// gemini.js — Gemini Vision API: count cards, grid-crop, then identify each one

const Gemini = (() => {
  const MODEL = 'gemini-2.5-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const GENERATION_CONFIG = {
    temperature: 0.0,
    topP: 1,
    topK: 1,
    maxOutputTokens: 4096,
  };

  // ─── STEP 1: Count cards and detect layout ───
  const DETECT_PROMPT = `How many Pokémon cards are visible in this image? Describe the layout.

Return ONLY this JSON object, nothing else, no markdown:
{"count": 9, "layout": "grid", "cols": 3, "rows": 3}

Rules:
- layout must be one of: "grid", "row", "column", "single", "random"
- cols and rows only needed for "grid" layout
- For a single card: {"count": 1, "layout": "single"}
- For 4 cards in a 2x2 grid: {"count": 4, "layout": "grid", "cols": 2, "rows": 2}
- For 3 cards side by side: {"count": 3, "layout": "row"}`;

  // ─── STEP 2: Identify a single cropped card ───
  const IDENTIFY_PROMPT = `You are a Pokémon TCG Forensic Scanner. Identify the single card in this image for TCGPlayer with 100% accuracy.

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
- Pre-Scarlet & Violet: ALL ultra rares (EX, GX, V, VMAX, VSTAR, Full Arts, Rainbow Rares, Alternate Arts) use a single white or black star. Do NOT assume multiple stars on pre-S&V cards.
- Scarlet & Violet only: 2 black stars = Double Rare, 2 silver stars = Ultra Rare, 1 gold star = Illustration Rare, 2 gold stars = Special Illustration Rare, 3 gold stars = Hyper Rare

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

STEP 5 — VINTAGE ERA CHECK (WOTC era only, 1999-2003)
- 1st Edition: "EDITION 1" stamp below left side of artwork. Base Set through Neo Destiny only.
- Shadowless: No drop shadow on right side of art box. Base Set only.
- Unlimited: Drop shadow visible on right of art box.

Return ONLY a single JSON object, no array, no markdown, no backticks:
{
  "name": "Official TCGPlayer card name",
  "set": "Full set name and collector number (e.g., BREAKpoint 76/122)",
  "rarity_variant": "Holo Rare / Reverse Holo / Full Art / Rainbow Rare / Secret Rare / Alternate Art / Illustration Rare / Special Illustration Rare / Hyper Rare / 1st Edition / Shadowless / Promo",
  "number_read": "Exact digits read from card, or unreadable if blurry",
  "internal_audit": "Describe the visual evidence used to identify this card",
  "tcgplayer_search": "Name Set Number",
  "confidence": "high / medium / low"
}`;

  // ─── Call Gemini API ───
  async function callGemini(prompt, base64, mimeType) {
    const apiKey = Settings.get('gemini');
    if (!apiKey) throw new Error('Gemini API key not set. Click Settings to add it.');

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
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
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  }

  // ─── Generate crop boxes from layout info ───
  function generateBoxes(layout) {
    const count = layout.count || 1;
    const type = layout.layout || 'single';
    const pad = 0.01;

    if (type === 'single' || count === 1) {
      return [{ x: 0, y: 0, width: 1, height: 1 }];
    }

    if (type === 'grid' && layout.cols && layout.rows) {
      const cols = layout.cols;
      const rows = layout.rows;
      const boxes = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          boxes.push({
            x: c / cols + pad,
            y: r / rows + pad,
            width: 1 / cols - pad * 2,
            height: 1 / rows - pad * 2
          });
        }
      }
      return boxes;
    }

    if (type === 'row') {
      return Array.from({ length: count }, (_, i) => ({
        x: i / count + pad,
        y: pad,
        width: 1 / count - pad * 2,
        height: 1 - pad * 2
      }));
    }

    if (type === 'column') {
      return Array.from({ length: count }, (_, i) => ({
        x: pad,
        y: i / count + pad,
        width: 1 - pad * 2,
        height: 1 / count - pad * 2
      }));
    }

    // random/unknown: estimate a grid
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return generateBoxes({ count, layout: 'grid', cols, rows });
  }

  // ─── Crop a region from an image using canvas ───
  async function cropCard(imageFile, box) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(imageFile);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const x = Math.max(0, box.x) * img.width;
        const y = Math.max(0, box.y) * img.height;
        const w = Math.min(img.width - x, box.width * img.width);
        const h = Math.min(img.height - y, box.height * img.height);

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        URL.revokeObjectURL(url);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = () => reject(new Error('Failed to load image for cropping'));
      img.src = url;
    });
  }

  // ─── Convert file to base64 ───
  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }

  // ─── Main: count cards, crop each one, identify each one ───
  async function identifyCards(imageFile, onProgress) {
    const apiKey = Settings.get('gemini');
    if (!apiKey) throw new Error('Gemini API key not set. Click Settings to add it.');

    const base64Full = await fileToBase64(imageFile);
    const mimeType = imageFile.type || 'image/jpeg';

    // Step 1: Count cards and detect layout
    if (onProgress) onProgress('Counting cards in image...');
    let layout = { count: 1, layout: 'single' };
    try {
      const detectRaw = await callGemini(DETECT_PROMPT, base64Full, mimeType);
      if (onProgress) onProgress(`Layout response: ${detectRaw.substring(0, 80)}`);
      const parsed = JSON.parse(detectRaw);
      if (parsed && parsed.count) layout = parsed;
    } catch (err) {
      if (onProgress) onProgress(`Layout detection failed (${err.message}) — assuming single card`);
    }

    const boxes = generateBoxes(layout);
    if (onProgress) onProgress(`Detected ${layout.count || 1} card(s) — cropping and identifying each one...`);

    // Step 2: Crop and identify each card
    const cards = [];
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (onProgress) onProgress(`Identifying card ${i + 1} of ${boxes.length}...`);

      try {
        const croppedBase64 = await cropCard(imageFile, box);
        const identifyRaw = await callGemini(IDENTIFY_PROMPT, croppedBase64, 'image/jpeg');

        let card;
        try {
          card = JSON.parse(identifyRaw);
        } catch {
          const match = identifyRaw.match(/\{[\s\S]*?\}/);
          if (match) card = JSON.parse(match[0]);
        }

        if (card && card.name) {
          cards.push({
            name: card.name || '',
            set: card.set || '',
            rarity_variant: card.rarity_variant || '',
            tcgplayer_search: card.tcgplayer_search || '',
            confidence: card.confidence || 'medium',
            internal_audit: card.internal_audit || ''
          });
        } else {
          if (onProgress) onProgress(`Card ${i + 1}: could not parse response`);
        }
      } catch (err) {
        if (onProgress) onProgress(`Card ${i + 1} failed: ${err.message}`);
      }

      // Small delay between API calls to respect rate limits
      if (i < boxes.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return cards;
  }

  return { identifyCards };
})();
