const https = require("https");

/* ─── Tonearm/cartridge resonance, computed in code ─────────────
 * Deterministic so every analysis of the same system reports the same
 * figure and grade. Reads the spec blocks produced by analyze-specs
 * ("**Name (Type)**" followed by "- key: value" lines).
 *   F = 159.15 / √(M × C)
 *   M = tonearm effective mass + cartridge weight + 1 g mounting hardware
 *   C = dynamic compliance at 10 Hz (µm/mN = 10⁻⁶ cm/dyne); figures quoted
 *       at 100 Hz are multiplied by 1.7 to estimate the 10 Hz value.
 */
function parseSpecBlocks(specsText) {
  const blocks = [];
  let cur = null;
  for (const raw of String(specsText || "").split("\n")) {
    const line = raw.trim();
    const head = line.match(/^\*\*(.+)\s\(([^()]+)\)\*\*$/);
    if (head) { cur = { name: head[1].trim(), type: head[2].trim().toLowerCase(), specs: [] }; blocks.push(cur); continue; }
    const kv = line.match(/^-\s*([^:]+):\s*(.+)$/);
    if (cur && kv) cur.specs.push([kv[1].trim(), kv[2].trim()]);
  }
  return blocks;
}

function firstNumber(v) {
  const m = String(v).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function findSpec(block, keyRe, skipRe) {
  if (!block) return null;
  const hit = block.specs.find(([k]) => keyRe.test(k) && !(skipRe && skipRe.test(k)));
  return hit ? { key: hit[0], value: hit[1] } : null;
}

function round1(x) { return Math.round(x * 10) / 10; }

function computeResonance(specsText) {
  const blocks = parseSpecBlocks(specsText);
  const cart = blocks.find(b => b.type === "cartridge");
  const arm  = blocks.find(b => b.type === "tonearm");
  const tt   = blocks.find(b => b.type === "turntable");
  const missing = [];

  // Tonearm effective mass: a separate tonearm component wins over the turntable's figure.
  const massSpec = findSpec(arm, /effective\s*mass/i) || findSpec(tt, /effective\s*mass/i);
  const armMass = massSpec ? firstNumber(massSpec.value) : null;
  if (!(armMass > 0)) missing.push("tonearm effective mass");

  // Cartridge weight (grams; ounces converted).
  let cartWeight = null, weightAssumed = false;
  const wSpec = findSpec(cart, /(^|\s|net\s*)(weight|mass)\b/i, /effective|tracking|supported|headshell/i);
  if (wSpec) {
    const n = firstNumber(wSpec.value);
    if (n != null) cartWeight = /\boz\b/i.test(wSpec.value) && !/\bg\b/i.test(wSpec.value) ? n * 28.35 : n;
  }
  if (!(cartWeight > 0 && cartWeight < 40)) { cartWeight = 6; weightAssumed = true; }

  // Dynamic compliance, normalised to 10 Hz.
  const cSpec = findSpec(cart, /dynamic\s*compliance/i) || findSpec(cart, /compliance/i, /static/i);
  let compliance = cSpec ? firstNumber(cSpec.value) : null;
  let converted = false;
  if (compliance > 0 && /100\s*hz/i.test(cSpec.key + " " + cSpec.value)) { compliance = round1(compliance * 1.7); converted = true; }
  if (!(compliance > 0)) missing.push("cartridge dynamic compliance");
  if (!cart) missing.unshift("cartridge");

  if (missing.length) {
    return { ok: false, line: `Not calculated (missing ${[...new Set(missing)].join(", ")} in the specs above)` };
  }

  const total = round1(armMass + cartWeight + 1);
  const hz = round1(159.15 / Math.sqrt(total * compliance));
  const grade = (hz >= 8 && hz <= 12) ? "Good (8–12 Hz)"
              : ((hz >= 7 && hz < 8) || (hz > 12 && hz <= 13)) ? "Borderline (within 1 Hz of 8–12 Hz)"
              : (hz < 8 ? "Poor (below 8 Hz: warp/footfall sensitivity)" : "Poor (above 12 Hz: can colour the bass)");
  const notes = [];
  if (weightAssumed) notes.push("cartridge weight not listed, 6 g assumed");
  if (converted) notes.push(`compliance quoted at 100 Hz: ${round1(compliance / 1.7)} × 1.7 = ${compliance} µm/mN at 10 Hz`);
  const line = `159/√((${armMass} g arm + ${round1(cartWeight)} g cartridge + 1 g screws) × ${compliance} µm/mN) = ${hz.toFixed(1)} Hz — ${grade}` +
               (notes.length ? ` [${notes.join("; ")}]` : "");
  return { ok: true, hz, grade, line };
}

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
    const resonance = hasPhono ? computeResonance(specsText) : null;

    const prompt = `Hi-fi compatibility expert. Use ONLY the exact specs below — never substitute values.

SPECS:
${specsText || componentList}

Connections: ${connectionList}

Work out every number before writing; the summary must use exactly the same values as the sections below it. When comparing figures, lower THD, IMD and noise are better and higher SNR is better. Check which way each figure points before calling a setting better, and if a setting you recommend is worse on a figure, say so as a trade-off.${hasPhono ? ` The phono resonance has already been calculated: copy the Resonance line below exactly and use only that figure and grade wherever resonance is mentioned.` : ""}

Output EXACTLY:

OVERALL SCORE: [X/10]
IMPEDANCE MATCH: [Good/Acceptable/Poor or N/A]
SENSITIVITY MATCH: [Good/Acceptable/Poor or N/A]

COMPATIBILITY SUMMARY
[2 sentences: verdict with key numbers]${hasPhono ? `

PHONO CHAIN
- Cartridge: [type, output voltage from specs]
- Resonance: ${resonance.line}
- Recommended gain: [dB]
- Recommended loading: [Ω]` : ""}

ISSUES & RECOMMENDATIONS
1. [recommendation with exact setting]
2. [recommendation]
3. [recommendation]

Keep each recommendation to 1–2 sentences with the exact setting and key figure.`;

    const body = JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
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
      }, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>resolve(d)); });
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    const parsed = JSON.parse(raw);
    if (parsed.error) throw new Error(parsed.error.message);
    if (parsed.stop_reason === "refusal") throw new Error("The AI declined to summarize this system. Please try again.");
    const text = (parsed.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    // truncated: thinking + text hit max_tokens, so the page can say the section was cut off
    return { statusCode: 200, headers, body: JSON.stringify({ text, truncated: parsed.stop_reason === "max_tokens" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

exports.computeResonance = computeResonance; // exported for local testing
