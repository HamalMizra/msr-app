(function () {
  "use strict";

  var STATION_KEYS_STORAGE = "HAMAL_STATION_KEYS";
  var ACTIVE_SLUG_KEY = "MSR_ACTIVE_STATION_SLUG";

  function getStoredKey() {
    try {
      return localStorage.getItem("HAMAL_KEY") || "";
    } catch (e) {
      return "";
    }
  }

  function getStationKeysMap() {
    try {
      var raw = localStorage.getItem(STATION_KEYS_STORAGE) || "{}";
      var j = JSON.parse(raw);
      return typeof j === "object" && j !== null ? j : {};
    } catch (e) {
      return {};
    }
  }

  function getStationKey(slug) {
    var s = String(slug || "").trim();
    if (!s) return "";
    var m = getStationKeysMap();
    return m[s] ? String(m[s]) : "";
  }

  function setStationKey(slug, key) {
    var s = String(slug || "").trim();
    if (!s) return;
    var m = getStationKeysMap();
    m[s] = key;
    try {
      localStorage.setItem(STATION_KEYS_STORAGE, JSON.stringify(m));
    } catch (e) {}
  }

  function clearStationKeys() {
    try {
      localStorage.removeItem(STATION_KEYS_STORAGE);
    } catch (e) {}
  }

  function getPathFile() {
    var path = window.location.pathname || "";
    var parts = path.split("/");
    return parts.pop() || "index.html";
  }

  function requireLogin() {
    var path = getPathFile();
    if (
      path === "login.html" ||
      path === "login-station.html" ||
      path === "login-station"
    )
      return;
    if (!getStoredKey()) window.location.replace("./login.html");
  }

  /**
   * דף תחנה (station.html?s=...) — סיסמת חמ״ל ראשית או סיסמת תחנה לפי slug.
   */
  function requireStationPageAccess() {
    var path = getPathFile();
    if (
      path === "login.html" ||
      path === "login-station.html" ||
      path === "login-station"
    )
      return;

    var params;
    try {
      params = new URLSearchParams(window.location.search || "");
    } catch (e) {
      params = new URLSearchParams();
    }
    var raw = params.get("s") || params.get("station") || "";
    var stationName = "";
    try {
      stationName = decodeURIComponent(raw).trim();
    } catch (e2) {
      stationName = String(raw).trim();
    }

    if (!stationName) {
      window.location.replace("./stations.html");
      return;
    }

    var slug =
      typeof window.msrGetStationSlug === "function"
        ? window.msrGetStationSlug(stationName)
        : "";
    if (!slug) {
      window.location.replace("./stations.html");
      return;
    }

    try {
      sessionStorage.setItem(ACTIVE_SLUG_KEY, slug);
    } catch (e3) {}

    if (getStoredKey()) return;
    if (getStationKey(slug)) return;

    var next = encodeURIComponent(
      window.location.pathname + (window.location.search || "")
    );
    window.location.replace(
      "./login-station.html?st=" +
        encodeURIComponent(slug) +
        "&next=" +
        next
    );
  }

  function logout() {
    var slug = getActiveStationSlug();
    var hadMain = !!getStoredKey();
    try {
      localStorage.removeItem("HAMAL_KEY");
    } catch (e) {}
    clearStationKeys();
    try {
      sessionStorage.removeItem(ACTIVE_SLUG_KEY);
    } catch (e2) {}

    if (!hadMain && slug) {
      window.location.replace(
        "./login-station.html?st=" + encodeURIComponent(slug)
      );
    } else {
      window.location.replace("./login.html");
    }
  }

  function getActiveStationSlug() {
    try {
      return sessionStorage.getItem(ACTIVE_SLUG_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function fetchWithAuth(url, options) {
    var opts = options ? Object.assign({}, options) : {};
    var headers = Object.assign({}, opts.headers || {});
    var mainKey = getStoredKey();
    var slug = getActiveStationSlug();
    var sk = slug ? getStationKey(slug) : "";

    if (mainKey) {
      headers["x-hamal-key"] = mainKey;
    } else if (slug && sk) {
      headers["x-hamal-station"] = slug;
      headers["x-hamal-station-key"] = sk;
    }

    opts.headers = headers;
    return fetch(url, opts);
  }

  function injectLogoutButton() {
    if (document.getElementById("hamalLogoutBtn")) return;
    var btn = document.createElement("button");
    btn.id = "hamalLogoutBtn";
    btn.type = "button";
    btn.textContent = "יציאה";
    btn.style.cssText =
      "position:fixed;top:12px;left:12px;z-index:9999;padding:8px 12px;border:1px solid #d0d7de;border-radius:8px;background:#fff;cursor:pointer;";
    btn.addEventListener("click", logout);
    document.body.appendChild(btn);
  }

  window.HAMALAuth = {
    getStoredKey: getStoredKey,
    requireLogin: requireLogin,
    requireStationPageAccess: requireStationPageAccess,
    logout: logout,
    fetchWithAuth: fetchWithAuth,
    injectLogoutButton: injectLogoutButton,
    getStationKey: getStationKey,
    setStationKey: setStationKey,
    getActiveStationSlug: getActiveStationSlug,
  };
  window.fetchWithAuth = fetchWithAuth;
})();
