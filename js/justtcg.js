// justtcg.js — JustTCG API for TCGPlayer market prices
// Docs: https://justtcg.com/docs

const JustTCG = (() => {
  const BASE_URL = 'https://poke-price-proxy.c59374758.workers.dev/v1';

  // JustTCG condition codes mapping
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

    const conditionCode = CONDITION_MAP[condition] || 'near_mint';

    // Build search query — include set info if available for accuracy
    const query = setInfo
      ? `${cardName} ${setInfo}`.trim()
      : cardName;

    // Step 1: Search for the card
    const searchParams = new URLSearchParams({
      q: query,
      game: 'pokemon',
      limit: '5'
    });

    const searchResponse = await fetch(`${BASE_URL}/products/search?${searchParams}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!searchResponse.ok) {
      const err = await searchResponse.json().catch(() => ({}));
      throw new Error(`JustTCG search error ${searchResponse.status}: ${err?.message || searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    const products = searchData?.data || searchData?.results || searchData?.products || [];

    if (!products.length) {
      return { price: null, url: null, source: 'Not found', productId: null };
    }

    // Step 2: Pick best match (first result is usually most relevant)
    const product = products[0];
    const productId = product.id || product.productId;

    // Step 3: Fetch pricing for that specific product + condition
    const priceResponse = await fetch(`${BASE_URL}/products/${productId}/prices`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!priceResponse.ok) {
      // If price endpoint fails, try to use price from search result
      const fallbackPrice = extractPriceFromProduct(product, conditionCode);
      return {
        price: fallbackPrice,
        url: product.url || buildTCGPlayerUrl(cardName),
        source: 'TCGPlayer (via search)',
        productId
      };
    }

    const priceData = await priceResponse.json();
    const price = extractPrice(priceData, conditionCode);

    return {
      price,
      url: product.url || priceData.url || buildTCGPlayerUrl(cardName),
      source: 'TCGPlayer Market Price',
      productId,
      productName: product.name || cardName
    };
  }

  function extractPrice(priceData, conditionCode) {
    // JustTCG returns various price structures — handle multiple formats
    const prices = priceData?.data || priceData?.prices || priceData;

    if (!prices) return null;

    // Format 1: prices keyed by condition
    if (prices[conditionCode]) {
      return prices[conditionCode]?.market || prices[conditionCode]?.mid || prices[conditionCode];
    }

    // Format 2: array of price objects
    if (Array.isArray(prices)) {
      const match = prices.find(p =>
        p.condition === conditionCode ||
        p.condition?.toLowerCase().replace(' ', '_') === conditionCode
      );
      if (match) return match.market_price || match.marketPrice || match.price;
    }

    // Format 3: flat market price
    if (typeof prices.market_price === 'number') return prices.market_price;
    if (typeof prices.marketPrice === 'number') return prices.marketPrice;

    return null;
  }

  function extractPriceFromProduct(product, conditionCode) {
    // Try to get price from the search result product object directly
    if (product.prices?.[conditionCode]) {
      return product.prices[conditionCode]?.market || product.prices[conditionCode];
    }
    if (product.market_price) return product.market_price;
    if (product.price) return product.price;
    return null;
  }

  function buildTCGPlayerUrl(cardName) {
    const encoded = encodeURIComponent(cardName);
    return `https://www.tcgplayer.com/search/pokemon/product?q=${encoded}&view=grid`;
  }

  async function getPriceBatch(cards) {
    // Process with small delay between requests to respect rate limits
    const results = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      try {
        const result = await getPrice(card.name, card.condition, card.set || '');
        results.push({ ...card, ...result, error: null });
      } catch (err) {
        results.push({ ...card, price: null, url: null, source: 'Error', error: err.message });
      }
      // Small delay between requests
      if (i < cards.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    return results;
  }

  return { getPrice, getPriceBatch };
})();
