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
- **Netlify Personal plan:** 10-second hard function timeout per call — never increase token limits without estimating generation time first (Sonnet ~70 tok/s, Haiku ~150 tok/s)
- **Three parallel functions** run on every analysis:
  - `analyze-specs` — Sonnet, 650 tokens — fetches component specs, checks `corrections.json` first
  - `analyze-chain` — Haiku, 700 tokens — analyzes each signal chain connection
  - `analyze-summary` — Sonnet, 600 tokens — scores, phono chain calc, recommendations
- `analyze-specs` runs first; its output (`specsText`) is passed to `analyze-chain` and `analyze-summary` so all three use the same confirmed spec values

### Hard limits — never change without timeout testing
| Function | Model | Max tokens | Est. time |
|---|---|---|---|
| analyze-specs | claude-sonnet-4-6 | 650 | ~9s |
| analyze-chain | claude-haiku-4-5-20251001 | 700 | ~5s |
| analyze-summary | claude-sonnet-4-6 | 600 | ~9s |

### index.html rules
- **JS syntax verification is mandatory** before delivering any `index.html` edit. Use `node vm.Script` — the Python brace counter is unreliable when string literals contain `{` or `}`:
  ```
  node -e "const vm=require('vm'),fs=require('fs'),h=fs.readFileSync('index.html','utf8');try{new vm.Script(h.slice(h.lastIndexOf('<script>')+8,h.lastIndexOf('</script>')));console.log('OK');}catch(e){console.log('ERROR:',e.message);}"
  ```
- **All `<` and `>` in JS regex patterns** must use unicode escapes `\u003C` / `\u003E` — bare angle brackets inside `<script>` tags break the HTML parser silently
- **No bare `</` string literals** in JS — the HTML parser terminates the script block on any `</` sequence
- `index.html` has no test suite — Surgical Changes is especially critical here; one stray `}` can break the entire page

### corrections.json rules
- Lives at `netlify/functions/corrections.json` — co-located so functions can `require('./corrections.json')`
- **No JSON comments** — `//` and `/* */` are not valid JSON; `JSON.parse()` will throw and the corrections database silently fails to load
- Keys are component names exactly as users enter them (case-insensitive lookup is applied at runtime)
- Strip `// >>> CHANGED <<<` markers from Netlify form submissions before pasting into this file

### Signal chain diagram rules
- All `<` / `>` in SVG/HTML strings built in JS must use the `esc()` function or template literals — never raw angle brackets
- `boxH()` must account for variable-height turntable boxes (tonearm + cartridge sub-items) when calculating merge Y positions
- Topological sort uses level-based BFS — do not revert to DFS which breaks multi-source-to-hub layouts
