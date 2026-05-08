// gemini.js — Gemini Vision API for Pokémon card identification

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const PROMPT = `You are a Pokémon TCG Forensic Scanner. Your goal is to identify cards for TCGplayer with 100% data integrity.

### MANDATORY INSPECTION STEPS:
1. IDENTIFY THE NAME & SET SYMBOL.
2. DETECT "DUAL TYPE" (XY Era): Look at the name bar and the frame. Is it a solid color, or is it split into two colors (e.g., half red, half blue)?
   - IF SPLIT/DUAL TYPE: This is a Secret Rare (e.g., Volcanion 115/114).
   - IF SOLID COLOR: This is a standard Full Art (e.g., Volcanion 107/114).
3. DETECT "GOLD BORDER" (All Eras):
   - Is the outermost border gold? If YES, XXX must be > YYY (Secret Rare).
4. READ THE NUMBER STRING:
   - Zoom into the bottom left/right. Transcribe the digits EXACTLY as they appear. If the number is blurry, use the "Dual Type" or "Border" audit to decide.

### ERA-SPECIFIC RULES:
- VINTAGE: Check for "1st Edition" stamp and "Shadowless" art box (no drop shadow).
- MODERN (Scarlet & Violet): Grey/Silver borders = Standard. Gold borders = Hyper Rare.
- PROMO: If the number starts with a letter (XY, SM, SWSH, SVP), it is a Promo, not a set card.

### OUTPUT JSON FORMAT (Strict):
Return ONLY a valid JSON array, no markdown, no backticks:
[
  {
    "name": "Official TCGplayer Name",
    "set": "Full Expansion Name and collector number (e.g., Steam Siege 115/114)",
    "rarity_variant": "Regular / Full Art / Secret Rare / Hyper Rare / Promo",
    "dual_type_detected": "true/false",
    "border_color": "Silver/Gold/Yellow",
    "tcgplayer_search": "Name Set Number",
    "internal_audit": "Explain the physical proof (e.g., Solid red name bar confirms 107/114, not the dual-type 115/114)",
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
