// gemini.js — Gemini Vision API for Pokémon card identification

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const PROMPT = `You are a master Pokémon TCG historian and appraiser. Your goal is to identify every card in the image for TCGPlayer listing purposes, regardless of era (Vintage, EX-era, Modern).

Process (follow this order before outputting anything):
1. First, describe the card's physical appearance: color, border style, artwork, and any special textures.
2. Second, zoom into the bottom corners and identify the collector number digits. CRITICAL: Before finalizing the collector_number, check if the card has a gold border, rainbow texture, or unique finish — if so, it is likely a Secret Rare and the first number will be higher than the second (e.g., 115/114). Do NOT default to the standard set number; verify the specific digits visible on the card.
3. Third, use those visual details to look up the exact TCGPlayer metadata.
4. Only after this mental check, output the JSON.

For each card also check:
- ERA CHECK (Vintage 1999-2002): Check for a "1st Edition" stamp (left side below art). If Base Set (no symbol): Check for "Shadowless" (no drop shadow on right of art box) vs "Unlimited" (drop shadow present).
- VARIANT CHECK: "Holo" = only artwork is shiny. "Reverse Holo" = area around art is shiny. "Full Art / Ultra Rare" = artwork covers entire card. "Secret Rare" = first number higher than second.

Return ONLY a valid JSON array, no markdown, no backticks:
[
  {
    "name": "Exact Name + Variant (e.g., Charizard [Shadowless], Blastoise [1st Edition])",
    "set": "Full Official Set Name + collector number (e.g., Base Set 4/102, BREAKpoint 76/122)",
    "rarity_variant": "Holo / Reverse Holo / Non-Holo / 1st Edition / Shadowless / Secret Rare",
    "tcgplayer_search": "Direct search string for TCGPlayer",
    "confidence": "high / medium / low"
  }
]

Constraints:
- Be extremely specific about Shadowless vs Unlimited for Base Set cards.
- If the card has a 1st Edition stamp, it MUST be included in the name.
- If no cards are visible, return: []`;

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
