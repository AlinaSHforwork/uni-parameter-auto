require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const { Pool } = require('pg');
const path  = require('path');

const app = express();
const PORT = 3000;

const pool = new Pool({ connectionString: process.env.DB });

pool.query(`
  CREATE TABLE IF NOT EXISTS parameters (
    id SERIAL PRIMARY KEY,
    parameter VARCHAR(100) NOT NULL,
    choices TEXT[] NOT NULL DEFAULT '{}'
  )
`).then(() => console.log('DB ready'))
  .catch(err => console.error('DB error:', err.message));

app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  helpers: {
    length: (arr) => (Array.isArray(arr) ? arr : []).length,
  },
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function parseChoices(choices) {
  if (Array.isArray(choices)) return choices;
  if (typeof choices === 'string') {
    return choices.replace(/^\{|\}$/g, '').split(',').map(c => c.trim()).filter(Boolean);
  }
  return [];
}

function cartesian(params) {
  if (!params.length) return [];
  const lists = params
    .map(p => parseChoices(p.choices).map(c => ({ param: p.parameter, value: c })))
    .filter(l => l.length > 0);
  if (!lists.length) return [];
  return lists.reduce((acc, list) => {
    const out = [];
    acc.forEach(combo => list.forEach(item => out.push([...combo, item])));
    return out;
  }, [[]]);
}

app.get('/api/parameters', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM parameters ORDER BY id');
  res.json(rows);
});

app.get('/api/parameters/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM parameters WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.post('/api/parameters', async (req, res) => {
  const { parameter, choices } = req.body;
  const arr = Array.isArray(choices) ? choices : String(choices).split(',').map(c => c.trim()).filter(Boolean);
  const { rows } = await pool.query(
    'INSERT INTO parameters (parameter, choices) VALUES ($1,$2) RETURNING *', 
    [parameter.trim(), arr]
  );
  res.status(201).json(rows[0]);
});


app.put('/api/parameters/:id', async (req, res) => {
  const { parameter, choices } = req.body;
  const arr = Array.isArray(choices) ? choices : String(choices).split(',').map(c => c.trim()).filter(Boolean);
  const { rows } = await pool.query(
    'UPDATE parameters SET parameter=$1,choices=$2 WHERE id=$3 RETURNING *', 
    [parameter.trim(), arr, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.delete('/api/parameters/:id', async (req, res) => {
  await pool.query('DELETE FROM parameters WHERE id=$1', [req.params.id]);
  res.json({ deleted: true });
});

app.get('/', async (req, res) => {
  try {
    const { rows: params } = await pool.query('SELECT * FROM parameters ORDER BY id');
    const normalized = params.map(p => ({ ...p, choices: parseChoices(p.choices) }));
    const combos = cartesian(normalized).map(tags => ({ tags }));
    res.render('index', { params: normalized, combos, total: combos.length });
  } catch (err) {
    res.render('index', { params: [], combos: [], total: 0, error: err.message });
  }
});

app.post('/add', async (req, res) => {
  const { parameter, choices } = req.body;
  const arr = String(choices).split(',').map(c => c.trim()).filter(Boolean);
  await pool.query(
    'INSERT INTO parameters (parameter,choices) VALUES ($1,$2)', 
    [parameter.trim(), arr]
  );
  res.redirect('/');
});

app.post('/update/:id', async (req, res) => {
  const { parameter, choices } = req.body;
  const arr = String(choices).split(',').map(c => c.trim()).filter(Boolean);
  await pool.query(
    'UPDATE parameters SET parameter=$1,choices=$2 WHERE id=$3',
    [parameter.trim(), arr, req.params.id]
  );
  res.redirect('/');
});
app.post('/delete/:id', async (req, res) => {
  await pool.query('DELETE FROM parameters WHERE id=$1', [req.params.id]);
  res.redirect('/');
});

app.listen(PORT, () => console.log('http://localhost:' + PORT));