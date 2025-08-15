import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------- DB ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureTables() {
  await pool.query(`
    create table if not exists persona (
      id integer primary key default 1,
      version integer not null default 1,
      traits jsonb not null,
      last_updated timestamptz not null
    );
    create table if not exists entries (
      id serial primary key,
      ts timestamptz not null,
      text text not null,
      sentiment real not null default 0,
      keywords jsonb not null default '[]'::jsonb
    );
  `);

  // seed persona if empty
  const r = await pool.query(`select count(*)::int as n from persona where id=1`);
  if (r.rows[0].n === 0) {
    const now = new Date().toISOString();
    const traits = {
      curiosity: 0.6, empathy: 0.7, rigor: 0.6, mystique: 0.7, challengeRate: 0.35,
    };
    await pool.query(
      `insert into persona (id, version, traits, last_updated) values (1, 1, $1::jsonb, $2::timestamptz)`,
      [JSON.stringify(traits), now]
    );
  }
}

// ---------- NLP helpers (simple & local) ----------
const STOP = new Set([
  'the','a','an','and','or','but','if','in','on','at','for','with','to','of','is','are','be','am','i',
  'you','he','she','it','we','they','me','my','your','our','their','this','that'
]);
function extractKeywords(text: string): string[] {
  return [...new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
  )].slice(0, 12);
}
const POS = ['love','calm','joy','grateful','hope','progress','win','peace','light','trust','curious'];
const NEG = ['sad','angry','fear','anxious','lost','tired','hate','fail','pain','dark','stuck'];
function naiveSentiment(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  POS.forEach(p => { if (t.includes(p)) score += 1; });
  NEG.forEach(n => { if (t.includes(n)) score -= 1; });
  return Math.max(-1, Math.min(1, score / 3));
}

// persona evolution (gentle, based on recent entries)
const EMOTION_WORDS: Record<string, string[]> = {
  wonder: ['why','how','mystery','infinite','star','time','cosmos','quantum','paradox','entropy'],
  care:   ['friend','family','love','help','care','hug','kind','support','listen','safe'],
  rigor:  ['proof','logic','because','define','evidence','theory','model','axiom','data','test'],
  gloom:  ['alone','lost','dark','void','fear','anxious','tired','pain','fail','stuck'],
};
function mix(a:number,b:number,t:number){ return a*(1-t)+b*t; }
function clamp(x:number,lo=0,hi=1){ return Math.max(lo, Math.min(hi, x)); }

async function evolvePersona() {
  const recent = await pool.query(
    `select id, text, sentiment from entries order by id desc limit 7`
  );
  const score: any = { wonder:0, care:0, rigor:0, gloom:0 };
  for (const e of recent.rows) {
    const t = (e.text as string).toLowerCase();
    for (const [k, ws] of Object.entries(EMOTION_WORDS)) {
      for (const w of ws) if (t.includes(w)) score[k] += 1;
    }
    if ((e.sentiment ?? 0) < 0) score.gloom += 1;
  }
  const total = Math.max(1, score.wonder + score.care + score.rigor + score.gloom);
  const w = score.wonder/total, c = score.care/total, r = score.rigor/total, g = score.gloom/total;

  const pr = await pool.query(`select version, traits, last_updated from persona where id=1`);
  const p = pr.rows[0];
  const tr = p?.traits ?? {
    curiosity: 0.6, empathy: 0.7, rigor: 0.6, mystique: 0.7, challengeRate: 0.35,
  };

  tr.curiosity = clamp(mix(tr.curiosity, 0.5 + 0.5*w, 0.2));
  tr.empathy   = clamp(mix(tr.empathy,   0.5 + 0.5*c - 0.3*g, 0.25));
  tr.rigor     = clamp(mix(tr.rigor,     0.5 + 0.5*r, 0.2));
  tr.mystique  = clamp(mix(tr.mystique,  0.55 + 0.3*w + 0.15*g, 0.2));
  tr.challengeRate = clamp(mix(tr.challengeRate, 0.25 + 0.4*w + 0.1*r - 0.2*g, 0.15));

  await pool.query(
    `update persona set traits = $1::jsonb, last_updated = $2::timestamptz where id=1`,
    [JSON.stringify(tr), new Date().toISOString()]
  );
}

// ---------- Routes ----------
app.get('/health', async (_req, res) => {
  const r = await pool.query('select 1 as ok');
  res.json({ ok: r.rows[0].ok === 1 });
});

app.get('/persona', async (_req, res) => {
  await ensureTables();
  const r = await pool.query(`select id, version, traits, last_updated from persona where id=1`);
  res.json(r.rows[0]);
});

app.get('/entries', async (req, res) => {
  await ensureTables();
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const r = await pool.query(
    `select id, ts, text, sentiment, keywords from entries order by id desc limit $1`,
    [limit]
  );
  res.json(r.rows);
});

app.post('/entry', async (req, res) => {
  await ensureTables();
  const text = String((req.body?.text ?? '')).trim();
  if (!text) return res.status(400).json({ error: 'text required' });

  const ts = new Date().toISOString();
  const keywords = extractKeywords(text);
  const sentiment = naiveSentiment(text);

  const ins = await pool.query(
    `insert into entries (ts, text, sentiment, keywords) values ($1, $2, $3, $4::jsonb)
     returning id, ts, text, sentiment, keywords`,
    [ts, text, sentiment, JSON.stringify(keywords)]
  );

  await evolvePersona();
  const pr = await pool.query(`select id, version, traits, last_updated from persona where id=1`);

  res.json({ entry: ins.rows[0], persona: pr.rows[0] });
});

// ---------- Boot ----------
(async () => {
  await ensureTables();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Dreamshell API listening on http://localhost:${port}`);
  });
})();
