// justtcg.js — JustTCG API, correctly implemented per official docs

const JustTCG = (() => {
  const BASE_URL = 'https://poke-price-proxy.c59374758.workers.dev/v1';

  // Condition full names as required by the API
  const CONDITION_LABEL = {
    'NM':  'Near Mint',
    'LP':  'Lightly Played',
    'MP':  'Moderately Played',
    'HP':  'Heavily Played',
    'DMG': 'Damaged'
  };

  // Map pokemon-tcg.io set names to JustTCG set IDs
  // JustTCG set IDs follow pattern: set-name-game (lowercased, spaces -> hyphens)
  // We can get exact set IDs from the /sets endpoint, but the search q param
  // works without a set filter — we match by number instead
  const SET_NAME_TO_JUSTTCG = {
    'XY':                   'xy-base-set-pokemon',
    'Flashfire':            'xy-flashfire-pokemon',
    'Furious Fists':        'xy-furious-fists-pokemon',
    'Phantom Forces':       'xy-phantom-forces-pokemon',
    'Primal Clash':         'xy-primal-clash-pokemon',
    'Roaring Skies':        'xy-roaring-skies-pokemon',
    'Ancient Origins':      'xy-ancient-origins-pokemon',
    'BREAKthrough':         'xy-breakthrough-pokemon',
    'BREAKpoint':           'xy-breakpoint-pokemon',
    'Fates Collide':        'xy-fates-collide-pokemon',
    'Steam Siege':          'xy-steam-siege-pokemon',
    'Evolutions':           'xy-evolutions-pokemon',
    'Sun & Moon':           'sm-base-set-pokemon',
    'Guardians Rising':     'sm-guardians-rising-pokemon',
    'Burning Shadows':      'sm-burning-shadows-pokemon',
    'Crimson Invasion':     'sm-crimson-invasion-pokemon',
    'Ultra Prism':          'sm-ultra-prism-pokemon',
    'Forbidden Light':      'sm-forbidden-light-pokemon',
    'Celestial Storm':      'sm-celestial-storm-pokemon',
    'Lost Thunder':         'sm-lost-thunder-pokemon',
    'Team Up':              'sm-team-up-pokemon',
    'Unbroken Bonds':       'sm-unbroken-bonds-pokemon',
    'Unified Minds':        'sm-unified-minds-pokemon',
    'Cosmic Eclipse':       'sm-cosmic-eclipse-pokemon',
    'Sword & Shield':       'swsh01-sword-shield-base-set-pokemon',
    'Rebel Clash':          'swsh02-rebel-clash-pokemon',
    'Darkness Ablaze':      'swsh03-darkness-ablaze-pokemon',
    'Vivid Voltage':        'swsh04-vivid-voltage-pokemon',
    'Battle Styles':        'swsh05-battle-styles-pokemon',
    'Chilling Reign':       'swsh06-chilling-reign-pokemon',
    'Evolving Skies':       'swsh07-evolving-skies-pokemon',
    'Fusion Strike':        'swsh08-fusion-strike-pokemon',
    'Brilliant Stars':      'swsh09-brilliant-stars-pokemon',
    'Astral Radiance':      'swsh10-astral-radiance-pokemon',
    'Lost Origin':          'swsh11-lost-origin-pokemon',
    'Silver Tempest':       'swsh12-silver-tempest-pokemon',
    'Crown Zenith':         'swsh-crown-zenith-pokemon',
    'Scarlet & Violet':     'sv01-scarlet-violet-base-set-pokemon',
    'Paldea Evolved':       'sv02-paldea-evolved-pokemon',
    'Obsidian Flames':      'sv03-obsidian-flames-pokemon',
    'Paradox Rift':         'sv04-paradox-rift-pokemon',
    'Temporal Forces':      'sv05-temporal-forces-pokemon',
    'Twilight Masquerade':  'sv06-twilight-masquerade-pokemon',
    'Stellar Crown':        'sv07-stellar-crown-pokemon',
    'Surging Sparks':       'sv08-surging-sparks-pokemon',
    'Journey Together':     'sv09-journey-together-pokemon',
    'Destined Rivals':      'sv10-destined-rivals-pokemon',
    'Base Set':             'base-set-pokemon',
    'Jungle':               'jungle-pokemon',
    'Fossil':               'fossil-pokemon',
    'Team Rocket':          'team-rocket-pokemon',
    'Gym Heroes':           'gym-heroes-pokemon',
    'Gym Challenge':        'gym-challenge-pokemon',
    'Neo Genesis':          'neo-genesis-pokemon',
    'Neo Discovery':        'neo-discovery-pokemon',
    'Neo Revelation':       'neo-revelation-pokemon',
    'Neo Destiny':          'neo-destiny-pokemon',
    'Hidden Fates':         'hidden-fates-pokemon',
    'Shining Fates':        'shining-fates-pokemon',
    'Dragon Majesty':       'dragon-majesty-pokemon',
    'Generations':          'generations-pokemon',
    'Celebrations':         'celebrations-pokemon',
  };

  function getSetId(setName) {
    if (!setName) return null;
    if (SET_NAME_TO_JUSTTCG[setName]) return SET_NAME_TO_JUSTTCG[setName];
    // Try case-insensitive
    const lower = setName.toLowerCase();
    for (const [key, val] of Object.entries(SET_NAME_TO_JUSTTCG)) {
      if (key.toLowerCase() === lower) return val;
    }
    return null;
  }

  async function getPrice(cardName, condition, setInfo = '', tcgplayerId = null) {
    const apiKey = Settings.get('justTCG');
    if (!apiKey) throw new Error('JustTCG API key not set.');

    const conditionLabel = CONDITION_LABEL[condition] || 'Near Mint';
    const cleanName = cardName.replace(/\s*\(\d+\s*HP\)/gi, '').trim();

    // Parse set name and number from setInfo e.g. "Furious Fists 108/111"
    const numberMatch = setInfo.match(/(\d+)(?:\/\d+)?$/);
    const cardNumber = numberMatch ? numberMatch[1].replace(/^0+/, '') : null;
    const setNameRaw = setInfo.replace(/\s*\d+\/?\d*$/, '').trim();
    const setId = getSetId(setNameRaw);

    // Build search params — match exact console test that worked
    const params = new URLSearchParams({
      q: cleanName,
      game: 'pokemon',
      limit: '5',
    });
    if (conditionLabel) params.set('conditions', conditionLabel);
    if (setId) params.set('set', setId);
    
    console.log('JustTCG search:', params.toString());

    let cards = await fetchCards(params, apiKey);

    // Fallback: search without set filter
    if (!cards.length && setId) {
      const fallback = new URLSearchParams({
        q: cleanName,
        game: 'pokemon',
        limit: '20',
        conditions: conditionLabel,
      });
      cards = await fetchCards(fallback, apiKey);
    }

    if (!cards.length) return { price: null, url: null, source: 'Not found' };

    // Pick best match by card number
    let card = cards[0];
    if (cardNumber) {
      const numMatch = cards.find(c => {
        const cNum = (c.number || '').replace(/^0+/, '').split('/')[0];
        return cNum === cardNumber;
      });
      if (numMatch) card = numMatch;
    }

    const price = extractPrice(card, conditionLabel);
    return {
      price,
      url: card.url || buildTCGPlayerUrl(cleanName),
      source: price ? 'TCGPlayer via JustTCG' : 'Not found',
      productName: card.name || cleanName
    };
  }

  async function fetchCards(params, apiKey) {
    try {
      const r = await fetch(`${BASE_URL}/cards?${params}`, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      if (!r.ok) return [];
      const d = await r.json();
      return d?.data || [];
    } catch { return []; }
  }

  // Search for picker — returns formatted card objects with images
  async function searchForPicker(query) {
    const apiKey = Settings.get('justTCG');
    if (!apiKey) return [];
    try {
      const params = new URLSearchParams({ q: query, game: 'pokemon', limit: '30' });
      const cards = await fetchCards(params, apiKey);

      // Filter out products, tins, bundles — only keep actual cards
      // Real cards have a valid number like "76/122" or "115/114"
      const realCards = cards.filter(card => {
        if (!card.number) return false;
        // Skip if number is N/A or doesn't contain a digit
        if (card.number === 'N/A' || !/\d/.test(card.number)) return false;
        // Skip obvious products/bundles by name keywords
        const nameLower = (card.name || '').toLowerCase();
        const skipKeywords = ['tin', 'collection', 'bundle', 'box', 'deck', 'blister', 'pack', 'promo'];
        if (skipKeywords.some(k => nameLower.includes(k))) return false;
        return true;
      });

      return realCards.map(card => ({
        id: card.id,
        name: card.name,
        number: card.number,
        setName: card.set_name || '',
        setId: card.set || '',
        rarity: card.rarity || '',
        tcgplayerId: card.tcgplayerId || null,
        image: card.tcgplayerId
          ? `https://product-images.tcgplayer.com/fit-in/284x284/${card.tcgplayerId}.jpg`
          : '',
        label: `${card.set_name || ''} ${card.number || ''}`,
        _raw: card
      }));
    } catch { return []; }
  }

  function extractPrice(card, conditionLabel) {
    const variants = card?.variants || [];
    if (!variants.length) return null;

    // Find variant matching our condition
    const matches = variants.filter(v => v.condition === conditionLabel);
    if (matches.length) {
      // Prefer Unlimited/Normal over 1st Edition (more common/standard)
      const preferred = matches.find(v =>
        v.printing && (
          v.printing.includes('Unlimited') ||
          v.printing === 'Normal' ||
          v.printing === 'Holofoil' ||
          v.printing === 'Reverse Holofoil'
        )
      ) || matches[0];
      return preferred.price ?? null;
    }

    // Fallback: first variant regardless of condition
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
      if (i < cards.length - 1) await new Promise(r => setTimeout(r, 250));
    }
    return results;
  }

  return { getPrice, getPriceBatch, searchForPicker };
})();
