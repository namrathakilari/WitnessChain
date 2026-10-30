"""
severity.py — Compute a 1–10 severity score from AI outputs.
No GPU required. Pure Python logic.
"""

DISTRESS_KEYWORDS = [
    "help", "dying", "dead", "blood", "fire", "trapped", "crash",
    "emergency", "please", "save", "hurting", "pain", "attack",
]

BASE_SCORES = {
    "fire":              8,
    "road accident":     7,
    "medical emergency": 7,
    "physical assault":  6,
    "flood":             5,
    "normal scene":      1,
}


def compute_severity(incident_type: str, people_count: int, transcript: str) -> int:
    score = BASE_SCORES.get(incident_type, 5)

    # more victims → higher urgency
    if people_count >= 5:
        score += 2
    elif people_count >= 3:
        score += 1

    # distress words in transcript
    words_found = sum(1 for w in DISTRESS_KEYWORDS if w in transcript.lower())
    if words_found >= 3:
        score += 2
    elif words_found >= 1:
        score += 1

    return min(10, score)
