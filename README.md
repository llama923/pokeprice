# PokePrice — Pokémon Card Collection Valuator

A fully browser-based app that uses **Gemini Vision AI** to identify Pokémon cards from photos, lets you assign conditions, and fetches **live TCGPlayer market prices** via the JustTCG API — then exports everything to **Google Sheets**.

---

## 🚀 Live App

Once deployed to GitHub Pages: `https://YOUR_USERNAME.github.io/pokeprice/`

---

## 📋 How It Works

1. **Upload photos** of your card collection (JPG/PNG/WEBP, multiple files)
2. **Gemini Vision** identifies every card name, set, and number automatically
3. **You set the condition** per card (NM / LP / MP / HP / DMG) using dropdowns
4. **JustTCG API** fetches the current TCGPlayer market price per card + condition
5. **Export** to a Google Sheet (one click) or download as CSV

---

## 🔑 API Keys You Need

All keys are stored only in your browser's `localStorage` — never hardcoded, never sent to any server except the respective API.

### 1. Gemini API Key (FREE)
- Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Create a new API key
- Free tier: 15 requests/minute, 1,500/day — more than enough

### 2. JustTCG API Key
- Sign up at [justtcg.com](https://justtcg.com)
- Navigate to your account/dashboard to get your API key
- Provides access to TCGPlayer market price data

### 3. Google OAuth Client ID (for Sheets export)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Google Sheets API"
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Name: `PokePrice` (or anything)
7. **Authorized JavaScript origins**: add your GitHub Pages URL:
   ```
   https://YOUR_USERNAME.github.io
   ```
   Also add `http://localhost:8080` for local testing
8. Click **Create** and copy the Client ID (looks like `xxxx.apps.googleusercontent.com`)

> ⚠️ You do NOT need a client secret — this app uses the OAuth implicit flow (browser-only).

### 4. Google Sheet ID
1. Create a new Google Sheet at [sheets.google.com](https://sheets.google.com)
2. The Sheet ID is the long string in the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
   ```
3. Make sure the sheet is accessible by your Google account (it will ask you to authorize on first export)

---

## 🛠 Setup & Deploy

### Option A: GitHub Pages (recommended)

1. **Fork or clone this repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/pokeprice.git
   cd pokeprice
   ```

2. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

3. **Enable GitHub Pages**
   - Go to your repo → Settings → Pages
   - Source: **Deploy from a branch** → `main` → `/ (root)`
   - Click Save
   - Your app will be live at `https://YOUR_USERNAME.github.io/pokeprice/` in ~1 minute

4. **Add your API keys**
   - Open the live app
   - Click **Settings** (top right)
   - Enter all four keys and click Save

### Option B: Local Development

Just open `index.html` in a browser — no build step, no Node.js required.

For the Google OAuth to work locally, use a local server:
```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .
```
Then open `http://localhost:8080`

---

## 📁 Project Structure

```
pokeprice/
├── index.html          # Main app
├── css/
│   └── style.css       # All styles
├── js/
│   ├── settings.js     # API key storage (localStorage)
│   ├── gemini.js       # Gemini Vision API integration
│   ├── justtcg.js      # JustTCG / TCGPlayer price API
│   ├── sheets.js       # Google Sheets OAuth + export
│   └── app.js          # Main controller
└── README.md
```

---

## 💡 Tips for Best Results

- **Photo quality matters**: Clear, well-lit photos with cards laid flat give Gemini the best chance to read card names accurately
- **Multiple cards per photo**: Gemini handles 10-20+ cards per image well; just make sure names are legible
- **Holo/foil cards**: Sometimes harder to identify — add them manually if needed using the "+ Add Card" button
- **Condition guide**:
  - **NM** — Near Mint: essentially perfect
  - **LP** — Lightly Played: minor edge/surface wear
  - **MP** — Moderately Played: visible wear, scratches
  - **HP** — Heavily Played: significant damage
  - **DMG** — Damaged: creases, tears, major flaws

---

## 🐛 Troubleshooting

**"Gemini API error 400"** — Check your Gemini API key in Settings

**"No cards identified"** — Try a clearer photo; make sure card names are in focus

**"JustTCG error 401"** — Check your JustTCG API key in Settings

**Price shows "Not found"** — The card name may not exactly match TCGPlayer. Click the row to edit the name and try specific variants (e.g. "Charizard VMAX" instead of "Charizard")

**Google Sheets export popup blocked** — Allow popups for your GitHub Pages URL (the OAuth consent screen needs to open)

**OAuth error: redirect_uri_mismatch** — Your GitHub Pages URL isn't in the authorized origins. Go back to Google Cloud Console → Credentials → your OAuth client → add the exact URL

---

## 📄 License

MIT — use freely, modify freely.
