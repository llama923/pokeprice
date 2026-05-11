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

  const PROMPT = `You are a Pokémon TCG expert. Look at this image and identify every Pokémon card visible.

For each card return the name and a search hint to find the exact version on TCGPlayer.

Rules:
- Identify cards by their ARTWORK and VISUAL APPEARANCE first
- Be precise: "Charizard" and "Charizard VMAX" are completely different cards
- For EX cards: note if it is a standard EX, Full Art EX, or Secret Rare EX (dual-color frame)
- For vintage cards (1999-2003): note if 1st Edition or Shadowless
- search_hint should include the set name if you can identify it from the art style and era

Return ONLY a valid JSON array, no markdown, no backticks:
[
  {
    "name": "Scizor EX",
    "art_style": "Full Art",
    "search_hint": "Scizor EX"
  },
  {
    "name": "Volcanion EX",
    "art_style": "Secret Rare",
    "search_hint": "Volcanion EX Steam Siege"
  }
]

If a card is a card back or unidentifiable, skip it entirely.`;

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
