const https = require("https");
const { URL } = require("url");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { component_name, proposed_specs, submitter_email, notes } = JSON.parse(event.body || "{}");

    if (!component_name || !proposed_specs || typeof proposed_specs !== "object") {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "component_name and proposed_specs (object) are required" }) };
    }

    const row = {
      component_name: component_name.trim(),
      proposed_specs,
      submitter_email: submitter_email ? submitter_email.trim() : null,
      notes: notes ? notes.trim() : null
    };

    const body = JSON.stringify(row);
    const { hostname } = new URL(process.env.SUPABASE_URL);

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname,
        path: "/rest/v1/spec_submissions",
        method: "POST",
        headers: {
          "apikey": process.env.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
          "Content-Length": Buffer.byteLength(body)
        }
      }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => {
          if (res.statusCode === 201) resolve();
          else reject(new Error(`DB error ${res.statusCode}: ${d}`));
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
