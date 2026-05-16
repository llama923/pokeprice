// tcgdb.js — Pokémon TCG Database lookup via pokemon-tcg.io (free, no key needed)

const TCGDB = (() => {
  const BASE = 'https://api.pokemontcg.io/v2';

  // Search for all versions of a card by name
  async function searchCard(name) {
    const cleanName = name
      .replace(/\s*(full art|secret rare|holo|reverse holo|rainbow rare|alternate art)\s*/gi, '')
      .replace(/\s*\(\d+\s*HP\)/gi, '')
      .trim();

    const params = new URLSearchParams({
      q: `name:"${cleanName}"`,
      orderBy: 'set.releaseDate',
      pageSize: '50',
      select: 'id,name,number,set,images,rarity,supertype,subtypes'
    });

    const response = await fetch(`${BASE}/cards?${params}`);
    if (!response.ok) throw new Error(`TCG DB error ${response.status}`);
    const data = await response.json();
    return data.data || [];
  }

  // Search with a hint string for more specific results
  async function searchWithHint(name, hint) {
    try {
      if (hint && hint !== name) {
        const hintWords = hint.replace(name, '').trim().split(' ').filter(w => w.length > 2);
        if (hintWords.length) {
          const results = await searchCard(name);
          const filtered = results.filter(card => {
            const setName = (card.set?.name || '').toLowerCase();
            return hintWords.some(w => setName.includes(w.toLowerCase()));
          });
          if (filtered.length) return filtered;
        }
      }
      return await searchCard(name);
    } catch {
      return await searchCard(name);
    }
  }

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
