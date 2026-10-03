const https = require("https");
const { URL } = require("url");

// Module-level cache — persists across warm Lambda invocations (~5 min TTL)
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

// Page through component_specs: the Data API caps every response at the
// project's "Max rows" setting (1000), and past that rows would silently
// drop out of matching. count=exact puts the table total in Content-Range,
// so paging stops on the real row count whatever the cap is set to.
const SPEC_PAGE = 1000;

function fetchSpecsPage(offset, timeoutMs) {
  return new Promise((resolve) => {
    const { hostname, pathname, search } = new URL(
      `${process.env.SUPABASE_URL}/rest/v1/component_specs?select=name,specs&order=name&limit=${SPEC_PAGE}&offset=${offset}`
    );
    const req = https.request({
      hostname, path: pathname + search, method: "GET",
      headers: {
        "apikey": process.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        "Prefer": "count=exact"
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const rows = JSON.parse(d);
          const total = parseInt(String(res.headers["content-range"] || "").split("/")[1], 10);
          if (Array.isArray(rows) && Number.isFinite(total)) return resolve({ rows, total });
        } catch {}
        resolve(null); // HTTP error body, non-array payload, missing count, or parse failure
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// One timeout budget covers all pages, so the retry logic in getCorrections()
// keeps its worst case.
async function fetchSpecs(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const rows = [];
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return { map: null, ok: false };
    const page = await fetchSpecsPage(rows.length, left);
    if (!page) return { map: null, ok: false };
    rows.push(...page.rows);
    if (rows.length >= page.total || page.rows.length === 0) break;
  }
  return { map: Object.fromEntries(rows.map(r => [r.name, r.specs])), ok: true };
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
  // Mark suffixes: Roman numerals read as digits, so "MKIII", "Mk III" and "MKⅢ" all match "MK3".
  const mk = s => s.replace(/(?<![a-z])(mk)[\s.\-]*(iv|iii|ii|i|[ⅰ-ⅳⅠ-Ⅳ])(?![a-z])/gi, (m, p, r) => p + ({ i: 1, ii: 2, iii: 3, iv: 4, 'ⅰ': 1, 'ⅱ': 2, 'ⅲ': 3, 'ⅳ': 4, 'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4 })[/[a-z]/i.test(r) ? r.toLowerCase() : r]);
  const normalize = s => mk(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokenize = s => mk(s).toLowerCase().split(/[\s\-_.]+/).map(t => t.replace(/[^a-z0-9]/g,'')).filter(Boolean);
  const digits = s => (s.match(/[0-9]/g) || []).join('');
  const n = normalize(name);
  const nd = digits(n);
  const userTokens = tokenize(name);
  // Model code: the tokens containing digits, each joined to a preceding
  // single-letter token ("NAD C 538" -> "c538", "NAD 3020A" -> "3020a").
  const modelCode = s => tokenize(s).map((t, i, a) => /[0-9]/.test(t) ? ((i > 0 && /^[a-z]$/.test(a[i - 1])) ? a[i - 1] : '') + t : '').join('');

  // 1. Exact normalized match
  let key = Object.keys(corrections).find(k => normalize(k) === n);

  // 2. Substring match (handles "Parasound 275" vs "Parasound 275 v1").
  //    Prefer the closest length, so "KEF LS50" binds to "KEF LS50 Meta" rather
  //    than "KEF LS50 Wireless II". Whole-word matches outrank partial ones, so
  //    "Schiit Loki" prefers "Schiit Loki Mini+" over "Schiit Lokius". A tie
  //    falls through to later steps.
  if (!key) {
    let best = null, bestDiff = Infinity, tie = false;
    for (const k of Object.keys(corrections)) {
      const nk = normalize(k);
      if (!nk.includes(n) && !n.includes(nk)) continue;
      const keyTokens = tokenize(k);
      const whole = nk.includes(n) ? userTokens.every(t => keyTokens.includes(t))
                                   : keyTokens.every(t => userTokens.includes(t));
      const diff = Math.abs(nk.length - n.length) + (whole ? 0 : 1000);
      if (diff < bestDiff) { bestDiff = diff; best = k; tie = false; }
      else if (diff === bestDiff) tie = true;
    }
    if (best && !tie) key = best;
  }

  // 3. Token subset match (handles "Wharfedale 5.1" vs "Wharfedale Evo 5.1").
  //    Digit runs must match: tokenizing on "." splits "5.1" into ["5","1"], so
  //    without this guard a "5.x" model would bind to "5.1" (both share token "5").
  //    Prefer the candidate with the fewest extra tokens, so "Fosi V3" binds to
  //    "Fosi Audio V3" rather than "Fosi Audio V3 Mono"; a tie is ambiguous and
  //    falls through.
  if (!key && userTokens.length > 0) {
    let best = null, bestExtra = Infinity, tie = false;
    for (const k of Object.keys(corrections)) {
      const keyTokens = tokenize(k);
      if (digits(normalize(k)) !== nd || !userTokens.every(t => keyTokens.includes(t))) continue;
      const extra = keyTokens.length - userTokens.length;
      if (extra < bestExtra) { bestExtra = extra; best = k; tie = false; }
      else if (extra === bestExtra) tie = true;
    }
    if (best && !tie) key = best;
  }

  // 4. Fuzzy fallback for letter typos (handles "Wharefedale" -> "Wharfedale").
  //    Conservative on purpose: the model code must match exactly, so a typo can
  //    never bind "5.1" to "5.2", nor "3020A" to "D 3020" (same digits, different
  //    product). Requires a single unambiguous nearest candidate within a small
  //    edit distance — ties or anything farther fall back to AI.
  if (!key && n.length >= 5) {
    const um = modelCode(name);
    let best = null, bestDist = Infinity, tie = false;
    for (const k of Object.keys(corrections)) {
      const nk = normalize(k);
      if (digits(nk) !== nd || modelCode(k) !== um) continue; // different model -> different product
      const dist = levenshtein(n, nk);
      if (dist < bestDist) { bestDist = dist; best = k; tie = false; }
      else if (dist === bestDist) tie = true;
    }
    const maxDist = Math.min(2, Math.floor(n.length / 6) + 1);
    if (best && !tie && bestDist <= maxDist) key = best;
  }

  return key ? { name: key, specs: corrections[key] } : null;
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
      cartridge: "type (MM/MC), output voltage (mV), dynamic compliance (µm/mN; state 10Hz or 100Hz), weight (g), internal impedance (Ω), tracking force (g), recommended loading (Ω), channel separation (dB)",
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
    const verifiedNames = [];   // components whose specs came from the reported DB (not AI)
    const verifiedAs = {};      // typed name -> DB row name, only when they differ
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    components.forEach((c, i) => {
      const corrected = findCorrection(c.name, corrections);
      if (corrected) {
        correctedBlocks.push(formatCorrectedSpecs(c.name, typeLabels[c.type] || c.type, corrected.specs));
        verifiedNames.push(c.name);
        if (norm(corrected.name) !== norm(c.name)) verifiedAs[c.name] = corrected.name;
      } else {
        needsAI.push({ index: i, component: c });
      }
    });

    let aiText = "";
    let _diag = null;
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
        model: "claude-sonnet-5-5",
        max_tokens: 1500,
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
        }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d)); });
        req.on("error", reject);
        req.write(body);
        req.end();
      });

      const parsed = JSON.parse(raw);
      if (parsed.error) throw new Error(parsed.error.message);
      if (parsed.stop_reason === "refusal") throw new Error("The AI declined to look up these components. Please try again.");
      aiText = (parsed.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      _diag = { stop_reason: parsed.stop_reason, usage: parsed.usage, chars: aiText.length };
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
      body: JSON.stringify({ text: (dbBanner + correctedSection + aiText).trim(), verified: verifiedNames, verifiedAs, _diag })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
