// Parser coverage + regression check for netlify/functions/_lib/parse-specs.js
// (the compatibility checker's spec parsers). Runs every parser over every
// component_specs row in its categories, prints how many rows each field parses
// for, and diffs the output against scripts/parser-baseline.json so a parser edit
// shows exactly which rows' numbers changed. Review every change it lists.
//
//   node scripts/parser-check.js           coverage + diff against the baseline
//   node scripts/parser-check.js --save    same, then overwrite the baseline
//
// Exits 1 when a row present in both runs parses differently (rows added to or
// removed from the DB are listed but don't fail the check). Save a new baseline
// once the changes are reviewed, and after loading new rows.
//
// Database access, either:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=...                    (Data API, like build-trends.js)
//   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=...        (Management API)

const fs = require("fs");
const path = require("path");
const { PARSERS, CATEGORIES } = require("../netlify/functions/_lib/parse-specs");

const BASELINE = path.join(__dirname, "parser-baseline.json");
const PAGE = 1000; // Data API max rows per request

async function fetchRows() {
  const cats = [...new Set(Object.values(CATEGORIES).flat())];
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const url = `${SUPABASE_URL}/rest/v1/component_specs?select=name,category,specs&category=in.(${cats.join(",")})&order=name`;
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Range: `${from}-${from + PAGE - 1}` }
      });
      if (!res.ok) throw new Error(`Data API ${res.status}: ${await res.text()}`);
      const page = await res.json();
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }
  if (SUPABASE_ACCESS_TOKEN && SUPABASE_PROJECT_REF) {
    const query = `select name, category, specs from component_specs where category in (${cats.map(c => `'${c}'`).join(",")}) order by name`;
    const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error("Set SUPABASE_URL + SUPABASE_ANON_KEY, or SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF");
}

// { kind: { name: values-or-null } }
function parseAll(rows) {
  const out = {};
  for (const [kind, parse] of Object.entries(PARSERS)) {
    out[kind] = {};
    for (const r of rows) if (CATEGORIES[kind].includes(r.category)) out[kind][r.name] = parse(r.specs);
  }
  return out;
}

// A field counts as parsed when it has a value; an empty list (e.g. no gains found) doesn't.
const has = x => x != null && !(Array.isArray(x) && !x.length);

function pct(n, total) {
  return total ? `${Math.round((100 * n) / total)}%` : "-";
}

function printCoverage(results) {
  console.log("Coverage (rows where the field parses / rows in the kind's categories)");
  for (const [kind, byName] of Object.entries(results)) {
    const values = Object.values(byName);
    const fields = new Set();
    values.forEach(v => v && Object.keys(v).forEach(f => fields.add(f)));
    const any = values.filter(v => v && Object.values(v).some(has)).length;
    const parts = [...fields].map(f => {
      const n = values.filter(v => v && has(v[f])).length;
      return `${f} ${n} (${pct(n, values.length)})`;
    });
    console.log(`  ${kind.padEnd(9)} ${String(values.length).padStart(4)} rows · any ${any} (${pct(any, values.length)}) · ${parts.join(" · ")}`);
  }
}

function diff(base, now) {
  let changed = 0;
  for (const kind of Object.keys(now)) {
    const b = base[kind] || {};
    const n = now[kind];
    const lines = [];
    const added = Object.keys(n).filter(k => !(k in b));
    const removed = Object.keys(b).filter(k => !(k in n));
    for (const name of Object.keys(n)) {
      if (!(name in b)) continue;
      const before = JSON.stringify(b[name]);
      const after = JSON.stringify(n[name]);
      if (before !== after) lines.push(`    ${name}\n      was ${before}\n      now ${after}`);
    }
    changed += lines.length;
    if (lines.length || added.length || removed.length) {
      console.log(`\n${kind}: ${lines.length} changed, ${added.length} new rows, ${removed.length} gone`);
      lines.forEach(l => console.log(l));
      if (added.length) console.log(`  new: ${added.slice(0, 10).join(", ")}${added.length > 10 ? ` … +${added.length - 10}` : ""}`);
      if (removed.length) console.log(`  gone: ${removed.slice(0, 10).join(", ")}${removed.length > 10 ? ` … +${removed.length - 10}` : ""}`);
    }
  }
  return changed;
}

(async () => {
  const results = parseAll(await fetchRows());
  printCoverage(results);

  let changed = 0;
  if (fs.existsSync(BASELINE)) {
    changed = diff(JSON.parse(fs.readFileSync(BASELINE, "utf8")), results);
    console.log(changed ? `\n${changed} row(s) parse differently from the baseline. Review each one.` : "\nNo parsed values changed against the baseline.");
  } else {
    console.log("\nNo baseline yet; run with --save to create it.");
  }

  if (process.argv.includes("--save")) {
    fs.writeFileSync(BASELINE, JSON.stringify(results, null, 1) + "\n");
    console.log(`Baseline saved: ${path.relative(process.cwd(), BASELINE)}`);
  } else if (changed) {
    process.exitCode = 1;
  }
})().catch(e => { console.error(e.message); process.exit(2); });
