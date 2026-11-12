const { logEvent } = require("./_lib/log-event");

// Anonymous usage counter for the compatibility checker. The page posts one
// event when a component is picked from the database ("pick") and one when a
// pairing first produces a verdict ("result"). Only database names and fixed
// kinds are accepted; nothing the user typed freely is stored.

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
const KINDS = ["amp", "speaker", "cartridge", "phono"];
const ACTIONS = ["pick", "result"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  let data;
  try { data = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  if (!ACTIONS.includes(data.action) || !Array.isArray(data.components)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad event" }) };
  }
  const components = data.components
    .filter(c => c && KINDS.includes(c.kind) && typeof c.name === "string" && c.name.trim())
    .slice(0, 4)
    .map(c => ({ name: c.name, category: c.kind, verified: true }));
  // A pick needs exactly one named component; a result may have none (all typed by hand).
  if (data.action === "pick" && components.length !== 1) return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad event" }) };

  await logEvent(event, "checker", components, data.action);
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
