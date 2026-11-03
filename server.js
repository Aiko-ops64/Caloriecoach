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

app.use(express.json());
app.use(express.static('public'));

// Geeft het eten van één dag terug: /api/eten?datum=2026-11-03
app.get('/api/eten', (req, res) => {
  const data = leesData();
  const lijst = data.eten.filter(e => e.datum === req.query.datum);
  res.json(lijst);
});

// Voegt een etensregel toe
app.post('/api/eten', (req, res) => {
  const { datum, maaltijd, omschrijving, gram, kcal } = req.body;
  const k = Number(kcal);
  if (!datum || !omschrijving || kcal === '' || kcal == null || isNaN(k) || k < 0) {
    return res.status(400).json({ fout: 'Vul datum, omschrijving en calorieën in.' });
  }
  const regel = {
    id: crypto.randomUUID(),
    datum,
    maaltijd: maaltijd || 'Tussendoor',
    omschrijving: String(omschrijving).trim(),
    gram: gram ? Number(gram) : null,
    kcal: k
  };
  const data = leesData();
  data.eten.push(regel);
  schrijfData(data);
  res.status(201).json(regel);
});

app.listen(PORT, () => {
  console.log('Caloriecoach draait op http://localhost:' + PORT);
  console.log('Gegevens in: ' + DATA_FILE);
});