// gemini.js — Gemini Vision API for Pokémon card identification

const Gemini = (() => {
  const MODEL = 'gemini-2.0-flash-001';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const PROMPT = `You are an expert Pokémon Trading Card Game identifier with encyclopedic knowledge of every Pokémon TCG set ever released.

Carefully examine this image of Pokémon cards and identify EVERY visible card.

For each card, return:
1. The EXACT full card name (including HP and stage if visible, e.g. "Charizard VMAX", "Pikachu V", "Blastoise GX", "Trainer — Professor's Research")
2. The set name and card number if visible (e.g. "Darkness Ablaze 020/189")
3. A confidence score: high / medium / low

Return ONLY a valid JSON array. No explanation, no markdown, no backticks. Example format:
[
  {"name": "Charizard VMAX", "set": "Darkness Ablaze 020/189", "confidence": "high"},
  {"name": "Pikachu V", "set": "Vivid Voltage 043/185", "confidence": "high"},
  {"name": "Professor's Research", "set": "", "confidence": "medium"}
]

If no cards are visible, return an empty array: []
If a card is partially visible, still include it with confidence "low".
Be precise — "Charizard" and "Charizard VMAX" are different cards.`;

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
