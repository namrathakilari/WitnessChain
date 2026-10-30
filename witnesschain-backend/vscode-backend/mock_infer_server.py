"""
mock_infer_server.py
────────────────────
Run this INSTEAD of Colab during local development / testing.
It returns fake AI results instantly so you can test all the VS Code
business logic without needing a GPU or ngrok.

Usage:
    python mock_infer_server.py
    # then in .env set: COLAB_INFER_URL=http://localhost:8000

Keep your real Colab notebook for the actual demo.
"""

import random
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="WitnessChain Mock Inference Server")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

INCIDENT_TYPES = ["fire", "road accident", "medical emergency",
                  "physical assault", "flood"]

MOCK_TRANSCRIPTS = [
    "Please help there has been an accident on the road someone is bleeding",
    "Fire fire the building is on fire help us please",
    "I need an ambulance the person is not breathing help",
    "Someone is attacking a person in the street call the police now",
    "The street is flooding water is rising please send help",
]


@app.post("/infer")
async def mock_infer(file: UploadFile = File(...)):
    """Returns randomised but realistic mock AI outputs."""
    incident = random.choice(INCIDENT_TYPES)
    idx      = INCIDENT_TYPES.index(incident)
    return {
        "transcript":          MOCK_TRANSCRIPTS[idx],
        "scene_descriptions":  [
            f"A scene showing a {incident} situation with multiple people",
            "People appear distressed and are moving quickly",
        ],
        "incident_type":       incident,
        "people_count":        random.randint(1, 6),
    }


@app.get("/ping")
def ping():
    return {"status": "mock-infer-running"}


if __name__ == "__main__":
    print("Mock inference server running on http://localhost:8000")
    print("Set COLAB_INFER_URL=http://localhost:8000 in your .env")
    uvicorn.run(app, host="0.0.0.0", port=8000)
