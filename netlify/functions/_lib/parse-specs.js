// Best-effort extraction of the numbers the compatibility checker needs from
// component_specs rows, whose keys and units are free text that varies by
// manufacturer. Every parser returns null for a field it is not sure about;
// the page shows blanks the user can fill in, so a miss is never a wrong answer.

const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";
const toNum = s => parseFloat(String(s).replace(/,/g, ""));
const OHM = "(?:Ω|ohms?|kilohms?|kohms?)";

// "47 kΩ" / "100 Ohm" / ">= 100 Ω" -> ohms
function ohms(str) {
  const m = new RegExp(NUM + "\\s*(k)?\\s*" + OHM, "i").exec(str || "");
  if (!m) return null;
  const kilo = m[2] || /kilo|kohm/i.test(m[0]);
  return toNum(m[1]) * (kilo ? 1000 : 1);
}

// "50–1050 Ω" / "100 Ohm - 1000 Ohm" / "150 Ω" -> {min, max} in ohms
function ohmRange(str) {
  const m = new RegExp(NUM + "\\s*(k)?\\s*(?:" + OHM + ")?\\s*(?:-|–|—|to)\\s*" + NUM + "\\s*(k)?\\s*" + OHM, "i").exec(str || "");
  if (m) {
    const a = toNum(m[1]) * (m[2] ? 1000 : 1);
    const b = toNum(m[3]) * (m[4] ? 1000 : 1);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const one = ohms(str);
  return one == null ? null : { min: one, max: one };
}

function entries(specs) {
  return Object.entries(specs || {}).map(([k, v]) => [String(k), String(v == null ? "" : v)]);
}

/* ─── Amplifier: watts per channel into 8 Ω and 4 Ω ──────────────── */
const AMP_KEY_OK = /power|watt|output/i;
const AMP_KEY_NO = /consumption|standby|supply|impedance|dynamic|ihf|\bpeak|headphone|mono|bridg|btl|pbtl|distortion|thd|imd|noise|channel sep|input|mode|type|voltage|current|level|sub|mw\b/i;

function ampPriority(k) {
  if (/rated|continuous|rms|nominal/i.test(k)) return 0;
  if (/^(amplifier\s*[—-]\s*)?(output power|power output)/i.test(k)) return 1;
  return 2;
}

function parseAmp(specs) {
  const out = { power8: null, power4: null };
  const rows = entries(specs)
    .filter(([k, v]) => AMP_KEY_OK.test(k) && !AMP_KEY_NO.test(k) && !/mW/.test(v))
    .sort((a, b) => ampPriority(a[0]) - ampPriority(b[0]));

  for (const [k, v] of rows) {
    const keyLoads = (k.match(new RegExp(NUM + "\\s*" + OHM, "gi")) || []).map(s => toNum(s));
    const hits = [];
    const re = new RegExp(NUM + "\\s*(?:W|watts?)\\b", "gi");
    let m;
    while ((m = re.exec(v))) hits.push({ watts: toNum(m[1]), end: re.lastIndex, start: m.index });
    hits.forEach((h, i) => {
      const tail = v.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : h.end + 40);
      const lm = new RegExp(NUM + "\\s*" + OHM, "i").exec(tail);
      const loads = lm ? [toNum(lm[1])] : keyLoads;
      loads.forEach(load => {
        if (load === 8 && out.power8 == null) out.power8 = h.watts;
        if (load === 4 && out.power4 == null) out.power4 = h.watts;
      });
    });
  }
  return out.power8 == null && out.power4 == null ? null : out;
}

/* ─── Speaker: sensitivity, impedance, recommended amp power ─────── */
function firstInRange(str, lo, hi) {
  const re = new RegExp(NUM, "g");
  let m;
  while ((m = re.exec(str))) {
    const n = toNum(m[1]);
    if (n >= lo && n <= hi) return n;
  }
  return null;
}

function parseSpeaker(specs) {
  const out = { sensitivity: null, nominal: null, minimum: null, recMin: null, recMax: null };
  for (const [k, v] of entries(specs)) {
    if (/sensitiv/i.test(k) && !/input/i.test(k) && out.sensitivity == null) {
      out.sensitivity = firstInRange(v, 70, 110);
    }
    if (/impedance/i.test(k) && !/input|output|amp/i.test(k)) {
      const both = /nominal.*min|nominal\s*\|/i.test(k);
      if (both) {
        const parts = v.split(/[|/,;]/);
        if (out.nominal == null) out.nominal = firstInRange(parts[0] || "", 1, 16);
        if (out.minimum == null) out.minimum = firstInRange(parts[1] || "", 0.5, 16);
      } else if (/\bmin/i.test(k)) {
        if (out.minimum == null) out.minimum = firstInRange(v, 0.5, 16);
      } else if (out.nominal == null) {
        out.nominal = firstInRange(v, 1, 16);
        const mm = /min\.?(?:imum)?\s*:?\s*(\d+(?:\.\d+)?)/i.exec(v);
        if (mm && out.minimum == null) out.minimum = toNum(mm[1]);
      }
    }
    if (/(recommended|suitable).*(amp)|amp\.?\s*power|amplifier power/i.test(k) && !/output|type|class/i.test(k) && out.recMin == null) {
      const r = new RegExp(NUM + "\\s*(?:W|watts?)?\\s*(?:-|–|—|to)\\s*" + NUM).exec(v);
      if (r) { out.recMin = toNum(r[1]); out.recMax = toNum(r[2]); }
      else {
        const one = firstInRange(v, 1, 2000);
        if (one != null) out.recMin = one;
      }
    }
  }
  return Object.values(out).every(x => x == null) ? null : out;
}

/* ─── Cartridge: type, output (mV), internal Ω, recommended load Ω ── */
function parseCartridge(specs) {
  const out = { type: null, outputMv: null, internalOhms: null, loadOhms: null };
  for (const [k, v] of entries(specs)) {
    if (/^type$/i.test(k.trim()) && out.type == null) {
      out.type = /\b(MC|HOMC|LOMC)\b|moving coil/i.test(v) ? "MC" : /MM|MI|VM|moving magnet|moving iron/i.test(v) ? "MM" : null;
    }
    if (/output/i.test(k) && /volt|level|^output$/i.test(k.trim()) || /^output voltage/i.test(k)) {
      if (out.outputMv == null) {
        const m = new RegExp(NUM + "\\s*(m|µ|μ|u)?V", "i").exec(v);
        if (m) {
          const unit = (m[2] || "").toLowerCase();
          out.outputMv = unit === "m" ? toNum(m[1]) : unit ? toNum(m[1]) / 1000 : toNum(m[1]) * 1000;
        }
      }
    }
    if (/load|loading/i.test(k) && !/capacit/i.test(k) && out.loadOhms == null) out.loadOhms = ohms(v);
    else if (/impedance|resistance/i.test(k) && !/load|capacit/i.test(k) && out.internalOhms == null) out.internalOhms = ohms(v);
  }
  return Object.values(out).every(x => x == null) ? null : out;
}

/* ─── Phono stage: gains (dB), MC support, input loads ───────────── */
function dbList(str) {
  const nums = [];
  const re = new RegExp(NUM + "\\s*d[bB]", "g");
  let m;
  while ((m = re.exec(str))) {
    const n = toNum(m[1]);
    if (n >= 20 && n <= 90) nums.push(n);
  }
  return nums;
}

function parsePhono(specs) {
  const rows = entries(specs);
  const text = rows.map(([k, v]) => k + " " + v).join(" ");
  const hasMC = /\bMC\b|moving coil/i.test(text);
  const out = { hasMC, mmGain: [], mcGain: [], mmLoad: null, mcLoadMin: null, mcLoadMax: null };
  let generic = [];

  for (const [k, v] of rows) {
    if (/gain/i.test(k) && !/setting|rca|line|aux/i.test(k)) {
      const nums = dbList(v);
      if (!nums.length) continue;
      if (/\bMC\b/i.test(k)) out.mcGain.push(...nums);
      else if (/\bMM\b/i.test(k)) out.mmGain.push(...nums);
      else generic.push(...nums);
    }
    if (/impedance|loading/i.test(k) && !/output|headphone|rca|line|aux|capacit|matched/i.test(k)) {
      const mmPart = new RegExp("MM\\W{0,3}" + NUM + "\\s*(k)?\\s*" + OHM, "i").exec(v);
      const mcIdx = v.search(/MC/i);
      const mcPart = mcIdx >= 0 ? ohmRange(v.slice(mcIdx)) : null;
      if (/\bMC\b/i.test(k)) { const r = ohmRange(v); if (r) { out.mcLoadMin = r.min; out.mcLoadMax = r.max; } }
      else if (/\bMM\b/i.test(k)) out.mmLoad = ohms(v);
      else if (mmPart || mcPart) {
        if (mmPart) out.mmLoad = toNum(mmPart[1]) * (mmPart[2] || /kilo|kohm/i.test(mmPart[0]) ? 1000 : 1);
        if (mcPart) { out.mcLoadMin = mcPart.min; out.mcLoadMax = mcPart.max; }
      } else if (/47\s*k/i.test(v)) out.mmLoad = 47000;
    }
  }
  const uniq = a => [...new Set(a)].sort((x, y) => x - y);
  if (!out.mmGain.length && generic.length) out.mmGain = generic;
  if (!out.mcGain.length && hasMC && generic.length) out.mcGain = generic;
  out.mmGain = uniq(out.mmGain);
  out.mcGain = uniq(out.mcGain);
  const empty = !out.mmGain.length && !out.mcGain.length && out.mmLoad == null && out.mcLoadMin == null;
  return empty && !hasMC ? null : out;
}

const PARSERS = { amp: parseAmp, speaker: parseSpeaker, cartridge: parseCartridge, phono: parsePhono };
const CATEGORIES = { amp: ["amplifier"], speaker: ["speaker"], cartridge: ["cartridge"], phono: ["phono-stage"] };

module.exports = { parseAmp, parseSpeaker, parseCartridge, parsePhono, PARSERS, CATEGORIES };
