// tcgdb.js — Pokémon TCG Database lookup via pokemon-tcg.io (free, no key needed)

const TCGDB = (() => {
  const BASE = 'https://api.pokemontcg.io/v2';

  // Search by exact name — tries both capitalizations (EX vs ex, GX vs gx, etc.)
  async function searchCard(name) {
    const cleanName = name.trim();
    if (!cleanName) return [];

    // Build alternate capitalizations to try
    const variants = new Set([
      cleanName,
      cleanName.replace(/ EX$/i, ' EX'),   // ensure uppercase EX
      cleanName.replace(/ EX$/i, ' ex'),    // ensure lowercase ex
      cleanName.replace(/ GX$/i, ' GX'),
      cleanName.replace(/ GX$/i, ' gx'),
      cleanName.replace(/ V$/i, ' V'),
      cleanName.replace(/ VMAX$/i, ' VMAX'),
    ]);

    // Try each variant, collect all results, deduplicate by id
    const seen = new Set();
    const allResults = [];

    for (const variant of variants) {
      try {
        const params = new URLSearchParams({
          q: `name:"${variant}"`,
          pageSize: '50',
          select: 'id,name,number,set,images,rarity,supertype,subtypes'
        });
        const r = await fetch(`${BASE}/cards?${params}`);
        if (!r.ok) continue;
        const d = await r.json();
        for (const card of (d.data || [])) {
          if (!seen.has(card.id)) {
            seen.add(card.id);
            allResults.push(card);
          }
        }
        // If we got results on first try, no need to try other variants
        if (allResults.length > 0) break;
      } catch { continue; }
    }

    // Sort: oldest sets first so vintage cards appear before modern reprints
    // This matches what Gemini is identifying (XY era cards show before S&V)
    allResults.sort((a, b) => {
      const dateA = a.set?.releaseDate || '';
      const dateB = b.set?.releaseDate || '';
      return dateA.localeCompare(dateB);
    });

    return allResults;
  }

  // Search using Gemini's search hint
  async function searchWithHint(name, hint) {
    try {
      // If hint contains extra info (set name etc), try searching with it first
      if (hint && hint.trim() !== name.trim()) {
        const hintResults = await searchCard(hint);
        if (hintResults.length) return hintResults;
      }
      return await searchCard(name);
    } catch {
      return await searchCard(name);
    }
  }

  // Format card for display
  function formatCard(card) {
    return {
      id: card.id,
      name: card.name,
      number: card.number,
      setName: card.set?.name || '',
      setId: card.set?.id || '',
      rarity: card.rarity || '',
      image: card.images?.small || '',
      imageLarge: card.images?.large || '',
      label: `${card.set?.name || ''} ${card.number || ''}`,
    };
  }

  return { searchCard, searchWithHint, formatCard };
})();
