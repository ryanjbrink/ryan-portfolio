/**
 * Secret admin entry: Cmd/Ctrl+E on keyboard, long-press hotspot on touch.
 */
(function () {
  const PASS_KEY = "rb_stats_pass_v1";
  const LONG_MS = 700;

  function goStats() {
    const pass = sessionStorage.getItem(PASS_KEY);
    if (pass) {
      location.href = "stats.html";
      return;
    }
    openGate();
  }

  function openGate() {
    if (document.getElementById("rb-stats-gate")) return;
    const overlay = document.createElement("div");
    overlay.id = "rb-stats-gate";
    overlay.innerHTML = `
      <div class="rb-gate-card" role="dialog" aria-modal="true" aria-label="Admin sign in">
        <p class="rb-gate-kicker">Admin</p>
        <h2 class="rb-gate-title">Site stats</h2>
        <p class="rb-gate-copy">Enter the admin password to view journeys and engagement.</p>
        <form class="rb-gate-form">
          <input class="rb-gate-input" type="password" name="password" autocomplete="current-password" placeholder="Password" required />
          <p class="rb-gate-error" hidden>Incorrect password</p>
          <div class="rb-gate-actions">
            <button type="button" class="rb-gate-cancel">Cancel</button>
            <button type="submit" class="rb-gate-submit">Enter</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector(".rb-gate-input");
    const err = overlay.querySelector(".rb-gate-error");
    input.focus();

    overlay.querySelector(".rb-gate-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector(".rb-gate-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = input.value;
      const cfg = window.RB_ANALYTICS || {};
      const endpoint = (cfg.endpoint || "").replace(/\/+$/, "");

      let ok = false;
      // Live auth only when a Worker endpoint is set (demo flag is ignored then)
      if (!endpoint) {
        ok = password.length > 0;
      } else {
        try {
          const res = await fetch(endpoint + "/admin/auth", {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify({ password }),
            mode: "cors",
            credentials: "omit",
          });
          const data = await res.json().catch(() => ({}));
          ok = Boolean(data.ok);
        } catch (_) {
          ok = false;
          err.textContent = "Can’t reach analytics API";
        }
      }

      if (!ok) {
        err.hidden = false;
        input.select();
        return;
      }
      sessionStorage.setItem(PASS_KEY, password);
      location.href = "stats.html";
    });
  }

  window.addEventListener("rb-open-stats-gate", goStats);

  // Keyboard: Cmd+E (Mac) or Ctrl+E
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "e") {
      // Don't steal from inputs
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      goStats();
    }
  });

  // Touch: invisible long-press hotspot, bottom-left
  const hot = document.createElement("button");
  hot.type = "button";
  hot.className = "rb-admin-hotspot";
  hot.setAttribute("aria-label", "Admin");
  hot.tabIndex = -1;
  document.documentElement.appendChild(hot);

  let pressTimer = null;
  let startX = 0;
  let startY = 0;

  function clearPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  hot.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      clearPress();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (navigator.vibrate) navigator.vibrate(12);
        goStats();
      }, LONG_MS);
    },
    { passive: true }
  );

  hot.addEventListener(
    "pointermove",
    (e) => {
      if (!pressTimer) return;
      if (Math.abs(e.clientX - startX) > 12 || Math.abs(e.clientY - startY) > 12) clearPress();
    },
    { passive: true }
  );

  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => {
    hot.addEventListener(ev, clearPress, { passive: true });
  });

  // Styles for gate + hotspot — home tokens only
  if (!document.getElementById("rb-stats-gate-style")) {
    const style = document.createElement("style");
    style.id = "rb-stats-gate-style";
    style.textContent = `
      .rb-admin-hotspot {
        position: fixed;
        left: 0;
        bottom: 0;
        width: 44px;
        height: 44px;
        opacity: 0;
        z-index: 9998;
        border: 0;
        padding: 0;
        background: transparent;
        -webkit-touch-callout: none;
        user-select: none;
      }
      #rb-stats-gate {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        place-items: center;
        padding: 1.25rem;
        background: color-mix(in srgb, #000c14 28%, transparent);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        animation: rbGateIn 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      }
      @keyframes rbGateIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .rb-gate-card {
        width: min(100%, 380px);
        padding: 1.5rem 1.4rem 1.25rem;
        border-radius: 20px;
        background: var(--card-bg, #fff);
        border: 1px solid rgba(0, 12, 20, 0.08);
        box-shadow: var(--card-shadow, 0 2px 8px rgba(0, 12, 20, 0.08));
        transform: translateY(8px);
        animation: rbGateCard 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      html.dark .rb-gate-card,
      html.dark-mode .rb-gate-card,
      body.dark .rb-gate-card,
      body.dark-mode .rb-gate-card {
        border-color: rgba(255, 255, 255, 0.1);
      }
      @keyframes rbGateCard {
        to { transform: translateY(0); }
      }
      .rb-gate-kicker {
        margin: 0 0 0.35rem;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-secondary, #525252);
      }
      .rb-gate-title {
        margin: 0;
        font-size: 1.45rem;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--text-primary, #000c14);
      }
      .rb-gate-copy {
        margin: 0.45rem 0 1.1rem;
        color: var(--text-secondary, #525252);
        font-size: 0.95rem;
        line-height: 1.45;
      }
      .rb-gate-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(0, 12, 20, 0.12);
        border-radius: 14px;
        padding: 0.85rem 1.1rem;
        font: inherit;
        font-size: 1rem;
        background: #f3f3f0;
        color: var(--text-primary, #000c14);
        outline: none;
      }
      html.dark .rb-gate-input,
      html.dark-mode .rb-gate-input,
      body.dark .rb-gate-input,
      body.dark-mode .rb-gate-input {
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.12);
        color: var(--text-primary);
      }
      .rb-gate-input:focus {
        border-color: var(--profile-blue, #2563eb);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--profile-blue, #2563eb) 20%, transparent);
      }
      .rb-gate-error {
        margin: 0.55rem 0 0;
        color: #b42318;
        font-size: 0.85rem;
        font-weight: 700;
      }
      .rb-gate-actions {
        display: flex;
        gap: 0.55rem;
        justify-content: flex-end;
        margin-top: 1rem;
      }
      .rb-gate-cancel, .rb-gate-submit {
        appearance: none;
        border: 0;
        border-radius: 14px;
        padding: 0.7rem 1.15rem;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .rb-gate-cancel {
        background: transparent;
        color: var(--text-secondary, #525252);
      }
      .rb-gate-submit {
        background: var(--text-primary, #000c14);
        color: #f3f3f0;
      }
      html.dark .rb-gate-submit,
      html.dark-mode .rb-gate-submit,
      body.dark .rb-gate-submit,
      body.dark-mode .rb-gate-submit {
        background: var(--text-primary);
        color: #0f0f0f;
      }
    `;
    document.head.appendChild(style);
  }
})();
