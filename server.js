const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Waar de gegevens staan: de map uit DATA_DIR, anders de map "data" in dit project
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

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
    kcal: k
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

app.listen(PORT, () => {
  console.log('Caloriecoach draait op http://localhost:' + PORT);
  console.log('Gegevens in: ' + DATA_FILE);
});