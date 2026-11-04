const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { laadNevo, zoekNevo, normaliseer, opWoorden } = require('./nevo')

const app = express();
const PORT = 3000;

// Waar de gegevens staan: de map uit DATA_DIR, anders de map "data" in dit project
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

// Het NEVO-bestand met basisvoeding (CSV van het RIVM)
// Pakt het (laatste) CSV-bestand in de map "nevo", ongeacht de naam of versie
const NEVO_MAP = path.join(__dirname, 'nevo');
const nevoCsv = fs.existsSync(NEVO_MAP)
  ? fs.readdirSync(NEVO_MAP).filter(f => f.toLowerCase().endsWith('.csv')).sort().pop()
  : null;
const NEVO_BESTAND = process.env.NEVO_BESTAND || (nevoCsv ? path.join(NEVO_MAP, nevoCsv) : '');
laadNevo(NEVO_BESTAND);

function leesData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { eten: [], verbruik: [], gewicht: [] };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function schrijfData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Zet een waarde om naar een getal, of naar null als er niets (geldigs) is ingevuld
function getalOfNull(w) {
  if (w === '' || w == null) return null;
  const n = Number(w);
  return isNaN(n) ? null : n;
}



// Controleert de invoer van het formulier en maakt er een nette regel van.
// Geeft null terug als er iets ontbreekt of niet klopt.
function maakRegel(body) {
  const { datum, maaltijd, omschrijving, gram, kcal } = body;
  const k = Number(kcal);
  const tekst = String(omschrijving || '').trim();
  if (!datum || !tekst || kcal === '' || kcal == null || isNaN(k) || k < 0) {
    return null;
  }
  return {
    datum,
    maaltijd: maaltijd || 'Tussendoor',
    omschrijving: tekst,
    gram: gram ? Number(gram) : null,
    kcal: k,
    eiwit: getalOfNull(body.eiwit),
    kcal100: getalOfNull(body.kcal100),
    eiwit100: getalOfNull(body.eiwit100)
  };
}

app.use(express.json());
app.use(express.static('public'));

// Geeft het eten van één dag terug: /api/eten?datum=2026-11-04
app.get('/api/eten', (req, res) => {
  const data = leesData();
  const lijst = data.eten.filter(e => e.datum === req.query.datum);
  res.json(lijst);
});

// Voegt een etensregel toe
app.post('/api/eten', (req, res) => {
  const nieuw = maakRegel(req.body);
  if (!nieuw) {
    return res.status(400).json({ fout: 'Vul datum, omschrijving en calorieën in.' });
  }
  const regel = { id: crypto.randomUUID(), ...nieuw };
  const data = leesData();
  data.eten.push(regel);
  schrijfData(data);
  res.status(201).json(regel);
});

// Wijzigt een bestaande etensregel
app.put('/api/eten/:id', (req, res) => {
  const nieuw = maakRegel(req.body);
  if (!nieuw) {
    return res.status(400).json({ fout: 'Vul datum, omschrijving en calorieën in.' });
  }
  const data = leesData();
  const index = data.eten.findIndex(e => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ fout: 'Regel niet gevonden.' });
  }
  data.eten[index] = { id: req.params.id, ...nieuw };
  schrijfData(data);
  res.json(data.eten[index]);
});

// Verwijdert één etensregel
app.delete('/api/eten/:id', (req, res) => {
  const data = leesData();
  const aantalVoor = data.eten.length;
  data.eten = data.eten.filter(e => e.id !== req.params.id);
  if (data.eten.length === aantalVoor) {
    return res.status(404).json({ fout: 'Regel niet gevonden.' });
  }
  schrijfData(data);
  res.json({ ok: true });
});

// Basisvoeding uit NEVO: /api/zoek/basis?q=gebakken ei (staat lokaal, dus meteen klaar)
app.get('/api/zoek/basis', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  res.json(zoekNevo(q, 10).map(p => ({ ...p, bron: 'NEVO' })));
});

app.listen(PORT, () => {
  console.log('Caloriecoach draait op http://localhost:' + PORT);
  console.log('Gegevens in: ' + DATA_FILE);
});

// Merkproducten uit Open Food Facts: /api/zoek/merk?q=pindakaas
app.get('/api/zoek/merk', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.json([]);

  const url = 'https://search.openfoodfacts.org/search'
    + '?q=' + encodeURIComponent(q)
    + '&page_size=20'
    + '&fields=product_name,brands,nutriments';

  try {
    const antwoord = await fetch(url, {
      headers: { 'User-Agent': 'Caloriecoach/1.0 (persoonlijk project)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!antwoord.ok) throw new Error('Status ' + antwoord.status);
    const gegevens = await antwoord.json();
    const woorden = opWoorden(q);

    const resultaten = (gegevens.hits || [])
      .map(p => ({
        naam: p.product_name,
        merk: Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands || ''),
        kcal100: p.nutriments ? p.nutriments['energy-kcal_100g'] : undefined,
        eiwit100: p.nutriments ? p.nutriments['proteins_100g'] : undefined
      }))
      .filter(p => p.naam && typeof p.kcal100 === 'number')
      // Alle woorden die je typte moeten in naam of merk voorkomen
      .filter(p => {
        const tekst = normaliseer(p.naam + ' ' + p.merk);
        return woorden.every(w => tekst.includes(w));
      })
      .slice(0, 8)
      .map(p => ({
        ...p,
        kcal100: Math.round(p.kcal100),
        eiwit100: typeof p.eiwit100 === 'number' ? Math.round(p.eiwit100 * 10) / 10 : null,
        bron: 'Open Food Facts'
      }));

    res.json(resultaten);
  } catch (fout) {
    console.error('Zoeken mislukt:', fout.message);
    res.status(502).json({ fout: 'Merkproducten zoeken lukt nu niet.' });
  }
});