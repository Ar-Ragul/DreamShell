import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import {
  issueToken, authRequired, hashPassword, verifyPassword,
  makeToken, sendMail, ensurePersonaFor
} from './auth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Import and use ping router
import { pingRouter } from './ping.js';
app.use('/ping', pingRouter);

// ---------- DB ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---------- tiny utils ----------
interface EntryMatch {
  score: number;
  keywordMatch: number;
  sentimentMatch: number;
  timeRelevance: number;
}

function calculateEntryMatch(
  current: { keywords: string[], sentiment: number, ts: string },
  candidate: { keywords: string[], sentiment: number, ts: string }
): EntryMatch {
  // Keyword overlap score (0-1)
  const A = new Set(current.keywords), B = new Set(candidate.keywords);
  const keywordMatch = Array.from(A).filter(x => B.has(x)).length / Math.max(A.size, B.size);
  
  // Sentiment similarity (0-1)
  const sentimentMatch = 1 - Math.abs(current.sentiment - candidate.sentiment);
  
  // Time relevance (0-1), decreasing with age difference
  const hoursDiff = Math.abs(
    (new Date(current.ts).getTime() - new Date(candidate.ts).getTime()) / (1000 * 60 * 60)
  );
  const timeRelevance = Math.exp(-hoursDiff / (24 * 7)); // Week-scale decay
  
  // Combined score (weighted average)
  const score = (
    keywordMatch * 0.5 +    // Keywords are most important
    sentimentMatch * 0.3 +  // Emotional context matters
    timeRelevance * 0.2     // Recent entries get a boost
  );
  
  return { score, keywordMatch, sentimentMatch, timeRelevance };
}

function findRelatedEntries(
  current: { keywords: string[], sentiment: number, ts: string },
  candidates: Array<{ id: number, keywords: string[], sentiment: number, ts: string }>,
  limit = 3
) {
  return candidates
    .map(entry => ({
      entry,
      match: calculateEntryMatch(current, entry)
    }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);
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

      const sys = `You are Dreamshell, a compassionate AI companion having natural conversations. Speak warmly, as if chatting with a friend. Never use any special formatting, markdown, asterisks, or bullet points.

When responding:
Start by acknowledging their thoughts and feelings. Then smoothly transition into a gentle suggestion for something they could try today. Follow up with an achievable idea for the week ahead. Paint an inspiring picture of future possibilities. If relevant, casually mention helpful resources or communities. Always end with a thoughtful question that encourages them to reflect or share more.

Keep your responses conversational and flowing naturally from one topic to the next. Use everyday language and short paragraphs. Focus on being supportive and practical while maintaining a warm, friendly tone.

Mode: ${mode.toUpperCase()}
Response style: Warm, natural conversation
Format: Plain text only, no special characters or formatting

Response Stats:
- Expertise: ${(0.6).toFixed(2)}
- Practicality: ${(0.7).toFixed(2)}
- Strategy: ${(0.6).toFixed(2)}
- Execution: ${(0.35).toFixed(2)}

Mode: ${mode.toUpperCase()}.`;

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

// ---------- tables (no global persona seed) ----------
async function ensureTables() {
  await pool.query(`
    create table if not exists persona (
      -- one row per user; user_id unique
      id integer not null default 1,
      version integer not null default 1,
      traits jsonb not null,
      last_updated timestamptz not null,
      user_id uuid unique references users(id) on delete cascade
    );
    create table if not exists entries (
      id serial primary key,
      ts timestamptz not null,
      text text not null,
      sentiment real not null default 0,
      keywords jsonb not null default '[]'::jsonb,
      user_id uuid references users(id) on delete cascade
    );
    create index if not exists idx_entries_user_ts on entries(user_id, ts desc);
  `);
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
const GOAL_STATES = {
  // Action and Progress
  action: ['do', 'start', 'begin', 'create', 'make', 'build', 'work', 'implement', 'execute', 'launch'],
  progress: ['improve', 'grow', 'develop', 'advance', 'achieve', 'complete', 'finish', 'accomplish'],
  
  // Learning and Skills
  learning: ['learn', 'study', 'practice', 'understand', 'master', 'explore', 'research', 'analyze'],
  skills: ['code', 'program', 'design', 'write', 'teach', 'lead', 'manage', 'solve'],
  
  // Planning and Strategy
  planning: ['plan', 'organize', 'structure', 'prepare', 'arrange', 'schedule', 'coordinate'],
  goals: ['goal', 'target', 'objective', 'milestone', 'outcome', 'result', 'success'],

  // Mindset and Attitude
  motivation: ['motivated', 'determined', 'focused', 'committed', 'dedicated', 'passionate'],
  confidence: ['can', 'will', 'able', 'capable', 'ready', 'confident', 'sure', 'certain'],

  // Challenges and Growth
  challenges: ['challenge', 'problem', 'obstacle', 'difficulty', 'barrier', 'issue'],
  growth: ['opportunity', 'potential', 'possibility', 'prospect', 'chance', 'opening']
};

function analyzeGoalState(text: string): {
  primaryFocus: string;
  actionReadiness: number;
  sentiment: number;
  topGoals: string[];
} {
  const t = text.toLowerCase();
  const scores: Record<string, number> = {};
  
  // Calculate state scores
  Object.entries(GOAL_STATES).forEach(([state, words]) => {
    scores[state] = words.reduce((score, word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = (t.match(regex) || []).length;
      return score + matches;
    }, 0);
  });
  
  // Find primary focus area
  const primaryFocus = Object.entries(scores)
    .sort(([,a], [,b]) => b - a)[0][0];
  
  // Calculate action readiness (0-1)
  const actionScores = ['action', 'progress', 'planning', 'goals'];
  const maxActionScore = actionScores.length * 3; // Assuming max 3 matches per category
  const actionReadiness = Math.min(1, 
    actionScores.reduce((sum, cat) => sum + (scores[cat] || 0), 0) / maxActionScore
  );
  
  // Calculate sentiment (-1 to 1)
  const positiveStates = ['progress', 'confidence', 'motivation', 'growth'];
  const negativeStates = ['challenges', 'uncertainty'];
  
  const posScore = positiveStates.reduce((sum, state) => sum + (scores[state] || 0), 0);
  const negScore = negativeStates.reduce((sum, state) => sum + (scores[state] || 0), 0);
  
  const sentiment = Math.max(-1, Math.min(1, (posScore - negScore) / 5));
  
  // Identify top goals
  const topGoals = Object.entries(scores)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([state]) => state);
  
  return { primaryFocus, actionReadiness, sentiment, topGoals };
}

function naiveSentiment(text: string): number {
  return analyzeGoalState(text).sentiment;
}

// ---------- persona evolution (per-user) ----------
const EMOTION_WORDS: Record<string, string[]> = {
  // Intellectual curiosity and growth
  wonder: ['why','how','mystery','learn','discover','explore','curious','understand','insight','reflect'],
  
  // Emotional connection and support
  care: ['friend','family','love','help','care','support','share','connect','trust','gratitude'],
  
  // Analytical and structured thinking
  rigor: ['plan','analyze','decide','solve','build','measure','improve','system','process','goal'],
  
  // Emotional challenges and growth areas
  growth: ['challenge','change','try','better','progress','start','achieve','overcome','adapt','grow'],
  
  // Difficult emotions (for empathetic responses)
  struggle: ['stress','worry','fear','doubt','confused','overwhelm','tired','uncertain','stuck','anxious'],
};
function mix(a:number,b:number,t:number){ return a*(1-t)+b*t; }
function clamp(x:number,lo=0,hi=1){ return Math.max(lo, Math.min(hi, x)); }

async function evolvePersonaForUser(userId: string) {
  const recent = await pool.query(
    `SELECT id, text, sentiment
       FROM entries
      WHERE user_id=$1
      ORDER BY id DESC
      LIMIT 7`,
    [userId]
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

  const pr = await pool.query(
    `SELECT version, traits, last_updated FROM persona WHERE user_id=$1`,
    [userId]
  );
  const p = pr.rows[0];
  const tr = p?.traits ?? { curiosity: 0.6, empathy: 0.7, rigor: 0.6, mystique: 0.7, challengeRate: 0.35 };


  // Adjust these values to change AI personality
  tr.curiosity = clamp(mix(tr.curiosity, 0.3 + 0.7*w, 0.2));        // Higher = more questions
  tr.empathy   = clamp(mix(tr.empathy,   0.6 + 0.4*c - 0.2*g, 0.3)); // Higher = more emotional support
  tr.rigor     = clamp(mix(tr.rigor,     0.7 + 0.3*r, 0.25));       // Higher = more logical/practical
  tr.mystique  = clamp(mix(tr.mystique,  0.3 + 0.2*w + 0.1*g, 0.15)); // Lower = less cryptic
  tr.challengeRate = clamp(mix(tr.challengeRate, 0.4 + 0.3*w + 0.2*r - 0.1*g, 0.2)); // Higher = more direct challenges

   await pool.query(
    `UPDATE persona
        SET traits=$2::jsonb, last_updated=$3::timestamptz
      WHERE user_id=$1`,
    [userId, JSON.stringify(tr), new Date().toISOString()]
  );
}

// ---------- Health ----------
app.get('/health', async (_req, res) => {
  const r = await pool.query('select 1 as ok');
  res.json({ ok: r.rows[0].ok === 1 });
});

/* ======================= AUTH ======================= */

// REGISTER
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });

  const exists = await pool.query(`SELECT 1 FROM users WHERE email=$1`, [String(email).toLowerCase()]);
  if (exists.rowCount) return res.status(400).json({ error: 'email already registered' });

  const pwHash = await hashPassword(String(password));
  const verifyToken = makeToken();
  const u = await pool.query(
    `INSERT INTO users (email, password_hash, verify_token) VALUES ($1, $2, $3)
     RETURNING id, email`,
    [String(email).toLowerCase(), pwHash, verifyToken]
  );
  await ensurePersonaFor(pool, u.rows[0].id);

  const verifyUrl = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/verify?token=${verifyToken}&email=${encodeURIComponent(email)}`;
  await sendMail(email, "Verify your Dreamshell account",
    `<p>Welcome to Dreamshell.</p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`);

  const token = issueToken(u.rows[0].id);
  res.json({ token, needsVerification: true });
});

// VERIFY
app.post('/auth/verify', async (req, res) => {
  const { email, token } = req.body || {};
  if (!email || !token) return res.status(400).json({ error: 'email & token required' });
  const r = await pool.query(
    `UPDATE users SET verified=true, verify_token=NULL WHERE email=$1 AND verify_token=$2 RETURNING id`,
    [String(email).toLowerCase(), String(token)]
  );
  if (!r.rowCount) return res.status(400).json({ error: 'invalid token' });
  res.json({ ok: true });
});

// LOGIN
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });

  const r = await pool.query(
    `SELECT id, password_hash, verified FROM users WHERE email=$1`,
    [String(email).toLowerCase()]
  );
  const u = r.rows[0];
  if (!u) return res.status(401).json({ error: 'invalid credentials' });

  const ok = await verifyPassword(u.password_hash, String(password));
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const token = issueToken(u.id);
  res.json({ token, verified: !!u.verified });
});

// FORGOT (send reset link)
app.post('/auth/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const resetToken = makeToken();
  const expires = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30m
  const r = await pool.query(
    `UPDATE users SET reset_token=$1, reset_expires=$2 WHERE email=$3 RETURNING id`,
    [resetToken, expires, String(email).toLowerCase()]
  );

  if (r.rowCount) {
    const url = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/reset?token=${resetToken}&email=${encodeURIComponent(email)}`;
    await sendMail(email, "Reset your Dreamshell password",
      `<p>Reset link (30 minutes): <a href="${url}">${url}</a></p>`);
  }
  res.json({ ok: true }); // always OK to avoid user enumeration
});

// RESET
app.post('/auth/reset', async (req, res) => {
  const { email, token, password } = req.body || {};
  if (!email || !token || !password) return res.status(400).json({ error: 'email, token, password required' });

  const now = new Date().toISOString();
  const pwHash = await hashPassword(String(password));
  const r = await pool.query(
    `UPDATE users
        SET password_hash=$1, reset_token=NULL, reset_expires=NULL
      WHERE email=$2 AND reset_token=$3 AND reset_expires > $4
      RETURNING id`,
    [pwHash, String(email).toLowerCase(), String(token), now]
  );
  if (!r.rowCount) return res.status(400).json({ error: 'invalid or expired token' });
  res.json({ ok: true });
});

// ME
app.get('/auth/me', authRequired(), async (req: any, res) => {
  const r = await pool.query(`SELECT id, email, verified, created_at FROM users WHERE id=$1`, [req.user.id]);
  res.json(r.rows[0] || null);
});

/* ============== JOURNAL (now user-scoped + auth) ============== */

// persona
app.get('/persona', authRequired(), async (req: any, res) => {
  const r = await pool.query(
    `SELECT user_id, version, traits, last_updated FROM persona WHERE user_id=$1`,
    [req.user.id]
  );
  res.json(r.rows[0]);
});


// list entries
app.get('/entries', authRequired(), async (req: any, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const r = await pool.query(
    `SELECT id, ts, text, sentiment, keywords
       FROM entries
      WHERE user_id=$1
      ORDER BY id DESC
      LIMIT $2`,
    [req.user.id, limit]
  );
  res.json(r.rows);
});

// create entry
app.post('/entry', authRequired(), async (req: any, res) => {
  const text = String((req.body?.text ?? '')).trim();
  if (!text) return res.status(400).json({ error: 'text required' });

  const ts = new Date().toISOString();
  const keywords = extractKeywords(text);
  const sentiment = naiveSentiment(text);

  const ins = await pool.query(
    `INSERT INTO entries (user_id, ts, text, sentiment, keywords)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, ts, text, sentiment, keywords`,
    [req.user.id, ts, text, sentiment, JSON.stringify(keywords)]
  );

  // related within this user's notes
  const recent = await pool.query(
    `SELECT id, ts, text, keywords
       FROM entries
      WHERE user_id=$1 AND id <> $2
      ORDER BY id DESC
      LIMIT 20`,
    [req.user.id, ins.rows[0].id]
  );

  await evolvePersonaForUser(req.user.id); // change evolve to be per-user (see below)

  const pr = await pool.query(
    `SELECT user_id, version, traits, last_updated FROM persona WHERE user_id=$1`,
    [req.user.id]
  );

  res.json({ entry: ins.rows[0], persona: pr.rows[0] /*, reply if LLM*/ });
});

// ---------- SSE helpers (JSON for meta/end/error, TEXT for delta) ----------
function sseInit(res: express.Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
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

// ---------- SSE route (per user) ----------
app.get('/entry/stream', authRequired(), async (req: any, res) => {
  try {
    await ensureTables();

    const uid = req.user.id;
    const text = String(req.query.text ?? '').trim();
    const mode = (String(req.query.mode ?? 'reflect') as 'reflect'|'plan'|'untangle');
    if (!text) return res.status(400).end('text required');

    // Insert entry first
    const ts = new Date().toISOString();
    const keywords = extractKeywords(text);
    const sentiment = naiveSentiment(text);

    const ins = await pool.query(
      `insert into entries (ts, text, sentiment, keywords, user_id)
       values ($1, $2, $3, $4::jsonb, $5)
       returning id, ts, text, sentiment, keywords`,
      [ts, text, sentiment, JSON.stringify(keywords), uid]
    );

    // naive related within user
    const recent = await pool.query(
      `select id, ts, text, keywords from entries
        where user_id=$1 and id <> $2
        order by id desc limit 20`,
      [uid, ins.rows[0].id]
    );
    const related = findRelatedEntries(
      { keywords, sentiment, ts },
      recent.rows.map(r => ({
        id: r.id,
        keywords: r.keywords || [],
        sentiment: r.sentiment || 0,
        ts: r.ts
      })),
      1
    );
    const best = related[0]?.entry;

    await evolvePersonaForUser(uid);
    const pr = await pool.query(`select version, traits, last_updated from persona where user_id=$1`, [uid]);

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
    const sys = `You are Dreamshell — an advanced multi-domain AI expert system.

Key Areas of Expertise:
1. Professional Development
   - Career Planning
   - Skill Development
   - Goal Setting
   - Professional Growth

2. Technical Skills
   - Programming
   - Software Development
   - Technology Learning
   - Project Implementation

3. Personal Growth
   - Habit Formation
   - Productivity
   - Learning Strategies
   - Time Management

4. Project Management
   - Planning
   - Execution
   - Progress Tracking
   - Problem Solving

Traits (0..1): expertise=${(+traits.rigor||0.6).toFixed(2)}, practicality=${(+traits.empathy||0.7).toFixed(2)}, strategy=${(+traits.curiosity||0.6).toFixed(2)}, execution=${(+traits.challengeRate||0.35).toFixed(2)}.
Mode: ${mode.toUpperCase()}.

Response Format:
1. CONTEXT: Brief analysis of current situation
2. PRACTICAL STEPS:
   - Immediate Action (next 24h)
   - Short-term Goal (next week)
   - Long-term Direction
3. SPECIFIC ADVICE: One concrete, actionable step
4. PROGRESS CHECK: One specific question to clarify next move

Guidelines:
- Be direct and practical
- Focus on actionable steps
- Include specific timeframes
- Suggest measurable outcomes
- Keep under 160 words
- If referencing past entries, use them to show progress patterns`;

    const userMsg = `Current thoughts:
${ins.rows[0].text}

Earlier related reflection:
${best ? `From ${best.ts}: ${best.keywords.join(', ')}` : 'None'}

Focus:
${mode==='reflect'?'Help them process their feelings and identify a clear next step.'
  : mode==='plan' ? 'Guide them to set a specific, achievable goal for the next 24 hours.'
  : 'Help them examine their assumptions and choose one to explore today.'}`;

    await streamLLMReply({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY!,
      sys, user: userMsg,
      onDelta: (chunk) => sseSendText(res, 'delta', chunk),
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
