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
    const numberedList = components.map((c,i)=>`${i+1}. [${typeLabels[c.type]||c.type}] ${c.name}`).join("\n");

    const prompt = `List published specifications for all ${components.length} components. Use training knowledge. For each component:
- If you know the EXACT model: list its specs normally
- If you are NOT certain it is the exact model and are using a similar one: add a note "⚠ Specs shown are for [similar model] — exact specs for [entered model] not confirmed"
- Never skip a component. Estimate with (~) if needed.

${numberedList}

For each component output EXACTLY:
**[Name] ([Type])**
- spec: value
- spec: value

Go through all ${components.length} components in order. No summary text at the end.`;

    const body = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1100,
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
