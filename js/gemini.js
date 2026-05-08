// gemini.js — Gemini Vision API for Pokémon card identification

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const PROMPT = `You are a highly precise Pokémon TCG Data Extraction API. Your goal is to identify cards for TCGplayer integration.

CRITICAL RULE: You must perform a multi-step visual audit for EVERY card before generating its data. Do not guess based on artwork alone.

STEP 1: VISUAL ANALYSIS
- Locate the card name and set symbol.
- Identify the Collector Number (bottom left/right).
- Audit for "Secret Rare" markers: Does the card have a gold border? Is it a "Rainbow/Hyper" rare? Is the first number higher than the second (e.g., 115/114)?
- Audit for "Full Art": Does the character artwork break the frame and cover the entire card?

STEP 2: DATA CROSS-REFERENCE
- If the card is Volcanion EX and you see a gold/dual-type border, it MUST be 115/114 (Steam Siege).
- If the card is M Manectric EX and has a gold border/Japanese text in the art, it MUST be 120/119 (Phantom Forces).
- Match the visual version (Full Art vs Regular) to the correct TCGplayer set list.

OUTPUT FORMAT:
Return a JSON array where each object strictly follows this schema.
Include your reasoning in the "internal_audit" field to ensure the numbers match the visuals.

[
  {
    "internal_audit": "Briefly describe the visual proof for the number (e.g., 'Gold border and dual-type confirmed, indicates Secret 115/114')",
    "name": "Exact TCGplayer Name",
    "set": "Full Set Name and collector number (e.g., Steam Siege 115/114)",
    "rarity_variant": "Regular / Full Art / Secret Rare",
    "tcgplayer_search": "Direct TCGplayer search string",
    "confidence": "high/medium/low"
  }
]`;

  const GENERATION_CONFIG = {
    temperature: 0.0,
    topP: 1,
    topK: 1,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
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
