(function () {
  "use strict";
  function getStoredKey() {
    try { return localStorage.getItem("HAMAL_KEY") || ""; } catch (e) { return ""; }
  }
  function requireLogin() {
    var path = (window.location.pathname || "").split("/").pop() || "index.html";
    if (path === "login.html") return;
    if (!getStoredKey()) window.location.replace("./login.html");
  }
  function logout() {
    try { localStorage.removeItem("HAMAL_KEY"); } catch (e) {}
    window.location.replace("./login.html");
  }
  function fetchWithAuth(url, options) {
    var opts = options ? Object.assign({}, options) : {};
    var headers = Object.assign({}, opts.headers || {});
    var key = getStoredKey();
    if (key) headers["x-hamal-key"] = key;
    opts.headers = headers;
    return fetch(url, opts);
  }
  function injectLogoutButton() {
    if (document.getElementById("hamalLogoutBtn")) return;
    var btn = document.createElement("button");
    btn.id = "hamalLogoutBtn";
    btn.type = "button";
    btn.textContent = "יציאה";
    btn.style.cssText = "position:fixed;top:12px;left:12px;z-index:9999;padding:8px 12px;border:1px solid #d0d7de;border-radius:8px;background:#fff;cursor:pointer;";
    btn.addEventListener("click", logout);
    document.body.appendChild(btn);
  }
  window.HAMALAuth = { getStoredKey:getStoredKey, requireLogin:requireLogin, logout:logout, fetchWithAuth:fetchWithAuth, injectLogoutButton:injectLogoutButton };
  window.fetchWithAuth = fetchWithAuth;
})();