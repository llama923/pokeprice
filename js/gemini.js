// gemini.js — Gemini Vision: identify card names + positions only

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const GENERATION_CONFIG = {
    temperature: 0.0,
    topP: 1,
    topK: 1,
    maxOutputTokens: 8192,
  };

  const PROMPT = `You are a Pokémon TCG card detector. Look at this image and identify every Pokémon card visible.

For each card return:
1. The card name as it appears on TCGPlayer (e.g. "Scizor EX", "M Manectric EX", "Charizard VMAX")
2. The art style to help narrow down which version it is (e.g. "Full Art", "Secret Rare", "Holo", "Reverse Holo", "Rainbow Rare")
3. Its approximate position in the image as fractions 0-1 (x, y = top-left corner, width, height)

Return ONLY a valid JSON array, no markdown, no backticks:
[
  {
    "name": "Scizor EX",
    "art_style": "Full Art",
    "search_hint": "Scizor EX Full Art BREAKpoint",
    "x": 0.0,
    "y": 0.0,
    "width": 0.33,
    "height": 0.5
  }
]

Be precise about the name — "Charizard" and "Charizard VMAX" are different cards.
For art_style, note if it is: Full Art, Secret Rare, Holo, Reverse Holo, Rainbow Rare, Standard, 1st Edition, Shadowless.
search_hint should be the best search string to find this exact card on TCGPlayer.`;

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

  return { identifyCards };
})();
