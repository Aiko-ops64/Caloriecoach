const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Waar de gegevens staan: de map uit DATA_DIR, anders de map "data" in dit project
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

// Leest alle gegevens. Bestaat het bestand nog niet, dan begint de app leeg.
function leesData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { eten: [], verbruik: [], gewicht: [] };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Schrijft alle gegevens naar het bestand (en maakt de map aan als die ontbreekt)
function schrijfData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.static('public'));

// TIJDELIJK, alleen om de opslag te testen. Verdwijnt in de volgende stap.
app.get('/api/test-opslaan', (req, res) => {
  const data = leesData();
  data.eten.push({ omschrijving: 'testregel', tijd: new Date().toISOString() });
  schrijfData(data);
  res.json(data);
});

app.listen(PORT, () => {
  console.log('Caloriecoach draait op http://localhost:' + PORT);
  console.log('Gegevens in: ' + DATA_FILE);
});