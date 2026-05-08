// gemini.js — Gemini Vision API for Pokémon card identification

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const PROMPT = `You are a master Pokémon TCG historian and appraiser. Your goal is to identify every card in the image for TCGPlayer listing purposes, regardless of era (Vintage, EX-era, Modern).

For each card, perform these precise checks:
1. Identify the Name, Set Symbol, and Collector Number.
2. ERA CHECK (Vintage 1999-2002):
   - Check for a "1st Edition" stamp (left side below art).
   - If Base Set (no symbol): Check for "Shadowless" (no drop shadow on the right of the art box) vs "Unlimited" (drop shadow present).
3. VARIANT CHECK:
   - "Holo": Only the artwork is shiny.
   - "Reverse Holo": The area around the art is shiny (note: EX-era reverse holos often have the set logo inside the art).
   - "Full Art / Ultra Rare": The artwork covers the entire card.
   - "Secret Rare": The first number is higher than the second (e.g., 115/114).

Return ONLY a valid JSON array, no markdown, no backticks. Each object must use exactly this schema:
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
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      }
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
