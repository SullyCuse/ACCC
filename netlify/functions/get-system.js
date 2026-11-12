const https = require("https");
const { URL } = require("url");

// Returns a saved system for /s/<id> and counts the view. Counting never blocks
// or fails the load: it is capped at 1 s and any error just leaves views null.

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

function rest(method, path, { body, prefer, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const { hostname } = new URL(process.env.SUPABASE_URL);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname, path, method,
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        ...(prefer ? { "Prefer": prefer } : {}),
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve({ status: res.statusCode, body: d, range: res.headers["content-range"] }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Database timeout")); });
    req.end(payload);
  });
}

async function fetchRow(id) {
  const res = await rest("GET", `/rest/v1/shared_systems?select=data&id=eq.${id}&limit=1`);
  try { const rows = JSON.parse(res.body); if (Array.isArray(rows)) return rows[0] || null; } catch {}
  throw new Error("Database error");
}

// Records this view, then returns how many views the link has (including this one).
async function countView(id) {
  try {
    const ins = await rest("POST", "/rest/v1/shared_system_views", { body: { system_id: id }, prefer: "return=minimal", timeoutMs: 1000 });
    if (ins.status !== 201) return null;
    const cnt = await rest("HEAD", `/rest/v1/shared_system_views?select=id&system_id=eq.${id}`, { prefer: "count=exact", timeoutMs: 1000 });
    const total = parseInt(String(cnt.range || "").split("/")[1], 10);
    return Number.isFinite(total) ? total : null;
  } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  const id = (event.queryStringParameters || {}).id || "";
  if (!/^[A-Za-z0-9]{8}$/.test(id)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid link" }) };

  try {
    const row = await fetchRow(id);
    if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: "We couldn't find that system. The link may be mistyped." }) };
    const views = await countView(id);
    return { statusCode: 200, headers, body: JSON.stringify({ ...row.data, views }) };
  } catch {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not load that system right now. Please try again." }) };
  }
};
