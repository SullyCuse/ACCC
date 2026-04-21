const https = require("https");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const { components } = JSON.parse(event.body);
    const typeLabels = {
      amp:"Amplifier",preamp:"Preamplifier",speakers:"Speakers",dac:"DAC",
      turntable:"Turntable",tonearm:"Tonearm",cartridge:"Cartridge",
      phonopre:"Phono Preamp",streamer:"Streamer",cdplayer:"CD Player",
      cables:"Cables",headphones:"Headphones",other:"Other"
    };
    const componentList = components.map(c=>`- [${typeLabels[c.type]||c.type}] ${c.name}`).join("\n");

    const prompt = `Audio equipment expert. List published specs for each component. Never refuse — estimate if uncertain, mark with (~).

Components:
${componentList}

For each component output EXACTLY:
**[Name] ([Type])**
- spec: value
- spec: value

Include relevant specs only (power, impedance, sensitivity, gain, output voltage, compliance, mass, etc). One block per component. No other text.`;

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
