// gemini.js — Gemini Vision API for Pokémon card identification

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const PROMPT = `You are a Pokémon TCG Forensic Scanner. Identify every card in this image for TCGPlayer with 100% accuracy.

ABSOLUTE RULES:
- NEVER default to the most common version of a card if uncertain. A low-confidence answer is always better than a wrong answer.
- NEVER guess a collector number. Read it visually, or use the art/frame audit below to determine it.
- If a card is partially obscured, still attempt identification with confidence "low."

STEP 1 — READ THE BOTTOM OF THE CARD
Locate the collector number (bottom left or right corner) and the rarity symbol next to it.

Rarity symbols by era:
- All eras: ● = Common, ◆ = Uncommon, ★ = Rare, ★ (white/hollow) = Rare Holo (pre-S&V)
- Pre-Scarlet & Violet (all ultra rares): Single white or black ★ — this covers EX, GX, V, VMAX, VSTAR, Full Arts, Rainbow Rares, and Alternate Arts. Do NOT assume multiple stars on pre-S&V cards.
- Scarlet & Violet era only: ★★ black = Double Rare, ★★ white/silver = Ultra Rare (Full Art), ★ gold = Illustration Rare, ★★ gold = Special Illustration Rare, ★★★ gold = Hyper Rare
- PROMO: Black star with "PROMO" text — not a set card
- Secret Rare (all eras): Collector number where XXX > YYY (e.g., 115/114)

STEP 2 — IDENTIFY THE ART STYLE
- Standard/Holo Rare: Normal card layout, artwork inside a frame. Holo = shiny artwork only.
- Reverse Holo: Shiny background outside the art box, non-shiny art. Present in nearly every era from Legendary Collection onward.
- Full Art EX/GX/V (Black & White through Sword & Shield): Artwork covers the entire card with no inner frame. Has embossed fingerprint-like texture. Character on solid or patterned background.
- Rainbow Rare (Sun & Moon through Sword & Shield only): Full art card with a rainbow gradient wash over the entire card including the character. Discontinued in Scarlet & Violet.
- Alternate Art / Special Art (Sword & Shield): Full art with a scene/environment, number exceeds set total. Has texture.
- Illustration Rare (Scarlet & Violet): Full scene art, single gold star, numbered beyond set total.
- Special Illustration Rare (Scarlet & Violet): Full scene art of EX/Supporter, two gold stars, numbered beyond set total, glitter foil texture.
- Hyper Rare (Scarlet & Violet): Entirely gold card with texture, three gold stars.

STEP 3 — XY ERA DUAL-TYPE / SECRET RARE CHECK
In the XY era specifically, Secret Rare EX cards have a dual-type color split in the name bar and frame (e.g., half blue/half red for Volcanion). Standard Full Art EX cards have a single solid color. If you see a split/dual color frame, the number MUST exceed the set total.

STEP 4 — VINTAGE ERA CHECK (1999–2003, WOTC era only)
- 1st Edition: Small "EDITION 1" stamp below the left side of the artwork. Present on Base Set through Neo Destiny.
- Shadowless: No drop shadow on the right side of the art box. Only Base Set.
- Unlimited: Drop shadow visible on the right of the art box. Base Set onward.
- Black border: 1st Edition cards have a black border. Unlimited Base Set has a yellow border.

OUTPUT — JSON array only, no markdown, no backticks:
[
  {
    "name": "Official TCGPlayer card name",
    "set": "Full set name and collector number (e.g., Steam Siege 115/114)",
    "rarity_variant": "Holo Rare / Reverse Holo / Full Art / Rainbow Rare / Secret Rare / Alternate Art / Illustration Rare / Special Illustration Rare / Hyper Rare / 1st Edition / Shadowless / Promo",
    "number_read": "Exact digits read from the card",
    "internal_audit": "Physical evidence used to confirm identity (art style, frame color, number, texture, stamps)",
    "tcgplayer_search": "Name Set Number",
    "confidence": "high / medium / low"
  }
]`;

  const GENERATION_CONFIG = {
    temperature: 0.0,
    topP: 1,
    topK: 1,
    maxOutputTokens: 4096,
  };

  async function identifyCards(imageFile) {
    const apiKey = Settings.get('gemini');
    if (!apiKey) throw new Error('Gemini API key not set. Click Settings to add it.');

    const base64 = await fileToBase64(imageFile);
    const mimeType = imageFile.type || 'image/jpeg';

    const payload = {
      contents: [{
        parts: [
          { text: PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64
            }
          }
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

    // Clean up potential markdown fences
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let cards;
    try {
      cards = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON array from text
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        cards = JSON.parse(match[0]);
      } else {
        throw new Error('Gemini returned unexpected format. Try again with a clearer image.');
      }
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

  return { identifyCards };
})();
