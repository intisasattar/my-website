/* ==========================================================================
   UG Global — Depth cues (vanilla JS, no dependencies)
   1. Pointer tilt: [data-ug-tilt] leans towards a fine pointer (max
      --ug-tilt-max) with a moving sheen. Touch, pen-less and keyboard users
      get the flat element; focus inside a tilted element flattens it.
   2. Once-only entrances: .ug-ledger3d and .ug-steps--unfold receive .is-in
      the first time they are in view.
   Under prefers-reduced-motion both are no-ops (entrances are marked .is-in
   immediately, so the finished state shows).
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Pointer tilt ---------- */
  function initTilt() {
    if (reduceMotion.matches || !finePointer.matches) return;
    $$("[data-ug-tilt]").forEach(function (el) {
      if (el.classList.contains("ug-tilt")) return;
      el.classList.add("ug-tilt");
      var sheen = document.createElement("span");
      sheen.className = "ug-tilt__sheen";
      sheen.setAttribute("aria-hidden", "true");
      el.appendChild(sheen);

      var max = parseFloat(window.getComputedStyle(el).getPropertyValue("--ug-tilt-max")) || 4;
      var x = 0.5, y = 0.5, raf = 0;

      function apply() {
        raf = 0;
        // rotateX lifts the edge nearest the pointer; rotateY turns towards it
        el.style.setProperty("--ug-tilt-x", ((0.5 - y) * 2 * max).toFixed(2) + "deg");
        el.style.setProperty("--ug-tilt-y", ((x - 0.5) * 2 * max).toFixed(2) + "deg");
        el.style.setProperty("--ug-sheen-x", (x * 100).toFixed(1) + "%");
        el.style.setProperty("--ug-sheen-y", (y * 100).toFixed(1) + "%");
      }
      function move(e) {
        if (e.pointerType !== "mouse" || reduceMotion.matches) return;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        el.classList.add("is-tilting");
        if (!raf) raf = window.requestAnimationFrame(apply);
      }
      function leave() {
        if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
        el.classList.remove("is-tilting");
        el.style.setProperty("--ug-tilt-x", "0deg");
        el.style.setProperty("--ug-tilt-y", "0deg");
      }
      el.addEventListener("pointermove", move, { passive: true });
      el.addEventListener("pointerleave", leave);
      el.addEventListener("pointerdown", leave);   // a press is a decision: settle flat
    });
  }

  /* ---------- Once-only entrances ---------- */
  function initEntrances() {
    var items = $$(".ug-ledger3d, .ug-steps--unfold");
    if (!items.length) return;
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    // Arm the pending state only now that something will release it
    document.documentElement.classList.add("ug-depth");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.2 });
    items.forEach(function (el) { io.observe(el); });
  }

  // If the visitor switches reduced motion on mid-visit, settle everything
  reduceMotion.addEventListener("change", function () {
    if (!reduceMotion.matches) return;
    $$(".ug-ledger3d, .ug-steps--unfold").forEach(function (el) { el.classList.add("is-in"); });
    $$(".ug-tilt.is-tilting").forEach(function (el) { el.classList.remove("is-tilting"); });
  });

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    initTilt();
    initEntrances();
  });
})();
