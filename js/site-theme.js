/**
 * Shared light/dark theme.
 * - Manual choice: localStorage `theme` = "dark" | "light"
 * - Default (no choice): follow local sun-up / sun-down (6:00–18:00 light)
 */
(function () {
  var KEY = "theme";
  // Local daytime window — light while the sun is roughly up.
  var DAY_START = 6;
  var DAY_END = 18;

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function prefersDarkBySun() {
    var hour = new Date().getHours();
    return hour < DAY_START || hour >= DAY_END;
  }

  function isDark() {
    var pref = stored();
    if (pref === "dark") return true;
    if (pref === "light") return false;
    return prefersDarkBySun();
  }

  function apply(dark) {
    var root = document.documentElement;
    var body = document.body;
    root.classList.toggle("dark", dark);
    root.classList.toggle("dark-mode", dark);
    if (body) {
      body.classList.toggle("dark", dark);
      body.classList.toggle("dark-mode", dark);
    }
  }

  function set(dark) {
    try {
      localStorage.setItem(KEY, dark ? "dark" : "light");
    } catch (e) {}
    apply(dark);
  }

  function syncFromStorage() {
    apply(isDark());
  }

  syncFromStorage();

  // If still on auto, re-check when returning to the tab (e.g. across sunset).
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && stored() == null) {
      syncFromStorage();
    }
  });

  window.SiteTheme = {
    KEY: KEY,
    isDark: isDark,
    apply: apply,
    set: set,
    syncFromStorage: syncFromStorage,
    prefersDarkBySun: prefersDarkBySun,
  };
})();
