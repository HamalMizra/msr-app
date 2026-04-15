(function () {
    "use strict";

    const API_BASE = "/api";
    const fetchWithAuth = (window.HAMALAuth && window.HAMALAuth.fetchWithAuth) || fetch;

    let PAGE_STATION = "";
    let isLevPage = false;
    let isMedicalPage = false;
    let allRecords = [];
    let poolRecords = [];

    function $(id) {
        return document.getElementById(id);
    }

    function getStationFromQuery() {
        const p = new URLSearchParams(window.location.search || "");
        const raw = p.get("s") || p.get("station") || "";
        try {
            return decodeURIComponent(raw).trim();
        } catch {
            return raw.trim();
        }
    }

    function formatDateDisplay(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
    }

    function genRecordId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
        return "r-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    }

    function isReleased(r) {
        return r.released === true || r.released === "כן";
    }

    function ensureShape(r) {
        if (!r || typeof r !== "object") return r;
        if (typeof msrMigrateMedicalStationRename === "function") msrMigrateMedicalStationRename(r);
        if (Array.isArray(r.nextStations)) {
            r.nextStations =
                typeof msrStringifyNextStationsArr === "function"
                    ? msrStringifyNextStationsArr(r.nextStations)
                    : JSON.stringify(r.nextStations);
        }
        if (!r.recordId) r.recordId = r.rowKey || genRecordId();
        if (r.releaseNotes == null) r.releaseNotes = "";
        if (r.arrivalOther == null) r.arrivalOther = "";
        const first = window.MSR_STATIONS && MSR_STATIONS.length ? MSR_STATIONS[0] : "";
        const releasedRec = r.released === true || r.released === "כן";
        if (releasedRec) {
            r.currentStation = "";
        } else if (r.currentStation == null || r.currentStation === "") {
            r.currentStation = first;
        }
        if (r.nextStation == null) r.nextStation = "";
        if (r.nextStations == null) r.nextStations = "";
        if (r.arrivalReasons == null) r.arrivalReasons = "";
        if (r.recordStatus == null || r.recordStatus === "") r.recordStatus = "פתוח";
        if (r.stationNotes == null || r.stationNotes === "") r.stationNotes = "{}";
        if (typeof msrMigrateLegacyMedicalNotes === "function") msrMigrateLegacyMedicalNotes(r);
        if (typeof msrMigrateLegacyLevNotes === "function") msrMigrateLegacyLevNotes(r);
        if (r.stationNotesMedical == null) r.stationNotesMedical = "";
        const nextList =
            typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(r)
                : [];
        if ((!r.nextStations || r.nextStations === "") && nextList.length) {
            r.nextStations =
                typeof msrStringifyNextStationsArr === "function"
                    ? msrStringifyNextStationsArr(nextList)
                    : JSON.stringify(nextList);
        } else if (!r.nextStations || r.nextStations === "") {
            r.nextStations = "[]";
        }
        const nextSynced =
            typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(r)
                : [];
        if (!(r.nextStation || "").trim() && nextSynced.length) {
            r.nextStation = nextSynced[0] || "";
        }
        if (r.stationNotesLev == null) r.stationNotesLev = "";
        if (r.stationPhases == null || r.stationPhases === "") r.stationPhases = "{}";
        if (r.visitedStations == null || r.visitedStations === "") r.visitedStations = "[]";
        return r;
    }

    function pushVisitedUnique(visitedArr, stationName) {
        if (!stationName) return visitedArr;
        if (visitedArr.indexOf(stationName) < 0) visitedArr.push(stationName);
        return visitedArr;
    }

    /** הערות לתחנה הנוכחית: לב / רפואה בשדות נפרדים; אחרת מ־stationNotes */
    function getNoteTextForPageStation(shaped) {
        if (isLevPage) {
            return shaped.stationNotesLev != null ? String(shaped.stationNotesLev) : "";
        }
        if (isMedicalPage) {
            return shaped.stationNotesMedical != null ? String(shaped.stationNotesMedical) : "";
        }
        const parsed = msrParseStationNotes(shaped.stationNotes);
        const v = parsed[PAGE_STATION];
        return v != null ? String(v) : "";
    }

    /** מחזיר שדות הערות מלאים אחרי עדכון לתחנה PAGE_STATION */
    function mergeNotesForPageStation(shaped, noteVal) {
        const lev = window.MSR_LEV_STATION;
        const med = window.MSR_MEDICAL_STATION;
        if (isLevPage) {
            return {
                stationNotes: shaped.stationNotes || "{}",
                stationNotesLev: noteVal || "",
                stationNotesMedical: shaped.stationNotesMedical || "",
            };
        }
        if (isMedicalPage) {
            return {
                stationNotes: shaped.stationNotes || "{}",
                stationNotesLev: shaped.stationNotesLev || "",
                stationNotesMedical: noteVal || "",
            };
        }
        const o = msrParseStationNotes(shaped.stationNotes);
        if (lev) delete o[lev];
        if (med) delete o[med];
        if (noteVal) {
            o[PAGE_STATION] = noteVal;
        } else {
            delete o[PAGE_STATION];
        }
        return {
            stationNotes: msrStringifyStationNotes(o),
            stationNotesLev: shaped.stationNotesLev || "",
            stationNotesMedical: shaped.stationNotesMedical || "",
        };
    }

    function fillActiveModalPlannedStations(shaped) {
        const wrap = $("activeModalPlannedWrap");
        const listEl = $("activeModalPlannedList");
        if (!wrap || !listEl) return;
        const planned =
            shaped && typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(shaped)
                : [];
        listEl.innerHTML = "";
        if (!planned.length) {
            wrap.classList.add("hidden");
            return;
        }
        wrap.classList.remove("hidden");
        planned.forEach(function (name) {
            const li = document.createElement("li");
            li.className = "active-modal-planned-chip";
            li.textContent = name;
            listEl.appendChild(li);
        });
    }

    function fillActiveModalNextSelect(excludeStation, shaped) {
        const sel = $("activeModalNext");
        if (!sel || !window.MSR_STATIONS) return;
        const ex = (excludeStation || "").trim();
        const planned =
            shaped && typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(shaped)
                : [];
        const plannedSet = new Set(planned);

        sel.innerHTML = "";
        const optEmpty = document.createElement("option");
        optEmpty.value = "";
        optEmpty.textContent = "— בחרו תחנה הבאה —";
        sel.appendChild(optEmpty);

        const ordered = [];
        planned.forEach(function (name) {
            if (ex && name === ex) return;
            if (ordered.indexOf(name) < 0) ordered.push(name);
        });
        MSR_STATIONS.forEach(function (name) {
            if (ex && name === ex) return;
            if (ordered.indexOf(name) < 0) ordered.push(name);
        });

        ordered.forEach(function (name) {
            const o = document.createElement("option");
            o.value = name;
            o.textContent = plannedSet.has(name) ? "★ " + name + " (הוקצה מראש)" : name;
            sel.appendChild(o);
        });

        if (planned.length > 0) {
            let pick = planned[0];
            if (ex && pick === ex) {
                pick = planned.length > 1 ? planned[1] : "";
            }
            if (pick) {
                sel.value = pick;
            } else {
                sel.selectedIndex = 0;
            }
        } else {
            sel.selectedIndex = 0;
        }
    }

    /**
     * אחרי סיום טיפול בתחנה: התחנה הנבחרת היא ההמשך המיידי, ואחריה שאר התחנות
     * שהיו ברשימת ההמשך (למשל מס רכוש שנבחר בטופס) — בלי לאבד תחנות.
     */
    function mergeNextStationsAfterComplete(shaped, stationName, nextSel) {
        const norm =
            typeof msrNormalizeStationLabel === "function"
                ? msrNormalizeStationLabel
                : function (x) {
                      return String(x || "").trim();
                  };
        const nextT = norm(nextSel);
        const curT = norm(stationName);
        let planned =
            typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(shaped).slice()
                : [];
        planned = planned
            .map(function (x) {
                return norm(x);
            })
            .filter(Boolean);
        const withoutCurrent = planned.filter(function (x) {
            return x !== curT;
        });
        const seen = {};
        const out = [];
        function add(x) {
            const nx = norm(x);
            if (!nx || seen[nx]) return;
            seen[nx] = true;
            out.push(nx);
        }
        add(nextT);
        withoutCurrent.forEach(function (x) {
            if (norm(x) !== nextT) add(x);
        });
        return out;
    }

    function isRegistrationStationPage() {
        return !!(window.MSR_REGISTRATION_STATION && PAGE_STATION === MSR_REGISTRATION_STATION);
    }

    async function loadRecords() {
        const res = await fetchWithAuth(API_BASE + "/items");
        if (!res.ok) {
            const txt = await res.text();
            throw new Error("Failed to load: " + res.status + " " + txt);
        }
        const data = await res.json();
        allRecords = Array.isArray(data) ? data.map(ensureShape) : [];
    }

    function recordMatchesQuery(r, qLow) {
        if (!qLow) return true;
        const notesLev = (r.stationNotesLev || "").toLowerCase();
        const notesText =
            typeof msrFormatStationNotesForDisplayNoLev === "function"
                ? msrFormatStationNotesForDisplayNoLev(r.stationNotes)
                : "";
        const reasonsBlob =
            typeof msrFormatArrivalReasonsDisplay === "function"
                ? msrFormatArrivalReasonsDisplay(r)
                : r.arrivalReason || "";
        const blob = [
            r.firstName,
            r.familyName,
            r.phone,
            r.idNumber,
            r.recordStatus,
            r.currentStation,
            r.nextStation,
            r.nextStations,
            r.arrivalReason,
            reasonsBlob,
            notesText,
            notesLev,
            r.stationNotesMedical,
        ]
            .join(" ")
            .toLowerCase();
        return blob.indexOf(qLow) !== -1;
    }

    function relevantToStation(r, S) {
        const cur = (r.currentStation || "").trim();
        const activeAtS = cur === S;
        const waitingForS =
            typeof msrRecordIsWaitingForStation === "function"
                ? msrRecordIsWaitingForStation(r, S)
                : false;
        return waitingForS || activeAtS;
    }

    function computePool() {
        const qLow = ($("stationQ").value || "").trim().toLowerCase();
        const S = PAGE_STATION;
        poolRecords = allRecords.filter(function (r) {
            if (isReleased(r)) return false;
            if (!relevantToStation(r, S)) return false;
            return recordMatchesQuery(r, qLow);
        });
        $("stationFilterHint").textContent =
            "מוצגות " + poolRecords.length + " רשומות רלוונטיות לתחנה זו (לא שוחררו)." + (qLow ? " — אחרי סינון." : "");
    }

    function renderSingleList(containerId, records, isWaiting) {
        const el = $(containerId);
        if (!el) return;
        el.innerHTML = "";
        if (!records.length) {
            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = "אין רשומות.";
            el.appendChild(p);
            return;
        }
        const ul = document.createElement("ul");
        ul.className = "station-cards-list";
        records.forEach(function (r) {
            const rowKey = String(r.recordId || r.rowKey || "");
            ul.appendChild(buildPersonCard(r, rowKey, PAGE_STATION, isWaiting));
        });
        el.appendChild(ul);
    }

    function buildPersonCard(r, rowKey, stationName, isWaitingColumn) {
        const s = ensureShape({ ...r });
        const name = ((s.firstName || "") + " " + (s.familyName || "")).trim() || "(ללא שם)";
        const sub = [s.phone || "", s.recordStatus || ""].filter(Boolean).join(" · ");
        const li = document.createElement("li");
        li.className =
            "station-person-card station-card-onecol" +
            (isWaitingColumn ? " station-person-card--wait" : " station-person-card--active station-person-card--active-cyan");
        if (isWaitingColumn) {
            const reg = window.MSR_REGISTRATION_STATION || "";
            const cur = (s.currentStation || "").trim();
            if (cur && cur !== reg) {
                li.classList.add("station-wait-card--elsewhere");
            } else {
                li.classList.add("station-wait-card--available");
            }
        }

        if (isWaitingColumn) {
            li.setAttribute("role", "button");
            li.tabIndex = 0;
        } else {
            li.setAttribute("role", "button");
            li.tabIndex = 0;
        }

        const title = document.createElement("div");
        title.className = "station-person-name";
        title.textContent = name;
        li.appendChild(title);
        if (sub) {
            const meta = document.createElement("div");
            meta.className = "station-person-meta";
            meta.textContent = sub;
            li.appendChild(meta);
        }

        const hint = document.createElement("div");
        hint.className = "station-person-hint";
        hint.textContent = isWaitingColumn
            ? "לחיצה — הערות ותחילת טיפול"
            : isRegistrationStationPage()
              ? "לחיצה — סיום טיפול (תחנה הבאה) או שחרור עם הערה"
              : "לחיצה — הערות וסיום טיפול (בחירת תחנה הבאה)";
        li.appendChild(hint);

        if (isWaitingColumn) {
            li.addEventListener("click", function () {
                openWaitModal(rowKey, stationName);
            });
            li.addEventListener("keydown", function (ev) {
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    openWaitModal(rowKey, stationName);
                }
            });
        } else {
            li.addEventListener("click", function () {
                openActiveModal(rowKey, stationName);
            });
            li.addEventListener("keydown", function (ev) {
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    openActiveModal(rowKey, stationName);
                }
            });
        }

        return li;
    }

    function renderBoards() {
        const S = PAGE_STATION;
        const waiting = poolRecords.filter(function (r) {
            return typeof msrRecordIsWaitingForStation === "function"
                ? msrRecordIsWaitingForStation(r, S)
                : false;
        });
        const active = poolRecords.filter(function (r) {
            return (r.currentStation || "").trim() === S;
        });
        renderSingleList("stationWaitList", waiting, true);
        renderSingleList("stationActiveList", active, false);
    }

    function findRecordByKey(key) {
        return allRecords.find(function (r) {
            return String(r.recordId || r.rowKey || "") === key;
        });
    }

    function openWaitModal(rowKey, stationName) {
        const r = findRecordByKey(rowKey);
        if (!r) return;
        const s = ensureShape({ ...r });
        const cur = (s.currentStation || "").trim();
        const stillWait =
            typeof msrRecordIsWaitingForStation === "function"
                ? msrRecordIsWaitingForStation(s, stationName)
                : false;
        if (!stillWait) {
            $("waitModalStatus").textContent = "הרשומה כבר לא במצב המתנה לתחנה זו. מרענן…";
            refresh();
            return;
        }

        $("waitModalRecordId").value = rowKey;
        $("waitModalStationName").value = stationName;
        const lbl = $("waitModalStationLabel");
        if (lbl) lbl.textContent = "«" + stationName + "»";
        $("waitModalSummary").textContent =
            (((s.firstName || "") + " " + (s.familyName || "")).trim() || "—") +
            " · טלפון: " +
            (s.phone || "—") +
            " · תחנה נוכחית: " +
            (cur || "—");
        $("waitModalNotes").value = getNoteTextForPageStation(s);
        $("waitModalStatus").textContent = "";
        $("waitModalStatus").classList.remove("err");
        $("waitModal").classList.remove("hidden");
        $("waitModalNotes").focus();
    }

    function closeWaitModal() {
        $("waitModal").classList.add("hidden");
        $("waitModalStatus").textContent = "";
    }

    async function postMergedRecord(merged) {
        const res = await fetchWithAuth(API_BASE + "/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(merged),
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt);
        }
    }

    async function saveWaitModalNotesOnly() {
        const key = $("waitModalRecordId").value;
        const stationName = ($("waitModalStationName").value || "").trim();
        const st = $("waitModalStatus");
        st.classList.remove("err");

        const prev = findRecordByKey(key);
        if (!prev || !stationName) {
            st.textContent = "שגיאה בנתונים.";
            st.classList.add("err");
            return;
        }

        const shaped = ensureShape({ ...prev });
        const stillWait =
            typeof msrRecordIsWaitingForStation === "function"
                ? msrRecordIsWaitingForStation(shaped, stationName)
                : false;
        if (!stillWait) {
            closeWaitModal();
            await refresh();
            return;
        }

        const noteVal = $("waitModalNotes").value.trim();
        const notesMerged = mergeNotesForPageStation(shaped, noteVal);
        const now = new Date().toISOString();
        const merged = {
            ...shaped,
            stationNotes: notesMerged.stationNotes,
            stationNotesLev: notesMerged.stationNotesLev,
            stationNotesMedical: notesMerged.stationNotesMedical,
            updatedAt: now,
        };

        try {
            await postMergedRecord(merged);
            closeWaitModal();
            await refresh();
        } catch (e) {
            console.error(e);
            st.textContent = "שגיאה בשמירה.";
            st.classList.add("err");
        }
    }

    async function saveWaitModalStartTreatment() {
        const key = $("waitModalRecordId").value;
        const stationName = ($("waitModalStationName").value || "").trim();
        const st = $("waitModalStatus");
        st.classList.remove("err");

        const prev = findRecordByKey(key);
        if (!prev || !stationName) {
            st.textContent = "שגיאה בנתונים.";
            st.classList.add("err");
            return;
        }

        const shaped = ensureShape({ ...prev });
        const stillWait =
            typeof msrRecordIsWaitingForStation === "function"
                ? msrRecordIsWaitingForStation(shaped, stationName)
                : false;
        if (!stillWait) {
            closeWaitModal();
            await refresh();
            return;
        }

        const noteVal = $("waitModalNotes").value.trim();
        const notesMerged = mergeNotesForPageStation(shaped, noteVal);
        const phases = msrParseStationPhases(shaped.stationPhases);
        const visited = msrParseVisitedStations(shaped.visitedStations);
        phases[stationName] = MSR_PHASE_ACTIVE;
        pushVisitedUnique(visited, stationName);

        let nextArr =
            typeof msrGetNextStationsListFromRecord === "function"
                ? msrGetNextStationsListFromRecord(shaped).slice()
                : [];
        nextArr = nextArr.filter(function (x) {
            return x !== stationName;
        });
        const nextStr =
            typeof msrStringifyNextStationsArr === "function"
                ? msrStringifyNextStationsArr(nextArr)
                : JSON.stringify(nextArr);

        const now = new Date().toISOString();
        const merged = {
            ...shaped,
            currentStation: stationName,
            nextStation: nextArr[0] || "",
            nextStations: nextStr,
            stationNotes: notesMerged.stationNotes,
            stationNotesLev: notesMerged.stationNotesLev,
            stationNotesMedical: notesMerged.stationNotesMedical,
            stationPhases: msrStringifyStationPhases(phases),
            visitedStations: msrStringifyVisitedStations(visited),
            recordStatus: "בטיפול",
            updatedAt: now,
        };

        try {
            await postMergedRecord(merged);
            closeWaitModal();
            await refresh();
        } catch (e) {
            console.error(e);
            st.textContent = "שגיאה בשמירה.";
            st.classList.add("err");
        }
    }

    function openActiveModal(rowKey, stationName) {
        const r = findRecordByKey(rowKey);
        if (!r) return;
        const s = ensureShape({ ...r });
        const cur = (s.currentStation || "").trim();
        if (cur !== stationName) {
            refresh();
            return;
        }

        $("activeModalRecordId").value = rowKey;
        $("activeModalStationName").value = stationName;
        const lbl = $("activeModalStationLabel");
        if (lbl) lbl.textContent = "«" + stationName + "»";
        $("activeModalSummary").textContent =
            (((s.firstName || "") + " " + (s.familyName || "")).trim() || "—") +
            " · טלפון: " +
            (s.phone || "—") +
            " · בטיפול בתחנה זו.";
        $("activeModalNotes").value = getNoteTextForPageStation(s);
        fillActiveModalNextSelect(stationName, s);
        fillActiveModalPlannedStations(s);
        const relBlock = $("activeModalReleaseBlock");
        const relNotes = $("activeModalReleaseNotes");
        if (relNotes) relNotes.value = "";
        if (relBlock) {
            if (isRegistrationStationPage()) {
                relBlock.classList.remove("hidden");
            } else {
                relBlock.classList.add("hidden");
            }
        }
        $("activeModalStatus").textContent = "";
        $("activeModalStatus").classList.remove("err");
        $("activeModal").classList.remove("hidden");
        $("activeModalNotes").focus();
    }

    function closeActiveModal() {
        $("activeModal").classList.add("hidden");
        $("activeModalStatus").textContent = "";
        const relNotes = $("activeModalReleaseNotes");
        if (relNotes) relNotes.value = "";
    }

    async function saveActiveModalNotesOnly() {
        const key = $("activeModalRecordId").value;
        const stationName = ($("activeModalStationName").value || "").trim();
        const st = $("activeModalStatus");
        st.classList.remove("err");

        const prev = findRecordByKey(key);
        if (!prev || !stationName) {
            st.textContent = "שגיאה בנתונים.";
            st.classList.add("err");
            return;
        }

        const shaped = ensureShape({ ...prev });
        if ((shaped.currentStation || "").trim() !== stationName) {
            closeActiveModal();
            await refresh();
            return;
        }

        const noteVal = $("activeModalNotes").value.trim();
        const notesMerged = mergeNotesForPageStation(shaped, noteVal);
        const now = new Date().toISOString();
        const merged = {
            ...shaped,
            stationNotes: notesMerged.stationNotes,
            stationNotesLev: notesMerged.stationNotesLev,
            stationNotesMedical: notesMerged.stationNotesMedical,
            updatedAt: now,
        };

        try {
            await postMergedRecord(merged);
            closeActiveModal();
            await refresh();
        } catch (e) {
            console.error(e);
            st.textContent = "שגיאה בשמירה.";
            st.classList.add("err");
        }
    }

    async function saveActiveModalRelease() {
        if (!isRegistrationStationPage()) return;

        const key = $("activeModalRecordId").value;
        const stationName = ($("activeModalStationName").value || "").trim();
        const st = $("activeModalStatus");
        st.classList.remove("err");

        const prev = findRecordByKey(key);
        if (!prev || !stationName) {
            st.textContent = "שגיאה בנתונים.";
            st.classList.add("err");
            return;
        }

        const shaped = ensureShape({ ...prev });
        if ((shaped.currentStation || "").trim() !== stationName) {
            closeActiveModal();
            await refresh();
            return;
        }

        const releaseNotesRaw = $("activeModalReleaseNotes");
        const releaseNotes = releaseNotesRaw ? releaseNotesRaw.value.trim() : "";
        if (!releaseNotes) {
            st.textContent = "נא למלא הערת שחרור.";
            st.classList.add("err");
            if (releaseNotesRaw) {
                try {
                    releaseNotesRaw.focus();
                } catch (e) {
                    /* ignore */
                }
            }
            return;
        }

        const noteVal = $("activeModalNotes").value.trim();
        const notesMerged = mergeNotesForPageStation(shaped, noteVal);
        const now = new Date().toISOString();

        let merged = {
            ...shaped,
            released: true,
            releaseNotes: releaseNotes,
            recordStatus: "סגור",
            currentStation: "",
            nextStation: "",
            nextStations: "[]",
            arrivalReason: shaped.arrivalReason,
            arrivalReasons: shaped.arrivalReasons || "[]",
            stationNotes: notesMerged.stationNotes,
            stationNotesLev: notesMerged.stationNotesLev,
            stationNotesMedical: notesMerged.stationNotesMedical,
            updatedAt: now,
        };

        if (
            typeof msrMergeVisitedForRelease === "function" &&
            typeof msrCloseAllVisitedStationPhases === "function" &&
            typeof msrStringifyVisitedStations === "function"
        ) {
            const vis = msrMergeVisitedForRelease(merged);
            merged.visitedStations = msrStringifyVisitedStations(vis);
            merged.stationPhases = msrCloseAllVisitedStationPhases(
                merged.stationPhases || "{}",
                merged.visitedStations
            );
        }

        try {
            await postMergedRecord(merged);
            closeActiveModal();
            await refresh();
        } catch (e) {
            console.error(e);
            st.textContent = "שגיאה בשמירה.";
            st.classList.add("err");
        }
    }

    async function saveActiveModalComplete() {
        const key = $("activeModalRecordId").value;
        const stationName = ($("activeModalStationName").value || "").trim();
        const st = $("activeModalStatus");
        st.classList.remove("err");

        const prev = findRecordByKey(key);
        if (!prev || !stationName) {
            st.textContent = "שגיאה בנתונים.";
            st.classList.add("err");
            return;
        }

        const shaped = ensureShape({ ...prev });
        if ((shaped.currentStation || "").trim() !== stationName) {
            closeActiveModal();
            await refresh();
            return;
        }

        const noteVal = $("activeModalNotes").value.trim();
        const nextSel = ($("activeModalNext").value || "").trim();
        if (!nextSel) {
            st.textContent = "נא לבחור את התחנה הבאה לפני סיום טיפול.";
            st.classList.add("err");
            const selNext = $("activeModalNext");
            if (selNext) {
                try {
                    selNext.focus();
                } catch (e) {
                    /* ignore */
                }
            }
            return;
        }
        const notesMerged = mergeNotesForPageStation(shaped, noteVal);

        const phases = msrParseStationPhases(shaped.stationPhases);
        const visited = msrParseVisitedStations(shaped.visitedStations);
        phases[stationName] = MSR_PHASE_CLOSED;
        pushVisitedUnique(visited, stationName);
        phases[nextSel] = MSR_PHASE_WAIT;
        pushVisitedUnique(visited, nextSel);

        const nextArr = mergeNextStationsAfterComplete(shaped, stationName, nextSel);
        const nextStationsJson =
            typeof msrStringifyNextStationsArr === "function"
                ? msrStringifyNextStationsArr(nextArr)
                : JSON.stringify(nextArr);

        const regStation =
            (window.MSR_REGISTRATION_STATION || "").trim() ||
            (window.MSR_STATIONS && MSR_STATIONS.length ? String(MSR_STATIONS[0]) : "");

        const now = new Date().toISOString();
        const merged = {
            ...shaped,
            /* אחרת נשארים ב־currentStation === התחנה הזו ונצגים לנצח ב«בטיפול» כאן */
            currentStation: regStation,
            nextStation: nextArr.length ? nextArr[0] : nextSel,
            nextStations: nextStationsJson,
            stationNotes: notesMerged.stationNotes,
            stationNotesLev: notesMerged.stationNotesLev,
            stationNotesMedical: notesMerged.stationNotesMedical,
            stationPhases: msrStringifyStationPhases(phases),
            visitedStations: msrStringifyVisitedStations(visited),
            updatedAt: now,
        };

        try {
            await postMergedRecord(merged);
            closeActiveModal();
            await refresh();
        } catch (e) {
            console.error(e);
            st.textContent = "שגיאה בשמירה.";
            st.classList.add("err");
        }
    }

    async function refresh() {
        const loadSt = $("stationLoadStatus");
        loadSt.classList.remove("err");
        try {
            await loadRecords();
            computePool();
            renderBoards();
            loadSt.textContent =
                "עודכן " +
                formatDateDisplay(new Date().toISOString()) +
                " — " +
                poolRecords.length +
                " רשומות רלוונטיות לתחנה.";
        } catch (e) {
            console.error(e);
            loadSt.textContent = "שגיאה בטעינת נתונים מהשרת.";
            loadSt.classList.add("err");
        }
    }

    function init() {
        PAGE_STATION = getStationFromQuery();

        const valid =
            window.MSR_STATIONS &&
            MSR_STATIONS.some(function (n) {
                return n === PAGE_STATION;
            });

        if (!PAGE_STATION || !valid) {
            $("stationBadParam").classList.remove("hidden");
            $("stationBadParam").textContent =
                "נא לבחור תחנה מדף «כל התחנות» או להשתמש בקישור עם פרמטר ?s=שם התחנה.";
            $("stationMainContent").classList.add("hidden");
            return;
        }

        isLevPage = PAGE_STATION === MSR_LEV_STATION;
        isMedicalPage = !!(window.MSR_MEDICAL_STATION && PAGE_STATION === MSR_MEDICAL_STATION);

        document.title = PAGE_STATION + " — מרכז סיוע";
        const t = $("stationPageTitle");
        if (t) t.textContent = PAGE_STATION;

        $("btnWaitModalStart").addEventListener("click", saveWaitModalStartTreatment);
        $("btnWaitModalSaveNotes").addEventListener("click", saveWaitModalNotesOnly);
        $("btnWaitModalCancel").addEventListener("click", closeWaitModal);
        $("waitModal").addEventListener("click", function (e) {
            if (e.target === $("waitModal")) closeWaitModal();
        });

        $("btnActiveModalComplete").addEventListener("click", saveActiveModalComplete);
        const btnRel = $("btnActiveModalRelease");
        if (btnRel) btnRel.addEventListener("click", saveActiveModalRelease);
        $("btnActiveModalSaveNotes").addEventListener("click", saveActiveModalNotesOnly);
        $("btnActiveModalCancel").addEventListener("click", closeActiveModal);
        $("activeModal").addEventListener("click", function (e) {
            if (e.target === $("activeModal")) closeActiveModal();
        });

        document.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") return;
            if ($("waitModal") && !$("waitModal").classList.contains("hidden")) closeWaitModal();
            else if ($("activeModal") && !$("activeModal").classList.contains("hidden")) closeActiveModal();
        });

        $("stationQ").addEventListener("input", function () {
            computePool();
            renderBoards();
        });

        refresh();

        setInterval(function () {
            refresh().catch(function (e) {
                console.error(e);
            });
        }, 8000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
