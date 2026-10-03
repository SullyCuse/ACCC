const https = require("https");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const { components, connections, specsText } = JSON.parse(event.body);
    const typeLabels = {
      amp:"Amplifier",preamp:"Preamplifier",speakers:"Speakers",dac:"DAC",
      turntable:"Turntable",tonearm:"Tonearm",cartridge:"Cartridge",
      phonopre:"Phono Preamp",streamer:"Streamer",cdplayer:"CD Player",
      cables:"Cables",headphones:"Headphones",other:"Other"
    };
    const componentList = components.map(c=>`- [${typeLabels[c.type]||c.type}] ${c.name}`).join("\n");
    const connectionList = connections && connections.length > 0
      ? connections.map(c=>`- ${c.fromName} → ${c.toName} via ${c.type}`).join("\n")
      : "Not specified";

    const prompt = `Audio engineer. Analyze each connection in this signal chain using the EXACT confirmed specs below — do not substitute your own spec values. Never refuse. Complete all connections.

CONFIRMED SPECS:
${specsText || componentList}

Connections to analyze:
${connectionList}

Output EXACTLY — one bullet per connection:

SIGNAL CHAIN ANALYSIS
- [From] → [To] via [type]: [impedance/voltage figures from confirmed specs above, match assessment]
- [repeat for every connection]

Keep each bullet to 1–2 sentences with the key figures.`;

    const body = JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    });

    const raw = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "server-side-fallback-2026-07-01",
          "Content-Length": Buffer.byteLength(body),
        },
      }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => resolve(d));
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    const parsed = JSON.parse(raw);
    if (parsed.error) throw new Error(parsed.error.message);
    if (parsed.stop_reason === "refusal") throw new Error("The AI declined to analyze this chain. Please try again.");
    const text = (parsed.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    // truncated: thinking + text hit max_tokens, so the page can say the section was cut off
    return { statusCode: 200, headers, body: JSON.stringify({ text, truncated: parsed.stop_reason === "max_tokens" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
