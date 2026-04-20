# AudioChain — Hi-Fi Compatibility Checker

A production-ready web application that analyzes the compatibility of hi-fi audio system components using Claude AI. Users add their components, define signal chain connections, and receive a detailed analysis covering impedance matching, gain staging, sensitivity, phono chain resonance, and actionable recommendations.

---

## How it works

1. User adds components (amplifier, speakers, DAC, turntable, cartridge, phono preamp, etc.)
2. User defines signal chain connections (XLR, RCA, AES/EBU, speaker wire, etc.)
3. The frontend sends the component list to a Netlify serverless function
4. The function calls the Anthropic API server-side (keeping your API key secure)
5. Claude looks up published specs and returns a structured compatibility analysis
6. Results display with score cards, section-by-section analysis, and recommendations

---

## Recommended deployment: Netlify

Netlify is the best choice for this project because:
- **Free tier** is generous enough for personal/small community use
- **Serverless functions** handle the Anthropic API proxy securely (API key never exposed to browsers)
- **One-command deploy** from GitHub
- **Automatic HTTPS**, CDN, and branch previews included
- No server to manage or pay for

### Deploy in 5 minutes

**Step 1 — Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/audiochecker.git
git push -u origin main
```

**Step 2 — Connect to Netlify**
1. Go to [netlify.com](https://netlify.com) and sign up (free)
2. Click **"Add new site"** → **"Import an existing project"**
3. Connect your GitHub account and select your `audiochecker` repository
4. Leave build settings as-is (Netlify detects `netlify.toml` automatically)
5. Click **"Deploy site"**

**Step 3 — Add your Anthropic API key**
1. In Netlify dashboard: **Site Settings** → **Environment Variables**
2. Click **"Add a variable"**
3. Key: `ANTHROPIC_API_KEY`
4. Value: your key from [console.anthropic.com](https://console.anthropic.com)
5. Click **Save**, then **Trigger deploy** → **Deploy site**

Your site is now live at `https://your-site-name.netlify.app`

**Optional — Custom domain**
In Netlify: **Domain Management** → **Add custom domain** → follow DNS instructions for your registrar.

---

## Project structure

```
audiochecker/
├── index.html                   # Full frontend (HTML + CSS + JS, self-contained)
├── netlify.toml                 # Netlify build & function configuration
├── package.json                 # Anthropic SDK dependency for functions
├── netlify/
│   └── functions/
│       └── analyze.js           # Serverless API proxy (keeps API key secure)
└── README.md
```

---

## Alternative deployment options

### Vercel (similar to Netlify)
1. Push to GitHub
2. Import at [vercel.com](https://vercel.com)
3. Rename `netlify/functions/analyze.js` → `api/analyze.js`
4. Update `netlify.toml` not needed — Vercel auto-detects `api/` folder
5. Add `ANTHROPIC_API_KEY` in Vercel project settings → Environment Variables
6. Change the fetch URL in `index.html` from `/.netlify/functions/analyze` to `/api/analyze`

### Cloudflare Pages + Workers
Slightly more setup but excellent performance and generous free tier.

### Self-hosted (VPS/Raspberry Pi)
For full control:
```bash
npm install
node server.js  # You'd need to add a simple Express server wrapping the function
```

---

## Customization

### Change the AI model
In `netlify/functions/analyze.js`, line with `model:`:
```js
model: "claude-opus-4-5",      // Best quality, slower
model: "claude-sonnet-4-6",    // Faster, still excellent
```

### Limit usage / add auth
To prevent abuse on a public deployment, consider:
- Adding [Netlify Identity](https://docs.netlify.com/security/secure-access-to-sites/identity/) for login gates
- Rate limiting via Netlify Edge Functions
- A simple password prompt (not secure but deters casual abuse)

### Styling
All CSS is in the `<style>` block of `index.html`. CSS custom properties at the top of the file control the color scheme:
```css
--amber: #c8933a;   /* Primary accent */
--bg:    #0b0a09;   /* Background */
```

---

## Cost estimate (Anthropic API)

Each analysis uses approximately 1,500–2,500 output tokens with claude-opus-4-5.
- ~$0.04–0.08 per analysis at current pricing
- For personal use (a few analyses/day): ~$1–3/month
- For a small community (50 analyses/day): ~$60–120/month

Consider claude-sonnet-4-6 for a ~5x cost reduction with minimal quality difference for most system analyses.

---

## License
MIT — use, modify, and share freely.
