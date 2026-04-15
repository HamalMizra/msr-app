const { createClient } = require("@supabase/supabase-js");

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("SUPABASE_URL is missing");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isAuthorized(event) {
  const secret = process.env.HAMAL_SECRET;
  if (!secret) return false;
  const headers = event.headers || {};
  const headerKey =
    headers["x-hamal-key"] ||
    headers["X-Hamal-Key"] ||
    headers["x-hamal-secret"] ||
    headers["X-Hamal-Secret"];
  return headerKey === secret;
}

function normalizeJsonString(value, fallback) {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return fallback;
  }
}

function normalizeRecord(data) {
  const now = new Date().toISOString();
  const recordId =
    data.recordId ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const releasedFlag = !!data.released;
  const currentStationResolved =
    data.currentStation != null && String(data.currentStation).trim() !== ""
      ? String(data.currentStation)
      : releasedFlag
        ? ""
        : "עמדת רישום ושחרור";

  return {
    recordId,
    firstName: data.firstName || "",
    familyName: data.familyName || "",
    phone: data.phone || "",
    idNumber: data.idNumber || "",
    indication: !!data.indication,
    arrivalReason: data.arrivalReason || "",
    arrivalOther: data.arrivalOther || "",
    released: releasedFlag,
    releaseNotes: data.releaseNotes || "",
    currentStation: currentStationResolved,
    nextStation: data.nextStation || "",
    nextStations: normalizeJsonString(data.nextStations, "[]"),
    arrivalReasons: normalizeJsonString(data.arrivalReasons, "[]"),
    stationNotes: normalizeJsonString(data.stationNotes, "{}"),
    stationNotesLev:
      typeof data.stationNotesLev === "string"
        ? data.stationNotesLev
        : data.stationNotesLev != null
          ? String(data.stationNotesLev)
          : "",
    stationNotesMedical:
      typeof data.stationNotesMedical === "string"
        ? data.stationNotesMedical
        : data.stationNotesMedical != null
          ? String(data.stationNotesMedical)
          : "",
    stationPhases: normalizeJsonString(data.stationPhases, "{}"),
    visitedStations: normalizeJsonString(data.visitedStations, "[]"),
    recordStatus: data.recordStatus || "פתוח",
    savedAt: data.savedAt || now,
    updatedAt: data.updatedAt ? String(data.updatedAt).trim() || null : null,
  };
}

exports.handler = async (event) => {
  try {
    if (!isAuthorized(event)) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const supabase = getSupabase();

    if (event.httpMethod === "GET") {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("savedAt", { ascending: false, nullsFirst: false });

      if (error) {
        return jsonResponse(500, { error: error.message, details: error });
      }
      return jsonResponse(200, Array.isArray(data) ? data : []);
    }

    if (event.httpMethod === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const record = normalizeRecord(body);

      const { error } = await supabase
        .from("items")
        .upsert(record, { onConflict: "recordId" });

      if (error) {
        return jsonResponse(500, { error: error.message, details: error });
      }

      return jsonResponse(200, { success: true, recordId: record.recordId });
    }

    return jsonResponse(405, { error: "Method not allowed" });
  } catch (err) {
    return jsonResponse(500, {
      error: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : null,
    });
  }
};
