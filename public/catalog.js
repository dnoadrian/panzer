// PANZER – gemeinsamer Katalog (Server UND Browser): Ränge, Belohnungen, Fähigkeiten, Items, Shop
(function (root) {
  'use strict';

  // ---------------- Ränge ----------------
  const RANK_TIERS = [
    { name: 'Bronze', col: '#d8955a', dark: '#8a5a2b', shape: 'shield', need: 100, cost: 0 },
    { name: 'Silber', col: '#d9dee6', dark: '#8a909a', shape: 'shield', need: 150, cost: 8 },
    { name: 'Gold', col: '#f7c843', dark: '#b08a1c', shape: 'star', need: 200, cost: 15 },
    { name: 'Platin', col: '#7fe0d6', dark: '#2f9a90', shape: 'hex', need: 260, cost: 22 },
    { name: 'Diamant', col: '#8ab8ff', dark: '#3f6fd0', shape: 'gem', need: 320, cost: 30 },
    { name: 'Elite', col: '#6f7596', dark: '#2b2f40', shape: 'elite', need: 450, cost: 38 },
    { name: 'Champion', col: '#ff8c4a', dark: '#c0402a', shape: 'wings', need: 600, cost: 46 },
    { name: 'Unreal', col: '#c49cff', dark: '#6a3fc0', shape: 'burst', need: 0, cost: 52 },
  ];
  const RANKS = [];
  let acc = 0;
  for (let t = 0; t < 5; t++) for (let d = 1; d <= 3; d++) {
    RANKS.push({ tier: t, div: d, name: `${RANK_TIERS[t].name} ${'I'.repeat(d)}`, start: acc, need: RANK_TIERS[t].need });
    acc += RANK_TIERS[t].need;
  }
  for (let t = 5; t < 8; t++) { RANKS.push({ tier: t, div: 0, name: RANK_TIERS[t].name, start: acc, need: RANK_TIERS[t].need }); acc += RANK_TIERS[t].need; }

  function rankInfo(rp) {
    rp = Math.max(0, rp | 0);
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) if (rp >= RANKS[i].start) idx = i;
    const r = RANKS[idx], last = idx === RANKS.length - 1;
    const rest = rp - r.start;
    return { idx, rank: r, tier: RANK_TIERS[r.tier], rest, need: r.need, pct: last ? 1 : rest / r.need, last };
  }
  // Rangstufe (Bronze/Silber/...) kann man nicht mehr verlieren
  function tierFloor(rp) {
    const r = rankInfo(rp).rank;
    return RANKS.find(x => x.tier === r.tier).start;
  }
  // Belohnung nach einer Runde (Server rechnet, Browser zeigt an)
  function matchRewards({ place, teams, kills, rp }) {
    const p = teams > 1 ? (place - 1) / (teams - 1) : 0;
    const placePts = place === 1 ? 70 : Math.round(52 * Math.pow(1 - p, 1.6));
    const tier = rankInfo(rp).rank.tier;
    let drp = placePts + kills * 8 - RANK_TIERS[tier].cost;
    const newRp = Math.max(tierFloor(rp), rp + drp);
    drp = newRp - rp;
    const coins = 15 + kills * 6 + (place === 1 ? 60 : place <= 3 ? 25 : place <= Math.ceil(teams / 2) ? 10 : 0);
    return { drp, newRp, coins };
  }

  // ---------------- Fähigkeiten (eine pro Rang) ----------------
  const ABILITIES = [
    { id: 'turbo', name: 'Turbo', type: 'aktiv', cd: 12, desc: '2,5 s lang 60 % schneller.' },
    { id: 'repair', name: 'Reparatur', type: 'aktiv', cd: 22, desc: 'Heilt 45 Leben über 2 Sekunden.' },
    { id: 'smoke', name: 'Nebelwand', type: 'aktiv', cd: 20, desc: 'Nebelwolke, in der dich niemand sieht (6 s).' },
    { id: 'mine', name: 'Mine', type: 'aktiv', cd: 12, desc: 'Legt eine versteckte Mine (45 Schaden).' },
    { id: 'sniper', name: 'Scharfschütze', type: 'passiv', cd: 0, desc: 'Kugeln fliegen 70 % weiter und schneller, du schießt etwas langsamer.' },
    { id: 'salvo', name: 'Salve', type: 'aktiv', cd: 10, desc: 'Feuert sofort 3 Schüsse hintereinander.' },
    { id: 'dome', name: 'Schutzkuppel', type: 'aktiv', cd: 24, desc: '3 s unverwundbar, du kannst weiter schießen.' },
    { id: 'radar', name: 'Radar', type: 'aktiv', cd: 20, desc: 'Zeigt 5 s alle Gegner in der Nähe auf der Karte.' },
    { id: 'blink', name: 'Blink', type: 'aktiv', cd: 9, desc: 'Springt ein Stück in Zielrichtung.' },
    { id: 'shotgun', name: 'Schrotflinte', type: 'aktiv', cd: 7, desc: '6 Schrotkugeln im Fächer, kurze Reichweite.' },
    { id: 'rocket', name: 'Rakete', type: 'aktiv', cd: 15, desc: 'Alle 15 s eine Rakete mit Explosion (60 + Flächenschaden).' },
    { id: 'magnet', name: 'Magnetkugeln', type: 'passiv', cd: 0, desc: 'Deine Kugeln lenken leicht auf Gegner zu.' },
    { id: 'invis', name: 'Unsichtbar', type: 'aktiv', cd: 26, desc: '4 s unsichtbar (bis du schießt).' },
    { id: 'ricochet', name: 'Abpraller', type: 'passiv', cd: 0, desc: 'Kugeln prallen einmal von Felsen und Mauern ab.' },
    { id: 'vampire', name: 'Lebensraub', type: 'passiv', cd: 0, desc: '35 % deines Schadens heilen dich.' },
    { id: 'artillery', name: 'Artillerie', type: 'aktiv', cd: 25, desc: 'Schlag auf die Mausposition nach 1,5 s (bis 80 Schaden).' },
    { id: 'emp', name: 'EMP', type: 'aktiv', cd: 22, desc: 'Gegner in der Nähe 3 s verlangsamt, ohne Fähigkeit, langsamer schießend.' },
    { id: 'wallhack', name: 'Wallhack + Aimbot', type: 'passiv', cd: 0, desc: 'Du siehst Gegner durch alles. Doppelte Gegner-Hitbox: was du triffst, trifft zu 100 %.' },
  ];
  ABILITIES.forEach((a, i) => { a.rank = i; });
  const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map(a => [a.id, a]));

  // ---------------- Items ----------------
  // rank: per Rang freigeschaltet · price: im Shop kaufbar · free: Standard
  const ITEMS = [
    // Lackierungen
    { id: 'rot', cat: 'skin', name: 'Klassik', color: '#e8594f', pat: 'plain', free: true },
    { id: 'blau', cat: 'skin', name: 'Ozean', color: '#4f86e8', pat: 'plain', free: true },
    { id: 'gruen', cat: 'skin', name: 'Wald', color: '#4fb85a', pat: 'plain', free: true },
    { id: 'orange', cat: 'skin', name: 'Kürbis', color: '#f2a03f', pat: 'dots', rank: 1 },
    { id: 'lila', cat: 'skin', name: 'Flieder', color: '#9b6be0', pat: 'stripes', rank: 2 },
    { id: 'tuerkis', cat: 'skin', name: 'Lagune', color: '#3bb8b0', pat: 'dots', rank: 3 },
    { id: 'grau', cat: 'skin', name: 'Stahl', color: '#8a8f98', pat: 'stripes', rank: 4 },
    { id: 'pink', cat: 'skin', name: 'Kaugummi', color: '#ec6fae', pat: 'dots', rank: 5 },
    { id: 'tarn', cat: 'skin', name: 'Tarnfleck', color: '#6f8a4a', pat: 'camo', rank: 6 },
    { id: 'wueste', cat: 'skin', name: 'Wüste', color: '#d6b26a', pat: 'camo', rank: 7 },
    { id: 'zebra', cat: 'skin', name: 'Zebra', color: '#f2f2f2', pat: 'zebra', rank: 9 },
    { id: 'gold', cat: 'skin', name: 'Gold', color: '#f0c03a', pat: 'shine', rank: 11 },
    { id: 'nacht', cat: 'skin', name: 'Nacht', color: '#3a3f58', pat: 'stars', rank: 13 },
    { id: 'lava', cat: 'skin', name: 'Lava', color: '#d9472b', pat: 'zigzag', rank: 15 },
    { id: 'tiger', cat: 'skin', name: 'Tiger', color: '#f28c28', pat: 'tiger', price: 800 },
    { id: 'galaxie', cat: 'skin', name: 'Galaxie', color: '#2b2560', pat: 'galaxy', price: 1200 },
    { id: 'zuckerstange', cat: 'skin', name: 'Zuckerstange', color: '#ffffff', pat: 'candy', price: 900 },
    { id: 'pixel', cat: 'skin', name: 'Pixel', color: '#5ac8fa', pat: 'pixel', price: 800 },
    { id: 'flammen', cat: 'skin', name: 'Flammen', color: '#3a3a44', pat: 'flames', price: 1000 },
    { id: 'regenbogen', cat: 'skin', name: 'Regenbogen', color: '#ffffff', pat: 'rainbow', price: 1500 },
    { id: 'chrom', cat: 'skin', name: 'Chrom', color: '#c8d0da', pat: 'chrome', price: 1100 },
    { id: 'schnee', cat: 'skin', name: 'Schneetarn', color: '#e9f1f7', pat: 'snowcamo', price: 800 },
    // Leuchtspuren
    { id: 'standard', cat: 'tracer', name: 'Standard', free: true },
    { id: 'feuer', cat: 'tracer', name: 'Feuer', price: 400 },
    { id: 'eis', cat: 'tracer', name: 'Eis', price: 400 },
    { id: 'regenbogen-spur', cat: 'tracer', name: 'Regenbogen', price: 600 },
    { id: 'herzen', cat: 'tracer', name: 'Herzen', price: 500 },
    { id: 'sterne', cat: 'tracer', name: 'Sterne', price: 500 },
    { id: 'blitz', cat: 'tracer', name: 'Blitz', price: 600 },
    { id: 'gift', cat: 'tracer', name: 'Gift', price: 400 },
    { id: 'goldspur', cat: 'tracer', name: 'Goldstaub', price: 700 },
    // Hüte & Spezial-Items
    { id: 'keiner', cat: 'hat', name: 'Kein Hut', free: true },
    { id: 'krone', cat: 'hat', name: 'Krone', price: 900 },
    { id: 'partyhut', cat: 'hat', name: 'Partyhut', price: 500 },
    { id: 'kappe', cat: 'hat', name: 'Kappe', price: 400 },
    { id: 'zylinder', cat: 'hat', name: 'Zylinder', price: 700 },
    { id: 'blume', cat: 'hat', name: 'Blume', price: 400 },
    { id: 'hoerner', cat: 'hat', name: 'Teufelshörner', price: 600 },
    { id: 'heiligenschein', cat: 'hat', name: 'Heiligenschein', price: 800 },
    { id: 'kochmuetze', cat: 'hat', name: 'Kochmütze', price: 500 },
    { id: 'wikinger', cat: 'hat', name: 'Wikingerhelm', price: 700 },
    { id: 'propeller', cat: 'hat', name: 'Propellermütze', price: 600 },
    { id: 'sombrero', cat: 'hat', name: 'Sombrero', price: 600 },
    // Kill-Finisher
    { id: 'standard-boom', cat: 'finisher', name: 'Standard', free: true },
    { id: 'feuerwerk', cat: 'finisher', name: 'Feuerwerk', price: 1000 },
    { id: 'geist', cat: 'finisher', name: 'Geist', price: 900 },
    { id: 'konfetti', cat: 'finisher', name: 'Konfetti', price: 800 },
    { id: 'gewitter', cat: 'finisher', name: 'Gewitter', price: 1100 },
    { id: 'papierball', cat: 'finisher', name: 'Zerknüllt', price: 1200 },
    { id: 'herzregen', cat: 'finisher', name: 'Herzregen', price: 900 },
    { id: 'sternschnuppe', cat: 'finisher', name: 'Sternschnuppe', price: 1000 },
  ];
  const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
  const CATS = { skin: 'Lackierung', tracer: 'Leuchtspur', hat: 'Spezial-Item', finisher: 'Kill-Finisher' };
  const DEFAULT_EQUIP = { skin: 'rot', tracer: 'standard', hat: 'keiner', finisher: 'standard-boom' };

  // ---------------- Shop: rotiert jeden Tag (UTC) ----------------
  const dayIndex = (t = Date.now()) => Math.floor(t / 86400000);
  function shopForDay(day) {
    let s = (day * 2654435761) >>> 0;
    const r = () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 5; i++) r();
    return ['tracer', 'skin', 'hat', 'finisher'].map(cat => {
      const pool = ITEMS.filter(i => i.cat === cat && i.price);
      return pool[Math.floor(r() * pool.length)].id;
    });
  }

  // Darf ein Spieler ein Item benutzen?
  function canUse(user, id, cheatAll) {
    const it = ITEM_BY_ID[id];
    if (!it) return false;
    if (it.free || cheatAll) return true;
    if (it.rank != null) return rankInfo(user.rp).idx >= it.rank;
    return (user.owned || []).includes(id);
  }
  function canUseAbility(user, id, cheatAll) {
    const a = ABILITY_BY_ID[id];
    return !!a && (cheatAll || rankInfo(user.rp).idx >= a.rank);
  }

  const api = { RANK_TIERS, RANKS, rankInfo, tierFloor, matchRewards, ABILITIES, ABILITY_BY_ID, ITEMS, ITEM_BY_ID, CATS, DEFAULT_EQUIP, dayIndex, shopForDay, canUse, canUseAbility };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CAT = api;
})(typeof window !== 'undefined' ? window : globalThis);
