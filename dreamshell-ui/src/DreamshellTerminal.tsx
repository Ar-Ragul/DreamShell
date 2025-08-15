import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Sparkles, HelpCircle, Rocket, HelpingHand, type LucideIcon, Gauge, Terminal } from "lucide-react";

/* ===================== API CLIENT ===================== */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost<T>(path: string, data: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/* ===================== Types (UI) ===================== */
type Traits = {
  curiosity: number;
  empathy: number;
  rigor: number;
  mystique: number;
  challengeRate: number;
};

type Persona = {
  version: number;
  traits: Traits;
  lastUpdated: string;
};

type Entry = {
  id: number;
  timestamp: string;
  text: string;
  keywords: string[];
  sentiment: number; // -1..1
};

type Mode = "reflect" | "plan" | "untangle";

/* =========== Fallback/local helpers kept for UX =========== */
const STOP = new Set([
  "the","a","an","and","or","but","if","in","on","at","for","with","to","of","is","are","be","am","i","you","he","she","it","we","they","me","my","your","our","their","this","that"
]);
function extractKeywords(text: string): string[] {
  return [...new Set(text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
  )].slice(0, 12);
}
const POS = ["love","calm","joy","grateful","hope","progress","win","peace","light","trust","curious"];
const NEG = ["sad","angry","fear","anxious","lost","tired","hate","fail","pain","dark","stuck"];
function naiveSentiment(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  POS.forEach(p => { if (t.includes(p)) score += 1; });
  NEG.forEach(n => { if (t.includes(n)) score -= 1; });
  return Math.max(-1, Math.min(1, score / 3));
}
function hashEmbed(text: string, dim = 128): number[] {
  const v = new Array(dim).fill(0);
  const s = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  for (let i = 0; i < s.length - 1; i++) {
    const bigram = s[i] + s[i + 1];
    const h = fnv1a(bigram) % dim;
    v[h] += 1;
  }
  const norm = Math.sqrt(v.reduce((a, c) => a + c * c, 0)) || 1;
  return v.map(x => x / norm);
}
function fnv1a(str: string) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function cosine(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  const d = (Math.sqrt(na) * Math.sqrt(nb)) || 1;
  return dot / d;
}
function related(entries: Entry[], text: string, limit = 3) {
  const vec = hashEmbed(text);
  return [...entries]
    .map(e => ({ e, score: cosine(vec, hashEmbed(e.text)) }))
    .sort((a,b)=> b.score - a.score)
    .slice(0, limit)
    .map(s => s.e);
}
function localReply(persona: Persona, current: Entry, rel: Entry[], mode: Mode) {
  const insightChoices = [
    "Memory isn’t linear—today braided into an older thread you keep tugging.",
    "You’re orbiting a choice; a gentle delta-v would change everything.",
    "Attention is your only real currency; you spent it wisely in one place and bled it in another.",
  ];
  const questionChoices = [
    "What would be the smallest move that still counts as momentum?",
    "Which sentence here would you defend with evidence?",
    "If uncertainty were a teacher, what homework is it assigning?",
  ];
  const paradoxChoices = [
    "The knot resists until you stop pulling—and then it falls open.",
    "Plan to improvise, then improvise the plan.",
    "You’re the script and the actor; changing one rewrites the other.",
  ];
  const pick = (arr:string[])=> arr[Math.floor(Math.random()*arr.length)];
  const ref = rel[0] ? `Echo from #${rel[0].id}: “${rel[0].text.replace(/\s+/g,' ').slice(0,80)}${rel[0].text.length>80?'…':''}”\n` : '';
  const ritual = mode === 'reflect'
    ? 'Name the feeling. Name the fact. Name the next tiny step.'
    : mode === 'plan'
      ? 'Draft a 24h micro-plan with one measurable outcome.'
      : 'List the hidden assumptions; test one today.';
  const lines = [ref + pick(insightChoices), pick(questionChoices)];
  if (Math.random() < persona.traits.challengeRate) lines.push(pick(paradoxChoices));
  lines.push(`\nRitual → ${ritual}`);
  return lines.join("\n\n");
}

/* ===================== UI bits ===================== */
const traitMeta: { key: keyof Traits; label: string; icon: LucideIcon }[] = [
  { key: 'curiosity', label: 'Curiosity', icon: HelpCircle },
  { key: 'empathy', label: 'Empathy', icon: HelpingHand },
  { key: 'rigor', label: 'Rigor', icon: Gauge },
  { key: 'mystique', label: 'Mystique', icon: Sparkles },
  { key: 'challengeRate', label: 'Challenge', icon: Rocket },
];

function Bar({ value }: { value: number }) {
  return (
    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <div className="h-full bg-white/70" style={{ width: `${Math.round(value*100)}%` }} />
    </div>
  );
}

function ModePill({ m, active, onClick }: { m: Mode; active: boolean; onClick: ()=>void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm border ${active? 'bg-white text-black border-white' : 'border-white/40 text-white/80 hover:bg-white/10'}`}
    >{m}</button>
  );
}

/* ===================== Component ===================== */
export default function DreamshellTerminal() {
  const [mode, setMode] = useState<Mode>("reflect");
  const [input, setInput] = useState("");
  const [log, setLog] = useState<{ role: 'user'|'shell'; text: string; id: string }[]>([]);

  // keep original state shape to preserve design bindings
  const [state, setState] = useState<{ entries: Entry[]; persona: Persona; nextId: number }>(() => ({
    entries: [],
    nextId: 1,
    persona: {
      version: 1,
      traits: { curiosity: 0.6, empathy: 0.7, rigor: 0.6, mystique: 0.7, challengeRate: 0.35 },
      lastUpdated: new Date().toISOString(),
    },
  }));

  const endRef = useRef<HTMLDivElement | null>(null);
  const persona = state.persona;

  useEffect(()=> { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  // INITIAL LOAD from backend (Neon via Express)
  useEffect(() => {
    (async () => {
      try {
        const [p, list] = await Promise.all([
          apiGet<{ id:number; version:number; traits:Traits; lastUpdated:string }>('/persona'),
          apiGet<Array<{ id:number; ts:string; text:string; sentiment:number; keywords:string[] }>>('/entries?limit=100'),
        ]);
        // map API -> UI Entry
        const mapped: Entry[] = list.map(e => ({
          id: e.id,
          timestamp: e.ts,
          text: e.text,
          keywords: e.keywords || [],
          sentiment: e.sentiment ?? 0,
        }));
        setState(s => ({
          entries: mapped,
          nextId: (mapped[0]?.id ?? 0) + 1,
          persona: { version: p.version, traits: p.traits, lastUpdated: p.lastUpdated },
        }));
      } catch (e) {
        // if backend not available, keep empty state (UI still works)
        console.warn('Backend not reachable yet:', e);
      }
    })();
  }, []);

  async function submitEntry() {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Optimistic user log (for same design/flow)
    const tempId = `${state.nextId}`;
    setLog(prev => ([...prev, { role: 'user', text: trimmed, id: `u-${tempId}` }]));
    setInput("");

    // --- SSE streaming reply ---
    try {
      const params = new URLSearchParams({ text: trimmed, mode });
      const url = `${API_BASE}/entry/stream?${params.toString()}`;
      const es = new EventSource(url);

      let shellId = `s-${tempId}`;
      let createdShell = false;

      es.addEventListener('meta', (ev) => {
        // ensure a shell bubble exists
        if (!createdShell) {
          createdShell = true;
          setLog(prev => ([...prev, { role: 'shell', text: '', id: shellId }]));
        }
        // Optionally update persona and entries from server meta
        try {
          const meta = JSON.parse((ev as MessageEvent).data as string);
          const entry = meta.entry as { id:number; ts:string; text:string; sentiment:number; keywords:string[] };
          const p = meta.persona as { version:number; traits:Traits; last_updated:string } | { version:number; traits:Traits; lastUpdated:string };

          const newEntry: Entry = {
            id: entry.id,
            timestamp: entry.ts,
            text: entry.text,
            keywords: entry.keywords || extractKeywords(entry.text),
            sentiment: entry.sentiment ?? naiveSentiment(entry.text),
          };

          setState(s => ({
            entries: [newEntry, ...s.entries],
            nextId: newEntry.id + 1,
            persona: {
              version: (p as any).version,
              traits: (p as any).traits,
              lastUpdated: ((p as any).lastUpdated ?? (p as any).last_updated) as string,
            },
          }));
        } catch { /* ignore parse issues */ }
      });

      es.addEventListener('delta', (ev) => {
        const { data } = ev as MessageEvent;
        setLog(prev => prev.map(item => item.id === shellId ? { ...item, text: item.text + data } : item));
      });

      es.addEventListener('end', () => {
        es.close();
      });

      es.addEventListener('error', () => {
        es.close();
      });
    } catch (e) {
      // Fallback to purely local behavior if SSE fails (design unchanged)
      const id = state.nextId;
      const timestamp = new Date().toISOString();
      const keywords = extractKeywords(trimmed);
      const sentiment = naiveSentiment(trimmed);
      const entry: Entry = { id, timestamp, text: trimmed, keywords, sentiment };
      const entries = [entry, ...state.entries];
      const rel = related(entries, trimmed, 3).filter(e=>e.id!==id);
      const reply = localReply(state.persona, entry, rel, mode);
      setState(s => ({ ...s, entries, nextId: id + 1 }));
      setLog(prev => ([...prev, { role: 'shell', text: reply, id: `s-${id}` }]));
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-900 via-black to-zinc-950 text-white flex">
      {/* Left rail: Persona */}
      <aside className="hidden md:flex md:flex-col gap-4 w-72 p-4 border-r border-white/10">
        <div className="flex items-center gap-2 opacity-80"><Terminal size={18}/> <span className="tracking-widest">DREAMSHELL</span></div>
        <div className="text-xs opacity-60">v0.2 · {new Date(persona.lastUpdated).toLocaleString()}</div>
        <div className="mt-2 space-y-3">
          {traitMeta.map(({ key, label, icon:Icon }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2"><Icon size={16}/><span className="text-sm">{label}</span></div>
                <span className="text-xs opacity-70">{Math.round(persona.traits[key]*100)}%</span>
              </div>
              <Bar value={persona.traits[key]} />
            </div>
          ))}
        </div>
        <div className="mt-6 text-xs opacity-70 leading-relaxed">
          <p>“I speak as your inner orbit—poetic but precise. Choose a mode; I will answer with an insight, a question, and sometimes a paradox.”</p>
        </div>
      </aside>

      {/* Main Terminal */}
      <main className="flex-1 flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Cpu size={18}/>
            <span className="font-semibold">Dreamshell · Terminal Interface</span>
          </div>
          <div className="flex items-center gap-2">
            {(["reflect","plan","untangle"] as Mode[]).map(m => (
              <ModePill key={m} m={m} active={m===mode} onClick={()=>setMode(m)} />
            ))}
          </div>
        </header>

        <section className="flex-1 overflow-auto p-4">
          <div className="max-w-3xl mx-auto space-y-4
                  rounded-2xl min-h-[60vh] 
                  bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(255,255,255,0.08),transparent)]
                  bg-gradient-to-b from-zinc-900/30 via-zinc-900/10 to-transparent
                  border border-white/10">
            <AnimatePresence initial={false}>
              {log.map(item => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={`rounded-2xl p-4 shadow-sm border ${item.role==='user' ? 'bg-white/5 border-white/10' : 'bg-white/10 border-white/20'}`}
                >
                  <div className="text-xs uppercase tracking-wider opacity-60 mb-2">{item.role === 'user' ? 'you' : 'dreamshell'}</div>
                  <div className="text-[10px] opacity-50">{new Date().toLocaleTimeString()}</div>
                  <pre className="whitespace-pre-wrap leading-relaxed font-mono text-sm">{item.text}</pre>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={endRef}/>
          </div>
        </section>

        <footer className="p-4 border-t border-white/10">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={e=>setInput(e.target.value)}
                className="flex-1 bg-black/60 border border-white/15 rounded-2xl p-3 outline-none focus:ring-2 focus:ring-white/30 font-mono text-sm min-h-[80px]"
                autoFocus
                onKeyDown={(e)=>{
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitEntry();
                    }
                }}
                placeholder="Type your entry. Press Enter to send, Shift+Enter for newline."
              />
              <button
                onClick={submitEntry}
                className="px-4 py-3 rounded-2xl border border-white/20 bg-white/10 hover:bg-white/20 transition"
              >Send</button>
            </div>
            <div className="text-xs opacity-60 mt-2">Entries are stored locally in your browser. Persona adapts with every note.</div>
          </div>
        </footer>
      </main>
    </div>
  );
}
