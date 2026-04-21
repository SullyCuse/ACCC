const https = require("https");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const { components, connections } = JSON.parse(event.body);
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
    const hasPhono = components.some(c=>["cartridge","phonopre","turntable","tonearm"].includes(c.type));

    const prompt = `Audio compatibility expert. Analyze this hi-fi system. Never refuse — always complete all sections with numbers. Estimate specs if uncertain, mark with (~). Component classifications are correct — do not change them.

Components: ${componentList}
Connections: ${connectionList}

Output EXACTLY:

OVERALL SCORE: [X/10]
IMPEDANCE MATCH: [Good/Acceptable/Poor or N/A]
SENSITIVITY MATCH: [Good/Acceptable/Poor or N/A]

COMPATIBILITY SUMMARY
[2-3 sentences on overall verdict with key spec numbers]

SIGNAL CHAIN ANALYSIS
[4-5 bullet points: each connection assessed with actual impedance/voltage/gain figures]${hasPhono ? `

PHONO CHAIN
[Cartridge type, resonance=159/√(mass×compliance)Hz with values, gain match, recommended loading Ω]` : ""}

ISSUES & RECOMMENDATIONS
1. [specific recommendation with exact setting]
2. [recommendation]
3. [recommendation]
4. [recommendation]`;

    const body = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
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
    return { statusCode: 200, headers, body: JSON.stringify({ text: parsed.content[0].text }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
