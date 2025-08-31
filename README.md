# Dreamshell — Terminal-Style AI Journaling

Dreamshell is a terminal-born journaling companion that acts as your evolving subconscious.  
It blends poetry, logic, and curiosity to respond to your entries, remember past ones, and adapt its personality over time.


You can ask deep questions, log your thoughts, or explore philosophical ideas — and Dreamshell will reply in one of three modes:

- **reflect** → introspection & insight  
- **plan** → short-term actionable steps  
- **untangle** → breaking down complex ideas  

---

## Features

- **Persona Memory** — Dreamshell evolves based on your last few entries.  
- **Keyword Linking** — If a past entry relates to the current one, Dreamshell will “echo” it back.  
- **Multiple Modes** — Choose `reflect`, `plan`, or `untangle` to shape the AI’s tone.  
- **PostgreSQL Storage** — All entries & persona traits are stored locally or in the cloud.  
- **Optional LLM Integration** — Use OpenAI’s API for more nuanced replies.  

---

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/dreamshell.git
cd dreamshell
```
### 2. Install dependencies

#### For the backend:
```bash
cd backend
npm install
```

#### For the frontend:
```bash
cd frontend
npm install
```

---

## Environment Variables

Create a `.env` file in the `backend` folder:
```env
DATABASE_URL=postgresql://user:password@host:port/database
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

---

## Database Setup

Dreamshell will auto-create tables on first run:

- **persona** — Stores AI personality traits.
- **entries** — Stores your journal entries.

You need a PostgreSQL instance. You can use:

- Local Postgres installation
- Free Supabase database
- Railway.app or Render.com Postgres

---

## Running the App

### Backend
```bash
cd backend
npm run dev
```
Backend runs at: `http://localhost:3000`

### Frontend
```bash
cd frontend
npm run dev
```
Frontend runs at: `http://localhost:5173` (Vite default)

---

## Using Dreamshell

### 1. Add an Entry

- Type your thought/question into the entry box.
- Select mode:
  - **reflect** → emotional insight
  - **plan** → micro-action plan
  - **untangle** → break down assumptions
- Click Send.

Dreamshell will:
- Save your entry
- Find a related past note (if any)
- Reply in your chosen style

# MVP
User system
Register, login, JWT auth, forgot/reset password → ✔ secure baseline.

Database
PostgreSQL (Neon) integrated, schema for users, persona, entries.

AI-powered journaling
Streaming LLM replies with modes (reflect, plan, untangle).

Frontend
Clean login/signup UI, terminal-style journaling interface.

Security basics
JWT + token storage + protected routes.