// tcgdb.js — Pokémon TCG Database lookup via pokemon-tcg.io (free, no key needed)

const TCGDB = (() => {
  const BASE = 'https://api.pokemontcg.io/v2';

  async function searchCard(name) {
    const cleanName = name.trim();
    if (!cleanName) return [];
    const params = new URLSearchParams({
      q: `name:"${cleanName}"`,
      orderBy: '-set.releaseDate',
      pageSize: '50',
      select: 'id,name,number,set,images,rarity,supertype,subtypes'
    });
    const response = await fetch(`${BASE}/cards?${params}`);
    if (!response.ok) throw new Error(`TCG DB error ${response.status}`);
    const data = await response.json();
    return data.data || [];
  }

  async function searchByHint(hint) {
    if (!hint?.trim()) return [];
    const words = hint.trim().split(/\s+/);
    const queries = [hint.trim(), words.slice(0,3).join(' '), words.slice(0,2).join(' ')];
    for (const q of queries) {
      try {
        const params = new URLSearchParams({
          q: `name:"${q}"`,
          orderBy: '-set.releaseDate',
          pageSize: '30',
          select: 'id,name,number,set,images,rarity,supertype,subtypes'
        });
        const r = await fetch(`${BASE}/cards?${params}`);
        if (!r.ok) continue;
        const d = await r.json();
        if (d.data?.length) return d.data;
      } catch { continue; }
    }
    return [];
  }

  async function searchWithHint(name, hint) {
    try {
      if (hint && hint !== name) {
        const results = await searchByHint(hint);
        if (results.length) return results;
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

  return { searchCard, searchByHint, searchWithHint, formatCard };
})();
