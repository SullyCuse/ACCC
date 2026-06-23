const https = require("https");
const { URL } = require("url");

// Module-level cache — persists across warm Lambda invocations (~5 min TTL)
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

function fetchSpecs(timeoutMs) {
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
            return resolve({ map: Object.fromEntries(rows.map(r => [r.name, r.specs])), ok: true });
          }
        } catch {}
        resolve({ map: null, ok: false }); // HTTP error body, non-array payload, or parse failure
      });
    });
    req.on("error", () => resolve({ map: null, ok: false }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ map: null, ok: false }); });
    req.end();
  });
}

// Returns { corrections, ok }. ok=false means the verified-spec DB could not be
// reached AND no cached copy exists — so every component falls back to an AI
// estimate and the response should be flagged as unverified.
async function getCorrections() {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return { corrections: _cache, ok: true };

  // Real failures (paused DB, auth/HTTP errors) return fast, so one retry is cheap
  // and recovers transient blips. Only retry when the first attempt failed quickly,
  // so two slow waits can never stack and blow the 10s function budget shared with
  // the Sonnet call.
  const t0 = Date.now();
  let res = await fetchSpecs(3500);
  if (!res.ok && Date.now() - t0 < 1500) res = await fetchSpecs(2500);

  if (res.ok) {
    _cache = res.map;
    _cacheAt = Date.now();
    return { corrections: _cache, ok: true };
  }
  // Fetch failed: a stale cache is still real data and beats guessing; only signal
  // unavailability when we have nothing verified to offer.
  if (_cache) return { corrections: _cache, ok: true };
  return { corrections: {}, ok: false };
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

    const { corrections, ok: dbOk } = await getCorrections();
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

    // When the verified-spec DB was unreachable, every block above is an AI
    // estimate. Lead with a notice block so the UI can't be mistaken for verified
    // specs. Formatted as a header + ⚠ line so renderCompSpecs shows it as a card.
    const dbBanner = dbOk ? "" :
      "**Specs Database Temporarily Unavailable**\n" +
      "⚠ The component specs below are AI estimates and were not verified against the corrections database. Try again in a moment for verified values.\n\n";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: (dbBanner + correctedSection + aiText).trim() })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
