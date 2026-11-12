const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");

// Saves an analyzer system (component names/types and connections only) under a
// short random id so it can be opened at /s/<id>. Anyone with the link can view it.

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

const TYPES = ["amp", "preamp", "speakers", "dac", "turntable", "tonearm", "cartridge", "phonopre", "streamer", "cdplayer", "cables", "headphones", "other"];
const CONN_TYPES = ["XLR balanced", "RCA single-ended", "USB", "Optical / TOSLINK", "AES/EBU", "I2S", "Speaker wire", "Phono / RCA", "Coaxial S/PDIF", "HDMI / I2S", "Bluetooth", "Wi-Fi / Network"];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const newId = () => Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");

function validate(body) {
  const { components, connections } = body || {};
  if (!Array.isArray(components) || components.length < 2 || components.length > 20) return null;
  if (!Array.isArray(connections) || connections.length > 40) return null;
  const comps = [];
  for (const c of components) {
    const name = c && typeof c.name === "string" ? c.name.trim().slice(0, 120) : "";
    if (!name || !TYPES.includes(c.type)) return null;
    comps.push({ type: c.type, name });
  }
  const conns = [];
  for (const c of connections) {
    if (!c || !Number.isInteger(c.from) || !Number.isInteger(c.to) || c.from === c.to) return null;
    if (c.from < 0 || c.to < 0 || c.from >= comps.length || c.to >= comps.length) return null;
    if (!CONN_TYPES.includes(c.type)) return null;
    conns.push({ from: c.from, to: c.to, type: c.type });
  }
  return { components: comps, connections: conns };
}

function insert(row) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(row);
    const { hostname } = new URL(process.env.SUPABASE_URL);
    const req = https.request({
      hostname, path: "/rest/v1/shared_systems", method: "POST",
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
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("Database timeout")); });
    req.end(body);
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  if ((event.body || "").length > 20000) return { statusCode: 413, headers, body: JSON.stringify({ error: "System too large" }) };

  let data;
  try { data = validate(JSON.parse(event.body || "{}")); } catch { data = null; }
  if (!data) return { statusCode: 400, headers, body: JSON.stringify({ error: "That system could not be saved. It needs 2 to 20 components." }) };

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = newId();
      const status = await insert({ id, data });
      if (status === 201) return { statusCode: 200, headers, body: JSON.stringify({ id }) };
      if (status !== 409) break; // 409 = id collision, try a new one
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not create a link right now. Please try again." }) };
  } catch {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not create a link right now. Please try again." }) };
  }
};

exports.validate = validate;
