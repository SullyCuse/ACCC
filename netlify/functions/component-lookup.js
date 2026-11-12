const https = require("https");
const { URL } = require("url");
const { PARSERS, CATEGORIES } = require("./_lib/parse-specs");

// Search component_specs by name for the compatibility checker and return the
// numbers it needs, parsed from the free-text specs. GET ?kind=amp|speaker|
// cartridge|phono&q=<text>. Read-only; uses the same anon key as the other functions.

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300"
};

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

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const { kind, q } = event.queryStringParameters || {};
  const parse = PARSERS[kind];
  if (!parse) return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown kind" }) };

  // Every word must appear in the name; strip characters PostgREST treats as syntax.
  const words = String(q || "").replace(/[*,()%\\"]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length || words.join("").length < 2) return { statusCode: 200, headers, body: JSON.stringify({ results: [] }) };

  const filter = `and=(${words.map(w => `name.ilike.*${encodeURIComponent(w)}*`).join(",")})`;
  // 51 rows (e.g. all KEF) have no category; include them, but below keep only
  // those whose specs actually parse for this kind.
  const cats = `or=(category.in.(${CATEGORIES[kind].join(",")}),category.is.null)`;

  try {
    const rows = await fetchRows(`/rest/v1/component_specs?select=name,category,specs&${cats}&${filter}&order=name&limit=8`, 4000);
    const results = rows
      .map(r => ({ name: r.name, category: r.category, values: parse(r.specs) }))
      .filter(r => r.category || r.values)
      .map(({ name, values }) => ({ name, values }));
    return { statusCode: 200, headers, body: JSON.stringify({ results }) };
  } catch (e) {
    return { statusCode: 500, headers: { ...headers, "Cache-Control": "no-store" }, body: JSON.stringify({ error: e.message }) };
  }
};
