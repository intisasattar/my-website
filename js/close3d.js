/* ==========================================================================
   UG Global — "The Close": signature WebGL scene (Three.js r128 UMD)

   Fifty thin, translucent ivory planes (a month of enquiries) drift on a
   loose, inclined arc. Ten of them (the same month converted at 20%) leave
   the arc one by one and settle into a precise stack of solid forest slabs.
   Scroll resolves scatter into order. The scene repeats what the page text
   already says, so it is always decorative (aria-hidden).

   Markup   <div class="ug-close3d" data-ug-close3d data-variant="hero|demo" aria-hidden="true">
              <div class="ug-close3d__fallback">…drawn static composition…</div>
            </div>
            A missing fallback is generated, so the element can be dropped in bare.
   Loading  three.min.js (r128, cdnjs) in a classic <script> BEFORE this file.
            If that tag is async, mounting waits for it.
   API      window.UGClose3D.mount(el, { variant }) → controller | null
            window.UGClose3D.unmountAll()
   State    el[data-state] = loading → ready    animated loop
                                     → static   reduced motion or a slow GPU:
                                                one resolved frame, no loop
                                     → fallback no WebGL, THREE missing,
                                                context lost or any error
   Tuning   custom properties on the element, read on every resize:
            --ug-close3d-focus-x / -y  where the stack sits in the frame (%)
            --ug-close3d-zoom          > 1 crops tighter; the arc may bleed
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var controllers = [];
  var NO_WEBGL = "ug-close3d: WebGL unavailable";

  var ENQUIRIES = 50;            // a month of enquiries, as in the cost ledger
  var CLIENTS = 10;              // the same month converted at 20%
  var CARD_W = 1;                // enquiry plane, world units (≈ A-series sheet)
  var CARD_H = 0.64;
  var CARD_T = 0.012;            // plane thickness
  var SLAB_S = 1.5;              // client slab footprint (scale of the card)
  var SLAB_T = 0.09;             // client slab thickness
  var SLAB_PITCH = 0.128;        // slab + hairline gap
  var ARC_START = 2.98;          // an amphitheatre behind the stack, open to the viewer
  var ARC_SPAN = 3.45;           // radians, ≈ 230°
  var ARC_RISE = [0.62, -0.5];   // high on the left, settling low on the right
  var FLOW = 0.0055;             // share of the arc travelled per second (~3 min)
  var YAW_BIAS = 0.55;            // the arc's ends turn towards the viewer
  var ELEVATION = 0.3;           // camera elevation, radians (≈17°)
  var FIT_W = 3.2;               // half-extents of the composition, for framing
  var FIT_H = 1.85;
  var PLANE_ALPHA = 0.24;

  /* ---------- Maths helpers (nothing here allocates per frame) ---------- */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function damp(current, target, lambda, dt) { return lerp(current, target, 1 - Math.exp(-lambda * dt)); }

  // Seeded PRNG (mulberry32) so the composition is identical on every load
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // CSS cubic-bezier() token → easing function (sampled once into a table)
  function bezierEasing(css) {
    var m = /cubic-bezier\(([^)]+)\)/.exec(css || "");
    var p = m ? m[1].split(",").map(parseFloat) : [];
    if (p.length !== 4 || p.some(isNaN)) p = [0.16, 1, 0.3, 1];
    var n = 128, xs = new Float32Array(n + 1), ys = new Float32Array(n + 1);
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      xs[i] = 3 * u * u * t * p[0] + 3 * u * t * t * p[2] + t * t * t;
      ys[i] = 3 * u * u * t * p[1] + 3 * u * t * t * p[3] + t * t * t;
    }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var lo = 0, hi = n;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid; else hi = mid; }
      return ys[lo] + (ys[hi] - ys[lo]) * ((x - xs[lo]) / ((xs[hi] - xs[lo]) || 1));
    };
  }

  function token(style, name, fallback) {
    var v = style.getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }
  function seconds(value, fallback) {
    var n = parseFloat(value);
    if (isNaN(n)) return fallback;
    return /ms\s*$/.test(value) ? n / 1000 : n;
  }
  function radians(value, fallbackDeg) {
    var n = parseFloat(value);
    if (isNaN(n)) n = fallbackDeg;
    if (/rad\s*$/.test(value)) return n;
    if (/turn\s*$/.test(value)) return n * Math.PI * 2;
    return n * Math.PI / 180;
  }
  function fraction(value, fallback) {
    var n = parseFloat(value);
    return isNaN(n) ? fallback : n / 100;
  }

  /* ---------- Shared pointer + scroll listeners (one each for all scenes) ---------- */
  var pointer = { x: 0, y: 0 };
  var listening = false;
  function onPointer(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    pointer.x = clamp(e.clientX / window.innerWidth * 2 - 1, -1, 1);
    pointer.y = clamp(e.clientY / window.innerHeight * 2 - 1, -1, 1);
  }
  function onPointerExit(e) { if (!e.relatedTarget) { pointer.x = 0; pointer.y = 0; } }
  function onScroll() { for (var i = 0; i < controllers.length; i++) controllers[i].measure(); }
  function listen() {
    if (listening) return;
    listening = true;
    if (finePointer.matches) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("pointerout", onPointerExit, { passive: true });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Paper texture: an enquiry, not a document (sender + four rules) ---------- */
  function paperTexture(THREE, renderer, base) {
    var c = document.createElement("canvas");
    c.width = 512;
    c.height = 328;
    var g = c.getContext("2d");
    g.fillStyle = base;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#5E5B52";
    g.globalAlpha = 0.5;
    g.fillRect(40, 44, 120, 9);
    g.globalAlpha = 0.24;
    g.fillRect(40, 108, 400, 5);
    g.fillRect(40, 140, 372, 5);
    g.fillRect(40, 172, 388, 5);
    g.fillRect(40, 204, 236, 5);
    g.globalAlpha = 0.35;
    g.fillRect(40, 268, 64, 5);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  // Hairlines add light to the page without adding canvas alpha (premultiplied
  // output), so a faint line can never darken the ground behind the canvas
  function lightOnly(THREE, params) {
    params.transparent = true;
    params.depthWrite = false;
    params.fog = false;
    params.blending = THREE.CustomBlending;
    params.blendEquation = THREE.AddEquation;
    params.blendSrc = THREE.SrcAlphaFactor;
    params.blendDst = THREE.OneFactor;
    params.blendSrcAlpha = THREE.ZeroFactor;
    params.blendDstAlpha = THREE.OneFactor;
    return params;
  }

  // Per-instance opacity for MeshStandardMaterial (r128 has instance colour only)
  function withInstanceAlpha(material) {
    material.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vInstanceAlpha;")
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );");
    };
    return material;
  }

  /* ==========================================================================
     Scene
     ========================================================================== */
  function createScene(el, variant) {
    var THREE = window.THREE;
    var style = window.getComputedStyle(el);
    var ease = bezierEasing(token(style, "--ug-ease-depth", ""));
    var parallaxMax = radians(token(style, "--ug-parallax-max", "6deg"), 6);
    var slabDuration = seconds(token(style, "--ug-depth-duration", "900ms"), 0.9) * 1.7;
    var stagger = seconds(token(style, "--ug-stagger", "80ms"), 0.08) * 1.6;
    var planeCss = token(style, "--ug-close3d-plane", "#F5F2EB");

    function linear(css) { return new THREE.Color(css).convertSRGBToLinear(); }
    var cPlane = linear(planeCss);
    var cClient = linear(token(style, "--ug-close3d-client", "#294C3B"));
    var cRim = linear(token(style, "--ug-close3d-rim", "#A9B8A6"));
    var cGround = linear(token(style, "--ug-ink-950", "#111312"));

    /* ---- Renderer on our own context, so a refusal is silent, not an error ---- */
    var canvas = document.createElement("canvas");
    canvas.className = "ug-close3d__canvas";
    canvas.setAttribute("aria-hidden", "true");
    var attrs = { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, powerPreference: "low-power" };
    var gl = null;
    try {
      gl = canvas.getContext("webgl2", attrs) || canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs);
    } catch (e) { gl = null; }
    if (!gl) throw new Error(NO_WEBGL);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl, alpha: true, antialias: true, premultipliedAlpha: true });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(cGround, 8, 16);
    var camera = new THREE.PerspectiveCamera(24, 1, 0.5, 80);
    var world = new THREE.Group();
    scene.add(world);

    // Matte light: warm key from the upper left, sage rim from behind right
    scene.add(new THREE.HemisphereLight(cPlane, cGround, 0.62));
    var key = new THREE.DirectionalLight(0xfff1e0, 1.05);
    key.position.set(-4, 7, 5);
    scene.add(key);
    var rim = new THREE.DirectionalLight(cRim, 1.6);
    rim.position.set(5, 2.5, -6);
    scene.add(rim);

    /* ---- Geometry: one unit-depth card, scaled per instance ---- */
    var paper = paperTexture(THREE, renderer, planeCss);
    var baseGeo = new THREE.BoxGeometry(CARD_W, CARD_H, 1);
    var geometries = [baseGeo];
    var materials = [];

    function instanced(count, roughness, depthWrite, order) {
      var g = baseGeo.clone();
      geometries.push(g);
      var alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
      alpha.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("instanceAlpha", alpha);
      var mat = withInstanceAlpha(new THREE.MeshStandardMaterial({
        color: 0xffffff, map: paper, roughness: roughness, metalness: 0,
        transparent: true, depthWrite: depthWrite,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      }));
      materials.push(mat);
      var mesh = new THREE.InstancedMesh(g, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (var i = 0; i < count; i++) mesh.setColorAt(i, cPlane); // allocates instanceColor once
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      world.add(mesh);
      return mesh;
    }
    // Clients draw first and write depth (solid slabs); enquiries blend over them
    var clientMesh = instanced(CLIENTS, 0.74, true, 1);
    var planeMesh = instanced(ENQUIRIES - CLIENTS, 0.92, false, 2);

    // Hairline outlines: 1 device pixel, additive, faded with depth by hand
    var lineVerts = ENQUIRIES * 8;
    var linePos = new Float32Array(lineVerts * 3);
    var lineCol = new Float32Array(lineVerts * 3);
    var lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeo.setAttribute("color", new THREE.BufferAttribute(lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    geometries.push(lineGeo);
    var lineMat = new THREE.LineBasicMaterial(lightOnly(THREE, { vertexColors: true }));
    materials.push(lineMat);
    var lines = new THREE.LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;
    lines.renderOrder = 3;
    world.add(lines);

    // Plinth: a hairline square the stack stands on
    var half = SLAB_S * 0.5 * 1.24;
    var plinthGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, 0, -half),
      new THREE.Vector3(half, 0, half), new THREE.Vector3(-half, 0, half)
    ]);
    geometries.push(plinthGeo);
    var plinthMat = new THREE.LineBasicMaterial(lightOnly(THREE, { color: cRim, opacity: 0 }));
    materials.push(plinthMat);
    var plinth = new THREE.LineLoop(plinthGeo, plinthMat);
    plinth.position.y = -0.5 * (CLIENTS - 1) * SLAB_PITCH - SLAB_T * 0.5 - 0.09;
    plinth.renderOrder = 0;
    world.add(plinth);

    /* ---- Composition: a seeded, loose arc that planes flow along; every
            fifth plane is a client ---- */
    var rand = seeded(1018);
    var cards = [];
    var clients = [];
    var slabColours = [];
    for (var i = 0; i < ENQUIRIES; i++) {
      var isClient = i % 5 === 2;
      var c = {
        u: (i + rand() * 0.6) / ENQUIRIES,      // position along the arc, 0..1
        r: 2.15 + rand() * 0.45,
        y: (rand() - 0.5) * 0.24,
        rx: (rand() - 0.5) * 0.3,
        ry: (rand() - 0.5) * 0.5,
        rz: (rand() - 0.5) * 0.36,
        s: 0.82 + rand() * 0.22,
        tint: 0.82 + rand() * 0.18,
        ph: rand() * Math.PI * 2,
        sp: 0.28 + rand() * 0.3,
        slot: -1, index: 0,
        e: 0, from: 0, to: 0, t0: -10
      };
      if (isClient) {
        c.slot = clients.length;
        c.index = clients.length;
        clients.push(c);
        // forest, lifting very slightly towards sage as the stack rises
        slabColours.push(cClient.clone().multiplyScalar(0.82 + c.slot * 0.018).lerp(cRim, c.slot * 0.012));
      } else {
        c.index = cards.length - clients.length;
      }
      cards.push(c);
    }

    var ringQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, -0.06));
    var flatQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    var stackQuat = new THREE.Quaternion();
    var UP = new THREE.Vector3(0, 1, 0);
    var slotBase = -0.5 * (CLIENTS - 1) * SLAB_PITCH;

    // Scratch objects, reused every frame
    var pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    var pos2 = new THREE.Vector3(), quat2 = new THREE.Quaternion();
    var euler = new THREE.Euler(), mat4 = new THREE.Matrix4(), v = new THREE.Vector3(), n = new THREE.Vector3(), col = new THREE.Color();
    var corners = [-0.5, -0.32, 0.5, 0.5, -0.32, 0.5, 0.5, 0.32, 0.5, -0.5, 0.32, 0.5];

    /* ---- State ---- */
    var live = !reduceMotion.matches;
    var clock = 0;               // seconds of animation actually shown
    var scroll = 0;              // 0..1 scroll resolve (hero)
    var progress = 0;            // target share of clients in the stack
    var px = 0, py = 0;          // damped pointer
    var gate = 0;                // earliest time the next slab may move
    var raf = 0, last = 0, visible = true, failed = false;
    var perfFrames = 0, perfTime = 0, perfChecked = false;
    var fogNear = 8, fogFar = 16;
    var camDist = 10;

    function tween(c, to, now) { c.from = c.e; c.to = to; c.t0 = now; }

    function updateSlabs(now, settled) {
      var count = Math.floor(clamp(progress, 0, 1) * CLIENTS + 0.5);
      var k, c;
      if (settled) {
        for (k = 0; k < CLIENTS; k++) { c = clients[k]; c.e = c.from = c.to = k < count ? 1 : 0; }
        return;
      }
      for (k = 0; k < count; k++) {           // arrivals, bottom slab first
        c = clients[k];
        if (c.to === 1) continue;
        if (now < gate) break;
        tween(c, 1, now);
        gate = now + stagger;
      }
      for (k = CLIENTS - 1; k >= count; k--) { // departures, top slab first
        c = clients[k];
        if (c.to === 0) continue;
        if (now < gate) break;
        tween(c, 0, now);
        gate = now + stagger * 0.6;
      }
      for (k = 0; k < CLIENTS; k++) {
        c = clients[k];
        c.e = lerp(c.from, c.to, ease(clamp((now - c.t0) / slabDuration, 0, 1)));
      }
    }

    function demoProgress(t) {
      var p = t % 15;
      if (p < 2) return 0;
      if (p < 7) return (p - 2) / 5;
      if (p < 11.5) return 1;
      if (p < 13.5) return 1 - (p - 11.5) / 2;
      return 0;
    }

    // Planes drift along the arc; a client in flight holds its place on it
    function flow(dt) {
      for (var i = 0; i < ENQUIRIES; i++) {
        var c = cards[i];
        if (c.slot >= 0 && c.e > 0) continue;
        c.u += dt * FLOW;
        if (c.u >= 1) c.u -= 1;
      }
    }

    function pose(t, settled) {
      var intro = settled ? 1 : clamp(t / 3.2, 0, 1);
      var gather = ease(intro);
      var fade = settled ? 1 : smoothstep(t / 1.8);
      var placed = 0;
      for (var k = 0; k < CLIENTS; k++) placed += clients[k].e;
      var resolved = placed / CLIENTS;
      var sweep = -0.5 * (1 - gather);
      var spread = lerp(1.18, 1, gather) * lerp(1, 1.05, resolved);
      var planeAlpha = PLANE_ALPHA * fade * lerp(1, 0.7, resolved);

      stackQuat.setFromAxisAngle(UP, 0.62 + (settled ? 0 : t * 0.012));
      plinthMat.opacity = 0.34 * smoothstep(placed);
      plinth.quaternion.copy(stackQuat);

      for (var i = 0; i < ENQUIRIES; i++) {
        var c = cards[i];
        var a = ARC_START + c.u * ARC_SPAN + sweep;
        var bob = settled ? 0 : Math.sin(t * c.sp + c.ph);
        var r = c.r * spread;
        var y = lerp(ARC_RISE[0], ARC_RISE[1], c.u) + c.y + bob * 0.05;
        pos.set(Math.cos(a) * r, y, Math.sin(a) * r).applyQuaternion(ringQuat);
        euler.set(c.rx + bob * 0.03, Math.PI / 2 - a - YAW_BIAS * Math.cos(a) + c.ry, c.rz + bob * 0.025, "YXZ");
        quat.setFromEuler(euler).premultiply(ringQuat);
        scl.set(c.s, c.s, CARD_T);
        // planes enter and leave the arc softly at its two ends
        var alpha = planeAlpha * smoothstep(c.u / 0.12) * smoothstep((1 - c.u) / 0.12);
        var e = 0;
        col.copy(cPlane).multiplyScalar(c.tint);

        if (c.slot >= 0) {
          e = c.e;
          if (e > 0) {
            pos2.set(0, slotBase + c.slot * SLAB_PITCH, 0);
            quat2.copy(stackQuat).multiply(flatQuat);
            pos.lerp(pos2, e);
            pos.y += Math.sin(e * Math.PI) * 0.42;
            quat.slerp(quat2, e);
            var s = lerp(c.s, SLAB_S, e);
            scl.set(s, s, lerp(CARD_T, SLAB_T, smoothstep(e * 1.25)));
            alpha = lerp(alpha, 1, smoothstep(e * 1.5));
            col.lerp(slabColours[c.slot], smoothstep(e * 1.3));
          }
        }

        mat4.compose(pos, quat, scl);
        var mesh = c.slot >= 0 ? clientMesh : planeMesh;
        mesh.setMatrixAt(c.index, mat4);
        mesh.setColorAt(c.index, col);
        mesh.geometry.attributes.instanceAlpha.array[c.index] = alpha;

        // Outline of the facing side. It fades with depth (like the fog) and
        // as the plane turns edge-on, so overlapping edges never pile up.
        var depth = 1 - smoothstep((camera.position.distanceTo(pos) - fogNear) / (fogFar - fogNear));
        n.set(0, 0, 1).applyQuaternion(quat);
        v.copy(camera.position).sub(pos).normalize();
        var facing = smoothstep(Math.abs(n.dot(v)) / 0.55);
        var glow = alpha * 0.6 * depth * lerp(0.15, 1, facing);
        var lr = cPlane.r * glow, lg = cPlane.g * glow, lb = cPlane.b * glow;
        if (e > 0) {
          var rimGlow = 0.42 * smoothstep(e * 1.4);
          lr = lerp(lr, cRim.r * rimGlow, e);
          lg = lerp(lg, cRim.g * rimGlow, e);
          lb = lerp(lb, cRim.b * rimGlow, e);
        }
        var o = i * 24;
        for (var q = 0; q < 4; q++) {
          var a0 = q * 3, a1 = ((q + 1) % 4) * 3;
          v.set(corners[a0], corners[a0 + 1], corners[a0 + 2]).applyMatrix4(mat4);
          linePos[o] = v.x; linePos[o + 1] = v.y; linePos[o + 2] = v.z;
          v.set(corners[a1], corners[a1 + 1], corners[a1 + 2]).applyMatrix4(mat4);
          linePos[o + 3] = v.x; linePos[o + 4] = v.y; linePos[o + 5] = v.z;
          lineCol[o] = lineCol[o + 3] = lr;
          lineCol[o + 1] = lineCol[o + 4] = lg;
          lineCol[o + 2] = lineCol[o + 5] = lb;
          o += 6;
        }
      }
      clientMesh.instanceMatrix.needsUpdate = true;
      clientMesh.instanceColor.needsUpdate = true;
      clientMesh.geometry.attributes.instanceAlpha.needsUpdate = true;
      planeMesh.instanceMatrix.needsUpdate = true;
      planeMesh.instanceColor.needsUpdate = true;
      planeMesh.geometry.attributes.instanceAlpha.needsUpdate = true;
      lineGeo.attributes.position.needsUpdate = true;
      lineGeo.attributes.color.needsUpdate = true;

      world.rotation.set(py * parallaxMax * 0.5, px * parallaxMax, 0);
    }

    /* ---- Framing: fit the arc, then shift the lens so the stack sits on the focus ---- */
    function frame() {
      var w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      var s = window.getComputedStyle(el);
      var fx = fraction(s.getPropertyValue("--ug-close3d-focus-x"), 0.5);
      var fy = fraction(s.getPropertyValue("--ug-close3d-focus-y"), 0.5);
      var zoom = parseFloat(s.getPropertyValue("--ug-close3d-zoom")) || 1;
      focusY = fy;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      var tanV = Math.tan(camera.fov * Math.PI / 360);
      camDist = Math.max(FIT_W / (tanV * camera.aspect), FIT_H / tanV) / zoom;
      camera.position.set(0, Math.sin(ELEVATION) * camDist, Math.cos(ELEVATION) * camDist);
      camera.lookAt(0, 0, 0);
      camera.setViewOffset(w, h, (0.5 - fx) * w, (0.5 - fy) * h, w, h);
      fogNear = camDist - 1.2;
      fogFar = camDist + 6.5;
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
    }

    // Scroll resolve: 0 at rest (the stack shows 10%), 1 (20%) by the time the
    // focus has risen to 12% from the top of the viewport, still in view
    var focusY = 0.5;
    function measure() {
      if (variant !== "hero") return;
      var r = el.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var y = window.pageYOffset || 0;
      var focusAbs = r.top + y + r.height * focusY;
      var start = Math.max(0, focusAbs - vh * 0.5);
      var end = Math.max(start + 120, focusAbs - vh * 0.12);
      scroll = clamp((y - start) / (end - start), 0, 1);
    }

    function step(now, dt) {
      if (variant === "demo") progress = demoProgress(now);
      else {
        var base = 0.5 * smoothstep((now - 0.9) / 2.2);   // intro: five clients, i.e. 10%
        progress = base + (1 - base) * scroll;              // scroll: all ten, i.e. 20%
      }
      flow(dt);
      px = damp(px, pointer.x, 2.2, dt);
      py = damp(py, pointer.y, 2.2, dt);
      updateSlabs(now, false);
      pose(now, false);
    }

    function renderStatic() {
      progress = 1;
      px = py = 0;
      updateSlabs(0, true);
      pose(0, true);
      renderer.render(scene, camera);
    }

    function tick(ms) {
      raf = 0;
      if (failed) return;
      var dt = last ? Math.min((ms - last) / 1000, 0.05) : 1 / 60;
      var raw = last ? (ms - last) / 1000 : 0;
      last = ms;
      try {
        clock += dt;
        step(clock, dt);
        renderer.render(scene, camera);
      } catch (err) { fail(err); return; }
      if (el.getAttribute("data-state") !== "ready") el.setAttribute("data-state", "ready");
      adapt(raw);
      if (live) raf = window.requestAnimationFrame(tick);
    }

    // A slow GPU first drops to 1x pixels, then settles on the static frame
    function adapt(raw) {
      if (perfChecked || !raw) return;
      perfFrames++;
      if (perfFrames < 20) return;             // skip shader compile and warm-up
      perfTime += raw;
      if (perfFrames < 110) return;
      var avg = perfTime / (perfFrames - 19);
      perfFrames = 0;
      perfTime = 0;
      if (avg > 1 / 24 && pixelRatio > 1) {
        pixelRatio = 1;
        renderer.setPixelRatio(1);
        frame();
      } else if (avg > 1 / 12) {
        perfChecked = true;
        goStatic();
      } else {
        perfChecked = true;
      }
    }

    function goStatic() {
      live = false;
      sync();
      renderStatic();
      el.setAttribute("data-state", "static");
    }

    function sync() {
      var run = live && visible && !document.hidden && !failed;
      if (run && !raf) { last = 0; raf = window.requestAnimationFrame(tick); }
      else if (!run && raf) { window.cancelAnimationFrame(raf); raf = 0; }
    }

    function fail(err) {
      if (failed) return;
      failed = true;
      if (err && err.message !== NO_WEBGL && window.console) console.warn("UGClose3D: showing the static fallback.", err);
      dispose();
      el.setAttribute("data-state", "fallback");
    }

    /* ---- Wiring ---- */
    var ro = null, io = null;
    function onResize() {
      if (failed) return;
      frame();
      measure();
      if (!live) { try { renderStatic(); } catch (err) { fail(err); } }
    }
    function onMotionChange() {
      if (failed) return;
      if (reduceMotion.matches) goStatic();
      else { live = true; el.setAttribute("data-state", "ready"); sync(); }
    }
    function onContextLost(e) { e.preventDefault(); fail(null); }

    if ("ResizeObserver" in window) { ro = new ResizeObserver(onResize); ro.observe(el); }
    else window.addEventListener("resize", onResize);
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      }, { rootMargin: "120px 0px" });
      io.observe(el);
    }
    document.addEventListener("visibilitychange", sync);
    reduceMotion.addEventListener("change", onMotionChange);
    canvas.addEventListener("webglcontextlost", onContextLost);

    function dispose() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      if (ro) ro.disconnect(); else window.removeEventListener("resize", onResize);
      if (io) io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduceMotion.removeEventListener("change", onMotionChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      geometries.forEach(function (g) { g.dispose(); });
      materials.forEach(function (m) { m.dispose(); });
      paper.dispose();
      renderer.dispose();
      if (renderer.forceContextLoss && !failed) renderer.forceContextLoss();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    el.appendChild(canvas);
    frame();
    measure();
    if (live) sync();
    else {
      renderStatic();
      el.setAttribute("data-state", "static");
    }

    return {
      el: el,
      variant: variant,
      measure: measure,
      destroy: function () {
        if (!failed) { failed = true; dispose(); }
        el.removeAttribute("data-state");
      }
    };
  }

  /* ==========================================================================
     Drawn fallback (also what no-JS visitors see): resolved stack + arc
     ========================================================================== */
  var FALLBACK_SVG = "";

  function ensureFallback(el) {
    if (el.querySelector(".ug-close3d__fallback") || !FALLBACK_SVG) return;
    var div = document.createElement("div");
    div.className = "ug-close3d__fallback";
    div.setAttribute("aria-hidden", "true");
    div.innerHTML = FALLBACK_SVG;
    el.insertBefore(div, el.firstChild);
  }

  /* ==========================================================================
     Public API + auto-mount
     ========================================================================== */
  function mount(el, opts) {
    if (!el || el.nodeType !== 1) return null;
    for (var i = 0; i < controllers.length; i++) if (controllers[i].el === el) return controllers[i];
    opts = opts || {};
    var variant = opts.variant || el.getAttribute("data-variant") || "hero";
    ensureFallback(el);
    if (!window.THREE || !window.THREE.WebGLRenderer) {
      el.setAttribute("data-state", "fallback");
      return null;
    }
    el.setAttribute("data-state", "loading");
    try {
      var ctrl = createScene(el, variant === "demo" ? "demo" : "hero");
      controllers.push(ctrl);
      listen();
      return ctrl;
    } catch (err) {
      if (err && err.message !== NO_WEBGL && window.console) console.warn("UGClose3D: showing the static fallback.", err);
      el.setAttribute("data-state", "fallback");
      return null;
    }
  }

  function unmountAll() {
    controllers.splice(0).forEach(function (c) { c.destroy(); });
  }

  // An async three.min.js tag may still be on its way; anything else has run (or failed)
  function pendingThree() {
    if (window.THREE) return null;
    var scripts = document.querySelectorAll("script[src]");
    for (var i = 0; i < scripts.length; i++) {
      if (/three(\.min)?\.js/.test(scripts[i].src) && scripts[i].async) return scripts[i];
    }
    return null;
  }

  function autoMount() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-ug-close3d]"));
    if (!els.length) return;
    var script = pendingThree();
    if (!script) { els.forEach(function (el) { mount(el); }); return; }
    els.forEach(function (el) { ensureFallback(el); el.setAttribute("data-state", "loading"); });
    var done = false;
    function go() {
      if (done) return;
      done = true;
      els.forEach(function (el) { mount(el); });
    }
    script.addEventListener("load", go);
    script.addEventListener("error", go);
    window.addEventListener("load", go);
  }

  window.UGClose3D = { mount: mount, unmountAll: unmountAll };

  if (document.readyState !== "loading") autoMount();
  else document.addEventListener("DOMContentLoaded", autoMount);
})();
