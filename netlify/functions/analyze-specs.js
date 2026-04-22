const https = require("https");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  try {
    const { components } = JSON.parse(event.body);
    const typeLabels = {
      amp:"Amplifier",preamp:"Preamplifier",speakers:"Speakers",dac:"DAC",
      turntable:"Turntable",tonearm:"Tonearm",cartridge:"Cartridge",
      phonopre:"Phono Preamp",streamer:"Streamer",cdplayer:"CD Player",
      cables:"Cables",headphones:"Headphones",other:"Other"
    };

    // Ask only the most critical specs per type — keeps output compact for Sonnet speed
    const specFields = {
      amp:       "power output (W/ch), input impedance (Ω), input sensitivity (mV)",
      preamp:    "gain (dB), input impedance (kΩ), output impedance (Ω)",
      speakers:  "nominal impedance (Ω), minimum impedance (Ω), sensitivity (dB/W/m), power handling (W)",
      dac:       "output voltage (Vrms), output impedance (Ω), THD+N",
      turntable: "drive type, speeds (RPM), tonearm effective mass (g)",
      tonearm:   "effective mass (g), effective length (mm), mounting type",
      cartridge: "type (MM/MC), output voltage (mV), dynamic compliance (µm/mN), internal impedance (Ω), tracking force (g), recommended loading (Ω), channel separation (dB)",
      phonopre:  "MM gain (dB), MC gain (dB), MM input impedance (kΩ), MC input impedance (Ω), output voltage",
      streamer:  "digital outputs, supported formats",
      cdplayer:  "output voltage (Vrms), digital outputs, THD",
      headphones:"impedance (Ω), sensitivity (dB/mW)",
      cables:    "type, impedance",
      other:     "key electrical specs"
    };

    const numberedList = components.map((c,i) => {
      const fields = specFields[c.type] || "key specs";
      return `${i+1}. [${typeLabels[c.type]||c.type}] ${c.name}\n   Required: ${fields}`;
    }).join("\n");

    const prompt = `You are an audio equipment specifications database with expert knowledge of hi-fi components. For each component below, report the exact published manufacturer specifications.

IMPORTANT:
- If you know this EXACT model: state its specs precisely
- If you are NOT certain this is the exact model: add line "⚠ Specs shown are for [similar model] — exact specs for [entered model] not confirmed in training data"
- Never skip a component
- Estimate with (~) only if no data available

${numberedList}

Output one block per component:
**[Name] ([Type])**
- spec: value

All ${components.length} components required. No summary text.`;

    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 650,
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
