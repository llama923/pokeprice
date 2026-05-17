// gemini.js — Gemini Vision: identify cards only, no coordinate tracking

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const GENERATION_CONFIG = {
    temperature: 0.0,
    topP: 1,
    topK: 1,
    maxOutputTokens: 8192,
  };

  const PROMPT = `You are a Pokémon TCG Forensic Scanner. Identify every Pokémon card visible in this image for TCGPlayer.

ABSOLUTE RULES:
- Identify each card primarily by its VISUAL APPEARANCE — artwork, card style, layout, era, and any visible text or stamps.
- The collector number is a secondary confirmation. If blurry or unreadable, rely on visual ID alone.
- NEVER invent a card. If you are not confident, set confidence to "low" — do not guess.
- NEVER default to the most common version of a card. Each card must be identified by what is actually visible.
- Do your best even if cards are in plastic sleeves, binder pages, at an angle, or have glare. Identify what you can see.
- If a card is partially visible or obscured by glare, still attempt identification with confidence "low".

STEP 0 — DETECT LANGUAGE:
- Look at the card text. Is it in English, Japanese, Korean, Chinese, or another language?
- If NON-ENGLISH: set "language" to the detected language (e.g. "Japanese", "Korean") and find the correct non-English TCGPlayer listing for that card.
- Japanese cards on TCGPlayer use Japanese set names (e.g. "SV: Space-Time Smackdown") and have different card numbers.
- If ENGLISH: set "language" to "English".

FOR EACH CARD, follow these steps:

1. VISUAL ID: What Pokémon or Trainer is shown? Describe the artwork style and card layout.

2. ERA + ART STYLE:
- Standard/Holo: art inside a frame, shiny art = Holo
- Reverse Holo: shiny background, non-shiny art (all eras from Legendary Collection onward)
- Full Art EX/GX/V (BW through SwSh): art bleeds to edges, embossed fingerprint texture, solid/patterned background
- Rainbow Rare (Sun & Moon through Sword & Shield ONLY): rainbow gradient over entire card including character
- Alternate Art (SwSh): full scene art, number exceeds set total
- Illustration Rare (S&V): full scene, 1 gold star
- Special Illustration Rare (S&V): full scene EX/Supporter, 2 gold stars, glitter foil
- Hyper Rare (S&V): entirely gold card, 3 gold stars

3. XY SECRET RARE CHECK: In the XY era, Secret Rare EX cards have a DUAL-TYPE split color in the name bar and frame (e.g. half blue/half red). Standard Full Art EX cards have ONE solid color. Dual color = number exceeds set total.

4. RARITY SYMBOLS:
- Pre-Scarlet & Violet: ALL ultra rares use a single white or black star (EX, GX, V, VMAX, Full Arts, Rainbow Rares, Alternate Arts). Never assume multiple stars on pre-S&V cards.
- Scarlet & Violet only: 2 black stars = Double Rare, 2 silver = Ultra Rare, 1 gold = IR, 2 gold = SIR, 3 gold = Hyper Rare

5. VINTAGE (1999-2003 WOTC only):
- 1st Edition stamp = small oval stamp below left of artwork. Present on Base Set, Jungle, Fossil, Team Rocket, Gym Heroes, Gym Challenge, Neo Genesis, Neo Discovery, Neo Revelation, Neo Destiny.
- Shadowless = no drop shadow on right side of art box. Base Set only. Very thin card border.
- Unlimited = drop shadow visible on right of art box.
- For vintage cards WITHOUT EX/GX/V suffix: identify by the Pokémon name + set (e.g. "Charizard" Base Set, "Blastoise" Base Set 2, "Mewtwo" Neo Genesis). These are just as valid as modern cards.
- Vintage holos have a starfield or diagonal pattern in the artwork area.

6. NUMBER: Read the collector number from the bottom of the card. If unreadable, use visual ID to determine it.

If a card is a card back or completely unidentifiable even after careful examination, skip it entirely.

Return ONLY a valid JSON array, no markdown, no backticks, no explanation:
[
  {
    "name": "Official TCGPlayer card name",
    "art_style": "Full Art / Secret Rare / Holo Rare / Reverse Holo / Rainbow Rare / Alternate Art / Illustration Rare / Special Illustration Rare / Hyper Rare / 1st Edition / Shadowless / Standard",
    "language": "English / Japanese / Korean / Chinese / Other",
    "search_hint": "Best search string to find this exact card on TCGPlayer (name + set name, use Japanese set name if Japanese card)",
    "confidence": "high / medium / low"
  }
]`;

  async function identifyCards(imageFile, onProgress) {
    const apiKey = Settings.get('gemini');
    if (!apiKey) throw new Error('Gemini API key not set. Click Settings to add it.');

    const base64 = await fileToBase64(imageFile);
    const mimeType = imageFile.type || 'image/jpeg';

    if (onProgress) onProgress('Identifying cards in image...');

    const payload = {
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }],
      generationConfig: GENERATION_CONFIG
    };

    const response = await fetch(
      `${API_BASE}/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error ${response.status}: ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let cards;
    try {
      cards = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) cards = JSON.parse(match[0]);
      else throw new Error('Gemini returned unexpected format. Try again with a clearer image.');
    }

    return Array.isArray(cards) ? cards : [];
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }

  // Generate object URL for a file (for displaying photos)
  function getPhotoUrl(file) {
    return URL.createObjectURL(file);
  }

  return { identifyCards, getPhotoUrl };
})();
