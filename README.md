
# Dreamshell (CLI Advanced v0.2)

A terminal-style journaling companion that evolves with you, remembers, and answers like your subconscious — now with **SQLite**, **semantic recall**, and **modes**.

## What’s new
- **SQLite storage** (`data/dreamshell.db`) via `better-sqlite3`
- **Hash embeddings** (offline) + **cosine semantic recall**
- **Modes**: `reflect`, `plan`, `untangle` (choose with `--mode=`)
- Still supports OpenAI/Ollama; falls back to local voice

## Quick Start
```bash
npm install
npm run build
node dist/index.js --mode=reflect    # or --mode=plan / --mode=untangle
# optional global:
npm i -g . && dreamshell --mode=plan
```

Type your entry, then press Enter on an empty line.

## Engines (optional)
- **OpenAI**
  - `DREAMSHELL_ENGINE=openai`
  - `OPENAI_API_KEY=...`
  - `DREAMSHELL_MODEL=gpt-4o-mini` (or your model)
- **Ollama**
  - `DREAMSHELL_ENGINE=ollama`
  - `DREAMSHELL_MODEL=llama3.1`

## Internals
- `db.ts` migrates schema and persists entries, keywords, persona, and embeddings.
- `embeddings.ts` provides a 128-dim hashing embedder; replace with a real model later.
- `search.ts` ranks related notes by cosine similarity.
- `persona.ts` gently adapts trait weights from recent entries.
- `prompt.ts` describes system behavior per mode (insight + question + optional paradox).

## Roadmap
- Swap hash-embedder with sentence-transformers or OpenAI embeddings
- Threading & scene timelines
- Story seeds and motif extraction
- Export to markdown notebooks
