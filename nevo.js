const fs = require('fs');
const path = require('path');

let producten = [];

// Kleine letters, zonder accenten (crème wordt creme)
function normaliseer(tekst) {
  return String(tekst || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Splitst een tekst in losse woorden
function opWoorden(tekst) {
  return normaliseer(tekst).split(/[^a-z0-9]+/).filter(Boolean);
}

// "1,8" wordt 1.8; leeg wordt null
function getal(w) {
  if (w === undefined || w === '') return null;
  const n = Number(String(w).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// Leest het NEVO-bestand (CSV met | tussen de kolommen) in het geheugen
function laadNevo(bestand) {
  producten = [];
  if (!fs.existsSync(bestand)) {
    console.log('NEVO-bestand niet gevonden: ' + bestand + ' (zoeken in basisvoeding staat uit)');
    return;
  }
  const tekst = fs.readFileSync(bestand, 'utf8').replace(/^\uFEFF/, '');
  const regels = tekst.split(/\r?\n/).filter(r => r.trim() !== '');
  const schoon = w => w.replace(/^"|"$/g, '').trim();

  // De kolommen zoeken we op naam, niet op volgorde
  const kop = regels[0].split('|').map(schoon);
  const kol = {
    naam: kop.findIndex(k => k.startsWith('Voedingsmiddelnaam')),
    synoniem: kop.findIndex(k => k === 'Synoniem'),
    kcal: kop.findIndex(k => k.startsWith('ENERCC')),
    eiwit: kop.findIndex(k => k === 'PROT (g)')
  };
  if (Object.values(kol).some(i => i === -1)) {
    console.error('NEVO-bestand: niet alle kolommen gevonden. Gevonden kolommen: ' + kop.slice(0, 15).join(' | '));
    return;
  }

  for (const regel of regels.slice(1)) {
    const v = regel.split('|').map(schoon);
    const naam = v[kol.naam];
    const kcal = getal(v[kol.kcal]);
    if (!naam || kcal === null) continue;
    const eiwit = getal(v[kol.eiwit]);
    const zoekbaar = naam + ' ' + (v[kol.synoniem] || '');
    producten.push({
      naam,
      kcal100: Math.round(kcal),
      eiwit100: eiwit === null ? null : Math.round(eiwit * 10) / 10,
      woorden: opWoorden(zoekbaar),
      zoektekst: normaliseer(zoekbaar)
    });
  }
  console.log('NEVO geladen uit ' + path.basename(bestand) + ': ' + producten.length + ' voedingsmiddelen');
}

// Zoekt voedingsmiddelen waarin ALLE woorden van de zoekvraag voorkomen
function zoekNevo(vraag, max) {
  const q = opWoorden(vraag);
  if (q.length === 0) return [];
  const treffers = [];
  for (const p of producten) {
    let score = 0;
    let alles = true;
    for (const w of q) {
            if (p.woorden.includes(w)) { score -= 10; continue; }                    // heel woord komt overeen
      if (p.woorden.some(d => d.startsWith(w))) continue;                      // een woord begint zo                      // een woord begint zo
      if (w.length >= 3 && p.zoektekst.includes(w)) { score += 30; continue; } // woord zit er ergens in
      alles = false;
      break;
    }
    if (!alles) continue;
    if (p.woorden[0] && p.woorden[0].startsWith(q[0])) score -= 5;
    score += p.naam.length / 100; // korte namen eerst
    treffers.push({ score, p });
  }
  treffers.sort((a, b) => a.score - b.score);
  return treffers.slice(0, max).map(t => ({
    naam: t.p.naam,
    merk: '',
    kcal100: t.p.kcal100,
    eiwit100: t.p.eiwit100
  }));
}

module.exports = { laadNevo, zoekNevo, normaliseer, opWoorden };