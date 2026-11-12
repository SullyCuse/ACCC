const https = require("https");
const { URL } = require("url");

// Returns a saved system for /s/<id>. Read-only.

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function fetchRow(id) {
  return new Promise((resolve, reject) => {
    const { hostname } = new URL(process.env.SUPABASE_URL);
    const req = https.request({
      hostname, path: `/rest/v1/shared_systems?select=data&id=eq.${id}&limit=1`, method: "GET",
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { const rows = JSON.parse(d); if (Array.isArray(rows)) return resolve(rows[0] || null); } catch {}
        reject(new Error("Database error"));
      });
    });
    req.on("error", reject);
    req.setTimeout(4000, () => { req.destroy(); reject(new Error("Database timeout")); });
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  const id = (event.queryStringParameters || {}).id || "";
  if (!/^[A-Za-z0-9]{8}$/.test(id)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid link" }) };

  try {
    const row = await fetchRow(id);
    if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: "We couldn't find that system. The link may be mistyped." }) };
    return { statusCode: 200, headers: { ...headers, "Cache-Control": "public, max-age=3600" }, body: JSON.stringify(row.data) };
  } catch {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not load that system right now. Please try again." }) };
  }
};
