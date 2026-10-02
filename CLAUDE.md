# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## AudioChainHiFi Project Constraints

Project-specific rules that override or extend the principles above.

### Architecture
- **Function timeout:** Netlify's synchronous function limit is **60 seconds and is not configurable** (per Netlify docs, checked 2026-10-02). (`netlify.toml` has no timeout setting; the old per-function `timeout = 10` blocks did nothing and were removed.) The practical constraint is user wait time, not the platform limit: an analysis runs `analyze-specs`, then `analyze-chain` + `analyze-summary` in parallel, so total wait ≈ specs + the slower of chain/summary. Measured live 2026-10-02 on Sonnet 5.5: **~12 s** for an all-DB 6-component phono system (specs ~1 s, chain ~10 s, summary ~11 s); expect up to ~20–25 s when specs needs AI lookups (~8–9 s) and the chain is long (up to ~15 s). (Before the Sonnet 5.5 switch it was ~15–27 s.) Never increase token limits without estimating generation time first (Sonnet ~70 tok/s, Haiku ~150 tok/s).
- **Three functions** run on every analysis:
  - `analyze-specs` — Sonnet 5.5 at low effort, 1500 tokens, server-side fallback — fetches component specs from Supabase `component_specs` first, AI only for components not found
  - `analyze-chain` — Sonnet 5.5 at low effort, 1500 tokens, server-side fallback — analyzes each signal chain connection
  - `analyze-summary` — Sonnet 5.5 at low effort, 1500 tokens, server-side fallback — scores, phono chain calc. **Resonance is computed in code** (`computeResonance()` in `analyze-summary.js`: parses the specs blocks, total mass = arm + cartridge + 1 g, 100 Hz compliance ×1.7, grades Good 8–12 / Borderline within 1 Hz / Poor) and injected into the prompt for the model to copy — edit the formula there, not in the prompt, recommendations
- `analyze-specs` runs first; its output (`specsText`) is passed to `analyze-chain` and `analyze-summary` so all three use the same confirmed spec values
- **`compare`** — a separate, standalone function (NOT part of the analysis flow) powering the `/compare` page. Sonnet 5.5 at low effort, 1100 tokens, with server-side fallback (`fallbacks: "default"`); reads the same Supabase `component_specs` table as `analyze-specs` (shared `fetchSpecs`/`getCorrections`/`findCorrection`) and sets `verified:true` on a match so the UI can badge it. Switched from Haiku 4.5 on 2026-10-02 after a 20-component test against verified rows: same number of correct specs, ~40% fewer wrong ones, similar speed.

### Token limits and measured times — never change limits without re-timing
Times measured on production, 2026-10-02 (3 runs each). Platform limit is 60 s.
| Function | Model | Max tokens | Measured time |
|---|---|---|---|
| analyze-specs | claude-sonnet-5-5 (effort low) | 1500 | ~0.2–1.4 s all-DB; ~8–9 s when AI looks up 5 components |
| analyze-chain | claude-sonnet-5-5 (effort low) | 1500 | ~9–15 s with 4–5 connections (runs in parallel with analyze-summary); 700 truncated Sonnet output |
| analyze-summary | claude-sonnet-5-5 (effort low) | 1500 | ~9–12 s |
| compare | claude-sonnet-5-5 (effort low) | 1100 | ~8–9 s per component (measured live 2026-10-02) |

All four functions use Sonnet 5.5 (switched 2026-10-02). Sonnet 5.5 thinks by default and is wordier than Haiku/Sonnet 4.6: always set `output_config.effort`, read only `type: "text"` content blocks (never `content[0].text`), and re-check for truncation (`stop_reason: "max_tokens"`) after any prompt or limit change. The old 650/700-token caps truncated every test run.

### index.html rules
- **JS syntax verification is mandatory** before delivering any `index.html` edit. Use `node vm.Script` — the Python brace counter is unreliable when string literals contain `{` or `}`:
  ```
  node -e "const vm=require('vm'),fs=require('fs'),h=fs.readFileSync('index.html','utf8');try{new vm.Script(h.slice(h.lastIndexOf('<script>')+8,h.lastIndexOf('</script>')));console.log('OK');}catch(e){console.log('ERROR:',e.message);}"
  ```
- **All `<` and `>` in JS regex patterns** must use unicode escapes `\u003C` / `\u003E` — bare angle brackets inside `<script>` tags break the HTML parser silently
- **No bare `</` string literals** in JS — the HTML parser terminates the script block on any `</` sequence
- `index.html` has no test suite — Surgical Changes is especially critical here; one stray `}` can break the entire page

### Corrections database rules
- **Corrections live in the Supabase `component_specs` table** (migrated from a hardcoded inline object in PR #8). `analyze-specs.js` fetches them live at runtime via `fetchSpecs()`/`getCorrections()` — there is no longer a `corrections = {}` object in the file, and no `corrections.json`.
- To add or update a spec: upsert into `component_specs` — `insert into component_specs (name, specs) values ('<name>', '<json>'::jsonb) on conflict (name) do update set specs = excluded.specs;` — via the Supabase MCP `execute_sql` or the Supabase dashboard. No code deploy needed.
- `name` is the match key (UNIQUE, case-sensitive in the DB); `findCorrection()` applies case-insensitive + fuzzy matching at runtime.
- **New tables need explicit grants** (Supabase change, effective 2026-10-30): any new `public` table created after that date is unreachable via the Data API until granted. Grant only what the site uses in the same SQL that creates the table — e.g. `grant insert on public.<table> to anon;` for write-only tables like `spec_submissions`, `grant select` for read tables like `component_specs` — plus `grant select, insert, update, delete on public.<table> to service_role;`. An RLS policy is still required on top of the grant. Existing tables are unaffected.
- Two submission paths feed corrections: the **"Suggest a Spec Correction"** modal writes structured rows to the `spec_submissions` table (via the `submit-correction` function); the **"Edit Component Specs"** modal (analyzer only) emails the owner a ready-to-run `component_specs` upsert (the `db-upsert-sql` field).
  - The Suggest modal is SHARED verbatim between `index.html` (analyzer) and `compare.html` (per-card "Report Inaccuracy" opens it, prefilling the component name). Both post `{component_name, proposed_specs, submitter_email, notes, source_url}` to `submit-correction`. Keep the modal markup, IDs (`suggest-*`), and `openSuggestModal/closeSuggestModal/submitSuggestion` identical across both files when editing.
  - A submission needs a name plus EITHER typed `Key: Value` specs OR a `source_url` (spec-page URL) — specs are optional when a URL is given. `spec_submissions.source_url` (added 2026-07-18) stores it; it is captured for manual review, NOT auto-extracted.
  - The "Edit Component Specs" modal has two actions: **Re-analyze Only** (`applySpecCorrections(false)`, local re-run, no submission) and **Re-analyze & Submit Correction** (`applySpecCorrections(true)`, also emails the upsert).
  - **Submission provenance:** `openSuggestModal(prefillName, via)` stashes `via` in `_suggestVia`; `submitSuggestion` sends it as `submitted_via`, which `submit-correction.js` folds into `notes` (`… · Submitted via <via>`). Analyzer passes `'Analyzer'`; compare passes `'Compare — <category>'`.
  - **Display provenance (reported vs AI):** ONLY DB-sourced components are badged **✓ Reported**; unbadged = AI-generated (implied, explained by the legend/disclaimer — do not add an "AI-generated" badge). Compare uses `d.verified` (from `compare.js`) on the card + table (`.verified-badge`). Analyzer: `analyze-specs.js` returns a `verified` array of matched component names → client stores `window._verifiedNames` → `renderCompSpecs` badges each verified block (only blocks WITH a `(Type)` header, so notice/banner blocks stay unbadged).
  - **"Verified specs are for <DB name>" note:** when the typed name matched a *differently named* DB row (names differ after lowercasing and stripping non-alphanumerics, e.g. "Fosi V3" → "Fosi Audio V3"), the ✓ Reported badge gets a note naming the row. Compare: `compare.js` sets `verifiedName` → `.verified-note` on card + table. Analyzer: `analyze-specs.js` returns `verifiedAs` `{typedName: dbName}` → `window._verifiedAs` → `renderCompSpecs`. Exact matches get no note. Both `findCorrection` copies return `{name, specs}`.

### Signal chain diagram rules
- All `<` / `>` in SVG/HTML strings built in JS must use the `esc()` function or template literals — never raw angle brackets
- `boxH()` must account for variable-height turntable boxes (tonearm + cartridge sub-items) when calculating merge Y positions
- Topological sort uses level-based BFS — do not revert to DFS which breaks multi-source-to-hub layouts
