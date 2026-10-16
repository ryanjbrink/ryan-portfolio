/**
 * Motion (motion.dev) — icon animations for “More than our AI tools”.
 * Plays on card hover; respects prefers-reduced-motion.
 */
import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@14.3.0/+esm";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const section = document.querySelector("#senses");
if (!section || reduceMotion) {
  /* no-op */
} else {
  function playIntuition(card, track) {
    const bars = card.querySelectorAll(".role-mock-signal span");
    if (!bars.length) return;
    bars.forEach((bar) => {
      bar.style.transformOrigin = "50% 100%";
    });
    track(
      animate(
        bars,
        { scaleY: [0.4, 1, 0.55, 0.92, 0.48, 1] },
        {
          duration: 2.2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: stagger(0.12),
        }
      )
    );
  }

  function playTaste(card, track) {
    const weak = card.querySelector(".role-mock-compare i:not(.is-strong)");
    const strong = card.querySelector(".role-mock-compare i.is-strong");
    if (strong) {
      track(
        animate(
          strong,
          { scale: [1, 1.12, 1], rotate: [0, -3, 0] },
          { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
        )
      );
    }
    if (weak) {
      track(
        animate(
          weak,
          { opacity: [0.55, 0.28, 0.55], scale: [1, 0.92, 1] },
          { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
        )
      );
    }
  }

  function playEmpathy(card, track) {
    const dots = card.querySelectorAll(".role-mock-faces i");
    if (!dots.length) return;
    track(
      animate(
        dots,
        { scale: [0.85, 1.25, 0.85], opacity: [0.4, 1, 0.4] },
        {
          duration: 1.15,
          repeat: Infinity,
          ease: "easeInOut",
          delay: stagger(0.14),
        }
      )
    );
  }

  function playPerspective(card, track) {
    const layers = card.querySelectorAll(".role-mock-layers span");
    if (!layers.length) return;
    layers.forEach((el) => {
      el.style.transformOrigin = "0% 50%";
    });
    track(
      animate(
        layers,
        { scaleX: [0.2, 1] },
        {
          duration: 0.7,
          ease: [0.22, 1, 0.36, 1],
          delay: stagger(0.1),
        }
      )
    );
    const accent = layers[layers.length - 1];
    if (accent) {
      track(
        animate(
          accent,
          { opacity: [1, 0.5, 1] },
          { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.65 }
        )
      );
    }
  }

  function playVision(card, track) {
    const dots = [...card.querySelectorAll(".role-mock-constellation i")];
    if (!dots.length) return;
    const entrance = animate(
      dots,
      { scale: [0.4, 1], opacity: [0.35, 1] },
      {
        type: "spring",
        stiffness: 380,
        damping: 16,
        delay: stagger(0.07),
      }
    );
    track(entrance);

    Promise.resolve(entrance.finished).then(() => {
      if (!card.matches(":hover")) return;
      const accent = dots[1] || dots[0];
      if (accent) {
        track(
          animate(
            accent,
            { scale: [1, 1.4, 1] },
            { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
          )
        );
      }
      dots.forEach((dot, i) => {
        const amp = 2.5 + (i % 3);
        track(
          animate(
            dot,
            { y: [0, -amp, 0, amp * 0.55, 0] },
            {
              duration: 2.4 + i * 0.25,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.08,
            }
          )
        );
      });
    });
  }

  const runners = {
    "role-vcard--intuition": playIntuition,
    "role-vcard--taste": playTaste,
    "role-vcard--empathy": playEmpathy,
    "role-vcard--perspective": playPerspective,
    "role-vcard--vision": playVision,
  };

  const resetSelectors = [
    ".role-mock-signal span",
    ".role-mock-compare i",
    ".role-mock-faces i",
    ".role-mock-layers span",
    ".role-mock-constellation i",
  ].join(",");

  function resetIconStyles(card) {
    card.querySelectorAll(resetSelectors).forEach((el) => {
      el.style.transform = "";
      el.style.opacity = "";
    });
  }

  section.querySelectorAll(".role-vcard").forEach((card) => {
    const key = Object.keys(runners).find((c) => card.classList.contains(c));
    if (!key) return;

    let active = [];
    let hovering = false;

    function track(ctrl) {
      if (!ctrl || !hovering) {
        try {
          ctrl?.stop?.();
        } catch (_) {}
        return ctrl;
      }
      active.push(ctrl);
      return ctrl;
    }

    function stop() {
      hovering = false;
      while (active.length) {
        const c = active.pop();
        try {
          c.stop?.();
        } catch (_) {}
      }
      resetIconStyles(card);
    }

    function start() {
      stop();
      hovering = true;
      runners[key](card, track);
    }

    card.addEventListener("pointerenter", start);
    card.addEventListener("pointerleave", stop);
    card.addEventListener("focusin", start);
    card.addEventListener("focusout", (e) => {
      if (!card.contains(e.relatedTarget)) stop();
    });
  });
}
