#!/usr/bin/env node
// Regenerates trends/index.html from the trends_summary() function in Supabase
// (see scripts/trends.sql). Run monthly by .github/workflows/trends.yml.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/build-trends.js [YYYY-MM]
//
// With no month it reports the previous calendar month (UTC). For a local dry
// run without keys, pass TRENDS_JSON=<file> holding the function's output.

const fs = require("fs");
const path = require("path");

// Keep false until the page has a full month of clean data; while false the
// page carries noindex. Turning it on also means adding /trends/ to the sitemap
// and linking it from the site.
const PUBLISHED = false;

const PAGE = path.join(__dirname, "..", "trends", "index.html");

const CATEGORY_LABELS = {
  amp: "Amplifiers", amplifier: "Amplifiers", preamp: "Preamplifiers", speakers: "Speakers", speaker: "Speakers",
  dac: "DACs", turntable: "Turntables", tonearm: "Tonearms", cartridge: "Cartridges", phonopre: "Phono stages",
  "phono-stage": "Phono stages", streamer: "Streamers", cdplayer: "CD players", "cd-player": "CD players",
  cassettedeck: "Cassette decks", "cassette-deck": "Cassette decks", recorder: "Recorders",
  cables: "Cables", headphones: "Headphones", headphone: "Headphones", subwoofer: "Subwoofers",
  equalizer: "Equalizers", power: "Power", network: "Network", tuner: "Tuners", clock: "Clocks", other: "Other"
};
const PAIR_LABELS = {
  "amp-speakers": "Amplifier + speakers",
  "cartridge-turntable": "Cartridge + turntable",
  "cartridge-phonopre": "Cartridge + phono stage"
};

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const label = c => CATEGORY_LABELS[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : "Other");
const fmt = n => Number(n).toLocaleString("en-US");
const regionName = (() => {
  let dn = null;
  try { dn = new Intl.DisplayNames(["en"], { type: "region" }); } catch { /* old Node */ }
  return code => { try { return (dn && dn.of(code)) || code; } catch { return code; } };
})();

function monthRange(arg) {
  let y, m;
  if (arg) {
    const match = /^(\d{4})-(\d{2})$/.exec(arg);
    if (!match) throw new Error("Month must be YYYY-MM");
    y = +match[1]; m = +match[2] - 1;
  } else {
    const now = new Date();
    y = now.getUTCFullYear(); m = now.getUTCMonth() - 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 1));
  const name = from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from, to, name };
}

async function fetchSummary(from, to) {
  if (process.env.TRENDS_JSON) return JSON.parse(fs.readFileSync(process.env.TRENDS_JSON, "utf8"));
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY (or TRENDS_JSON)");
  const res = await fetch(`${url}/rest/v1/rpc/trends_summary`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_from: from.toISOString(), p_to: to.toISOString() })
  });
  if (!res.ok) throw new Error(`trends_summary failed: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

function table(head, rows) {
  const th = head.map(h => `<th${h.num ? ' class="num"' : ""}>${esc(h.t)}</th>`).join("");
  const tr = rows.map(r => "<tr>" + r.map((c, i) => `<td${head[i].num ? ' class="num"' : ""}>${c}</td>`).join("") + "</tr>").join("\n        ");
  return `    <table class="spec-table">\n      <thead><tr>${th}</tr></thead>\n      <tbody>\n        ${tr}\n      </tbody>\n    </table>`;
}

const empty = text => `    <p class="trend-empty">${text}</p>`;

function render(d, month) {
  const t = d.totals || {};
  const min = d.min_visits || 3;
  const out = [];

  out.push(`    <h2>${esc(month.name)} at a Glance</h2>`);
  out.push(`    <div class="stat-grid">
      <div class="stat"><div class="stat-num">${fmt(t.analyses || 0)}</div><div class="stat-label">system analyses</div></div>
      <div class="stat"><div class="stat-num">${fmt(t.checks || 0)}</div><div class="stat-label">compatibility checks</div></div>
      <div class="stat"><div class="stat-num">${fmt(t.comparisons || 0)}</div><div class="stat-label">component lookups in Compare</div></div>
      <div class="stat"><div class="stat-num">${fmt(t.visits || 0)}</div><div class="stat-label">separate visits</div></div>
    </div>`);

  out.push(`    <h2>What People Analyzed</h2>`);
  const cats = (d.categories || []).filter(c => c.visits > 0);
  if (cats.length && t.analyzer_visits) {
    out.push(`    <p>The share of analyzer visits that included each kind of component. Most systems include several, so the shares add up to more than 100%.</p>`);
    out.push(table([{ t: "Component type" }, { t: "Share of analyzer visits", num: true }],
      cats.map(c => [esc(label(c.category)), Math.round(100 * c.visits / t.analyzer_visits) + "%"])));
  } else {
    out.push(empty("No analyzer runs were logged this month."));
  }

  out.push(`    <h2>Most-Analyzed Components</h2>`);
  const top = d.top_components || [];
  if (top.length) {
    out.push(`    <p>Components matched to the specs database that came up in at least ${min} separate visits, up to five per type.</p>`);
    out.push(table([{ t: "Type" }, { t: "Component" }, { t: "Visits", num: true }],
      top.map(c => [esc(label(c.category)), esc(c.name), fmt(c.visits)])));
  } else {
    out.push(empty(`No database-matched component came up in ${min} or more separate visits this month.`));
  }

  out.push(`    <h2>Common Pairings</h2>`);
  const pairs = d.pairs || [];
  if (pairs.length) {
    out.push(`    <p>Pairs analyzed or checked together in at least ${min} separate visits.</p>`);
    out.push(table([{ t: "Pairing" }, { t: "Components" }, { t: "Visits", num: true }],
      pairs.slice(0, 15).map(p => [esc(PAIR_LABELS[p.kind] || p.kind), `${esc(p.a)} + ${esc(p.b)}`, fmt(p.visits)])));
  } else {
    out.push(empty(`No pairing came up in ${min} or more separate visits this month.`));
  }

  out.push(`    <h2>Where Visitors Came From</h2>`);
  const countries = d.countries || [];
  if (countries.length) {
    out.push(table([{ t: "Country" }, { t: "Visits", num: true }],
      countries.slice(0, 10).map(c => [esc(regionName(c.country)), fmt(c.visits)])));
    out.push(`    <p class="trend-note">Countries with fewer than ${min} visits are not listed.</p>`);
  } else {
    out.push(empty(`No country had ${min} or more visits this month.`));
  }

  out.push(`    <h2>New in the Specs Database</h2>`);
  const ns = d.new_specs || { count: 0, items: [] };
  if (ns.count) {
    const groups = {};
    for (const it of ns.items) (groups[label(it.category)] = groups[label(it.category)] || []).push(it.name);
    out.push(`    <p>${fmt(ns.count)} component${ns.count === 1 ? "" : "s"} added in ${esc(month.name)}. Their specs now come from the manufacturer rather than an AI estimate when you analyze or compare them.</p>`);
    out.push(table([{ t: "Type" }, { t: "Added" }],
      Object.keys(groups).sort().map(g => [esc(g), groups[g].map(esc).join(", ")])));
  } else {
    out.push(empty(`Nothing new was added to the specs database in ${esc(month.name)}.`));
  }

  return out.join("\n\n");
}

function replaceBetween(html, tag, content) {
  const re = new RegExp(`(<!-- ${tag} -->)[\\s\\S]*?(<!-- /${tag} -->)`);
  if (!re.test(html)) throw new Error(`Marker ${tag} missing from ${PAGE}`);
  return html.replace(re, `$1${content}$2`);
}

(async () => {
  const month = monthRange(process.argv[2]);
  const data = await fetchSummary(month.from, month.to);
  let html = fs.readFileSync(PAGE, "utf8");
  html = html.replace(/(<!-- TRENDS:START -->)[\s\S]*?(<!-- TRENDS:END -->)/, `$1\n${render(data, month)}\n$2`);
  html = replaceBetween(html, "TRENDS:UPDATED", `${esc(month.name)} data &middot; Updated ${new Date().toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`);
  html = replaceBetween(html, "TRENDS:ROBOTS", PUBLISHED ? "" : '<meta name="robots" content="noindex, follow">');
  fs.writeFileSync(PAGE, html);
  console.log(`Trends page regenerated for ${month.name}`);
})().catch(err => { console.error(err.message); process.exit(1); });
