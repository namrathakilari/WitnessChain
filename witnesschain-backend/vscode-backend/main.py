"""
WitnessChain — VS Code Backend (main.py)
Full FastAPI server. Calls Colab for AI inference,
does all business logic locally.
Run with:  uvicorn main:app --reload --port 8001
"""

import os
import hashlib
import json
import time

import httpx
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from severity   import compute_severity
from report     import generate_report
from routing    import get_authority
from supabase_client import log_community_alert

load_dotenv()

COLAB_INFER_URL = os.getenv("COLAB_INFER_URL", "http://localhost:8000")

app = FastAPI(title="WitnessChain Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # lock to Vercel URL in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── helpers ──────────────────────────────────────────────────────────────────

def timestamp_report(report: dict) -> dict:
    report_str = json.dumps(report, sort_keys=True)
    sha256     = hashlib.sha256(report_str.encode()).hexdigest()
    return {
        "report":     report,
        "timestamp":  time.time(),
        "hash":       sha256,
    }


# ── endpoints ────────────────────────────────────────────────────────────────

@app.post("/analyze")
async def analyze(
    file:     UploadFile = File(...),
    lat:      float      = Form(0.0),
    lng:      float      = Form(0.0),
    language: str        = Form("en"),
    anonymous: bool      = Form(False),
):
    """
    1. Forward file to Colab /infer for GPU inference.
    2. Build full structured report locally.
    3. Timestamp + hash the report.
    4. Log to Supabase community_alerts table.
    5. Return stamped report to frontend.
    """
    file_bytes = await file.read()

    # ── Step 1: call Colab inference ─────────────────────────
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{COLAB_INFER_URL}/infer",
                files={"file": (file.filename, file_bytes, file.content_type)},
                headers={"ngrok-skip-browser-warning": "1"},
         )
        raw = response.json()
    except Exception as e:
        return {"error": f"Colab inference failed: {str(e)}"}

    transcript         = raw.get("transcript", "")
    scene_descriptions = raw.get("scene_descriptions", [])
    incident_type      = raw.get("incident_type", "medical emergency")
    people_count       = raw.get("people_count", 1)

    # ── Step 2: business logic ───────────────────────────────
    severity     = compute_severity(incident_type, people_count, transcript)
    report       = generate_report(transcript, scene_descriptions,
                                   incident_type, people_count, severity, language)
    report["authority"]  = get_authority(incident_type)
    report["gps"]        = {"lat": lat, "lng": lng}
    report["anonymous"]  = anonymous

    instructions_resp = get_instructions(incident_type, language)
    report["bystander_instructions"] = instructions_resp["instructions"]

    # ── Step 3: timestamp + hash ─────────────────────────────
    stamped = timestamp_report(report)

    # ── Step 4: log to Supabase ──────────────────────────────
    await log_community_alert(incident_type, severity, lat, lng)

    return stamped


@app.get("/instructions")
def get_instructions(incident_type: str = "medical emergency", language: str = "en"):
    """Return bystander instructions for the given incident type and language."""
    instructions_map = {
        "en": {
            "fire":             ["Move away from the fire immediately", "Do not enter the building",
                                 "Call Fire Department on 101", "Help others evacuate calmly"],
            "road accident":    ["Do not move the victim", "Check for breathing",
                                 "Apply firm pressure to wounds", "Keep the victim warm and still"],
            "medical emergency":["Keep the person conscious by talking to them",
                                 "Do not give food or water", "Loosen tight clothing",
                                 "Monitor breathing until help arrives"],
            "physical assault": ["Move to a safe distance immediately",
                                 "Do not confront the attacker", "Document what you see",
                                 "Call Police on 100"],
            "flood":            ["Move to higher ground immediately",
                                 "Do not walk through moving water", "Avoid all electrical equipment",
                                 "Call Disaster Management on 112"],
        },
        "hi": {
            "fire":             ["तुरंत आग से दूर जाएं", "इमारत में प्रवेश न करें",
                                 "दमकल विभाग को 101 पर कॉल करें", "शांति से दूसरों को निकालने में मदद करें"],
            "road accident":    ["पीड़ित को न हिलाएं", "सांस की जांच करें",
                                 "घावों पर दबाव डालें", "पीड़ित को गर्म और स्थिर रखें"],
            "medical emergency":["व्यक्ति से बात करते रहें", "खाना या पानी न दें",
                                 "तंग कपड़े ढीले करें", "मदद आने तक सांस की निगरानी करें"],
            "physical assault": ["तुरंत सुरक्षित दूरी पर जाएं", "हमलावर का सामना न करें",
                                 "जो देखें उसे दर्ज करें", "पुलिस को 100 पर कॉल करें"],
            "flood":            ["तुरंत ऊंचे स्थान पर जाएं", "बहते पानी में न चलें",
                                 "बिजली के उपकरणों से दूर रहें", "आपदा प्रबंधन को 112 पर कॉल करें"],
        },
        "te": {
            "fire":             ["వెంటనే మంటల నుండి దూరంగా వెళ్ళండి", "భవనంలోకి ప్రవేశించవద్దు",
                                 "అగ్నిమాపక శాఖకు 101కి కాల్ చేయండి", "ప్రశాంతంగా ఇతరులను తరలించడంలో సహాయం చేయండి"],
            "road accident":    ["బాధితుడిని కదిలించవద్దు", "శ్వాస తనిఖీ చేయండి",
                                 "గాయాలపై ఒత్తిడి వేయండి", "బాధితుడిని వెచ్చగా మరియు స్థిరంగా ఉంచండి"],
            "medical emergency":["వ్యక్తితో మాట్లాడుతూ స్పృహలో ఉంచండి", "ఆహారం లేదా నీళ్ళు ఇవ్వవద్దు",
                                 "బిగుతైన దుస్తులు వదులు చేయండి", "సహాయం వచ్చే వరకు శ్వాస పర్యవేక్షించండి"],
            "physical assault": ["వెంటనే సురక్షిత దూరానికి వెళ్ళండి", "దాడిచేసేవారిని ఎదుర్కోవద్దు",
                                 "మీరు చూసేది నమోదు చేయండి", "పోలీసులకు 100కి కాల్ చేయండి"],
            "flood":            ["వెంటనే ఎత్తైన ప్రాంతానికి వెళ్ళండి", "ప్రవహించే నీటిలో నడవద్దు",
                                 "విద్యుత్ పరికరాల దగ్గరకు వెళ్ళవద్దు", "విపత్తు నిర్వహణకు 112కి కాల్ చేయండి"],
        },
    }

    lang_map = instructions_map.get(language, instructions_map["en"])
    return {"instructions": lang_map.get(incident_type, ["Stay calm", "Call emergency services on 112"])}


@app.get("/health")
def health():
    return {"status": "vscode-backend-running", "colab_url": COLAB_INFER_URL}
