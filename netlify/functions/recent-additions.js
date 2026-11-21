const https = require("https");
const { URL } = require("url");

// "Recently added to the specs database" for Compare and the compatibility
// checker (rendered by /recent-additions.js). GET, no parameters. Returns the
// total number of components with specs and the latest brand batches: rows
// added on the same day whose names start with the same brand. No AI.

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=600"
};
const LIMIT = 1000;      // newest rows to read; enough for several batches
const BATCHES = 6;
const MODELS_SHOWN = 8;

function fetchRecent(timeoutMs) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(
      `${process.env.SUPABASE_URL}/rest/v1/component_specs?select=name,category,created_at&order=created_at.desc,name.asc&limit=${LIMIT}`
    );
    const req = https.request({
      hostname, path: pathname + search, method: "GET",
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        "Prefer": "count=exact"
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const rows = JSON.parse(d);
          const total = parseInt(String(res.headers["content-range"] || "").split("/")[1], 10);
          if (Array.isArray(rows) && Number.isFinite(total)) return resolve({ rows, total });
        } catch {}
        reject(new Error("Database error"));
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Database timeout")); });
    req.end();
  });
}

// Brand = the words every name in the batch starts with ("Monitor Audio",
// "Q Acoustics"), always leaving at least one word for the model. A lone row
// uses its first word, or two when the first is very short ("Q Acoustics").
function brandOf(names) {
  const split = names.map(n => n.trim().split(/\s+/));
  if (split.length === 1) {
    const w = split[0];
    return w.length > 2 && w[0].length <= 2 ? w.slice(0, 2).join(" ") : w[0];
  }
  const maxLen = Math.min(...split.map(w => w.length)) - 1;
  let k = 0;
  while (k < maxLen && split.every(w => w[k].toLowerCase() === split[0][k].toLowerCase())) k++;
  return split[0].slice(0, Math.max(k, 1)).join(" ");
}

function batchesFrom(rows, complete) {
  const groups = new Map();
  for (const r of rows) {
    const day = String(r.created_at).slice(0, 10);
    const first = r.name.trim().split(/\s+/)[0].toLowerCase();
    const key = day + "|" + first;
    if (!groups.has(key)) groups.set(key, { day, rows: [] });
    groups.get(key).rows.push(r);
  }
  let list = [...groups.values()];
  // When the read hit LIMIT, the oldest day may be cut off; drop it so no
  // batch reports a partial count.
  if (!complete && list.length) {
    const oldest = list[list.length - 1].day;
    list = list.filter(g => g.day !== oldest);
  }
  return list
    .sort((a, b) => b.day.localeCompare(a.day) || b.rows.length - a.rows.length)
    .slice(0, BATCHES)
    .map(g => {
      const brand = brandOf(g.rows.map(r => r.name));
      const models = g.rows.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, MODELS_SHOWN).map(r => ({
        name: r.name,
        model: r.name.trim().slice(brand.length).trim() || r.name,
        category: r.category || null
      }));
      return { brand, date: g.day, count: g.rows.length, models };
    });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    const { rows, total } = await fetchRecent(4000);
    const body = { total, batches: batchesFrom(rows, rows.length < LIMIT) };
    return { statusCode: 200, headers, body: JSON.stringify(body) };
  } catch (e) {
    return { statusCode: 502, headers: { ...headers, "Cache-Control": "no-store" }, body: JSON.stringify({ error: e.message }) };
  }
};
