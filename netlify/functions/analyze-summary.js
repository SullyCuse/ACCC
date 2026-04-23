const https = require("https");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
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
    const hasPhono = components.some(c=>["cartridge","phonopre","turntable","tonearm"].includes(c.type));

    const prompt = `Hi-fi compatibility expert. Use ONLY the exact specs below — never substitute values.

SPECS:
${specsText || componentList}

Connections: ${connectionList}

Output EXACTLY:

OVERALL SCORE: [X/10]
IMPEDANCE MATCH: [Good/Acceptable/Poor or N/A]
SENSITIVITY MATCH: [Good/Acceptable/Poor or N/A]

COMPATIBILITY SUMMARY
[2 sentences: verdict with key numbers]${hasPhono ? `

PHONO CHAIN
- Cartridge: [type, output voltage from specs]
- Resonance: 159/√([tonearm mass]×[compliance]) = [X] Hz — [Good 8-12Hz/Acceptable/Poor]
- Recommended gain: [dB]
- Recommended loading: [Ω]` : ""}

ISSUES & RECOMMENDATIONS
1. [recommendation with exact setting]
2. [recommendation]
3. [recommendation]`;

    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
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
      }, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>resolve(d)); });
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
