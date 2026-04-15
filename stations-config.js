(function (global) {
    "use strict";

    /** תחנות אפשריות במסלול המרכז */
    const STATIONS = [
        "עמדת רישום ושחרור",
        "צוות לב ורווחה",
        "תחנה רפואה",
        "איזור שהיה",
        "מס רכוש",
        "דיור",
        "שינוע",
        "וטרינר",
    ];

    const RECORD_STATUSES = ["פתוח", "בטיפול", "הושלם", "סגור"];

    /** שלבי תחנה במסלול כללי */
    const PHASE_WAIT = "ממתין";
    const PHASE_ACTIVE = "בטיפול";
    const PHASE_CLOSED = "סגור";

    /** תחנת צוות לב ורווחה — הערות בשדה נפרד */
    const LEV_STATION = "צוות לב ורווחה";
    /** תחנה רפואה — הערות בשדה נפרד (כמו לב) */
    const MEDICAL_STATION = "תחנה רפואה";
    /** שם ישן לפני שינוי תצוגה — מיגרציה מנתונים קיימים */
    const MEDICAL_STATION_LEGACY = "תחנה רופאית";

    const REGISTRATION_STATION = STATIONS[0];

    /**
     * מזהי URL (ASCII) לכניסת מתנדבים לפי תחנה — תואמים ל־HAMAL_STATION_KEYS בשרת.
     */
    const STATION_SLUG_BY_NAME = {
        "עמדת רישום ושחרור": "registration",
        "צוות לב ורווחה": "lev",
        "תחנה רפואה": "medical",
        "איזור שהיה": "area",
        "מס רכוש": "property",
        "דיור": "housing",
        "שינוע": "transport",
        "וטרינר": "vet",
    };

    /** לרשת Hub ולשדות הערות כלליים (ללא לב ורפואה) */
    const STATIONS_OTHER = STATIONS.filter(function (s) {
        return s !== LEV_STATION && s !== MEDICAL_STATION;
    });

    /** התאמת שם תחנה לרשימת MSR (רווחים, NFC, שם ישן לרפואה) */
    function normalizeStationLabel(name) {
        let t = String(name || "")
            .trim()
            .replace(/\s+/g, " ");
        try {
            t = t.normalize("NFC");
        } catch (e) {
            /* ignore */
        }
        if (!t) return t;
        if (t === MEDICAL_STATION_LEGACY) return MEDICAL_STATION;
        for (let i = 0; i < STATIONS.length; i++) {
            const s = STATIONS[i];
            let sn = s;
            try {
                sn = s.normalize("NFC");
            } catch (e2) {
                /* ignore */
            }
            if (s === t || sn === t) return s;
        }
        return t;
    }

    /** פענוח מערך nextStations בלבד — בלי נפילה ל־nextStation (לשימוש פנימי) */
    function tryParseNextStationsArrayOnly(str) {
        if (str == null) return { ok: false };
        if (Array.isArray(str)) {
            return {
                ok: true,
                arr: str
                    .map(function (x) {
                        return String(x || "").trim();
                    })
                    .filter(Boolean),
            };
        }
        const s = String(str).trim();
        if (!s) return { ok: false };
        let j;
        try {
            j = JSON.parse(s);
        } catch (e) {
            return { ok: false };
        }
        if (typeof j === "string") {
            const inner = j.trim();
            if (!inner) return { ok: false };
            try {
                j = JSON.parse(inner);
            } catch (e2) {
                return { ok: false };
            }
        }
        if (Array.isArray(j)) {
            return {
                ok: true,
                arr: j
                    .map(function (x) {
                        return String(x || "").trim();
                    })
                    .filter(Boolean),
            };
        }
        return { ok: false };
    }

    function parseNextStationsStr(str, legacySingle) {
        const parsed = tryParseNextStationsArrayOnly(str);
        if (parsed.ok) {
            return parsed.arr.map(normalizeStationLabel);
        }
        const leg = (legacySingle || "").trim();
        return leg ? [normalizeStationLabel(leg)] : [];
    }

    function parseStationNotes(s) {
        if (!s) return {};
        if (typeof s === "object" && s !== null && !Array.isArray(s)) {
            return Object.assign({}, s);
        }
        try {
            const j = JSON.parse(s);
            return typeof j === "object" && j !== null ? j : {};
        } catch {
            return {};
        }
    }

    function stringifyStationNotes(obj) {
        return JSON.stringify(obj || {});
    }

    function formatStationNotesForDisplay(notesStr) {
        const o = parseStationNotes(notesStr);
        const parts = [];
        STATIONS.forEach(function (name) {
            const v = (o[name] || "").trim();
            if (v) parts.push(name + ": " + v);
        });
        return parts.join(" · ");
    }

    /** הערות לתצוגה בלי צוות לב ורפואה */
    function formatStationNotesForDisplayNoLev(notesStr) {
        const o = parseStationNotes(notesStr);
        delete o[LEV_STATION];
        delete o[MEDICAL_STATION];
        delete o[MEDICAL_STATION_LEGACY];
        const parts = [];
        STATIONS_OTHER.forEach(function (name) {
            const v = (o[name] || "").trim();
            if (v) parts.push(name + ": " + v);
        });
        return parts.join(" · ");
    }

    function migrateLegacyLevNotes(r) {
        if (!r || typeof r !== "object") return;
        if (r.stationNotesLev != null && String(r.stationNotesLev).trim() !== "") return;
        const o = parseStationNotes(r.stationNotes);
        if (o[LEV_STATION]) {
            r.stationNotesLev = String(o[LEV_STATION]);
            delete o[LEV_STATION];
            r.stationNotes = stringifyStationNotes(o);
        }
        if (r.stationNotesLev == null) r.stationNotesLev = "";
    }

    function migrateMedicalStationRename(r) {
        if (!r || typeof r !== "object") return;
        if (r.currentStation === MEDICAL_STATION_LEGACY) r.currentStation = MEDICAL_STATION;
        if (r.nextStation === MEDICAL_STATION_LEGACY) r.nextStation = MEDICAL_STATION;
        const nl = parseNextStationsStr(r.nextStations, r.nextStation);
        let renamed = false;
        const nl2 = nl.map(function (x) {
            if (x === MEDICAL_STATION_LEGACY) {
                renamed = true;
                return MEDICAL_STATION;
            }
            return x;
        });
        if (renamed) r.nextStations = stringifyNextStationsArr(nl2);

        const ph = parseStationPhases(r.stationPhases);
        if (ph[MEDICAL_STATION_LEGACY] !== undefined) {
            if (ph[MEDICAL_STATION] === undefined) ph[MEDICAL_STATION] = ph[MEDICAL_STATION_LEGACY];
            delete ph[MEDICAL_STATION_LEGACY];
            r.stationPhases = stringifyStationPhases(ph);
        }

        const vis = parseVisitedStations(r.visitedStations);
        const vis2 = vis.map(function (x) {
            return x === MEDICAL_STATION_LEGACY ? MEDICAL_STATION : x;
        });
        if (JSON.stringify(vis) !== JSON.stringify(vis2)) {
            r.visitedStations = stringifyVisitedStations(vis2);
        }

        const o = parseStationNotes(r.stationNotes);
        if (o[MEDICAL_STATION_LEGACY] !== undefined) {
            if (o[MEDICAL_STATION] === undefined) o[MEDICAL_STATION] = o[MEDICAL_STATION_LEGACY];
            delete o[MEDICAL_STATION_LEGACY];
            r.stationNotes = stringifyStationNotes(o);
        }
    }

    function migrateLegacyMedicalNotes(r) {
        if (!r || typeof r !== "object") return;
        if (r.stationNotesMedical != null && String(r.stationNotesMedical).trim() !== "") return;
        const o = parseStationNotes(r.stationNotes);
        const fromKey =
            o[MEDICAL_STATION] != null
                ? MEDICAL_STATION
                : o[MEDICAL_STATION_LEGACY] != null
                  ? MEDICAL_STATION_LEGACY
                  : null;
        if (fromKey) {
            r.stationNotesMedical = String(o[fromKey]);
            delete o[MEDICAL_STATION];
            delete o[MEDICAL_STATION_LEGACY];
            r.stationNotes = stringifyStationNotes(o);
        }
        if (r.stationNotesMedical == null) r.stationNotesMedical = "";
    }

    function stringifyNextStationsArr(arr) {
        const a = Array.isArray(arr)
            ? arr
                  .map(function (x) {
                      return normalizeStationLabel(String(x || "").trim());
                  })
                  .filter(Boolean)
            : [];
        return JSON.stringify(a);
    }

    /**
     * רשימת תחנות המשך: מהשדה nextStations + איחוד עם nextStation אם חסר
     * (מפענח מערך גם כשה־API מחזיר מערך ולא מחרוזת).
     */
    function getNextStationsListFromRecord(r) {
        if (!r) return [];
        const parsed = tryParseNextStationsArrayOnly(r.nextStations);
        const leg = (r.nextStation || "").trim();
        const seen = {};
        const out = [];
        function add(x) {
            const n = normalizeStationLabel(x);
            if (!n || seen[n]) return;
            seen[n] = true;
            out.push(n);
        }
        if (parsed.ok && parsed.arr.length) {
            parsed.arr.forEach(function (x) {
                add(x);
            });
            if (leg) add(leg);
            return out;
        }
        if (parsed.ok && parsed.arr.length === 0 && leg) {
            add(leg);
            return out;
        }
        return parseNextStationsStr(r.nextStations, r.nextStation);
    }

    /** ממתין לתחנה S */
    function recordIsWaitingForStation(r, stationName) {
        if (!r || !stationName) return false;
        const S = normalizeStationLabel(stationName);
        const cur = normalizeStationLabel(r.currentStation);
        const targets = getNextStationsListFromRecord(r);
        let hit = false;
        for (let i = 0; i < targets.length; i++) {
            if (normalizeStationLabel(targets[i]) === S) {
                hit = true;
                break;
            }
        }
        return hit && cur !== S;
    }

    function parseArrivalReasonsStr(str, legacySingle) {
        if (Array.isArray(str)) {
            return str
                .map(function (x) {
                    return String(x || "").trim();
                })
                .filter(Boolean);
        }
        if (typeof str === "string" && str.trim()) {
            try {
                const j = JSON.parse(str);
                if (Array.isArray(j)) {
                    return j
                        .map(function (x) {
                            return String(x || "").trim();
                        })
                        .filter(Boolean);
                }
            } catch {
                /* לא מערך */
            }
        }
        const leg = (legacySingle || "").trim();
        return leg ? [leg] : [];
    }

    function stringifyArrivalReasonsArr(arr) {
        const a = Array.isArray(arr)
            ? arr
                  .map(function (x) {
                      return String(x || "").trim();
                  })
                  .filter(Boolean)
            : [];
        return JSON.stringify(a);
    }

    function formatArrivalReasonsDisplay(r) {
        if (!r) return "";
        const list = parseArrivalReasonsStr(r.arrivalReasons, r.arrivalReason);
        return list.join(", ");
    }

    global.MSR_STATIONS = STATIONS;
    global.MSR_REGISTRATION_STATION = REGISTRATION_STATION;
    global.MSR_LEV_STATION = LEV_STATION;
    global.MSR_MEDICAL_STATION = MEDICAL_STATION;
    global.MSR_STATIONS_OTHER = STATIONS_OTHER;
    global.MSR_RECORD_STATUSES = RECORD_STATUSES;
    global.msrParseStationNotes = parseStationNotes;
    global.msrStringifyStationNotes = stringifyStationNotes;
    global.msrFormatStationNotesForDisplay = formatStationNotesForDisplay;
    global.msrFormatStationNotesForDisplayNoLev = formatStationNotesForDisplayNoLev;
    global.msrMigrateLegacyLevNotes = migrateLegacyLevNotes;
    global.msrMigrateLegacyMedicalNotes = migrateLegacyMedicalNotes;
    global.msrMigrateMedicalStationRename = migrateMedicalStationRename;
    global.msrParseNextStationsStr = parseNextStationsStr;
    global.msrStringifyNextStationsArr = stringifyNextStationsArr;
    global.msrGetNextStationsListFromRecord = getNextStationsListFromRecord;
    global.msrRecordIsWaitingForStation = recordIsWaitingForStation;
    global.msrParseArrivalReasonsStr = parseArrivalReasonsStr;
    global.msrStringifyArrivalReasonsArr = stringifyArrivalReasonsArr;
    global.msrFormatArrivalReasonsDisplay = formatArrivalReasonsDisplay;
    global.msrNormalizeStationLabel = normalizeStationLabel;
    global.MSR_STATION_SLUG_BY_NAME = STATION_SLUG_BY_NAME;

    function getStationSlug(name) {
        const n = normalizeStationLabel(name);
        return STATION_SLUG_BY_NAME[n] || "";
    }

    function getStationNameFromSlug(slug) {
        const s = String(slug || "").trim();
        if (!s) return "";
        const keys = Object.keys(STATION_SLUG_BY_NAME);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (STATION_SLUG_BY_NAME[k] === s) return k;
        }
        return "";
    }

    global.msrGetStationSlug = getStationSlug;
    global.msrGetStationNameFromSlug = getStationNameFromSlug;

    function parseStationPhases(s) {
        if (!s) return {};
        if (typeof s === "object" && s !== null && !Array.isArray(s)) {
            return Object.assign({}, s);
        }
        try {
            const j = JSON.parse(s);
            return typeof j === "object" && j !== null ? j : {};
        } catch {
            return {};
        }
    }

    function stringifyStationPhases(obj) {
        return JSON.stringify(obj || {});
    }

    function parseVisitedStations(s) {
        if (!s) return [];
        if (Array.isArray(s)) return s.slice();
        try {
            const j = JSON.parse(s);
            return Array.isArray(j) ? j.slice() : [];
        } catch {
            return [];
        }
    }

    function stringifyVisitedStations(arr) {
        return JSON.stringify(Array.isArray(arr) ? arr : []);
    }

    function closeAllVisitedStationPhases(phasesStr, visitedStr) {
        const phases = parseStationPhases(phasesStr);
        const visited = parseVisitedStations(visitedStr);
        visited.forEach(function (st) {
            if (st) phases[st] = PHASE_CLOSED;
        });
        return stringifyStationPhases(phases);
    }

    function mergeVisitedForRelease(r) {
        const v = parseVisitedStations(r.visitedStations);
        function add(st) {
            if (st && v.indexOf(st) < 0) v.push(st);
        }
        add(r.currentStation);
        add(r.nextStation);
        getNextStationsListFromRecord(r).forEach(add);
        const ph = parseStationPhases(r.stationPhases);
        Object.keys(ph).forEach(function (k) {
            add(k);
        });
        return v;
    }

    global.MSR_PHASE_WAIT = PHASE_WAIT;
    global.MSR_PHASE_ACTIVE = PHASE_ACTIVE;
    global.MSR_PHASE_CLOSED = PHASE_CLOSED;
    global.msrParseStationPhases = parseStationPhases;
    global.msrStringifyStationPhases = stringifyStationPhases;
    global.msrParseVisitedStations = parseVisitedStations;
    global.msrStringifyVisitedStations = stringifyVisitedStations;
    global.msrCloseAllVisitedStationPhases = closeAllVisitedStationPhases;
    global.msrMergeVisitedForRelease = mergeVisitedForRelease;
})(typeof window !== "undefined" ? window : globalThis);
