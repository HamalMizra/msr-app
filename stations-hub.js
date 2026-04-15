(function () {
    "use strict";

    const API_BASE = "/api";
    const fetchWithAuth = (window.HAMALAuth && window.HAMALAuth.fetchWithAuth) || fetch;

    function $(id) {
        return document.getElementById(id);
    }

    function stationHref(name) {
        return "./station.html?s=" + encodeURIComponent(name);
    }

    function isReleased(r) {
        return r.released === true || r.released === "כן";
    }

    function countWaitingForStation(all, stationName) {
        return all.filter(function (r) {
            if (isReleased(r)) return false;
            return typeof msrRecordIsWaitingForStation === "function"
                ? msrRecordIsWaitingForStation(r, stationName)
                : false;
        }).length;
    }

    /** בטיפול בתחנה בפועל (תחנה נוכחית) — בלי ממתינים לתור */
    function countPatientsForStation(all, stationName) {
        return all.filter(function (r) {
            if (isReleased(r)) return false;
            const cur = (r.currentStation || "").trim();
            return cur === stationName;
        }).length;
    }

    function renderCards(all) {
        const grid = $("stationsHubGrid");
        if (!grid || !window.MSR_STATIONS_OTHER) return;
        grid.innerHTML = "";
        MSR_STATIONS_OTHER.forEach(function (name, idx) {
            const waiting = countWaitingForStation(all, name);
            const patients = countPatientsForStation(all, name);
            const a = document.createElement("a");
            a.className = "station-hub-card station-color-" + idx;
            a.href = stationHref(name);
            const h = document.createElement("span");
            h.className = "station-hub-card-title";
            h.textContent = name;
            a.appendChild(h);
            const countEl = document.createElement("span");
            countEl.className = "station-hub-card-count";
            countEl.textContent = "ממתינים: " + waiting + " · מטופלים: " + patients;
            a.appendChild(countEl);
            const sub = document.createElement("span");
            sub.className = "station-hub-card-sub";
            sub.textContent = "לחיצה לכניסה לדף התחנה";
            a.appendChild(sub);
            grid.appendChild(a);
        });
    }

    async function loadAndRender() {
        const hint = $("stationsHubLoadHint");
        let all = [];
        try {
            const res = await fetchWithAuth(API_BASE + "/items");
            if (res.ok) {
                const data = await res.json();
                all = Array.isArray(data) ? data : [];
            }
        } catch (e) {
            console.error(e);
            if (hint) {
                hint.textContent = "לא ניתן לטעון מספר ממתינים — לחצו לרענון.";
                hint.classList.add("err");
            }
        }
        if (hint) {
            hint.textContent = "";
            hint.classList.remove("err");
        }
        renderCards(all);
    }

    function init() {
        loadAndRender();
        setInterval(function () {
            loadAndRender().catch(function (e) {
                console.error(e);
            });
        }, 20000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
