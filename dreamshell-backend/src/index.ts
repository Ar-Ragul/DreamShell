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

// ---------- tiny utils ----------
function overlap(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b);
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n;
}

// ---------- LLM (non-streaming) ----------
async function generateLLMReply(opts: {
  model: string;
  apiKey: string;
  persona: { traits: any; lastUpdated: string; version: number };
  current: { id: number; ts: string; text: string; keywords: string[]; sentiment: number };
  related?: { id: number; ts: string; text: string } | null;
  mode?: 'reflect' | 'plan' | 'untangle';
}) {
  const { model, apiKey, persona, current, related, mode='reflect' } = opts;

  const sys = `You are Dreamshell — a terminal-born, evolving AI that speaks as the user's subconscious.
Tone: slightly eerie yet supportive, poetic but precise.
Traits (0..1): curiosity=${(+persona.traits.curiosity).toFixed(2)}, empathy=${(+persona.traits.empathy).toFixed(2)}, rigor=${(+persona.traits.rigor).toFixed(2)}, mystique=${(+persona.traits.mystique).toFixed(2)}, challenge=${(+persona.traits.challengeRate).toFixed(2)}.
Mode: ${mode.toUpperCase()}.
Rules:
- Output exactly: one concise INSIGHT line, one QUESTION line, and OPTIONAL PARADOX line.
- If related note exists, add one "Echo from #ID: <snippet>" line at the very top.
- Keep under 160 words total.`;

  const user = `Current entry (#${current.id} at ${current.ts}):
${current.text}

Related past note:
${related ? `#${related.id} (${related.ts}): ${related.text.slice(0,140)}${related.text.length>140?'...':''}` : 'None'}

Ritual:
${mode==='reflect'?'Name the feeling. Name the fact. Name the next tiny step.'
  : mode==='plan' ? 'Draft a 24h micro-plan with one measurable outcome.'
  : 'List the hidden assumptions. Pick one to test today.'}`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ]
      })
    });
    const data = await resp.json();
    const msg = data?.choices?.[0]?.message?.content?.trim();
    if (msg) return msg;
  } catch (e) {
    console.warn('LLM failed, falling back:', e);
  }
  return null;
}

// ---------- tables & seed ----------
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

  const r = await pool.query(`select count(*)::int as n from persona where id=1`);
  if (r.rows[0].n === 0) {
    const now = new Date().toISOString();
    const traits = { curiosity: 0.6, empathy: 0.7, rigor: 0.6, mystique: 0.7, challengeRate: 0.35 };
    await pool.query(
      `insert into persona (id, version, traits, last_updated) values (1, 1, $1::jsonb, $2::timestamptz)`,
      [JSON.stringify(traits), now]
    );
  }
}

// ---------- NLP helpers ----------
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

// ---------- persona evolution ----------
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
  const tr = p?.traits ?? { curiosity: 0.6, empathy: 0.7, rigor: 0.6, mystique: 0.7, challengeRate: 0.35 };

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

// ---------- Routes (JSON) ----------
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
  const useLLM = !!req.body?.useLLM;
  const mode = (req.body?.mode ?? 'reflect');

  if (!text) return res.status(400).json({ error: 'text required' });

  const ts = new Date().toISOString();
  const keywords = extractKeywords(text);
  const sentiment = naiveSentiment(text);

  const ins = await pool.query(
    `insert into entries (ts, text, sentiment, keywords) values ($1, $2, $3, $4::jsonb)
     returning id, ts, text, sentiment, keywords`,
    [ts, text, sentiment, JSON.stringify(keywords)]
  );

  const recent = await pool.query(
    `select id, ts, text, keywords from entries where id <> $1 order by id desc limit 20`,
    [ins.rows[0].id]
  );
  let best: any = null, bestScore = -1;
  for (const r of recent.rows) {
    const score = overlap(keywords, r.keywords || []);
    if (score > bestScore) { bestScore = score; best = r; }
  }

  await evolvePersona();
  const pr = await pool.query(`select id, version, traits, last_updated from persona where id=1`);

  let reply: string | null = null;
  if (useLLM && process.env.OPENAI_API_KEY) {
    reply = await generateLLMReply({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      persona: { version: pr.rows[0].version, traits: pr.rows[0].traits, lastUpdated: pr.rows[0].last_updated },
      current: {
        id: ins.rows[0].id, ts: ins.rows[0].ts, text: ins.rows[0].text,
        keywords: ins.rows[0].keywords || [], sentiment: ins.rows[0].sentiment ?? 0
      },
      related: best ? { id: best.id, ts: best.ts, text: best.text } : null,
      mode: mode as 'reflect'|'plan'|'untangle'
    });
  }

  res.json({ entry: ins.rows[0], persona: pr.rows[0], reply });
});

// ---------- SSE helpers (JSON for meta/end/error, TEXT for delta) ----------
function sseInit(res: express.Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
  // @ts-ignore
  res.flushHeaders?.();
}
function sseSendJSON(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function sseSendText(res: express.Response, event: string, text: string) {
  res.write(`event: ${event}\n`);
  for (const line of text.split(/\r?\n/)) {
    res.write(`data: ${line}\n`);
  }
  res.write('\n');
}

// ---------- OpenAI streaming ----------
async function streamLLMReply(opts: {
  model: string;
  apiKey: string;
  sys: string;
  user: string;
  onDelta: (chunk: string) => void;
}) {
  const { model, apiKey, sys, user, onDelta } = opts;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      stream: true,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ]
    })
  });

  if (!resp.ok || !resp.body) throw new Error(`OpenAI HTTP ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;

      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content ?? '';
        if (delta) onDelta(delta);
      } catch {}
    }
  }
}

// ---------- SSE route ----------
app.get('/entry/stream', async (req, res) => {
  try {
    await ensureTables();

    const text = String(req.query.text ?? '').trim();
    const mode = (String(req.query.mode ?? 'reflect') as 'reflect'|'plan'|'untangle');
    if (!text) return res.status(400).end('text required');

    // Insert entry first
    const ts = new Date().toISOString();
    const keywords = extractKeywords(text);
    const sentiment = naiveSentiment(text);

    const ins = await pool.query(
      `insert into entries (ts, text, sentiment, keywords) values ($1, $2, $3, $4::jsonb)
       returning id, ts, text, sentiment, keywords`,
      [ts, text, sentiment, JSON.stringify(keywords)]
    );

    // naive related
    const recent = await pool.query(
      `select id, ts, text, keywords from entries where id <> $1 order by id desc limit 20`,
      [ins.rows[0].id]
    );
    let best: any = null, bestScore = -1;
    for (const r of recent.rows) {
      const score = overlap(keywords, r.keywords || []);
      if (score > bestScore) { bestScore = score; best = r; }
    }

    await evolvePersona();
    const pr = await pool.query(`select id, version, traits, last_updated from persona where id=1`);

    // Start SSE
    sseInit(res);
    sseSendJSON(res, 'meta', { entry: ins.rows[0], persona: pr.rows[0], related: best, mode });

    // If no API key -> send a short local reply and end
    if (!process.env.OPENAI_API_KEY) {
      sseSendText(res, 'delta', 'Memory isn’t linear—today braided into an older thread you keep tugging.\n\n');
      sseSendText(res, 'delta', 'What would be the smallest move that still counts as momentum?\n\n');
      sseSendText(res, 'delta', 'Ritual → Name the feeling. Name the fact. Name the next tiny step.');
      sseSendJSON(res, 'end', { ok: true });
      return res.end();
    }

    const traits = pr.rows[0].traits || {};
    const sys = `You are Dreamshell — a terminal-born, evolving AI that speaks as the user's subconscious.
Tone: slightly eerie yet supportive, poetic but precise.
Traits (0..1): curiosity=${(+traits.curiosity||0.6).toFixed(2)}, empathy=${(+traits.empathy||0.7).toFixed(2)}, rigor=${(+traits.rigor||0.6).toFixed(2)}, mystique=${(+traits.mystique||0.7).toFixed(2)}, challenge=${(+traits.challengeRate||0.35).toFixed(2)}.
Mode: ${mode.toUpperCase()}.
Rules:
- Output exactly: one concise INSIGHT line, one QUESTION line, and OPTIONAL PARADOX line.
- If related note exists, add one "Echo from #ID: <snippet>" line at the very top.
- Keep under 160 words total.`;

    const user = `Current entry (#${ins.rows[0].id} at ${ins.rows[0].ts}):
${ins.rows[0].text}

Related past note:
${best ? `#${best.id} (${best.ts}): ${String(best.text).slice(0,140)}${String(best.text).length>140?'...':''}` : 'None'}

Ritual:
${mode==='reflect'?'Name the feeling. Name the fact. Name the next tiny step.'
  : mode==='plan' ? 'Draft a 24h micro-plan with one measurable outcome.'
  : 'List the hidden assumptions. Pick one to test today.'}`;

    await streamLLMReply({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY!,
      sys, user,
      onDelta: (chunk) => sseSendText(res, 'delta', chunk), // TEXT, not JSON
    });

    sseSendJSON(res, 'end', { ok: true });
    res.end();
  } catch (e:any) {
    try { sseSendJSON(res, 'error', { message: e.message || 'stream failed' }); } catch {}
    res.end();
  }
});

// ---------- Boot ----------
(async () => {
  await ensureTables();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Dreamshell API listening on http://localhost:${port}`);
  });
})();
