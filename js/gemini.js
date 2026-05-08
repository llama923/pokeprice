// gemini.js — Gemini Vision API for Pokémon card identification

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const PROMPT = `You are a Pokémon TCG Forensic API. Identify every card in this image for TCGplayer.

### LOGIC GATE 1: BORDER IDENTIFICATION (The Era Key)
- YELLOW Border: Vintage (1999) through Sword & Shield (2022).
- SILVER/GREY Border: Scarlet & Violet (2023) to Present.
- GOLD Border: Indicates a Secret Rare/Hyper Rare in almost any era.

### LOGIC GATE 2: THE NUMBER & SYMBOL AUDIT
1. Locate the number (bottom left or right).
2. Format Check:
   - XXX/YYY: If XXX > YYY, label as [Secret Rare].
   - Letters in number: e.g., "SV045" (Promo) or "GG12" (Galarian Gallery).
3. Rarity Symbol Check:
   - 1 Gold Star = Illustration Rare.
   - 2 Gold Stars = Special Illustration Rare.
   - 3 Gold Stars = Hyper Rare.

### LOGIC GATE 3: ART STYLE CLASSIFICATION
- REVERSE HOLO: Shiny background, non-shiny character art.
- FULL ART: Art covers the whole card; character is usually on a solid/patterned color background.
- ILLUSTRATION RARE (Alt Art): Art covers the whole card; features a full scene/environment.

### OUTPUT SCHEMA (JSON)
Return ONLY a valid JSON array, no markdown, no backticks:
[
  {
    "name": "Name [Variant]",
    "set": "Full Expansion Name and collector number (e.g., Steam Siege 115/114)",
    "rarity_variant": "Regular / Reverse Holo / Full Art / Secret Rare / Illustration Rare / Hyper Rare",
    "era_check": "Yellow Border (Legacy) or Silver Border (Modern)",
    "internal_audit": "Why this number? (e.g., 'Full art texture seen, Silver border found')",
    "tcgplayer_search": "Name Set Number",
    "confidence": "high/medium/low"
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
