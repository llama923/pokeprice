// justtcg.js — JustTCG API using tcgplayerId for exact condition-based pricing

const JustTCG = (() => {
  const BASE_URL = 'https://poke-price-proxy.c59374758.workers.dev/v1';

  async function getPrice(cardName, condition, setInfo = '', tcgplayerId = null) {
    const apiKey = Settings.get('justTCG');
    if (!apiKey) throw new Error('JustTCG API key not set.');

    // If we have a tcgplayerId, use it for a direct exact lookup
    if (tcgplayerId) {
      return await getPriceById(tcgplayerId, condition, cardName);
    }

    // Fallback: search by name
    return await getPriceByName(cardName, condition, setInfo);
  }

  async function getPriceById(tcgplayerId, condition, cardName) {
    const apiKey = Settings.get('justTCG');

    const params = new URLSearchParams({
      tcgplayerId: String(tcgplayerId),
      game: 'pokemon',
      conditions: condition,
    });

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
    const cards = data?.data || [];

    if (!cards.length) {
      return { price: null, url: null, source: 'Not found' };
    }

    const card = cards[0];
    const price = extractPrice(card, condition);
    const url = card.url || buildTCGPlayerUrl(cardName);

    return {
      price,
      url,
      source: price ? 'TCGPlayer via JustTCG' : 'Not found',
      productName: card.name || cardName
    };
  }

  async function getPriceByName(cardName, condition, setInfo) {
    const apiKey = Settings.get('justTCG');

    // Clean HP info from name
    const cleanName = cardName.replace(/\s*\(\d+\s*HP\)/gi, '').trim();

    const params = new URLSearchParams({
      q: cleanName,
      game: 'pokemon',
      conditions: condition,
      limit: '5'
    });

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
    const cards = data?.data || [];

    if (!cards.length) {
      return { price: null, url: null, source: 'Not found' };
    }

    // Try to find best match by set info
    let card = cards[0];
    if (setInfo) {
      const numberMatch = setInfo.match(/(\d+)\//);
      const cardNumber = numberMatch ? numberMatch[1].replace(/^0+/, '') : null;
      const setName = setInfo.replace(/\s*\d+\/\d+$/, '').trim().toLowerCase();

      const betterMatch = cards.find(c => {
        const cSetName = (c.set_name || '').toLowerCase();
        const cNumber = (c.number || '').replace(/^0+/, '').split('/')[0];
        return (cardNumber && cNumber === cardNumber) ||
               cSetName.includes(setName) || setName.includes(cSetName);
      });
      if (betterMatch) card = betterMatch;
    }

    const price = extractPrice(card, condition);
    return {
      price,
      url: card.url || buildTCGPlayerUrl(cardName),
      source: price ? 'TCGPlayer via JustTCG' : 'Not found',
      productName: card.name || cardName
    };
  }

  function extractPrice(card, condition) {
    const variants = card?.variants || [];
    if (!variants.length) return null;

    const conditionLabel = {
      'NM':  'Near Mint',
      'LP':  'Lightly Played',
      'MP':  'Moderately Played',
      'HP':  'Heavily Played',
      'DMG': 'Damaged'
    }[condition] || 'Near Mint';

    const matches = variants.filter(v => v.condition === conditionLabel);

    if (matches.length) {
      const preferred = matches.find(v =>
        v.printing && (v.printing.includes('Unlimited') || v.printing.includes('Normal') || v.printing.includes('Regular'))
      ) || matches[0];
      return preferred.price ?? null;
    }

    // Fallback: first variant
    return variants[0]?.price ?? null;
  }

  function buildTCGPlayerUrl(cardName) {
    return `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(cardName)}&view=grid`;
  }

  async function getPriceBatch(cards) {
    const results = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      try {
        const result = await getPrice(
          card.name,
          card.condition,
          card.set || '',
          card.tcgplayerId || null
        );
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
