/* ==========================================================================
   UG Global — Interaction layer (vanilla JS, no dependencies)
   Each behaviour is opt-in through a data attribute so components work
   unchanged on the homepage and on the design-system page.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Sticky header: condenses after 24px of scroll ---------- */
  function initHeader() {
    var header = $("[data-ug-header]");
    if (!header) return;
    var ticking = false;
    function update() {
      header.classList.toggle("is-condensed", window.scrollY > 24);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ---------- Scroll-spy: marks the nav link for the section in view ---------- */
  function initScrollSpy() {
    var links = $$("[data-ug-spy]");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      (map[id] = map[id] || []).push(link);
    });
    var sections = Object.keys(map).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (l) { l.removeAttribute("aria-current"); });
        (map[entry.target.id] || []).forEach(function (l) { l.setAttribute("aria-current", "true"); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- Mobile navigation: focus trap, Esc, inert background ---------- */
  function initMobileNav() {
    var toggle = $("[data-ug-menu-toggle]");
    var panel = toggle && document.getElementById(toggle.getAttribute("aria-controls"));
    if (!panel) return;
    var label = $(".ug-menu-toggle__label", toggle);
    var background = $$("[data-ug-inert-when-menu]");

    function focusables() {
      return [toggle].concat($$("a[href], button:not([disabled])", panel));
    }
    function open() {
      toggle.setAttribute("aria-expanded", "true");
      if (label) label.textContent = "Close";
      panel.hidden = false;
      // allow the hidden → visible transition to run
      window.requestAnimationFrame(function () { panel.classList.add("is-open"); });
      document.documentElement.style.overflow = "hidden";
      background.forEach(function (el) { el.setAttribute("inert", ""); });
      var first = $("a[href]", panel);
      if (first) first.focus();
    }
    function close(returnFocus) {
      toggle.setAttribute("aria-expanded", "false");
      if (label) label.textContent = "Menu";
      panel.classList.remove("is-open");
      document.documentElement.style.overflow = "";
      background.forEach(function (el) { el.removeAttribute("inert"); });
      var delay = reduceMotion.matches ? 0 : 320;
      window.setTimeout(function () {
        if (toggle.getAttribute("aria-expanded") === "false") panel.hidden = true;
      }, delay);
      if (returnFocus) toggle.focus();
    }
    toggle.addEventListener("click", function () {
      toggle.getAttribute("aria-expanded") === "true" ? close(true) : open();
    });
    panel.addEventListener("click", function (e) {
      if (e.target.closest("a[href^='#']")) close(false);
    });
    document.addEventListener("keydown", function (e) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab") return;
      var items = focusables();
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    window.matchMedia("(min-width: 1024px)").addEventListener("change", function (mq) {
      if (mq.matches && toggle.getAttribute("aria-expanded") === "true") close(false);
    });
  }

  /* ---------- Sticky mobile CTA: shown after the hero, hidden near the form ---------- */
  function initMobileCta() {
    var bar = $("[data-ug-mobile-cta]");
    var hero = $("[data-ug-hero]");
    var finale = $("[data-ug-finale]");
    if (!bar || !hero || !("IntersectionObserver" in window)) return;
    var heroVisible = true;
    var finaleVisible = false;
    function update() {
      var show = !heroVisible && !finaleVisible;
      bar.classList.toggle("is-visible", show);
      bar.toggleAttribute("inert", !show);
      bar.setAttribute("aria-hidden", show ? "false" : "true");
    }
    new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; update(); }).observe(hero);
    if (finale) new IntersectionObserver(function (e) { finaleVisible = e[0].isIntersecting; update(); }, { rootMargin: "0px 0px 20% 0px" }).observe(finale);
    update();
  }

  /* ---------- Accordion: native <details>, animated height ---------- */
  function initAccordions() {
    $$(".ug-accordion__item").forEach(function (item) {
      var summary = $(".ug-accordion__summary", item);
      var panel = $(".ug-accordion__panel", item);
      if (!summary || !panel) return;
      var anim = null;
      summary.addEventListener("click", function (e) {
        if (reduceMotion.matches || !panel.animate) return; // native toggle
        e.preventDefault();
        if (anim) anim.cancel();
        if (item.open) {
          var h = panel.offsetHeight;
          item.classList.add("is-closing");
          anim = panel.animate([{ height: h + "px" }, { height: "0px" }], { duration: 260, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
          anim.onfinish = function () { item.open = false; item.classList.remove("is-closing"); anim = null; };
        } else {
          item.open = true;
          var target = panel.offsetHeight;
          anim = panel.animate([{ height: "0px", opacity: 0 }, { height: target + "px", opacity: 1 }], { duration: 320, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
          anim.onfinish = function () { anim = null; };
        }
      });
    });
  }

  /* ---------- Media players (UI states; files are supplied later) ---------- */
  function fmt(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  var playIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
  var pauseIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';

  function makeTimeline(duration, onTick, onEnd) {
    var t = 0, timer = null;
    return {
      get time() { return t; },
      play: function () {
        if (timer) return;
        timer = window.setInterval(function () {
          t = Math.min(duration, t + 0.25);
          onTick(t);
          if (t >= duration) { this.pause(); onEnd(); }
        }.bind(this), 250);
      },
      pause: function () { window.clearInterval(timer); timer = null; },
      seek: function (v) { t = Math.max(0, Math.min(duration, v)); onTick(t); }
    };
  }

  function initVideo() {
    $$("[data-ug-video]").forEach(function (root) {
      var startBtn = $("[data-ug-video-start]", root);
      var controls = $(".ug-video__controls", root);
      var toggle = $("[data-ug-video-toggle]", root);
      var range = $(".ug-range", root);
      var time = $(".ug-time", root);
      var status = $("[data-ug-video-status]", root);
      var duration = Number(root.getAttribute("data-duration") || 150);
      if (!startBtn || !controls) return;

      function render(t) {
        range.value = String((t / duration) * 100);
        range.style.setProperty("--ug-range-fill", range.value + "%");
        range.setAttribute("aria-valuetext", fmt(t) + " of " + fmt(duration));
        time.textContent = fmt(t) + " / " + fmt(duration);
      }
      var tl = makeTimeline(duration, render, function () { setState("ended"); });
      function setState(state) {
        root.setAttribute("data-state", state);
        var playing = state === "playing";
        toggle.innerHTML = playing ? pauseIcon : playIcon;
        toggle.setAttribute("aria-label", playing ? "Pause film" : (state === "ended" ? "Replay film" : "Play film"));
        if (status) status.textContent = state === "loading" ? "Loading film…" : (state === "ended" ? "Film ended." : "");
      }
      startBtn.addEventListener("click", function () {
        setState("loading");
        startBtn.hidden = true;
        window.setTimeout(function () {
          controls.hidden = false;
          setState("playing");
          tl.play();
          toggle.focus();
        }, reduceMotion.matches ? 0 : 600);
      });
      toggle.addEventListener("click", function () {
        var state = root.getAttribute("data-state");
        if (state === "playing") { tl.pause(); setState("paused"); }
        else { if (state === "ended") tl.seek(0); tl.play(); setState("playing"); }
      });
      range.addEventListener("input", function () { tl.seek((range.value / 100) * duration); });
      render(0);
    });
  }

  function waveMask(seed, bars) {
    var x = seed, rects = "";
    for (var i = 0; i < bars; i++) {
      x = (x * 9301 + 49297) % 233280;
      var r = x / 233280;
      var env = 0.35 + 0.65 * Math.abs(Math.sin(i / bars * Math.PI * 3.2));
      var h = Math.max(3, Math.round((0.25 + r * 0.75) * env * 44));
      rects += '<rect x="' + (i * 6) + '" y="' + ((44 - h) / 2) + '" width="3" height="' + h + '" rx="0.5"/>';
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (bars * 6 - 3) + ' 44" preserveAspectRatio="none">' + rects + "</svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  function initAudio() {
    $$("[data-ug-audio]").forEach(function (root, idx) {
      var toggle = $("[data-ug-audio-toggle]", root);
      var range = $(".ug-range", root);
      var wave = $(".ug-audio__wave", root);
      var cur = $("[data-ug-audio-current]", root);
      var tBtn = $("[data-ug-transcript-toggle]", root);
      var transcript = tBtn && document.getElementById(tBtn.getAttribute("aria-controls"));
      var duration = Number(root.getAttribute("data-duration") || 94);
      if (wave) wave.style.setProperty("--ug-wave-mask", waveMask(7 + idx * 13, 64));

      function render(t) {
        var pct = (t / duration) * 100;
        range.value = String(pct);
        range.style.setProperty("--ug-range-fill", pct + "%");
        range.setAttribute("aria-valuetext", fmt(t) + " of " + fmt(duration));
        if (wave) wave.style.setProperty("--ug-wave-progress", pct + "%");
        if (cur) cur.textContent = fmt(t);
      }
      var tl = makeTimeline(duration, render, function () { setState("ended"); });
      function setState(state) {
        root.setAttribute("data-state", state);
        var playing = state === "playing";
        toggle.innerHTML = playing ? pauseIcon : playIcon;
        toggle.setAttribute("aria-label", playing ? "Pause call sample" : "Play call sample");
      }
      toggle.addEventListener("click", function () {
        if (root.getAttribute("data-state") === "playing") { tl.pause(); setState("paused"); }
        else { if (root.getAttribute("data-state") === "ended") tl.seek(0); tl.play(); setState("playing"); }
      });
      range.addEventListener("input", function () { tl.seek((range.value / 100) * duration); });
      if (tBtn && transcript) {
        tBtn.addEventListener("click", function () {
          var open = tBtn.getAttribute("aria-expanded") === "true";
          tBtn.setAttribute("aria-expanded", String(!open));
          transcript.hidden = open;
          $(".ug-link__text", tBtn).textContent = open ? "Show transcript" : "Hide transcript";
        });
      }
      render(0);
      setState("idle");
    });
  }

  /* ---------- Forms: validation, error summary, loading, success ---------- */
  var errorIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="0.75" y="0.75" width="14.5" height="14.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4v5" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="11.6" r="1" fill="currentColor"/></svg>';

  function fieldMessage(input) {
    var v = input.validity;
    var name = input.getAttribute("data-label") || "This field";
    if (v.valueMissing) {
      if (input.type === "checkbox") return input.getAttribute("data-required-msg") || "Please tick this box to continue.";
      if (input.tagName === "SELECT") return "Choose " + name.toLowerCase() + ".";
      return "Enter " + name.toLowerCase() + ".";
    }
    if (v.typeMismatch && input.type === "email") return "Enter an email address in the format name@company.com.";
    if (v.patternMismatch) return input.getAttribute("data-pattern-msg") || "Check the format of " + name.toLowerCase() + ".";
    if (v.tooShort) return name + " needs at least " + input.minLength + " characters.";
    return "";
  }
  function setFieldError(input, msg) {
    var errId = input.id + "-error";
    var err = document.getElementById(errId);
    var described = (input.getAttribute("aria-describedby") || "").split(" ").filter(function (x) { return x && x !== errId; });
    if (msg) {
      if (!err) {
        err = document.createElement("p");
        err.id = errId;
        err.className = "ug-error";
        var field = input.closest(".ug-field, .ug-check-field") || input.parentNode;
        field.appendChild(err);
      }
      err.innerHTML = errorIcon + "<span></span>";
      err.lastChild.textContent = msg;
      input.setAttribute("aria-invalid", "true");
      described.push(errId);
    } else {
      if (err) err.remove();
      input.removeAttribute("aria-invalid");
    }
    if (described.length) input.setAttribute("aria-describedby", described.join(" "));
    else input.removeAttribute("aria-describedby");
  }

  function initForms() {
    $$("form[data-ug-form]").forEach(function (form) {
      var summary = $("[data-ug-error-summary]", form);
      var submit = $("button[type='submit']", form);
      var success = document.getElementById(form.getAttribute("data-success"));
      var inputs = $$("input, select, textarea", form).filter(function (el) { return el.type !== "hidden"; });

      inputs.forEach(function (input) {
        // validate on blur once the user has interacted; re-validate live once invalid
        input.addEventListener("blur", function () {
          if (input.value || input.getAttribute("aria-invalid") === "true") setFieldError(input, fieldMessage(input));
        });
        input.addEventListener("input", function () {
          if (input.getAttribute("aria-invalid") === "true") setFieldError(input, fieldMessage(input));
        });
        input.addEventListener("change", function () {
          if (input.getAttribute("aria-invalid") === "true") setFieldError(input, fieldMessage(input));
        });
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var errors = [];
        inputs.forEach(function (input) {
          var msg = fieldMessage(input);
          setFieldError(input, msg);
          if (msg) errors.push({ input: input, msg: msg });
        });
        if (errors.length) {
          if (summary) {
            summary.hidden = false;
            var list = $("ul", summary);
            list.innerHTML = "";
            errors.forEach(function (er) {
              var li = document.createElement("li");
              var a = document.createElement("a");
              a.href = "#" + er.input.id;
              a.textContent = er.msg;
              a.addEventListener("click", function (ev) { ev.preventDefault(); er.input.focus(); });
              li.appendChild(a);
              list.appendChild(li);
            });
            $("[data-ug-error-count]", summary).textContent =
              errors.length === 1 ? "There is 1 problem with this form" : "There are " + errors.length + " problems with this form";
            summary.focus();
          } else {
            errors[0].input.focus();
          }
          return;
        }
        if (summary) summary.hidden = true;
        submit.setAttribute("aria-busy", "true");
        submit.disabled = true;
        var label = $(".ug-btn__label", submit);
        var original = label ? label.textContent : "";
        if (label) label.textContent = submit.getAttribute("data-busy-label") || "Sending…";
        window.setTimeout(function () {
          submit.removeAttribute("aria-busy");
          submit.disabled = false;
          if (label) label.textContent = original;
          if (success) {
            form.hidden = true;
            success.hidden = false;
            var heading = $("h3, h4", success);
            if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus(); }
          }
        }, 1100);
      });

      if (success) {
        var reset = $("[data-ug-form-reset]", success);
        if (reset) reset.addEventListener("click", function () {
          form.reset();
          inputs.forEach(function (i) { setFieldError(i, ""); });
          success.hidden = true;
          form.hidden = false;
          inputs[0].focus();
        });
      }
    });
  }

  /* ---------- Single-choice button groups (e.g. booking times) ---------- */
  function initChoiceGroups() {
    $$("[data-ug-choice-group]").forEach(function (group) {
      group.addEventListener("click", function (e) {
        var btn = e.target.closest("button[aria-pressed]");
        if (!btn) return;
        $$("button[aria-pressed]", group).forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      });
    });
  }

  /* ---------- Scroll reveal: only below-the-fold blocks, once ---------- */
  function initReveal() {
    if (reduceMotion.matches || !("IntersectionObserver" in window)) return;
    var items = $$("[data-ug-reveal]");
    var vh = window.innerHeight;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("ug-reveal-in");
        entry.target.classList.remove("ug-reveal-pending");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) {
      if (el.getBoundingClientRect().top < vh) return; // already visible: never hide
      el.classList.add("ug-reveal-pending");
      io.observe(el);
    });
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    initHeader();
    initScrollSpy();
    initMobileNav();
    initMobileCta();
    initAccordions();
    initVideo();
    initAudio();
    initForms();
    initChoiceGroups();
    initReveal();
  });
})();
