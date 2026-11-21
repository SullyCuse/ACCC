const https = require("https");
const { URL } = require("url");

// Anonymous usage log: component names, categories and country only. No IP,
// user agent or free text. `visit` is a random id the page makes on each load
// (kept in memory, never stored on the device) so repeat runs from one visit
// count once in the Trends page. Never throws and never waits longer than WAIT_MS,
// so a logging problem can't fail or noticeably slow an analysis.
const WAIT_MS = 1000;

function countryOf(event) {
  try {
    const geo = JSON.parse(Buffer.from(event.headers["x-nf-geo"] || "", "base64").toString());
    return geo && geo.country && geo.country.code ? String(geo.country.code).slice(0, 2) : null;
  } catch { return null; }
}

function cleanVisit(v) {
  return typeof v === "string" && /^[a-f0-9]{16}$/.test(v) ? v : null;
}

function logEvent(event, source, components, action, visit) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify({
        source,
        action: action || null,
        components: components.slice(0, 30).map(c => ({
          name: String(c.name || "").trim().slice(0, 120),
          category: String(c.category || "").slice(0, 40),
          verified: !!c.verified,
          db_name: c.db_name ? String(c.db_name).slice(0, 120) : null
        })),
        country: countryOf(event),
        visit_id: cleanVisit(visit)
      });
      const { hostname } = new URL(process.env.SUPABASE_URL);
      const req = https.request({
        hostname,
        path: "/rest/v1/analysis_events",
        method: "POST",
        headers: {
          "apikey": process.env.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
          "Content-Length": Buffer.byteLength(body)
        }
      }, res => { res.resume(); res.on("end", resolve); });
      req.on("error", resolve);
      req.setTimeout(WAIT_MS, () => { req.destroy(); resolve(); });
      req.end(body);
    } catch { resolve(); }
  });
}

module.exports = { logEvent };
