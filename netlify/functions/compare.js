/**
 * AudioChainHiFi — Netlify Function: compare.js
 *
 * Returns a full structured spec sheet for a single component (the /compare page
 * calls this once per model, in parallel, then renders them side by side).
 *
 * Verified specs come from the SAME central Supabase `component_specs` table that
 * feeds analyze-specs.js — so a correction added once (via the Suggest/Edit Spec
 * flow or a direct upsert) is authoritative across BOTH the analyzer and compare.
 * When a component matches a verified row, those specs are injected into the AI
 * prompt as an authoritative override.
 *
 * Model note: uses Haiku (not Sonnet) with a capped token budget so a full sheet
 * fits inside the 10s Netlify function timeout. See CLAUDE.md hard-limits table.
 *
 * Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY (already configured).
 */

const https = require("https");
const { URL } = require("url");

const MODEL      = "claude-haiku-4-5";
const MAX_TOKENS = 1100;

/* ─── Central verified-spec DB (shared with analyze-specs.js) ─── */
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
        resolve({ map: null, ok: false });
      });
    });
    req.on("error", () => resolve({ map: null, ok: false }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ map: null, ok: false }); });
    req.end();
  });
}

async function getCorrections() {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;
  const t0 = Date.now();
  let res = await fetchSpecs(3500);
  if (!res.ok && Date.now() - t0 < 1500) res = await fetchSpecs(2500);
  if (res.ok) { _cache = res.map; _cacheAt = Date.now(); return _cache; }
  if (_cache) return _cache;
  return {};
}

/* ─── Fuzzy match (same algorithm as analyze-specs.js) ─────────── */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

function findCorrection(name, corrections) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokenize = s => s.toLowerCase().split(/[\s\-_.]+/).map(t => t.replace(/[^a-z0-9]/g,'')).filter(Boolean);
  const digits = s => (s.match(/[0-9]/g) || []).join('');
  const n = normalize(name);
  const nd = digits(n);
  const userTokens = tokenize(name);

  let key = Object.keys(corrections).find(k => normalize(k) === n);
  if (!key) key = Object.keys(corrections).find(k => {
    const nk = normalize(k);
    return nk.includes(n) || n.includes(nk);
  });
  if (!key) key = Object.keys(corrections).find(k => {
    const keyTokens = tokenize(k);
    return userTokens.length > 0 && digits(normalize(k)) === nd && userTokens.every(t => keyTokens.includes(t));
  });
  if (!key && n.length >= 5) {
    let best = null, bestDist = Infinity, tie = false;
    for (const k of Object.keys(corrections)) {
      const nk = normalize(k);
      if (digits(nk) !== nd) continue;
      const dist = levenshtein(n, nk);
      if (dist < bestDist) { bestDist = dist; best = k; tie = false; }
      else if (dist === bestDist) tie = true;
    }
    const maxDist = Math.min(2, Math.floor(n.length / 6) + 1);
    if (best && !tie && bestDist <= maxDist) key = best;
  }
  return key ? { name: key, specs: corrections[key] } : null;
}

/* Turn a verified specs object into an authoritative correction block. */
function buildCorrectionBlock(match) {
  const lines = Object.entries(match.specs).map(([k, v]) => '  ' + k + ': ' + v).join('\n');
  return 'VERIFIED SPECS from the AudioChainHiFi verified-spec database — treat these as ' +
    'authoritative fact, overriding any conflicting data. Use them verbatim for the matching ' +
    'fields and fill remaining fields from your own knowledge:\n' +
    '  Component: ' + match.name + '\n' + lines + '\n\n';
}

const CORS = {
  'Content-Type':                 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server configuration error: API key not set.' }) };
  }

  let name, category;
  try {
    ({ name, category } = JSON.parse(event.body || '{}'));
  } catch (_) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
  }
  if (!name || !category) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing required fields: name and category' }) };
  }
  if (name.length > 200 || category.length > 100) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Input too long' }) };
  }
  name     = name.trim().replace(/[`\\]/g, '');
  category = category.trim().replace(/[`\\]/g, '');

  try {
    const corrections = await getCorrections();
    const match = findCorrection(name, corrections);
    const parsed = await callClaude(buildSpecPrompt(name, category, match), MAX_TOKENS, apiKey);
    parsed.verified = !!match;   // flag so the UI can badge verified components
    return { statusCode: 200, headers: CORS, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error('AudioChainHiFi compare error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message || 'Internal server error' }) };
  }
};

/* ─── Shared API fetch ───────────────────────────────────────── */
function callAPI(prompt, maxTokens, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body),
      },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callClaude(prompt, maxTokens, apiKey) {
  const raw = await callAPI(prompt, maxTokens, apiKey);
  const data = JSON.parse(raw);
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).map(b => b.text || '').join('');
  return extractJSON(text);
}

/* ─── Extract JSON robustly from AI response ─────────────────── */
function extractJSON(text) {
  if (!text) throw new Error('Empty response from AI');
  var cleaned = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
  var start = cleaned.indexOf('{');
  if (start === -1) throw new Error('No JSON object in AI response');
  var depth = 0, end = -1;
  for (var i = start; i < cleaned.length; i++) {
    if      (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Malformed JSON: unmatched braces');
  var jsonStr = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1'));
  }
}

/* ─── Prompt: Full component specification ───────────────────── */
function buildSpecPrompt(name, category, match) {
  const correctionBlock = match ? buildCorrectionBlock(match) : '';

  return 'You are a hi-fi audio equipment database. Return technical specifications for the component below.\n\n' +
    'CRITICAL: Return ONLY a raw JSON object. No markdown, no code fences, no preamble, no trailing text. Start with { and end with }.\n\n' +
    'Category: ' + category + '\n' +
    'Component: "' + name + '"\n\n' +
    correctionBlock +
    'SPECS REQUIREMENT: You MUST populate the "specs" object with at least 6 real key-value pairs. ' +
    'Use official manufacturer data first, then Stereophile, What Hi-Fi, Audio Science Review, The Absolute Sound, or Rtings.com. ' +
    'Do NOT return an empty specs object. For well-known products provide all specs you have. ' +
    'For obscure products include whatever is available and note limitations in the summary.\n\n' +
    'ACCURACY RULES:\n' +
    '- Use "N/A" only for individual values you cannot confirm — not as a reason to omit entire fields or return an empty specs object.\n' +
    '- SPEAKER EXCEPTION: enclosure type (bookshelf vs floorstander) must come from a verified source only. Do not infer from model name or siblings.\n' +
    '- If a product is genuinely obscure, say so in the summary but still populate every spec field you can.\n\n' +
    'Return this exact JSON structure with ALL fields populated:\n\n' +
    '{\n' +
    '  "brand": "Manufacturer name only",\n' +
    '  "model": "Model name only (no brand prefix)",\n' +
    '  "fullName": "Brand and model as one string",\n' +
    '  "msrpUSD": "e.g. $2499",\n' +
    '  "yearIntroduced": "e.g. 2021 or 2019-present",\n' +
    '  "specs": {\n' +
    '    "Spec Name 1": "value with units",\n' +
    '    "Spec Name 2": "value with units",\n' +
    '    "Spec Name 3": "value with units",\n' +
    '    "Spec Name 4": "value with units",\n' +
    '    "Spec Name 5": "value with units",\n' +
    '    "Spec Name 6": "value with units"\n' +
    '  },\n' +
    '  "dimensions": {\n' +
    '    "width":  "e.g. 440mm (17.3in)",\n' +
    '    "height": "e.g. 116mm (4.6in)",\n' +
    '    "depth":  "e.g. 380mm (15.0in)",\n' +
    '    "weight": "e.g. 8.4kg (18.5lbs)"\n' +
    '  },\n' +
    '  "notableFeatures": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],\n' +
    '  "summary": "2-3 sentences on sonic character, build quality, and ideal use case. If data is limited, state that clearly.",\n' +
    '  "strengths": ["Strength 1", "Strength 2", "Strength 3"],\n' +
    '  "considerations": ["Consideration 1", "Consideration 2"],\n' +
    '  "manufacturerUrl": "https://www.official-manufacturer-homepage.com",\n' +
    '  "ratings": null\n' +
    '}\n\n' +
    'manufacturerUrl RULES: the manufacturer\'s own root homepage (not a distributor, retailer, or product sub-page), starting with https://. If unsure, use "".\n\n' +
    'RATINGS — populate ONLY when category is Loudspeakers/Speakers. For all other categories set "ratings": null.\n' +
    'For speakers, replace "ratings": null with this object:\n' +
    '  "ratings": {\n' +
    '    "detailClarity": <integer 1-10, where 1=very dull/rolled-off, 10=highly detailed/extended>,\n' +
    '    "bass": <integer 1-10, where 1=very thin/lean, 10=very powerful/heavy>,\n' +
    '    "vocals": <integer 1-10, where 1=recessed/laid-back, 10=very forward/prominent>,\n' +
    '    "soundProfile": <integer 1-10, where 1=very warm, 5=neutral, 10=very bright>\n' +
    '  }\n' +
    'Base ratings on published professional reviews. For speakers ALWAYS return the ratings object (never null) — only set an INDIVIDUAL field to null when you truly lack review data for that one metric; do not guess, and do not null the whole object.\n\n' +
    'Spec fields to include (8-12 most relevant for the category):\n' +
    'AMPLIFIER / INTEGRATED AMPLIFIER: Output Power (8Ω stereo), Output Power (4Ω stereo), Output Power (8Ω mono if applicable), THD+N, Signal-to-Noise Ratio, Frequency Response, Damping Factor, Input Impedance, Class of Operation, Inputs, Outputs, Headphone Output\n' +
    'PREAMPLIFIER: Gain, THD+N, SNR, Frequency Response, Input Impedance, Output Impedance, Channel Separation, Inputs, Outputs, Power Supply\n' +
    'PHONO PREAMP: Gain (MM), Gain (MC), RIAA Accuracy, SNR (MM), SNR (MC), Input Impedance (MM), Input Impedance (MC), Output Impedance, Subsonic Filter, Power Supply\n' +
    'TURNTABLE: Drive Type, Motor Type, Speeds, Platter Material, Platter Weight, Wow & Flutter, Signal-to-Noise Ratio, Included Tonearm, Anti-Skate, Built-in Phono Stage\n' +
    'TONEARM: Effective Length, Mounting Distance, Overhang, Offset Angle, Effective Mass, Bearing Type, Headshell Mount, VTA Adjustment, Anti-Skating\n' +
    'CARTRIDGE: Type (MM/MC/MI), Output Voltage, Channel Separation, Channel Balance, Frequency Response, Tracking Force (recommended), Compliance, Stylus Shape, Cantilever Material, Loading Impedance\n' +
    'DAC: DAC Chip(s), Max PCM Resolution, DSD Support, Dynamic Range, THD+N, SNR, Digital Inputs, Analog Outputs, Headphone Output, USB Class\n' +
    'STREAMER: Supported Streaming Services, Max PCM Resolution, DSD Support, Network Connectivity, Analog Outputs, Digital Outputs, Built-in DAC, Control App, Roon Ready\n' +
    'SPEAKERS: Frequency Response, Sensitivity (dB/W/m), Nominal Impedance, Minimum Impedance, Woofer Size, Tweeter Type, Enclosure Type, Crossover Frequency, Recommended Amplifier Power\n' +
    'HEADPHONES: Driver Type, Driver Size, Frequency Response, Impedance, Sensitivity (dB/mW), THD, Weight (without cable), Cable Length, Connector Type, Wearing Style';
}
