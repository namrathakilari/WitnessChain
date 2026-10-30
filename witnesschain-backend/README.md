# WitnessChain — Person 1 Setup Guide

## What lives where

| Location | What runs there |
|---|---|
| **Google Colab** | Whisper, BLIP, CLIP, YOLO — one `/infer` endpoint |
| **VS Code** | Full FastAPI backend — all business logic |
| **Supabase** | Shared database — community alerts table |

---

## PART A — Google Colab (GPU inference)

### 1. Open a new Colab notebook
Runtime → Change Runtime Type → **GPU (T4)**

### 2. Copy `COLAB_NOTEBOOK.py` into cells
Each `# ── CELL N` comment marks a new cell. Split the file there.

### 3. Cell 1 — uncomment and run the pip install line
Takes 3–5 minutes. Run once per session.

### 4. Cell 3 — load models
Takes 2–4 minutes first time, instant after (cached).

### 5. Cell 6 — start server
- Sign up free at [ngrok.com](https://ngrok.com) → copy your auth token
- Paste it into the `ngrok.set_auth_token(...)` line
- Run the cell
- Copy the printed URL — it looks like `https://abc123.ngrok.io`

### 6. Paste that URL into VS Code `.env` as `COLAB_INFER_URL`

> ⚠️ Every time Colab restarts, the ngrok URL changes. Rerun Cell 6 and update `.env`.

---

## PART B — VS Code Backend

### 1. Open `vscode-backend/` in VS Code

### 2. Create a virtual environment
```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Set up environment variables
```bash
cp .env.example .env
# Edit .env and fill in:
# COLAB_INFER_URL  — from Colab Cell 6
# SUPABASE_URL     — from supabase.com → Settings → API
# SUPABASE_SERVICE_KEY — service role key (not anon key)
```

### 5. Run the backend
```bash
uvicorn main:app --reload --port 8001
```

Visit `http://localhost:8001/health` — should return `{"status": "vscode-backend-running"}`.

### 6. Test without Colab (local dev)
In a separate terminal:
```bash
python mock_infer_server.py
```
Then set `COLAB_INFER_URL=http://localhost:8000` in `.env`.
This lets you test everything without needing Colab open.

---

## API Endpoints

| Method | Path | What it does |
|---|---|---|
| `POST` | `/analyze` | Main endpoint — accepts video/audio, returns full stamped report |
| `GET` | `/instructions?incident_type=fire&language=en` | Returns bystander instructions |
| `GET` | `/health` | Health check |

### POST /analyze — form fields
| Field | Type | Description |
|---|---|---|
| `file` | File | Video (.mp4) or audio (.wav) |
| `lat` | float | GPS latitude |
| `lng` | float | GPS longitude |
| `language` | string | `en` / `hi` / `te` |
| `anonymous` | bool | If true, no user ID attached |

### Response shape
```json
{
  "report": {
    "incident_type": "fire",
    "severity": 9,
    "victim_count": 3,
    "hazards": ["Active fire", "Smoke inhalation risk"],
    "summary": "Fire detected...",
    "bystander_instructions": ["Move away from the fire", "..."],
    "authority": {
      "name": "Fire Department",
      "number": "101",
      "display": "Fire Department — 101",
      "eta_range": "6–10 minutes"
    },
    "gps": { "lat": 17.385, "lng": 78.486 },
    "anonymous": false,
    "language": "en"
  },
  "timestamp": 1716556800.0,
  "hash": "a3f9c2..."
}
```

---

## Deployment (for demo day)

### Deploy VS Code backend to Railway
1. Push `vscode-backend/` to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add all `.env` variables in Railway's Variables tab
4. Railway gives you a live URL like `https://witnesschain-backend.up.railway.app`
5. Give this URL to Person 2 as the API base URL

### Supabase table setup
Run this SQL in Supabase SQL editor:
```sql
create table community_alerts (
  id           uuid default gen_random_uuid() primary key,
  incident_type text,
  severity     int,
  lat          float,
  lng          float,
  created_at   timestamp default now()
);
```

---

## File Structure
```
witnesschain-p1/
├── COLAB_NOTEBOOK.py          ← paste into Colab cells
└── vscode-backend/
    ├── main.py                ← FastAPI app entry point
    ├── severity.py            ← severity scoring logic
    ├── report.py              ← report generation (rule-based or GPT)
    ├── routing.py             ← authority + ETA mapping
    ├── supabase_client.py     ← community alert logging
    ├── mock_infer_server.py   ← fake Colab for local testing
    ├── requirements.txt
    └── .env.example           ← copy to .env and fill in
```

---

## Before the demo — checklist

- [ ] Colab tab is open and not idle
- [ ] All Colab model cells have been run
- [ ] Colab Cell 6 is running — ngrok URL is active
- [ ] VS Code `.env` has the current ngrok URL
- [ ] VS Code server is running on port 8001
- [ ] `GET /health` returns OK
- [ ] Full end-to-end test done (record video → submit → see report)
- [ ] Shared Railway/deployed URL with Person 2
