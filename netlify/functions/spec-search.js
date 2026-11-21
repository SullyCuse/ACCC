const https = require("https");
const { URL } = require("url");
const { logEvent } = require("./_lib/log-event");

// Specs database page (/specs). No AI. Two GET forms:
//   ?q=<text>[&category=<cat>]  search component_specs by name (every word must
//                               match), up to 30 names, cached 5 min
//   ?name=<exact DB name>[&visit=<id>]  one full row; logs one anonymous
//                               "specs" event, so it is never cached

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
const CATEGORIES = ["amplifier", "speaker", "dac", "tuner", "cd-player", "subwoofer", "turntable", "streamer",
  "cassette-deck", "cartridge", "phono-stage", "headphone", "equalizer", "recorder", "tonearm", "power", "network", "clock"];
// Log categories in the analyzer's names where one exists, so Trends merges them.
const LOG_CAT = { amplifier: "amp", speaker: "speakers", subwoofer: "speakers", "phono-stage": "phonopre", "cd-player": "cdplayer" };

function fetchRows(path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(`${process.env.SUPABASE_URL}${path}`);
    const req = https.request({
      hostname, path: pathname + search, method: "GET",
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const rows = JSON.parse(d);
          if (Array.isArray(rows)) return resolve(rows);
        } catch {}
        reject(new Error("Database error"));
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Database timeout")); });
    req.end();
  });
}

const reply = (statusCode, body, cache) => ({
  statusCode, headers: { ...headers, "Cache-Control": cache || "no-store" }, body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return reply(405, { error: "Method not allowed" });
  const { q, category, name, visit } = event.queryStringParameters || {};

  try {
    if (name) {
      const rows = await fetchRows(`/rest/v1/component_specs?select=name,category,specs,source_url&name=eq.${encodeURIComponent(name)}&limit=1`, 4000);
      if (!rows.length) return reply(404, { error: "Not found" });
      const r = rows[0];
      await logEvent(event, "specs", [{ name: r.name, category: LOG_CAT[r.category] || r.category, verified: true, db_name: r.name }], null, visit);
      return reply(200, r);
    }

    // Same word rules as component-lookup: strip PostgREST syntax, Trio = Kenwood.
    const words = String(q || "").replace(/[*,()%\\"]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 5)
      .map(w => /^trio$/i.test(w) ? "Kenwood" : w);
    if (!words.length || words.join("").length < 2) return reply(200, { results: [] }, "public, max-age=300");
    const filter = `and=(${words.map(w => `name.ilike.*${encodeURIComponent(w)}*`).join(",")})`;
    const cat = CATEGORIES.includes(category) ? `&category=eq.${category}` : "";
    const rows = await fetchRows(`/rest/v1/component_specs?select=name,category&${filter}${cat}&order=name&limit=31`, 4000);
    return reply(200, { results: rows.slice(0, 30), more: rows.length > 30 }, "public, max-age=300");
  } catch (e) {
    return reply(500, { error: e.message });
  }
};
