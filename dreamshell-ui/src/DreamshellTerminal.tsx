import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Sparkles, HelpCircle, Rocket, HelpingHand, type LucideIcon, Gauge, Terminal, LogOut } from "lucide-react";

/* ===================== AUTH HELPERS (inline) ===================== */
const TOKEN_KEY = "dreamshell_jwt";
const SCOPE_KEY = "dreamshell_token_scope"; // "local" | "session"

function getToken(): string | null {
  const scope = localStorage.getItem(SCOPE_KEY);
  if (scope === "session") return sessionStorage.getItem(TOKEN_KEY);
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SCOPE_KEY);
}
async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/* ===================== API CLIENT ===================== */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

async function apiGet<T>(path: string): Promise<T> {
  const r = await authFetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost<T>(path: string, data: unknown): Promise<T> {
  const r = await authFetch(`${API_BASE}${path}`, {
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

type EmotionTag = {
  name: string;
  intensity: number; // 1-5
  color: string;
};

type EntryCategory = {
  name: string;
  icon: string;
};

type DailyMood = {
  date: string;
  morning?: number;
  afternoon?: number;
  evening?: number;
  notes?: string;
};

type Entry = {
  id: number;
  timestamp: string;
  text: string;
  keywords: string[];
  sentiment: number; // -1..1
  emotions?: EmotionTag[];
  category?: string;
  dailyMood?: DailyMood;
};

type Mode = "reflect" | "plan" | "untangle" | "vent" | "journal";

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
  const ventResponses = [
    "I hear how overwhelming this feels. Take your time to express everything that's on your mind.",
    "It sounds like you're carrying a lot right now. I'm here to listen.",
    "Those feelings are valid. Would you like to tell me more about what's weighing on you?",
  ];

  const insightChoices = [
    "Memory isn't linear—today braided into an older thread you keep tugging.",
    "You're orbiting a choice; a gentle delta-v would change everything.",
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
  let lines: string[] = [];
  
  if (mode === 'vent') {
    lines = [pick(ventResponses)];
  } else {
    lines = [ref + pick(insightChoices), pick(questionChoices)];
    if (Math.random() < persona.traits.challengeRate) {
      lines.push(pick(paradoxChoices));
    }
  }
  
  if (mode !== 'vent') {
    lines.push(`\nRitual → ${ritual}`);
  }
  return lines.join("\n\n");
}

/* ===================== UI bits ===================== */
const EMOTIONS = {
  joy: { name: 'Joy', color: 'bg-yellow-400' },
  gratitude: { name: 'Gratitude', color: 'bg-green-400' },
  peace: { name: 'Peace', color: 'bg-blue-400' },
  anxiety: { name: 'Anxiety', color: 'bg-purple-400' },
  sadness: { name: 'Sadness', color: 'bg-blue-600' },
  frustration: { name: 'Frustration', color: 'bg-red-400' },
  hope: { name: 'Hope', color: 'bg-cyan-400' },
  fear: { name: 'Fear', color: 'bg-gray-400' },
  excitement: { name: 'Excitement', color: 'bg-orange-400' },
  love: { name: 'Love', color: 'bg-pink-400' },
} as const;

const CATEGORIES = {
  personal: { name: 'Personal', icon: '👤' },
  work: { name: 'Work', icon: '💼' },
  health: { name: 'Health', icon: '🌱' },
  relationships: { name: 'Relationships', icon: '❤️' },
  goals: { name: 'Goals', icon: '🎯' },
  creativity: { name: 'Creativity', icon: '✨' },
  learning: { name: 'Learning', icon: '📚' },
  challenges: { name: 'Challenges', icon: '🏋️' },
} as const;

const PROMPTS = {
  vent: [
    "What's weighing on your mind right now?",
    "How are you really feeling in this moment?",
    "What's the hardest part about what you're going through?",
    "What do you wish others understood about your situation?",
  ],
  journal: {
    morning: [
      "What's one thing you're looking forward to today?",
      "How did you sleep? How does your body feel?",
      "What's your intention for today?",
      "What would make today great?",
    ],
    evening: [
      "What made you smile today?",
      "What challenged you today and what did you learn?",
      "What are you grateful for right now?",
      "How did your mood shift throughout the day?",
    ],
    reflection: [
      "What patterns have you noticed in your thoughts lately?",
      "What's something you've been avoiding thinking about?",
      "Where do you feel stuck, and what might help?",
      "What small progress are you proud of?",
    ],
  },
  reflect: [
    "What recurring patterns do you notice in your life lately?",
    "What beliefs or assumptions might be holding you back?",
    "What small changes could make the biggest difference?",
    "What would your future self thank you for starting today?",
  ],
  plan: [
    "What's the next small step you could take?",
    "What resources or support do you need to move forward?",
    "What would success look like for this goal?",
    "What potential obstacles might you encounter?",
  ],
  untangle: [
    "What different perspectives could you consider?",
    "What assumptions are you making about each option?",
    "What would you advise a friend in this situation?",
    "What's the core value or need driving this decision?",
  ],
} as const;

function getMoodLabel(s: number) {
  if (s > 0.5) return "Positive";
  if (s > 0) return "Slightly Positive";
  if (s > -0.5) return "Neutral";
  if (s > -1) return "Slightly Concerned";
  return "Need Support";
}

function getMoodColor(s: number) {
  if (s > 0.5) return "bg-emerald-500";
  if (s > 0) return "bg-blue-400";
  if (s > -0.5) return "bg-gray-400";
  if (s > -1) return "bg-amber-400";
  return "bg-rose-400";
}

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

function EmotionTag({ emotion, intensity, onSelect }: { 
  emotion: keyof typeof EMOTIONS; 
  intensity?: number; 
  onSelect?: (intensity: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button 
        className={`px-2 py-0.5 rounded-full text-xs ${EMOTIONS[emotion].color} text-white/90 
          ${intensity ? 'opacity-100' : 'opacity-60 hover:opacity-80'}`}
        onClick={() => onSelect?.(intensity ? 0 : 3)}
      >
        {EMOTIONS[emotion].name}
        {intensity && <span className="ml-1">{'•'.repeat(intensity)}</span>}
      </button>
    </div>
  );
}

function DailyMoodTracker({ date, mood, onChange }: { 
  date: string; 
  mood?: DailyMood; 
  onChange?: (mood: DailyMood) => void;
}) {
  const periods = ['morning', 'afternoon', 'evening'] as const;
  
  return (
    <div className="p-4 rounded-xl border border-white/10 bg-black/20">
      <h3 className="text-sm font-medium mb-3">Daily Check-in</h3>
      <div className="space-y-3">
        {periods.map(period => (
          <div key={period} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="capitalize">{period}</span>
              {mood?.[period] && (
                <span className="opacity-70">{getMoodLabel(mood[period]!)}</span>
              )}
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.1"
              value={mood?.[period] || 0}
              onChange={e => onChange?.({ 
                ...mood, 
                date, 
                [period]: parseFloat(e.target.value) 
              })}
              className="w-full accent-white/70"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function JournalPrompt({ mode, timeOfDay }: { 
  mode: Mode; 
  timeOfDay?: 'morning' | 'evening' | 'reflection';
}) {
  const [prompt] = useState(() => {
    const prompts = mode === 'journal' && timeOfDay 
      ? PROMPTS.journal[timeOfDay as keyof typeof PROMPTS.journal]
      : PROMPTS[mode];
    return Array.isArray(prompts) 
      ? prompts[Math.floor(Math.random() * prompts.length)]
      : PROMPTS.journal.morning[0];
  });

  return (
    <div className="text-sm opacity-80 italic mb-2">
      "{prompt}"
    </div>
  );
}

function EmotionSummary({ entries }: { entries: Entry[] }) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const weeklyEntries = entries.filter(e => new Date(e.timestamp) >= weekAgo);
  const avgSentiment = weeklyEntries.length > 0
    ? weeklyEntries.reduce((sum, e) => sum + e.sentiment, 0) / weeklyEntries.length
    : 0;

  // Using shared mood label and color functions

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-black/20">
      <h3 className="text-sm font-medium mb-3">Weekly Reflection</h3>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Overall Mood</span>
            <span>{getMoodLabel(avgSentiment)}</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={`h-full ${getMoodColor(avgSentiment)} transition-all duration-500`} 
              style={{ width: `${Math.round((avgSentiment + 1) * 50)}%` }} 
            />
          </div>
        </div>
        <div className="flex justify-between text-xs opacity-70">
          <span>Past Week</span>
          <span>{weeklyEntries.length} entries</span>
        </div>
      </div>
    </div>
  );
}

/* ===================== Component ===================== */
export default function DreamshellTerminal() {
  const [mode, setMode] = useState<Mode>("reflect");
  const [input, setInput] = useState("");
  const [log, setLog] = useState<{ role: 'user'|'shell'; text: string; id: string }[]>([]);
  const [currentEmotions, setCurrentEmotions] = useState<EmotionTag[]>([]);

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
        console.warn('Backend not reachable yet:', e);
      }
    })();
  }, []);

  async function submitEntry() {
    const trimmed = input.trim();
    if (!trimmed) return;

    const tempId = `${state.nextId}`;
    setLog(prev => ([...prev, { role: 'user', text: trimmed, id: `u-${tempId}` }]));
    setInput("");

    try {
      // SSE needs token in query (EventSource can't set headers)
      const token = getToken() || "";
      const params = new URLSearchParams({ text: trimmed, mode, token });
      const url = `${API_BASE}/entry/stream?${params.toString()}`;
      const es = new EventSource(url);

      let shellId = `s-${tempId}`;
      let createdShell = false;

      es.addEventListener('meta', (ev) => {
        if (!createdShell) {
          createdShell = true;
          setLog(prev => ([...prev, { role: 'shell', text: '', id: shellId }]));
        }
        try {
          const meta = JSON.parse((ev as MessageEvent).data as string);
          const entry = meta.entry as { id:number; ts:string; text:string; sentiment:number; keywords:string[] };
          const p = meta.persona as { version:number; traits:Traits; last_updated?:string; lastUpdated?:string };

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
              version: p.version,
              traits: p.traits,
              lastUpdated: (p.lastUpdated ?? p.last_updated) as string,
            },
          }));
        } catch { /* ignore */ }
      });

      es.addEventListener('delta', (ev) => {
        const { data } = ev as MessageEvent;
        setLog(prev => prev.map(item => item.id === shellId ? { ...item, text: item.text + data } : item));
      });

      es.addEventListener('end', () => es.close());
      es.addEventListener('error', () => es.close());
    } catch (e) {
      // Local fallback
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

  const handleLogout = () => {
    clearToken();
    // optional: clear UI state too
    // setState({ entries: [], nextId: 1, persona: state.persona });
    location.reload(); // simplest to reset auth + refetch guarded data
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-900 via-black to-zinc-950 text-white flex">
      {/* Left rail: Persona */}
            <aside className="hidden md:flex md:flex-col gap-4 w-72 p-4 border-r border-white/10">
        <div className="flex items-center gap-2 opacity-80"><Terminal size={18}/> <span className="tracking-widest">DREAMSHELL</span></div>
        <div className="text-xs opacity-60">v0.2 · {new Date(persona.lastUpdated).toLocaleString()}</div>
        
        {state.entries.length > 0 && (
          <EmotionSummary entries={state.entries} />
        )}

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
          <p>{
            mode === 'vent' 
              ? "This is a safe space. Express yourself freely without judgment. I'm here to listen."
              : mode === 'journal'
                ? "Write your thoughts, feelings, and experiences. I'll help you reflect on patterns and growth."
                : "I speak as your inner orbit—poetic but precise. Choose a mode; I will answer with an insight, a question, and sometimes a paradox."
          }</p>
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
            {(["vent", "journal", "reflect", "plan", "untangle"] as Mode[]).map(m => (
              <ModePill key={m} m={m} active={m===mode} onClick={()=>setMode(m)} />
            ))}
            <button
              onClick={handleLogout}
              className="ml-2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm border border-white/40 text-white/80 hover:bg-white/10"
              title="Sign out"
            >
              <LogOut size={14}/> logout
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-auto p-4">
          <div className="max-w-3xl mx-auto space-y-4
                  rounded-2xl min-h-[60vh] 
                  bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(255,255,255,0.08),transparent)]
                  bg-gradient-to-b from-zinc-900/30 via-zinc-900/10 to-transparent
                  border border-white/10">
            
            {mode === 'journal' && (
              <div className="p-4 border-b border-white/10">
                <JournalPrompt 
                  mode={mode}
                  timeOfDay={
                    mode === 'journal'
                      ? (new Date().getHours() < 12 ? 'morning' 
                        : new Date().getHours() < 18 ? 'evening' 
                        : 'reflection')
                      : undefined
                  }
                />
                <DailyMoodTracker 
                  date={new Date().toISOString().split('T')[0]}
                  mood={state.entries[0]?.dailyMood}
                  onChange={(mood) => {
                    if (state.entries[0]) {
                      const entry = {...state.entries[0], dailyMood: mood};
                      setState(s => ({...s, entries: [entry, ...s.entries.slice(1)]}));
                    }
                  }}
                />
              </div>
            )}
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
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap gap-2 mb-2">
                  {Object.keys(EMOTIONS).map(emotion => (
                    <EmotionTag 
                      key={emotion}
                      emotion={emotion as keyof typeof EMOTIONS}
                      intensity={currentEmotions?.find(e => e.name === EMOTIONS[emotion as keyof typeof EMOTIONS].name)?.intensity}
                      onSelect={(intensity) => {
                        const newEmotions = [...(currentEmotions || [])];
                        const index = newEmotions.findIndex(e => e.name === EMOTIONS[emotion as keyof typeof EMOTIONS].name);
                        if (index >= 0) {
                          if (intensity === 0) {
                            newEmotions.splice(index, 1);
                          } else {
                            newEmotions[index].intensity = intensity;
                          }
                        } else if (intensity > 0) {
                          newEmotions.push({
                            name: EMOTIONS[emotion as keyof typeof EMOTIONS].name,
                            intensity,
                            color: EMOTIONS[emotion as keyof typeof EMOTIONS].color
                          });
                        }
                        setCurrentEmotions(newEmotions);
                      }}
                    />
                  ))}
                </div>
                <textarea
                  value={input}
                  onChange={e=>setInput(e.target.value)}
                  className="w-full bg-black/60 border border-white/15 rounded-2xl p-3 outline-none focus:ring-2 focus:ring-white/30 font-mono text-sm min-h-[80px]"
                  autoFocus
                  onKeyDown={(e)=>{
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitEntry();
                      }
                  }}
                  placeholder={
                    mode === 'vent' 
                      ? "Express yourself freely. This is a safe space."
                      : mode === 'journal'
                        ? "Write about your day, thoughts, or feelings..."
                        : "Type your entry. Press Enter to send, Shift+Enter for newline."
                  }
                />
              </div>
              <button
                onClick={submitEntry}
                className="px-4 py-3 rounded-2xl border border-white/20 bg-white/10 hover:bg-white/20 transition"
              >
                Send
              </button>
            </div>
            <div className="text-xs opacity-60 mt-2">Entries are stored locally in your browser. Persona adapts with every note.</div>
          </div>
        </footer>
      </main>
    </div>
  );
}
