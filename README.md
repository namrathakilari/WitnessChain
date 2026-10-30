# WitnessChain

**AI-assisted emergency reporting for India. Record a short clip, get a structured incident report, the right helpline number, and bystander instructions in your language.**

WitnessChain is not a replacement for 112. It is an intake layer that turns a panicked bystander's video or voice clip into clean, structured data.

> **Status: hackathon prototype.** The core pipeline works end to end. Some features are partial or mocked, and they are marked as such in [Feature status](#feature-status). Please do not use this for real emergencies. In an emergency, call **112**.

---

## The problem

When witnesses freeze, they don't know which number to call or how to describe the scene. India has 22+ official languages, and a verbal description to an operator breaks down under stress. WitnessChain lets the bystander record 5 to 30 seconds and lets the software do the describing.

## How it works

```
 React PWA (phone)                FastAPI backend               Colab GPU (via ngrok)
┌──────────────────┐  POST       ┌───────────────────┐  POST   ┌────────────────────────┐
│ record video/    │ /analyze    │ severity scoring  │ /infer  │ Whisper  → transcript  │
│ voice (≤30 s)    │───────────▶ │ report generation │───────▶ │ BLIP     → scene text  │
│ GPS + language   │             │ authority routing │         │ CLIP     → incident    │
│ anonymous toggle │ ◀───────────│ SHA-256 stamp     │ ◀───────│ YOLOv8n  → people count│
└────────┬─────────┘  report     └─────────┬─────────┘  JSON   └────────────────────────┘
         │                                 │ insert
         │ poll every 30 s                 ▼
         └────────────────────────▶  Supabase (community_alerts)
```

1. **Record.** The PWA captures a video or audio clip (auto-stops at 30 s) and the device GPS.
2. **Infer.** The backend forwards the clip to a GPU inference server running in Google Colab, exposed through ngrok. Whisper transcribes the audio. Frames are sampled every 2 s. BLIP captions up to 3 frames. CLIP does zero-shot classification of the incident type. YOLOv8n counts people.
3. **Report.** The backend computes a 1 to 10 severity score, builds the report (rule-based by default, GPT-3.5 if `OPENAI_API_KEY` is set), maps the incident to an authority and ETA range, adds bystander instructions, then hashes the report with SHA-256.
4. **Alert.** The backend logs the incident type, severity and location to Supabase. Other clients poll that table and show a banner if an alert is within 500 m.

### Incident types

`fire`, `road accident`, `medical emergency`, `physical assault`, `flood`, `normal scene`

| Incident | Authority | Number |
|---|---|---|
| Fire | Fire Department | 101 |
| Road accident | Ambulance + Police | 112 |
| Medical emergency | Ambulance | 108 |
| Physical assault | Police | 100 |
| Flood | Disaster Management | 112 |

### Severity score

`base score by incident type`, plus 1 if 3 to 4 people or plus 2 if 5 or more people, plus 1 if the transcript has 1 to 2 distress keywords or plus 2 if it has 3 or more, capped at 10. See [`severity.py`](witnesschain-person1/vscode-backend/severity.py). This is a transparent heuristic and has not been validated against real dispatch data.

---

## Feature status

| Feature | Status | Notes |
|---|---|---|
| Video and voice capture (≤30 s) | Working | `MediaRecorder`, WebM |
| Transcription | Working | Whisper `base`, runs on the Colab GPU |
| Incident classification | Working, unevaluated | CLIP zero-shot over 6 labels, majority vote of up to 3 frames. No accuracy benchmark yet |
| People count | Working, unevaluated | YOLOv8n person class, max over up to 3 frames. This is a head-count of people in frame, not a count of victims |
| Severity score | Working | Rule-based, see above |
| Authority routing and bystander instructions | Working | English, Hindi, Telugu from the backend |
| Multilingual UI and report | Working | 19 languages through the free [MyMemory](https://mymemory.translated.net/) API, with rate limits. Machine translation of safety instructions has not been reviewed by native speakers |
| GPS and reverse geocoding | Working | OpenStreetMap Nominatim |
| Evidence hash | Partial | SHA-256 of the report JSON plus a server clock time. It is **not** a signed or trusted timestamp, and it does not cover the video itself |
| Community alert (500 m) | Partial | In-app banner from polling Supabase every 30 s with client-side Haversine distance. No push notifications |
| Anonymous mode | Partial | Sets an `anonymous` flag on the report. There is no user account system, and GPS is still sent |
| Offline queue | Partial | A service worker stores failed `/analyze` requests in IndexedDB. Automatic replay is not wired up yet (nothing registers the `sync` event) |
| Responder ETA | Mocked | Fixed ranges per incident type |
| Missing-person matching | Mocked | Demo only, a single hard-coded record shown at random |
| Emotion / distress detection | Not implemented | Distress is estimated only from transcript keywords in the severity score |

## Repository layout

```
witnesschain-frontend/        React 19 + Vite PWA
  src/App.jsx                 UI: record, report and nearby tabs
  src/useRecorder.js          camera and mic capture
  src/useGPS.js               geolocation and reverse geocoding
  src/useCommunityAlert.js    Supabase polling and 500 m check
  src/i18n.js                 language list and MyMemory translation
  public/sw.js                offline queue (IndexedDB)
witnesschain-person1/
  witnesschain_v1.ipynb       Colab notebook: models and /infer server
  vscode-backend/
    main.py                   FastAPI app: /analyze, /instructions, /health
    severity.py               severity scoring
    report.py                 report generation (rule-based or GPT-3.5)
    routing.py                authority and ETA mapping
    supabase_client.py        community alert logging
    mock_infer_server.py      fake inference server for local dev
```

## Tech stack

- **Frontend:** React 19, Vite 8, Axios, Supabase JS client, service worker (PWA)
- **Backend:** FastAPI, Uvicorn, httpx
- **AI:** OpenAI Whisper (base), BLIP (`blip-image-captioning-base`), CLIP (`clip-vit-base-patch32`), YOLOv8n (Ultralytics)
- **Infra:** Google Colab (T4 GPU) with ngrok, Supabase (Postgres)

---

## Getting started

### Prerequisites

- Python 3.13 (the version the setup below was tested on) and Node 20.19+ or 22.12+ (required by Vite 8)
- A [Supabase](https://supabase.com) project (optional for local dev, because the backend skips logging if it is not configured)
- A Google account for Colab and a free [ngrok](https://ngrok.com) auth token (only for real inference)

### 1. Fastest path: run everything locally with the mock AI server

No GPU, Colab or Supabase needed.

```bash
# terminal 1: fake inference server on :8000
cd witnesschain-person1/vscode-backend
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python mock_infer_server.py

# terminal 2: backend on :8001
cd witnesschain-person1/vscode-backend && source venv/bin/activate
cp .env.example .env                                  # then set COLAB_INFER_URL=http://localhost:8000
uvicorn main:app --reload --port 8001

# terminal 3: frontend
cd witnesschain-frontend
cp .env.example .env                                  # fill in the values, see below
npm install
npm run dev
```

Check the backend: `curl localhost:8001/health` should return `{"status":"vscode-backend-running", ...}`.

The mock server returns random incident types, so use it to test the pipeline and UI and not to judge accuracy.

### 2. Real inference on Colab

1. Open `witnesschain-person1/witnesschain_v1.ipynb` in Google Colab and set **Runtime → Change runtime type → T4 GPU**.
2. Run the install and model-loading cells (the first run takes a few minutes).
3. In the server cell, replace the ngrok placeholder with **your own** token. Do not commit it.
4. Run the cell and copy the printed `https://….ngrok…` URL into `COLAB_INFER_URL` in the backend `.env`.
5. Restart the backend.

The ngrok URL changes every time the Colab session restarts, so update `.env` each time.

### Environment variables

**Backend** (`witnesschain-person1/vscode-backend/.env`)

| Variable | Purpose |
|---|---|
| `COLAB_INFER_URL` | Base URL of the inference server (ngrok URL, or `http://localhost:8000` for the mock) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase **service-role** key. Server-side only, never in the frontend |
| `OPENAI_API_KEY` | Optional. If set, GPT-3.5 writes the report. Otherwise the rule-based generator is used |

**Frontend** (`witnesschain-frontend/.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend URL, e.g. `http://localhost:8001` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon** key (public) |

The frontend creates the Supabase client at load time, so the app will not start without the two `VITE_SUPABASE_*` values. For local development you can point them at any Supabase project.

### Supabase table

Run this in the Supabase SQL editor:

```sql
create table community_alerts (
  id            uuid default gen_random_uuid() primary key,
  incident_type text,
  severity      int,
  lat           float,
  lng           float,
  created_at    timestamp default now()
);
```

The frontend reads this table with the anon key, so enable Row Level Security with a read-only policy for `anon` and write only through the backend's service key.

---

## API

### `POST /analyze`

`multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | file | Video or audio clip (WebM from the PWA) |
| `lat`, `lng` | float | GPS position (default `0.0`) |
| `language` | string | `en`, `hi` or `te` for backend instructions (default `en`) |
| `anonymous` | bool | Marks the report as anonymous |

Response:

```json
{
  "report": {
    "incident_type": "physical assault",
    "severity": 7,
    "victim_count": 2,
    "hazards": ["Attacker may still be present", "Victim trauma"],
    "summary": "Physical assault reported — victim needs immediate assistance. 2 person(s) in scene. Severity: 7/10. Transcript excerpt: …",
    "scene_context": ["A scene showing …", "…"],
    "language": "en",
    "authority": { "name": "Police", "number": "100", "display": "Police — 100", "eta_range": "5–9 minutes" },
    "gps": { "lat": 17.385, "lng": 78.486 },
    "anonymous": true,
    "bystander_instructions": ["Move to a safe distance immediately", "…"]
  },
  "timestamp": 1793343992.72,
  "hash": "460cab41…"
}
```

If the inference server is unreachable, the endpoint returns `{"error": "Colab inference failed: …"}`.

### `GET /instructions?incident_type=fire&language=hi`

Returns `{"instructions": [...]}` for the given incident type and language.

### `GET /health`

Returns `{"status": "vscode-backend-running", "colab_url": "..."}`.

---

## Known limitations

- **Colab and ngrok are a demo setup.** Sessions time out and the URL changes on restart. A production version would use a hosted inference endpoint or a queue for slow jobs.
- **No accuracy evaluation yet.** The zero-shot classifier and person counter have not been benchmarked on labelled emergency footage, and only up to 3 frames per clip are analysed.
- **Safety-critical text is machine-translated** in the UI, and the backend ships hand-written instructions for English, Hindi and Telugu only.
- **CORS is open (`*`)** and the API has no authentication or rate limiting. Lock both down before any real deployment.
- **Community alerts are readable by anyone with the anon key** and are shown to the reporter as well as to people nearby.
- **The camera-switch button in `App.jsx` is not wired up**, because `useRecorder` does not yet return `switchCamera` or `facingMode`.
- **`npm run lint` reports 5 errors** from the React Compiler lint rules (setState inside effects, `Date.now` during render). The production build succeeds.

## Roadmap

- Wire up background sync for the offline queue and replay it with the correct multipart headers
- Replace the mock ETA and missing-person demo with real integrations
- Add a labelled evaluation set for incident classification and people counting
- Sign or externally timestamp the evidence hash, and hash the original media as well
- Host inference properly and add auth, rate limiting and locked-down CORS
- Native-speaker review of safety instructions per language

