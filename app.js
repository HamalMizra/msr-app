(function () {
    "use strict";

    const API_BASE = "/api";
    const fetchWithAuth = (window.HAMALAuth && window.HAMALAuth.fetchWithAuth) || fetch;
    const EXPORT_HEADERS = [
        "תאריך ושעה",
        "שם פרטי",
        "שם משפחה",
        "טלפון",
        "מספר תעודת זהות",
        'בעצ"מ',
        "סיבת הגעה",
        "פירוט (אחר)",
        "שוחרר מהמרכז",
        "מלל שחרור / הערות",
        "סטטוס מעקב",
        "תחנה נוכחית",
        "תחנה הבאה",
        "הערות תחנות (JSON)",
        "הערות צוות לב ורווחה (נפרד)",
        "סיבות הגעה (JSON)",
        "תחנות המשך (JSON)",
        "הערות תחנה רפואה",
    ];

    let editTargetIndex = -1;
    let population = [];
    let registrations = [];

    const $ = (id) => document.getElementById(id);

	function normalizeImportedDate(value) {
	  if (value == null) return "";
	  const raw = String(value).trim();
	  if (!raw) return "";

	  // אם כבר ISO / פורמט תקין
	  const direct = new Date(raw);
	  if (!Number.isNaN(direct.getTime())) {
		return direct.toISOString();
	  }

	  // פורמט ישראלי: 15.4.2026, 15:22 או 15/4/2026 15:22
	  const m = raw.match(
		/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
	  );

	  if (m) {
		let [, d, mo, y, hh, mm, ss] = m;

		const day = parseInt(d, 10);
		const month = parseInt(mo, 10) - 1;
		let year = parseInt(y, 10);
		if (year < 100) year += 2000;

		const hour = parseInt(hh || "0", 10);
		const minute = parseInt(mm || "0", 10);
		const second = parseInt(ss || "0", 10);

		const dt = new Date(year, month, day, hour, minute, second);
		if (!Number.isNaN(dt.getTime())) {
		  return dt.toISOString();
		}
	  }

	  return "";
	}
	
    function digits(s) {
        return String(s || "").replace(/\D/g, "");
    }

    function idDigitsOnly(s) {
        let t = String(s || "").trim();
        if (t.endsWith(".0") && /^\d+\.0$/.test(t)) t = t.slice(0, -2);
        return t.replace(/\D/g, "");
    }

    function normId(s) {
        const d = idDigitsOnly(s);
        if (!d) return "";
        if (d.length > 9) return d;
        return d.padStart(9, "0");
    }

    function updateIdHint() {
        const el = $("idNumberHint");
        if (!el) return;
        const d = idDigitsOnly($("idNumber").value);
        if (!d) {
            el.textContent = "";
            el.classList.remove("err");
            return;
        }
        const ok =
            typeof window.isValidIsraeliID === "function" &&
            window.isValidIsraeliID(d);
        el.textContent = ok ? "" : "מספר תעודת הזהות אינו תקין.";
        el.classList.toggle("err", !ok);
    }

    function genRecordId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return "r-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    }

    function ensureRecordShape(r) {
        if (!r || typeof r !== "object") return r;
        if (typeof msrMigrateMedicalStationRename === "function") msrMigrateMedicalStationRename(r);
        if (Array.isArray(r.nextStations)) {
            r.nextStations =
                typeof msrStringifyNextStationsArr === "function"
                    ? msrStringifyNextStationsArr(r.nextStations)
                    : JSON.stringify(r.nextStations);
        }
        if (!r.recordId) r.recordId = genRecordId();
        if (r.releaseNotes == null) r.releaseNotes = "";
        if (r.arrivalOther == null) r.arrivalOther = "";
        const firstStation =
            window.MSR_STATIONS && MSR_STATIONS.length ? MSR_STATIONS[0] : "";
        const releasedRec = r.released === true || r.released === "כן";
        if (releasedRec) {
            r.currentStation = "";
        } else if (r.currentStation == null || r.currentStation === "") {
            r.currentStation = firstStation;
        }
        if (r.nextStation == null) r.nextStation = "";
        if (r.nextStations == null) r.nextStations = "";
        if (r.arrivalReasons == null) r.arrivalReasons = "";
        if (r.recordStatus == null || r.recordStatus === "") {
            r.recordStatus = "פתוח";
        }
        if (r.stationNotes == null || r.stationNotes === "") {
            r.stationNotes = "{}";
        }
        if (typeof msrMigrateLegacyMedicalNotes === "function") {
            msrMigrateLegacyMedicalNotes(r);
        }
        if (typeof msrMigrateLegacyLevNotes === "function") {
            msrMigrateLegacyLevNotes(r);
        }
        if (r.stationNotesMedical == null) {
            r.stationNotesMedical = "";
        }
        if (r.stationNotesLev == null) {
            r.stationNotesLev = "";
        }
        const nextListPre =
            typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(r)
                : [];
        if ((!r.nextStations || String(r.nextStations).trim() === "") && nextListPre.length) {
            r.nextStations =
                typeof msrStringifyNextStationsArr === "function"
                    ? msrStringifyNextStationsArr(nextListPre)
                    : JSON.stringify(nextListPre);
        } else if (!r.nextStations || String(r.nextStations).trim() === "") {
            r.nextStations = "[]";
        }
        const nextSynced =
            typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(r)
                : [];
        if (!(String(r.nextStation || "").trim()) && nextSynced.length) {
            r.nextStation = nextSynced[0] || "";
        }
        const reasonsSynced =
            typeof msrParseArrivalReasonsStr === "function"
                ? msrParseArrivalReasonsStr(r.arrivalReasons, r.arrivalReason)
                : [];
        if (!(String(r.arrivalReason || "").trim()) && reasonsSynced.length) {
            r.arrivalReason = reasonsSynced.join(", ");
        }
        if (
            (!r.arrivalReasons || String(r.arrivalReasons).trim() === "" || r.arrivalReasons === "[]") &&
            (String(r.arrivalReason || "").trim())
        ) {
            r.arrivalReasons =
                typeof msrStringifyArrivalReasonsArr === "function"
                    ? msrStringifyArrivalReasonsArr([String(r.arrivalReason).trim()])
                    : JSON.stringify([String(r.arrivalReason).trim()]);
        } else if (!r.arrivalReasons || String(r.arrivalReasons).trim() === "") {
            r.arrivalReasons =
                typeof msrStringifyArrivalReasonsArr === "function"
                    ? msrStringifyArrivalReasonsArr([])
                    : "[]";
        }
        if (r.stationPhases == null || r.stationPhases === "") {
            r.stationPhases = "{}";
        }
        if (r.visitedStations == null || r.visitedStations === "") {
            r.visitedStations = "[]";
        }
        return r;
    }

    function recordHasAnyArrivalReason(rec) {
        const s = ensureRecordShape({ ...rec });
        if ((s.arrivalReason || "").trim()) return true;
        if (typeof msrParseArrivalReasonsStr !== "function") return false;
        return msrParseArrivalReasonsStr(s.arrivalReasons, "").length > 0;
    }

    function collectArrivalReasonsFromForm() {
        return Array.from(document.querySelectorAll('input[name="arrivalReasonCb"]:checked'))
            .map(function (cb) {
                return (cb.value || "").trim();
            })
            .filter(Boolean);
    }

    function setArrivalReasonsCheckboxes(reasons) {
        const list = Array.isArray(reasons)
            ? reasons.map(function (x) {
                  return String(x || "").trim();
              }).filter(Boolean)
            : typeof msrParseArrivalReasonsStr === "function"
              ? msrParseArrivalReasonsStr(reasons, "")
              : [];
        const set = new Set(list);
        document.querySelectorAll('input[name="arrivalReasonCb"]').forEach(function (cb) {
            cb.checked = set.has(cb.value);
        });
    }

    function collectNextStationsFromForm() {
        const sel = $("nextStationsSelect");
        if (!sel) return [];
        return Array.from(sel.selectedOptions)
            .map(function (o) {
                return (o.value || "").trim();
            })
            .filter(Boolean);
    }

    function setNextStationsSelectValues(list) {
        const sel = $("nextStationsSelect");
        if (!sel) return;
        const set = new Set(
            Array.isArray(list)
                ? list.map(function (x) {
                      return String(x || "").trim();
                  }).filter(Boolean)
                : []
        );
        Array.from(sel.options).forEach(function (opt) {
            opt.selected = set.has(opt.value);
        });
    }

    function fillStationSelectOptions() {
        const cur = $("currentStation");
        const nextMulti = $("nextStationsSelect");
        if (!cur || !window.MSR_STATIONS) return;
        cur.innerHTML = "";
        if (nextMulti) nextMulti.innerHTML = "";
        MSR_STATIONS.forEach(function (name) {
            const o1 = document.createElement("option");
            o1.value = name;
            o1.textContent = name;
            cur.appendChild(o1);
            if (nextMulti) {
                const o2 = document.createElement("option");
                o2.value = name;
                o2.textContent = name;
                nextMulti.appendChild(o2);
            }
        });
    }

    function syncNextStationLabel() {
        /* תווית קבועה בטופס: תחנות המשך (ממתינים) */
    }

    function buildStationNotesFields() {
        const wrap = $("stationNotesFields");
        if (!wrap || !window.MSR_STATIONS_OTHER) return;
        wrap.innerHTML = "";
        MSR_STATIONS_OTHER.forEach(function (name, idx) {
            const div = document.createElement("div");
            div.className = "field full";
            const lab = document.createElement("label");
            lab.setAttribute("for", "sn_" + idx);
            lab.textContent = name;
            const ta = document.createElement("textarea");
            ta.id = "sn_" + idx;
            ta.className = "station-note-input";
            ta.setAttribute("data-idx", String(idx));
            ta.rows = 2;
            div.appendChild(lab);
            div.appendChild(ta);
            wrap.appendChild(div);
        });
    }

    function collectStationNotesFromForm() {
        const o = {};
        if (!window.MSR_STATIONS_OTHER || typeof msrStringifyStationNotes !== "function") {
            return "{}";
        }
        const fields = document.querySelectorAll("#stationNotesFields .station-note-input");
        fields.forEach(function (el) {
            const idx = parseInt(el.getAttribute("data-idx"), 10);
            const name = MSR_STATIONS_OTHER[idx];
            const v = el.value.trim();
            if (name && v) o[name] = v;
        });
        return msrStringifyStationNotes(o);
    }

    function fillStationNotesFormFromRecord(r) {
        if (!window.MSR_STATIONS_OTHER || typeof msrParseStationNotes !== "function") return;
        const shaped = ensureRecordShape({ ...r });
        const parsed = msrParseStationNotes(shaped.stationNotes);
        if (window.MSR_LEV_STATION) delete parsed[MSR_LEV_STATION];
        if (window.MSR_MEDICAL_STATION) delete parsed[MSR_MEDICAL_STATION];
        if (!$("stationNotesFields")) {
            const levIn = $("stationNotesLevInput");
            if (levIn) levIn.value = shaped.stationNotesLev || "";
            const medIn = $("stationNotesMedicalInput");
            if (medIn) medIn.value = shaped.stationNotesMedical || "";
            return;
        }
        document.querySelectorAll("#stationNotesFields .station-note-input").forEach(function (el) {
            const idx = parseInt(el.getAttribute("data-idx"), 10);
            const name = MSR_STATIONS_OTHER[idx];
            el.value = name && parsed[name] != null ? String(parsed[name]) : "";
        });
        const levIn = $("stationNotesLevInput");
        if (levIn) levIn.value = shaped.stationNotesLev || "";
        const medIn = $("stationNotesMedicalInput");
        if (medIn) medIn.value = shaped.stationNotesMedical || "";
    }

    async function loadFromServer() {
        const res = await fetchWithAuth(`${API_BASE}/items`);
        if (!res.ok) throw new Error("Failed to load data");
        const data = await res.json();
        registrations = Array.isArray(data) ? data.map(ensureRecordShape) : [];
    }

    async function saveToServer(record) {
        const res = await fetchWithAuth(`${API_BASE}/items`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(record),
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Failed to save: ${res.status} ${txt}`);
        }
    }

    function formatDateDisplay(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString("he-IL", {
            dateStyle: "short",
            timeStyle: "short",
        });
    }

    function indicationIsYes(r) {
        if (r.indication === true || r.indication === "כן") return true;
        if (
            r.indication === false ||
            r.indication === "לא" ||
            r.indication == null ||
            r.indication === ""
        ) {
            return false;
        }
        if (typeof r.indication === "string" && r.indication.trim() !== "") {
            return true;
        }
        return false;
    }

    function escapeHtml(s) {
        const d = document.createElement("div");
        d.textContent = s == null ? "" : String(s);
        return d.innerHTML;
    }

    function renderTable() {
        const empty = $("recordsEmpty");
        const wrap = $("recordsTableWrap");
        const body = $("recordsBody");
        if (!empty || !wrap || !body) return;

        if (!registrations.length) {
            empty.classList.remove("hidden");
            wrap.classList.add("hidden");
            body.textContent = "";
            return;
        }

        empty.classList.add("hidden");
        wrap.classList.remove("hidden");
        body.textContent = "";

        registrations.forEach((r, idx) => {
            const tr = document.createElement("tr");
            const notes = (r.releaseNotes || "").trim();
            const st = ensureRecordShape({ ...r });
            const statusShort = (st.recordStatus || "").trim() || "—";
            const curSt = (st.currentStation || "").trim() || "—";
            const nextList =
                typeof msrGetNextStationsListFromRecord === "function"
                    ? msrGetNextStationsListFromRecord(st)
                    : [];
            const nextSt =
                (nextList.length ? nextList.join(", ") : (st.nextStation || "").trim()) || "—";
            const arrivalDisp =
                typeof msrFormatArrivalReasonsDisplay === "function"
                    ? msrFormatArrivalReasonsDisplay(st)
                    : st.arrivalReason || "";
            const dateStr = r.updatedAt
                ? formatDateDisplay(r.savedAt) +
                " (עודכן: " +
                formatDateDisplay(r.updatedAt) +
                ")"
                : formatDateDisplay(r.savedAt);

            tr.innerHTML =
                "<td>" +
                escapeHtml(dateStr) +
                "</td><td>" +
                escapeHtml(r.firstName) +
                "</td><td>" +
                escapeHtml(r.familyName) +
                "</td><td>" +
                escapeHtml(r.phone) +
                "</td><td>" +
                escapeHtml(r.idNumber) +
                "</td><td>" +
                escapeHtml(indicationIsYes(r) ? "כן" : "לא") +
                "</td><td>" +
                escapeHtml(arrivalDisp) +
                "</td><td>" +
                escapeHtml(r.released ? "כן" : "לא") +
                "</td><td>" +
                escapeHtml(statusShort.length > 12 ? statusShort.slice(0, 12) + "…" : statusShort) +
                "</td><td>" +
                escapeHtml(curSt.length > 18 ? curSt.slice(0, 18) + "…" : curSt) +
                "</td><td>" +
                escapeHtml(nextSt.length > 18 ? nextSt.slice(0, 18) + "…" : nextSt) +
                "</td><td>" +
                escapeHtml(notes.length > 40 ? notes.slice(0, 40) + "…" : notes) +
                '</td><td class="cell-actions">' +
                '<button type="button" class="secondary btn-edit-row" data-idx="' +
                idx +
                '">עריכה</button>' +
                "</td>";

            body.appendChild(tr);
        });

        body.querySelectorAll(".btn-edit-row").forEach((btn) => {
            btn.addEventListener("click", () => {
                const i = parseInt(btn.getAttribute("data-idx"), 10);
                loadRecordIntoForm(i);
            });
        });
    }

    async function loadPopulation() {
        const st = $("searchStatus");
        if (!st) return;

        st.textContent = "טוען נתוני אוכלוסייה…";
        st.classList.remove("err");

        try {
            const res = await fetch("population.json", { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            population = await res.json();
            if (!Array.isArray(population)) throw new Error("פורמט לא תקין");
            st.textContent = "נטענו " + population.length + " רשומות אוכלוסייה.";
        } catch (e) {
            st.textContent =
                "לא ניתן לטעון population.json (ודאו שהקובץ באותה תיקייה כמו הדף, ושהאתר נטען ב-HTTPS/HTTP ולא מ-file://).";
            st.classList.add("err");
            population = [];
        }
    }

    function getSearchMode() {
        const r = document.querySelector('input[name="searchMode"]:checked');
        return r ? r.value : "name";
    }

    const NAME_SUGGEST_CAP = 18;
    let nameSuggestTimer = null;
    let nameMatches = [];
    let nameHighlight = -1;

    function tokenizeQuery(q) {
        return String(q || "")
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
    }

    function personMatchesNameTokens(p, tokens) {
        if (!tokens.length) return false;
        const pf = (p.first || "").toLowerCase();
        const pfa = (p.family || "").toLowerCase();
        return tokens.every((t) => pf.includes(t) || pfa.includes(t));
    }

    function filterPopulationByName(q) {
        const tokens = tokenizeQuery(q);
        if (!tokens.length) return [];
        return population.filter((p) => personMatchesNameTokens(p, tokens));
    }

    function sortPopulationByName(arr) {
        return arr.slice().sort((a, b) => {
            const fa = (a.family || "").localeCompare(b.family || "", "he");
            if (fa !== 0) return fa;
            return (a.first || "").localeCompare(b.first || "", "he");
        });
    }

    function applyPopulationToForm(p) {
        $("firstName").value = p.first || "";
        $("familyName").value = p.family || "";
        $("phone").value = p.phone || "";
        $("idNumber").value = normId(p.id);
        updateIdHint();

        const st = $("formStatus");
        if (st) {
            st.textContent =
                "השדות מולאו מאוכלוסיית מזרע. השלימו את שאר השדות ושמרו.";
            st.classList.remove("err");
        }
    }

    function hideNameSuggestions() {
        const ul = $("nameSuggestionsList");
        const inp = $("qName");
        if (!ul || !inp) return;

        ul.classList.add("hidden");
        ul.innerHTML = "";
        nameMatches = [];
        nameHighlight = -1;
        inp.setAttribute("aria-expanded", "false");
    }

    function updateNameHighlightUI() {
        const ul = $("nameSuggestionsList");
        if (!ul) return;
        ul.querySelectorAll('li[role="option"]').forEach((li, i) => {
            li.setAttribute("aria-selected", i === nameHighlight ? "true" : "false");
        });
    }

    function renderNameSuggestions(matches) {
        const ul = $("nameSuggestionsList");
        const inp = $("qName");
        if (!ul || !inp) return;

        ul.innerHTML = "";
        nameMatches = matches.slice(0, NAME_SUGGEST_CAP);
        nameHighlight = nameMatches.length ? 0 : -1;

        if (!nameMatches.length) {
            ul.classList.add("hidden");
            inp.setAttribute("aria-expanded", "false");
            return;
        }

        nameMatches.forEach((p) => {
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", "false");

            const title = ((p.first || "") + " " + (p.family || "")).trim();
            li.textContent = title || "(רשומה ריקה)";

            const meta = document.createElement("div");
            meta.className = "meta";
            const parts = [];
            if (p.phone) parts.push(p.phone);
            if (p.id) parts.push("ת״ז " + p.id);
            if (p.housing) parts.push("מגורים: " + p.housing);
            meta.textContent = parts.join(" · ");
            if (meta.textContent) li.appendChild(meta);

            li.addEventListener("mousedown", (e) => {
                e.preventDefault();
                applyPopulationToForm(p);
                $("qName").value = title;
                hideNameSuggestions();
            });

            ul.appendChild(li);
        });

        ul.classList.remove("hidden");
        inp.setAttribute("aria-expanded", "true");
        updateNameHighlightUI();
    }

    function scheduleNameAutocomplete() {
        if (nameSuggestTimer) clearTimeout(nameSuggestTimer);
        nameSuggestTimer = setTimeout(() => {
            nameSuggestTimer = null;

            if (getSearchMode() !== "name") return;
            const q = $("qName").value;
            const tokens = tokenizeQuery(q);

            if (!tokens.length || !population.length) {
                hideNameSuggestions();
                return;
            }

            const matches = sortPopulationByName(filterPopulationByName(q));
            renderNameSuggestions(matches);
        }, 100);
    }

    function moveNameHighlight(delta) {
        if (!nameMatches.length) return;
        nameHighlight =
            (nameHighlight + delta + nameMatches.length) % nameMatches.length;
        updateNameHighlightUI();
    }

    function confirmNameHighlight() {
        if (nameHighlight < 0 || nameHighlight >= nameMatches.length) return;
        const p = nameMatches[nameHighlight];
        applyPopulationToForm(p);
        $("qName").value = ((p.first || "") + " " + (p.family || "")).trim();
        hideNameSuggestions();
    }

    function syncSearchFields() {
        const mode = getSearchMode();
        $("searchFieldsName").classList.toggle("hidden", mode !== "name");
        $("searchFieldsPhone").classList.toggle("hidden", mode !== "phone");
        $("searchFieldsId").classList.toggle("hidden", mode !== "id");
        $("btnSearch").classList.toggle("hidden", mode === "name");
        if (mode !== "name") hideNameSuggestions();
    }

    function runSearch() {
        const st = $("searchStatus");
        const ul = $("searchResults");
        if (!st || !ul) return;

        ul.classList.add("hidden");
        ul.innerHTML = "";
        st.classList.remove("err");

        if (!population.length) {
            st.textContent = "אין נתוני אוכלוסייה לחיפוש.";
            st.classList.add("err");
            return;
        }

        const mode = getSearchMode();
        let matches = [];

        if (mode === "phone") {
            const q = digits($("qPhone").value);
            if (!q || q.length < 4) {
                st.textContent = "הזינו לפחות 4 ספרות טלפון לחיפוש.";
                st.classList.add("err");
                return;
            }
            matches = population.filter((p) => {
                const pd = p.phoneDigits || digits(p.phone);
                return pd.includes(q);
            });
        } else if (mode === "id") {
            const q = idDigitsOnly($("qId").value);
            if (q.length < 4) {
                st.textContent = "הזינו לפחות 4 ספרות מתעודת הזהות.";
                st.classList.add("err");
                return;
            }
            matches = population.filter((p) => {
                const pid = idDigitsOnly(p.id);
                return pid.includes(q);
            });
        } else if (mode === "name") {
            st.textContent =
                "בחיפוש לפי שם ההשלמה מוצגת אוטומטית תוך כדי הקלדה בשדה שם.";
            return;
        } else {
            st.textContent = "בחרו סוג חיפוש.";
            return;
        }

        if (!matches.length) {
            st.textContent = "לא נמצאו תוצאות.";
            return;
        }

        st.textContent =
            "נמצאו " + matches.length + " תוצאות. לחצו על רשומה למילוי הטופס.";
        ul.classList.remove("hidden");

        matches.slice(0, 80).forEach((p) => {
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.tabIndex = 0;

            const title =
                (p.first || "") +
                " " +
                (p.family || "") +
                (p.phone ? " · " + p.phone : "") +
                (p.id ? " · ת״ז " + p.id : "");

            li.textContent = title.trim() || "(רשומה ריקה)";

            const meta = document.createElement("div");
            meta.className = "meta";
            const parts = [];
            if (p.housing) parts.push("מגורים: " + p.housing);
            if (p.email) parts.push(p.email);
            meta.textContent = parts.join(" · ");
            li.appendChild(meta);

            function apply() {
                applyPopulationToForm(p);
            }

            li.addEventListener("click", apply);
            li.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    apply();
                }
            });

            ul.appendChild(li);
        });

        if (matches.length > 80) {
            st.textContent += " מוצגות 80 הראשונות בלבד.";
        }
    }

    function clearSearchResults() {
        $("searchResults").classList.add("hidden");
        $("searchResults").innerHTML = "";
        $("searchStatus").textContent = "";
        $("qName").value = "";
        $("qPhone").value = "";
        $("qId").value = "";
        hideNameSuggestions();
    }

    function syncOtherField() {
        const wrap = $("otherDetailWrap");
        const otherCb = document.querySelector('input[name="arrivalReasonCb"][value="אחר"]');
        const isOther = otherCb && otherCb.checked;
        if (wrap) wrap.classList.toggle("hidden", !isOther);
        if (!isOther && $("arrivalOther")) $("arrivalOther").value = "";
    }

    function syncReleaseNotesWrap() {
        const wrap = $("releaseNotesWrap");
        const rel = $("released").checked;
        wrap.classList.toggle("hidden", !rel);
        if (!rel) $("releaseNotes").value = "";
    }

    function clearEditMode() {
        editTargetIndex = -1;
        const b = $("editModeBanner");
        if (b) b.classList.add("hidden");
    }

    function loadRecordIntoForm(idx) {
        const r = registrations[idx];
        if (!r) return;

        ensureRecordShape(r);
        editTargetIndex = idx;

        $("firstName").value = r.firstName || "";
        $("familyName").value = r.familyName || "";
        $("phone").value = r.phone || "";
        $("idNumber").value = r.idNumber || "";
        $("indication").checked = indicationIsYes(r);
        const shaped = ensureRecordShape({ ...r });
        setArrivalReasonsCheckboxes(
            typeof msrParseArrivalReasonsStr === "function"
                ? msrParseArrivalReasonsStr(shaped.arrivalReasons, shaped.arrivalReason)
                : []
        );
        $("arrivalOther").value = r.arrivalOther || "";
        $("released").checked = !!r.released;
        $("releaseNotes").value = r.releaseNotes || "";

        if ($("currentStation")) $("currentStation").value = shaped.currentStation || "";
        setNextStationsSelectValues(
            typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(shaped)
                : []
        );
        syncNextStationLabel();
        fillStationNotesFormFromRecord(shaped);

        syncOtherField();
        syncReleaseNotesWrap();

        $("editModeBanner").classList.remove("hidden");
        $("formStatus").textContent = "טופס מוכן לעריכה. שמרו כדי לעדכן את הרשומה.";
        $("formStatus").classList.remove("err");

        updateIdHint();
        $("firstName").focus();
    }

    function findExistingIndex(phone, idNumber) {
        const idN = normId(idNumber);
        const ph = digits(phone);

        if (idN && idN.length >= 4) {
            for (let i = registrations.length - 1; i >= 0; i--) {
                if (normId(registrations[i].idNumber) === idN) return i;
            }
        }

        if (ph.length >= 7) {
            for (let i = registrations.length - 1; i >= 0; i--) {
                if (digits(registrations[i].phone) === ph) return i;
            }
        }

        return -1;
    }

    function resetForm() {
        $("regForm").reset();
        syncOtherField();
        syncReleaseNotesWrap();
        clearEditMode();
        $("formStatus").textContent = "";
        updateIdHint();
        if ($("currentStation") && window.MSR_STATIONS && MSR_STATIONS.length) {
            $("currentStation").value = MSR_STATIONS[0];
        }
        setNextStationsSelectValues([]);
        setArrivalReasonsCheckboxes([]);
        syncNextStationLabel();
        fillStationNotesFormFromRecord({
            stationNotes: "{}",
            stationNotesLev: "",
            stationNotesMedical: "",
        });
    }

    function rowToRecord(row) {
        const pick = (keys) => {
            for (const k of keys) {
                if (row[k] != null && String(row[k]).trim() !== "") {
                    return String(row[k]).trim();
                }
            }
            return "";
        };

        const releasedRaw = pick(["שוחרר מהמרכז", "שוחרר"]);
        const released =
            releasedRaw === "כן" ||
                releasedRaw === true ||
                releasedRaw === "TRUE" ||
                releasedRaw === "true"
                ? true
                : false;

        const indicationRaw = pick([
            'בעצ"מ',
            'אינדיקציית בעצ"מ',
            "אינדיקציה",
            "אינדיקציית בעצם",
        ]);

        let indication = false;
        if (
            indicationRaw === "כן" ||
            indicationRaw === true ||
            indicationRaw === "TRUE" ||
            indicationRaw === "true"
        ) {
            indication = true;
        } else if (typeof indicationRaw === "string" && indicationRaw.trim() !== "") {
            indication = true;
        }

        const releaseNotes = pick([
            "מלל שחרור / הערות",
            "הערות שחרור",
            "מלל שחרור",
            "הערות",
        ]);

        const stationNotesExcel = pick([
            "הערות תחנות (JSON)",
            "הערות תחנות",
            "הערות לפי תחנה",
        ]);

        const stationNotesLevExcel = pick([
            "הערות צוות לב ורווחה (נפרד)",
            "הערות צוות לב ורווחה",
            "הערות לב ורווחה",
        ]);

        const stationNotesMedicalExcel = pick([
            "הערות תחנה רפואה",
            "הערות רופאית",
        ]);

        function parseBracketJsonArray(cell) {
            const t = String(cell || "").trim();
            if (!t || t.charCodeAt(0) !== 91) return null;
            try {
                const j = JSON.parse(t);
                return Array.isArray(j)
                    ? j
                          .map(function (x) {
                              return String(x || "").trim();
                          })
                          .filter(Boolean)
                    : null;
            } catch {
                return null;
            }
        }

        const arrivalReasonsCell = pick(["סיבות הגעה (JSON)"]);
        const reasonsFromJson = parseBracketJsonArray(arrivalReasonsCell);
        const arrivalReasonCell = pick(["סיבת הגעה"]);
        let arrivalReasonsStr = "[]";
        let arrivalReasonStr = "";
        if (reasonsFromJson && reasonsFromJson.length) {
            arrivalReasonsStr =
                typeof msrStringifyArrivalReasonsArr === "function"
                    ? msrStringifyArrivalReasonsArr(reasonsFromJson)
                    : JSON.stringify(reasonsFromJson);
            arrivalReasonStr = reasonsFromJson.join(", ");
        } else if (arrivalReasonCell) {
            arrivalReasonStr = String(arrivalReasonCell).trim();
            arrivalReasonsStr =
                typeof msrStringifyArrivalReasonsArr === "function"
                    ? msrStringifyArrivalReasonsArr([arrivalReasonStr])
                    : JSON.stringify([arrivalReasonStr]);
        }

        const nextStationsCell = pick(["תחנות המשך (JSON)"]);
        const nextFromJson = parseBracketJsonArray(nextStationsCell);
        const nextStationCell = pick(["תחנה הבאה"]);
        let nextStationsStr = "[]";
        let nextStationStr = "";
        if (nextFromJson && nextFromJson.length) {
            nextStationsStr =
                typeof msrStringifyNextStationsArr === "function"
                    ? msrStringifyNextStationsArr(nextFromJson)
                    : JSON.stringify(nextFromJson);
            nextStationStr = nextFromJson[0] || "";
        } else if (nextStationCell) {
            nextStationStr = String(nextStationCell).trim();
            nextStationsStr =
                typeof msrStringifyNextStationsArr === "function"
                    ? msrStringifyNextStationsArr([nextStationStr])
                    : JSON.stringify([nextStationStr]);
        }

        return {
            recordId: genRecordId(),
            savedAt: normalizeImportedDate(pick(["תאריך ושעה", "תאריך"])) || new Date().toISOString(),
            firstName: pick(["שם פרטי"]),
            familyName: pick(["שם משפחה"]),
            phone: pick(["טלפון", "מספר טלפון"]),
            idNumber: normId(pick(["מספר תעודת זהות", "תעודת זהות", "תז"])),
            indication,
            arrivalReason: arrivalReasonStr,
            arrivalReasons: arrivalReasonsStr,
            arrivalOther: pick(["פירוט (אחר)", "פירוט"]),
            released,
            releaseNotes,
            recordStatus: pick(["סטטוס מעקב", "סטטוס"]) || "פתוח",
            currentStation: pick(["תחנה נוכחית"]) || "",
            nextStation: nextStationStr,
            nextStations: nextStationsStr,
            stationNotes:
                stationNotesExcel && String(stationNotesExcel).trim()
                    ? String(stationNotesExcel).trim()
                    : "{}",
            stationNotesLev: stationNotesLevExcel || "",
            stationNotesMedical: stationNotesMedicalExcel || "",
        };
    }

    function exportExcel() {
        const st = $("excelStatus");
        if (!st) return;

        st.classList.remove("err");
        if (!registrations.length) {
            st.textContent = "אין רשומות לייצוא.";
            st.classList.add("err");
            return;
        }

        const rows = registrations.map((r) => {
            const s = ensureRecordShape({ ...r });
            const arrivalDisp =
                typeof msrFormatArrivalReasonsDisplay === "function"
                    ? msrFormatArrivalReasonsDisplay(s)
                    : s.arrivalReason || "";
            const nextJoin =
                typeof msrGetNextStationsListFromRecord === "function"
                    ? msrGetNextStationsListFromRecord(s).join("; ")
                    : "";
            return {
                [EXPORT_HEADERS[0]]: r.savedAt || "",
                [EXPORT_HEADERS[1]]: r.firstName,
                [EXPORT_HEADERS[2]]: r.familyName,
                [EXPORT_HEADERS[3]]: r.phone,
                [EXPORT_HEADERS[4]]: r.idNumber,
                [EXPORT_HEADERS[5]]: indicationIsYes(r) ? "כן" : "לא",
                [EXPORT_HEADERS[6]]: arrivalDisp,
                [EXPORT_HEADERS[7]]: r.arrivalOther,
                [EXPORT_HEADERS[8]]: r.released ? "כן" : "לא",
                [EXPORT_HEADERS[9]]: r.releaseNotes || "",
                [EXPORT_HEADERS[10]]: s.recordStatus || "",
                [EXPORT_HEADERS[11]]: s.currentStation || "",
                [EXPORT_HEADERS[12]]: nextJoin || s.nextStation || "",
                [EXPORT_HEADERS[13]]: s.stationNotes || "{}",
                [EXPORT_HEADERS[14]]: s.stationNotesLev || "",
                [EXPORT_HEADERS[15]]: s.arrivalReasons || "[]",
                [EXPORT_HEADERS[16]]: s.nextStations || "[]",
                [EXPORT_HEADERS[17]]: s.stationNotesMedical || "",
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "רישומים");

        const fname =
            "merkaz-siua-rishum-" + new Date().toISOString().slice(0, 10) + ".xlsx";

        XLSX.writeFile(wb, fname);
        st.textContent = "הקובץ הורד: " + fname;
    }

    /*function importExcel(file) {
        const st = $("excelStatus");
        if (!st) return;

        st.classList.remove("err");

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: "array" });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

                if (!json.length) {
                    st.textContent = "הגיליון ריק.";
                    st.classList.add("err");
                    return;
                }

                let added = 0;
                json.forEach((row) => {
                    const rec = rowToRecord(row);
                    if (
                        !rec.firstName &&
                        !rec.familyName &&
                        !rec.phone &&
                        !rec.idNumber &&
                        !recordHasAnyArrivalReason(rec)
                    ) {
                        return;
                    }
                    registrations.push(rec);
                    added++;
                });

                renderTable();
                st.textContent = "יובאו " + added + " רשומות מהקובץ.";
            } catch (err) {
                st.textContent = "שגיאה בקריאת הקובץ: " + (err.message || err);
                st.classList.add("err");
            }
        };

        reader.readAsArrayBuffer(file);
    }*/
    async function uploadImportedRecord(rec) {
        const res = await fetchWithAuth(`${API_BASE}/items`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(rec),
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Failed to save imported row: ${res.status} ${txt}`);
        }
    }

    function importExcel(file) {
        const st = $("excelStatus");
        st.classList.remove("err");

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: "array" });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

                if (!json.length) {
                    st.textContent = "הגיליון ריק.";
                    st.classList.add("err");
                    return;
                }

                let added = 0;
                let skipped = 0;

                for (const row of json) {
                    const rec = rowToRecord(row);

                    if (
                        !rec.firstName &&
                        !rec.familyName &&
                        !rec.phone &&
                        !rec.idNumber &&
                        !recordHasAnyArrivalReason(rec)
                    ) {
                        skipped++;
                        continue;
                    }

                    await uploadImportedRecord(rec);
                    added++;
                }

                await loadFromServer();
                renderTable();

                st.textContent =
                    `יובאו ${added} רשומות מהקובץ.` +
                    (skipped ? ` דולגו ${skipped} שורות ריקות.` : "");
            } catch (err) {
                console.error(err);
                st.textContent = "שגיאה בייבוא הקובץ: " + (err.message || err);
                st.classList.add("err");
            }
        };

        reader.readAsArrayBuffer(file);
    }

    async function init() {
        try {
            await loadFromServer();
            renderTable();
        } catch (e) {
            console.error(e);
            const fs = $("formStatus");
            if (fs) {
                fs.textContent = "בעיה בטעינת נתונים מהשרת.";
                fs.classList.add("err");
            }
        }

        document.querySelectorAll('input[name="searchMode"]').forEach((el) => {
            el.addEventListener("change", syncSearchFields);
        });
        syncSearchFields();

        $("btnSearch").addEventListener("click", runSearch);
        $("btnClearSearch").addEventListener("click", clearSearchResults);

        $("qName").addEventListener("input", scheduleNameAutocomplete);
        $("qName").addEventListener("keydown", (ev) => {
            if (getSearchMode() !== "name") return;
            const ul = $("nameSuggestionsList");
            const hidden = ul.classList.contains("hidden");
            const tokens = tokenizeQuery($("qName").value);

            if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
                if (!tokens.length || !population.length) return;
                if (hidden) {
                    ev.preventDefault();
                    const matches = sortPopulationByName(
                        filterPopulationByName($("qName").value)
                    );
                    renderNameSuggestions(matches);
                    if (ev.key === "ArrowUp" && nameMatches.length) {
                        nameHighlight = nameMatches.length - 1;
                    }
                    updateNameHighlightUI();
                    return;
                }
            }

            if (hidden) return;

            if (ev.key === "ArrowDown") {
                ev.preventDefault();
                moveNameHighlight(1);
            } else if (ev.key === "ArrowUp") {
                ev.preventDefault();
                moveNameHighlight(-1);
            } else if (ev.key === "Enter") {
                if (nameMatches.length) {
                    ev.preventDefault();
                    confirmNameHighlight();
                }
            } else if (ev.key === "Escape") {
                ev.preventDefault();
                hideNameSuggestions();
            }
        });

        document.addEventListener("mousedown", (ev) => {
            const wrap = document.querySelector(".autocomplete-wrap");
            if (wrap && !wrap.contains(ev.target)) hideNameSuggestions();
        });

        document.querySelectorAll('input[name="arrivalReasonCb"]').forEach(function (cb) {
            cb.addEventListener("change", syncOtherField);
        });
        syncOtherField();

        $("released").addEventListener("change", syncReleaseNotesWrap);
        syncReleaseNotesWrap();

        $("btnCancelEdit").addEventListener("click", resetForm);
        $("btnResetForm").addEventListener("click", resetForm);

        const idEl = $("idNumber");
        if (idEl) {
            idEl.addEventListener("input", updateIdHint);
            idEl.addEventListener("blur", updateIdHint);
        }

        $("regForm").addEventListener("submit", async (ev) => {
            ev.preventDefault();

            const fs = $("formStatus");
            fs.classList.remove("err");

            const firstName = $("firstName").value.trim();
            const familyName = $("familyName").value.trim();
            const phone = $("phone").value.trim();

            const idDigitsRaw = idDigitsOnly($("idNumber").value);
            if (idDigitsRaw) {
                if (
                    typeof window.isValidIsraeliID !== "function" ||
                    !window.isValidIsraeliID(idDigitsRaw)
                ) {
                    fs.textContent = "מספר תעודת הזהות אינו תקין.";
                    fs.classList.add("err");
                    return;
                }
            }

            const idNumber = idDigitsRaw ? idDigitsRaw.padStart(9, "0") : "";
            const indication = $("indication").checked;
            const arrivalReasonsArr = collectArrivalReasonsFromForm();
            const arrivalOther = $("arrivalOther").value.trim();
            const released = $("released").checked;
            const releaseNotes = released ? $("releaseNotes").value.trim() : "";
            const currentStation = $("currentStation") ? $("currentStation").value : "";
            const nextStationsArr = collectNextStationsFromForm();
            const stationNotesLev = $("stationNotesLevInput")
                ? $("stationNotesLevInput").value.trim()
                : "";
            const stationNotesMedical = $("stationNotesMedicalInput")
                ? $("stationNotesMedicalInput").value.trim()
                : "";

            if (!firstName || !familyName || !phone) {
                fs.textContent = "נא למלא שם פרטי, שם משפחה וטלפון.";
                fs.classList.add("err");
                return;
            }

            if (!arrivalReasonsArr.length) {
                fs.textContent = "נא לבחור לפחות סיבת הגעה אחת.";
                fs.classList.add("err");
                return;
            }

            if (arrivalReasonsArr.indexOf("אחר") >= 0 && !arrivalOther) {
                fs.textContent = 'כאשר נבחרה סיבת הגעה "אחר", נא למלא פירוט.';
                fs.classList.add("err");
                return;
            }

            let idx = editTargetIndex;
            if (idx < 0 || idx >= registrations.length) {
                idx = findExistingIndex(phone, idNumber);
            }

            const now = new Date().toISOString();
            const base =
                idx >= 0 && idx < registrations.length
                    ? { ...ensureRecordShape(registrations[idx]) }
                    : { recordId: genRecordId(), savedAt: now };

            let stationNotes;
            if ($("stationNotesFields") && $("stationNotesFields").querySelector(".station-note-input")) {
                stationNotes = collectStationNotesFromForm();
            } else {
                stationNotes = base.stationNotes != null ? base.stationNotes : "{}";
            }

            let recordStatus = released ? "סגור" : base.recordStatus || "פתוח";

            const arrivalReasonsJson =
                typeof msrStringifyArrivalReasonsArr === "function"
                    ? msrStringifyArrivalReasonsArr(arrivalReasonsArr)
                    : JSON.stringify(arrivalReasonsArr);
            const arrivalReasonJoined = arrivalReasonsArr.join(", ");
            const nextStationsJson =
                typeof msrStringifyNextStationsArr === "function"
                    ? msrStringifyNextStationsArr(nextStationsArr)
                    : JSON.stringify(nextStationsArr);
            const nextStationLegacy = nextStationsArr.length ? nextStationsArr[0] : "";

            const rec = {
                ...base,
                firstName,
                familyName,
                phone,
                idNumber,
                indication: !!indication,
                arrivalReason: arrivalReasonJoined,
                arrivalReasons: arrivalReasonsJson,
                arrivalOther: arrivalReasonsArr.indexOf("אחר") >= 0 ? arrivalOther : "",
                released: !!released,
                releaseNotes: released ? releaseNotes : "",
                recordStatus: recordStatus,
                currentStation: currentStation || (MSR_STATIONS && MSR_STATIONS[0]) || "",
                nextStation: nextStationLegacy,
                nextStations: nextStationsJson,
                stationNotes,
                stationNotesLev,
                stationNotesMedical,
                stationPhases: base.stationPhases != null ? base.stationPhases : "{}",
                visitedStations: base.visitedStations != null ? base.visitedStations : "[]",
                updatedAt: idx >= 0 ? now : undefined,
            };

            if (released) {
                if (
                    typeof msrMergeVisitedForRelease === "function" &&
                    typeof msrCloseAllVisitedStationPhases === "function" &&
                    typeof msrStringifyVisitedStations === "function"
                ) {
                    const vis = msrMergeVisitedForRelease(rec);
                    rec.visitedStations = msrStringifyVisitedStations(vis);
                    rec.stationPhases = msrCloseAllVisitedStationPhases(
                        rec.stationPhases || "{}",
                        rec.visitedStations
                    );
                }
                rec.recordStatus = "סגור";
                rec.currentStation = "";
            }

            try {
                await saveToServer(rec);
                await loadFromServer();
                clearEditMode();
                renderTable();
                syncReleaseNotesWrap();
                $("firstName").focus();

                fs.textContent =
                    idx >= 0
                        ? "הרשומה עודכנה בהצלחה."
                        : "הרשומה נוספה בהצלחה.";
            } catch (err) {
                console.error(err);
                fs.textContent = "שגיאה בשמירה לשרת.";
                fs.classList.add("err");
            }
        });

        $("btnExport").addEventListener("click", exportExcel);

        $("importFile").addEventListener("change", (ev) => {
            const f = ev.target.files && ev.target.files[0];
            ev.target.value = "";
            if (f) importExcel(f);
        });

        loadPopulation();

        fillStationSelectOptions();
        buildStationNotesFields();

        syncNextStationLabel();

        setInterval(async () => {
            try {
                await loadFromServer();
                renderTable();
            } catch (e) {
                console.error("Auto refresh failed", e);
            }
        }, 5000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();