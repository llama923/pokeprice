// justtcg.js — JustTCG API for TCGPlayer market prices
// Docs: https://justtcg.com/docs
// Actual endpoint: GET /v1/cards?q=CARDNAME&game=pokemon

const JustTCG = (() => {
  const BASE_URL = 'https://poke-price-proxy.c59374758.workers.dev/v1';

  // Map our condition codes to JustTCG condition names
  const CONDITION_MAP = {
    'NM':  'near_mint',
    'LP':  'lightly_played',
    'MP':  'moderately_played',
    'HP':  'heavily_played',
    'DMG': 'damaged'
  };

  async function getPrice(cardName, condition, setInfo = '') {
    const apiKey = Settings.get('justTCG');
    if (!apiKey) throw new Error('JustTCG API key not set.');

    const conditionKey = CONDITION_MAP[condition] || 'near_mint';

    // Build search query
    const params = new URLSearchParams({
      q: cardName,
      game: 'pokemon',
      limit: '5'
    });

    // Add set filter if available
    if (setInfo) {
      // Extract just the set name (drop card number like "115/114")
      const setName = setInfo.replace(/\s*\d+\/\d+$/, '').trim();
      if (setName) params.set('set', setName);
    }

    const response = await fetch(`${BASE_URL}/cards?${params}`, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`JustTCG error ${response.status}: ${err?.message || response.statusText}`);
    }

    const data = await response.json();

    // Cards are in data.data array
    const cards = data?.data || data?.cards || data?.results || [];

    if (!cards.length) {
      return { price: null, url: null, source: 'Not found' };
    }

    // Pick the best matching card (first result)
    const card = cards[0];

    // Extract price for our condition from variants
    const price = extractPrice(card, conditionKey);
    const url = card.url || buildTCGPlayerUrl(cardName);

    return {
      price,
      url,
      source: price ? 'TCGPlayer via JustTCG' : 'Not found',
      productName: card.name || cardName
    };
  }

  function extractPrice(card, conditionKey) {
    // JustTCG structure: card.variants[] each has condition and prices
    const variants = card?.variants || card?.prices || [];

    if (Array.isArray(variants)) {
      // Find variant matching our condition
      const match = variants.find(v => {
        const c = (v.condition || v.name || '').toLowerCase().replace(/\s+/g, '_');
        return c === conditionKey || c.includes(conditionKey);
      });

      if (match) {
        return match.market_price ?? match.marketPrice ?? match.price ?? match.mid_price ?? null;
      }

      // Fallback: try first variant's price
      if (variants[0]) {
        return variants[0].market_price ?? variants[0].price ?? null;
      }
    }

    // Flat price fields on the card itself
    if (card?.market_price != null) return card.market_price;
    if (card?.price != null) return card.price;

    return null;
  }

  function buildTCGPlayerUrl(cardName) {
    return `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(cardName)}&view=grid`;
  }

  async function getPriceBatch(cards) {
    const results = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      try {
        const result = await getPrice(card.name, card.condition, card.set || '');
        results.push({ ...card, ...result, error: null });
      } catch (err) {
        results.push({ ...card, price: null, url: null, source: 'Error', error: err.message });
      }
      if (i < cards.length - 1) {
        await new Promise(r => setTimeout(r, 250));
      }
    }
    return results;
  }

  return { getPrice, getPriceBatch };
})();
