const https = require("https");
const { URL } = require("url");

// Module-level cache — persists across warm Lambda invocations (~5 min TTL)
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getCorrections() {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;
  return new Promise((resolve) => {
    const { hostname, pathname, search } = new URL(
      `${process.env.SUPABASE_URL}/rest/v1/component_specs?select=name,specs`
    );
    const req = https.request({
      hostname, path: pathname + search, method: "GET",
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const rows = JSON.parse(d);
          if (Array.isArray(rows)) {
            _cache = Object.fromEntries(rows.map(r => [r.name, r.specs]));
            _cacheAt = Date.now();
          }
        } catch {}
        resolve(_cache || {});
      });
    });
    req.on("error", () => resolve(_cache || {}));
    req.setTimeout(3000, () => { req.destroy(); resolve(_cache || {}); });
    req.end();
  });
}

function findCorrection(name, corrections) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
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

    const corrections = await getCorrections();
    const correctedBlocks = [];
    const needsAI = [];

    components.forEach((c, i) => {
      const corrected = findCorrection(c.name, corrections);
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
- If NOT certain: add "⚠ Specs shown are for [similar model] — exact specs for [entered model] not confirmed" then provide your best known specs
- Never skip a component. Estimate with (~) only if no data available.
- NEVER ask clarifying questions. NEVER request more information. Always output spec blocks — one per component, no exceptions.

${numberedList}

Output one block per component:
**[Name] ([Type])**
- spec: value

All ${needsAI.length} components required. No summary text. No questions.`;

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
