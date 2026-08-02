(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const intro = document.querySelector(".role-intro");
  if (intro) {
    const ready = () => intro.classList.add("is-ready");
    if (reduceMotion) ready();
    else requestAnimationFrame(() => requestAnimationFrame(ready));
  }

  const root = document.querySelector("[data-role-tabs]");
  if (root) {
    const tabs = [...root.querySelectorAll("[data-tab]")];
    const panels = [...root.querySelectorAll("[data-panel]")];
    const panelWrap = root.querySelector(".role-focus-panels");
    const prevBtn = root.querySelector("[data-ethos-prev]");
    const nextBtn = root.querySelector("[data-ethos-next]");
    let activeKey =
      tabs.find((tab) => tab.classList.contains("is-active"))?.dataset.tab ||
      tabs[0]?.dataset.tab;

    function activeIndex() {
      return Math.max(
        0,
        tabs.findIndex((tab) => tab.classList.contains("is-active"))
      );
    }

    function activate(key) {
      activeKey = key;
      tabs.forEach((tab) => {
        const on = tab.dataset.tab === key;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
      });
      panels.forEach((panel) => {
        const on = panel.dataset.panel === key;
        panel.classList.toggle("is-active", on);
        panel.hidden = !on;
        panel.setAttribute("aria-hidden", on ? "false" : "true");
      });
    }

    function lockPanelHeight() {
      if (!panelWrap || !panels.length) return;

      const previousKey = activeKey || panels[0].dataset.panel;

      panelWrap.removeAttribute("data-height-locked");
      panelWrap.style.height = "";

      let tallest = 0;
      panels.forEach((panel) => {
        activate(panel.dataset.panel);
        tallest = Math.max(
          tallest,
          Math.ceil(panel.getBoundingClientRect().height)
        );
      });

      if (tallest > 0) {
        panelWrap.style.height = `${tallest + 36}px`;
        panelWrap.setAttribute("data-height-locked", "");
      }

      activate(previousKey);
    }

    function step(dir) {
      const next = tabs[(activeIndex() + dir + tabs.length) % tabs.length];
      activate(next.dataset.tab);
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab.dataset.tab));
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + dir + tabs.length) % tabs.length];
        next.focus();
        activate(next.dataset.tab);
      });
    });

    prevBtn?.addEventListener("click", () => step(-1));
    nextBtn?.addEventListener("click", () => step(1));

    const scheduleLock = () => window.requestAnimationFrame(lockPanelHeight);
    window.addEventListener("resize", scheduleLock);
    if (document.readyState === "complete") scheduleLock();
    else window.addEventListener("load", scheduleLock);
    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleLock).catch(() => {});
    }
    panelWrap?.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", scheduleLock, { once: true });
    });
  }

  const revealEls = [...document.querySelectorAll("[data-reveal]")];
  if (revealEls.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("is-inview"));
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-inview");
            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
      );
      revealEls.forEach((el) => observer.observe(el));
    }
  }

  // Particle cursor — current-role only
  const canvas = document.querySelector(".role-cursor-fx");
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (canvas && finePointer && !reduceMotion) {
    const ctx = canvas.getContext("2d", { alpha: true });
    const particles = [];
    const COLORS = [
      [224, 89, 41],
      [242, 242, 240],
      [126, 200, 234],
    ];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let mx = -9999;
    let my = -9999;
    let px = -9999;
    let py = -9999;
    let hoveringInteractive = false;
    let visible = false;
    let raf = 0;

    document.body.classList.add("has-cursor-fx");

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(x, y, speed) {
      const count = Math.min(5, 1 + Math.floor(speed / 8));
      for (let i = 0; i < count; i++) {
        const color = COLORS[(Math.random() * COLORS.length) | 0];
        const angle = Math.random() * Math.PI * 2;
        const burst = 0.4 + Math.random() * 1.8;
        particles.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * burst + (x - px) * 0.04,
          vy: Math.sin(angle) * burst + (y - py) * 0.04,
          life: 1,
          decay: 0.016 + Math.random() * 0.022,
          size: 1.2 + Math.random() * 2.8 + Math.min(speed / 40, 2),
          color,
        });
      }
      if (particles.length > 180) particles.splice(0, particles.length - 180);
    }

    function drawCursor(x, y) {
      const r = hoveringInteractive ? 16 : 10;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(242, 242, 240, 0.7)";
      ctx.lineWidth = 1.25;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, hoveringInteractive ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(224, 89, 41, 0.95)";
      ctx.shadowColor = "rgba(224, 89, 41, 0.55)";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function tick() {
      raf = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        const alpha = Math.max(0, p.life);
        const [r, g, b] = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.55 + alpha * 0.45), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.85})`;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`;
        ctx.shadowBlur = 10;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (visible) drawCursor(mx, my);
    }

    function onMove(e) {
      const x = e.clientX;
      const y = e.clientY;
      if (!visible) {
        visible = true;
        px = x;
        py = y;
      }
      const dx = x - px;
      const dy = y - py;
      const speed = Math.hypot(dx, dy);
      mx = x;
      my = y;
      if (speed > 0.4) spawn(x, y, speed);
      px = x;
      py = y;

      const target = e.target;
      hoveringInteractive = !!(
        target &&
        target.closest &&
        target.closest("a, button, [role='tab'], [role='button'], input, textarea, select, label")
      );
    }

    function onLeave() {
      visible = false;
      hoveringInteractive = false;
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
  } else if (canvas) {
    canvas.remove();
  }
})();
