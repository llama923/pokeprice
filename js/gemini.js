// gemini.js — Gemini Vision API for Pokémon card identification

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const PROMPT = `You are a Pokémon TCG Forensic Scanner. Identify every card in this image for TCGPlayer with 100% accuracy.

ABSOLUTE RULES:
- Your PRIMARY identification method is VISUAL — match the artwork, card style, and layout to your knowledge of TCGPlayer cards. The collector number is a CONFIRMATION tool, not the primary identifier.
- NEVER invent a card that does not exist on TCGPlayer. If you cannot confidently match the visual to a real card, set confidence to "low" and describe what you see.
- NEVER let a blurry or uncertain number override a confident visual identification. If the number is unreadable, use the visual match alone.
- A low-confidence answer is always better than a wrong answer.

STEP 1 — VISUAL IDENTIFICATION (Primary)
Look at the card's artwork, character, card layout, and style. Match it to a specific card you know exists on TCGPlayer. Ask yourself:
- What Pokémon or Trainer is depicted, and what does the art look like?
- Is the art style Full Art (bleeds to edges), standard (art inside a frame), or scene-based (Alternate Art/Illustration Rare)?
- What era does the card style belong to (WOTC, EX-era, BW, XY, Sun & Moon, Sword & Shield, Scarlet & Violet)?
- Does the card have embossed texture (BW/XY Full Arts), rainbow gradient (Sun & Moon/SwSh Rainbow Rare), or glitter foil (S&V SIR/Hyper Rare)?

STEP 2 — READ THE BOTTOM OF THE CARD (Confirmation only)
Only after visually identifying the card, check the collector number and rarity symbol to confirm.
- If the number matches your visual ID, use it.
- If the number is blurry or seems wrong for what you visually identified, trust the visual ID and note "unreadable" for the number.
- Secret Rare: XXX > YYY (e.g., 115/114)
- Promo: number starts with letters (SVP, SWSH, XY, SM, BW)

Rarity symbols by era:
- Pre-Scarlet & Violet: ALL ultra rares (EX, GX, V, VMAX, VSTAR, Full Arts, Rainbow Rares, Alternate Arts) use a single white or black ★. Do NOT assume multiple stars on pre-S&V cards.
- Scarlet & Violet only: ★★ black = Double Rare, ★★ silver = Ultra Rare, ★ gold = Illustration Rare, ★★ gold = Special Illustration Rare, ★★★ gold = Hyper Rare

STEP 3 — ART STYLE CLASSIFICATION
- Standard/Holo Rare: Artwork inside a frame. Holo = shiny artwork only.
- Reverse Holo: Shiny background outside the art box, non-shiny art. Present from Legendary Collection onward.
- Full Art EX/GX/V (BW through SwSh): Artwork covers entire card, no inner frame, embossed fingerprint texture, character on solid/patterned background.
- Rainbow Rare (Sun & Moon through Sword & Shield only): Rainbow gradient wash over entire card. Does NOT exist in Scarlet & Violet.
- Alternate Art / Special Art (Sword & Shield): Full scene art, number exceeds set total, has texture.
- Illustration Rare (Scarlet & Violet): Full scene art, single gold star, numbered beyond set total.
- Special Illustration Rare (Scarlet & Violet): Full scene art of EX/Supporter, two gold stars, glitter foil texture.
- Hyper Rare (Scarlet & Violet): Entirely gold card, three gold stars.

STEP 4 — XY ERA SECRET RARE CHECK
In the XY era, Secret Rare EX cards have a dual-type color split in the name bar and frame (e.g., half blue/half red). Standard Full Art EX cards have a single solid color frame. If you see a split/dual color frame, the number MUST exceed the set total.

STEP 5 — VINTAGE ERA CHECK (WOTC era only, 1999–2003)
- 1st Edition: "EDITION 1" stamp below left side of artwork. Base Set through Neo Destiny only.
- Shadowless: No drop shadow on right side of art box. Base Set only.
- Unlimited: Drop shadow visible on right of art box.

OUTPUT — JSON array only, no markdown, no backticks:
[
  {
    "name": "Official TCGPlayer card name",
    "set": "Full set name and collector number (e.g., BREAKpoint 76/122)",
    "rarity_variant": "Holo Rare / Reverse Holo / Full Art / Rainbow Rare / Secret Rare / Alternate Art / Illustration Rare / Special Illustration Rare / Hyper Rare / 1st Edition / Shadowless / Promo",
    "number_read": "Exact digits read from card, or unreadable if blurry",
    "internal_audit": "Describe the visual evidence used to identify this card — artwork, style, era, texture, frame color",
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
