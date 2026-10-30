"""
report.py — Generate the structured emergency report.

Uses a simple rule-based generator by default (no API key needed).
If you have an OpenAI key, set OPENAI_API_KEY in .env and the
generate_report() function will use GPT-3.5 instead.
"""

import os
import json

HAZARDS_MAP = {
    "fire":              ["Active fire", "Smoke inhalation risk", "Structural collapse risk"],
    "road accident":     ["Moving traffic", "Fuel leak possible", "Broken glass"],
    "medical emergency": ["Unconscious victim", "Possible cardiac event"],
    "physical assault":  ["Attacker may still be present", "Victim trauma"],
    "flood":             ["Rising water level", "Electrical hazard", "Debris in water"],
    "normal scene":      [],
}

SUMMARIES = {
    "fire":              "Fire detected at the scene.",
    "road accident":     "Road accident detected with possible casualties.",
    "medical emergency": "Medical emergency reported — person requires urgent care.",
    "physical assault":  "Physical assault reported — victim needs immediate assistance.",
    "flood":             "Flooding detected — immediate evacuation may be required.",
    "normal scene":      "No emergency detected in the recorded clip.",
}


def _rule_based_report(transcript, scene_descriptions, incident_type,
                        people_count, severity, language):
    return {
        "incident_type":  incident_type,
        "severity":       severity,
        "victim_count":   people_count,
        "hazards":        HAZARDS_MAP.get(incident_type, ["Unknown hazard"]),
        "summary":        (
            f"{SUMMARIES.get(incident_type, 'Emergency detected.')} "
            f"{people_count} person(s) in scene. Severity: {severity}/10. "
            f"Transcript excerpt: {transcript[:200]}"
        ),
        "scene_context":  scene_descriptions[:2],
        "language":       language,
    }


def _openai_report(transcript, scene_descriptions, incident_type,
                   people_count, severity, language):
    """Only called if OPENAI_API_KEY is set in .env"""
    import openai
    openai.api_key = os.getenv("OPENAI_API_KEY")

    prompt = f"""
You are an emergency dispatch assistant. Generate a structured emergency report as valid JSON only.

Transcript: {transcript}
Scene descriptions: {scene_descriptions}
Incident type: {incident_type}
People in scene: {people_count}
Severity (1-10): {severity}
Language code: {language}

Return ONLY a JSON object with these fields:
incident_type, severity, victim_count, hazards (list), summary, scene_context (list), language
No extra text, no markdown fences.
"""
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    raw = response.choices[0].message.content.strip()
    return json.loads(raw)


def generate_report(transcript, scene_descriptions, incident_type,
                    people_count, severity, language="en"):
    if os.getenv("OPENAI_API_KEY"):
        try:
            return _openai_report(transcript, scene_descriptions,
                                  incident_type, people_count, severity, language)
        except Exception:
            pass  # fall through to rule-based
    return _rule_based_report(transcript, scene_descriptions,
                              incident_type, people_count, severity, language)
