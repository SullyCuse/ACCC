const https = require("https");

// Verified component specs database.
// To add/update: edit this object and commit — Netlify redeploys automatically.
// Keys are matched case-insensitively against component names entered by users.
const corrections = {
  "Parasound zPhono XRM": {
    "MM gain": "40 dB",
    "MC gain": "60 dB",
    "MM input impedance": "47 kΩ",
    "MC input impedance": "100 Ω (selectable: 50-1050 Ω)",
    "Output voltage": "2V maximum"
  },
  "Denon DL-301 II": {
    "Type": "MC (Moving Coil)",
    "Output voltage": "0.4 mV",
    "Dynamic compliance": "13 µm/mN",
    "Static compliance": "35 µm/mN",
    "Internal impedance": "33 Ω",
    "Tracking force": "1.2–1.6 g (recommended 1.4 g)",
    "Recommended loading": "≥ 100 Ω",
    "Channel separation": ">28 dB (at 1 kHz)",
    "Net Weight": "6 g"
  },
  "Fluance RT85": {
    "Drive type": "Belt drive",
    "Speeds": "33⅓, 45 RPM",
    "Tonearm effective mass": "27.5 g",
    "Signal-Noise-Ratio (Weighted)": "76 dB",
    "Signal-Noise-Ratio (Unweighted)": "65 dB",
    "Platter": "Acrylic",
    "Tonearm Type": "Static Balanced, S-Type",
    "Supported Cartridge Weight": "5g-7.5 g",
    "Counterweight": "102 g (Adjustable)",
    "Overhang": "19.2 mm",
    "Effective Tonearm Length": "224 mm",
    "Headshell Mount": "H-4 Bayonet Mount",
    "Headshell Weight": "9 g",
    "Phono Output": "5.5 mV"
  },
  "Wharfedale Evo 5.1": {
    "Nominal Impedance": "4 Ω",
    "Minimum Impedance": "3.4 Ω",
    "Sensitivity": "87 dB (2.83V/1m)",
    "Power Handling": "25–100 W (recommended amplifier range)"
  },
  "AT-VM740ML": { 
    "Type": "MM (Moving Magnet)", 
    "Output Voltage": "4.0 mV (at 1 kHz, 5 cm/sec)", 
    "Dynamic Compliance": "10 x 10⁻⁶ cm/dyne (10 µm/mN)", 
    "Internal Impedance": "2.7 kΩ", 
    "Tracking Force": "1.8–2.2 g (2.0 g recommended)", 
    "Recommended Loading": "47 kΩ", 
    "Channel Separation": "28 dB (at 1 kHz)"
   }, 
    "Parasound 275": { 
    "Power Output": "75 W/ch (8Ω), 125 W/ch (4Ω)",
    "Input Impedance": "~47 kΩ", 
    "Input Sensitivity": "~1,000 mV (1V)" },
}, 
  "Dual 1229": { 
  "Effective Mass": "~11 g", 
  "Effective Length": "~222 mm", 
  "Mounting Type": "Proprietary Dual bayonet/plug-in headshell mount (non-standard; integrated straight arm with detachable headshell)" 
  }
};

function findCorrection(name) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Split on original string words, normalize each token — preserves word boundaries
  const tokenize = s => s.toLowerCase().split(/[\s\-_.]+/).map(t => t.replace(/[^a-z0-9]/g,'')).filter(Boolean);
  const n = normalize(name);
  const userTokens = tokenize(name);

  // 1. Exact normalized match
  let key = Object.keys(corrections).find(k => normalize(k) === n);

  // 2. Substring match (handles "Parasound 275" vs "Parasound 275 v1")
  if (!key) key = Object.keys(corrections).find(k => {
    const nk = normalize(k);
    return nk.includes(n) || n.includes(nk);
  });

  // 3. Token subset match (handles "Wharfedale 5.1" vs "Wharfedale Evo 5.1")
  // All user tokens must appear in the key's tokens
  if (!key) key = Object.keys(corrections).find(k => {
    const keyTokens = tokenize(k);
    return userTokens.length > 0 && userTokens.every(t => keyTokens.includes(t));
  });

  return key ? corrections[key] : null;
}

function formatCorrectedSpecs(name, type, specs) {
  const lines = Object.entries(specs).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  return `**${name} (${type})**\n${lines}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  try {
    const { components } = JSON.parse(event.body);
    const typeLabels = {
      amp:"Amplifier", preamp:"Preamplifier", speakers:"Speakers", dac:"DAC",
      turntable:"Turntable", tonearm:"Tonearm", cartridge:"Cartridge",
      phonopre:"Phono Preamp", streamer:"Streamer", cdplayer:"CD Player",
      cables:"Cables", headphones:"Headphones", other:"Other"
    };
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

    const correctedBlocks = [];
    const needsAI = [];

    components.forEach((c, i) => {
      const corrected = findCorrection(c.name);
      if (corrected) {
        correctedBlocks.push(formatCorrectedSpecs(c.name, typeLabels[c.type] || c.type, corrected));
      } else {
        needsAI.push({ index: i, component: c });
      }
    });

    let aiText = "";
    if (needsAI.length > 0) {
      const numberedList = needsAI.map(({ index, component: c }) => {
        return `${index + 1}. [${typeLabels[c.type] || c.type}] ${c.name}\n   Required: ${specFields[c.type] || "key specs"}`;
      }).join("\n");

      const prompt = `You are an audio equipment specifications database with expert knowledge of hi-fi components. For each component below, report the exact published manufacturer specifications.

IMPORTANT:
- If you know this EXACT model: state its specs precisely
- If NOT certain: add "⚠ Specs shown are for [similar model] — exact specs for [entered model] not confirmed"
- Never skip a component. Estimate with (~) only if no data available.

${numberedList}

Output one block per component:
**[Name] ([Type])**
- spec: value

All ${needsAI.length} components required. No summary text.`;

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
        }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d)); });
        req.on("error", reject);
        req.write(body);
        req.end();
      });

      const parsed = JSON.parse(raw);
      if (parsed.error) throw new Error(parsed.error.message);
      aiText = parsed.content[0].text;
    }

    const correctedSection = correctedBlocks.length > 0
      ? correctedBlocks.join("\n\n") + "\n\n"
      : "";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: (correctedSection + aiText).trim() })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
