// gemini.js — Gemini Vision: identify cards with primary match + alternatives

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
1. Your best guess for the card name and art style
2. 2-3 alternative guesses in case your first guess is wrong (different versions, similar cards)
3. The card's approximate position in the image as fractions 0-1

Return ONLY a valid JSON array, no markdown, no backticks:
[
  {
    "name": "Scizor EX",
    "art_style": "Full Art",
    "search_hint": "Scizor EX Full Art BREAKpoint",
    "alternatives": [
      {"name": "Scizor EX", "search_hint": "Scizor EX BREAKpoint 76/122"},
      {"name": "Scizor EX", "search_hint": "Scizor EX Full Art 119/122"}
    ],
    "x": 0.0,
    "y": 0.0,
    "width": 0.33,
    "height": 0.5
  }
]

Rules:
- Be precise about names: "Charizard" and "Charizard VMAX" are different cards
- For art_style use: Full Art, Secret Rare, Holo, Reverse Holo, Rainbow Rare, Standard, 1st Edition, Shadowless
- search_hint should be the best TCGPlayer search string for that exact version
- alternatives should be other plausible versions of the same card or similar cards
- x, y, width, height are fractions of the full image (0 to 1)
- If a card is the back of a card or unidentifiable, still include it with name "Unknown Card"`;

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

  // Crop a card region from an image file, returns object URL
  async function cropCard(imageFile, box) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(imageFile);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const pad = 0.01;
        const x = Math.max(0, (box.x - pad)) * img.width;
        const y = Math.max(0, (box.y - pad)) * img.height;
        const w = Math.min(img.width - x, (box.width + pad * 2) * img.width);
        const h = Math.min(img.height - y, (box.height + pad * 2) * img.height);
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => reject(new Error('Failed to crop image'));
      img.src = url;
    });
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }

  return { identifyCards, cropCard };
})();
