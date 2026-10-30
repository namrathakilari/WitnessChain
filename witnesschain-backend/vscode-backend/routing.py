"""
routing.py — Map incident type to the correct emergency authority.
"""

AUTHORITY_MAP = {
    "fire":              {"name": "Fire Department",        "number": "101"},
    "road accident":     {"name": "Ambulance + Police",     "number": "112"},
    "medical emergency": {"name": "Ambulance",              "number": "108"},
    "physical assault":  {"name": "Police",                 "number": "100"},
    "flood":             {"name": "Disaster Management",    "number": "112"},
    "normal scene":      {"name": "No emergency detected",  "number": None},
}

ETA_RANGES = {
    "fire":              (6, 10),
    "road accident":     (8, 12),
    "medical emergency": (7, 11),
    "physical assault":  (5, 9),
    "flood":             (10, 20),
    "normal scene":      (0, 0),
}


def get_authority(incident_type: str) -> dict:
    info    = AUTHORITY_MAP.get(incident_type, {"name": "Emergency Services", "number": "112"})
    eta_min, eta_max = ETA_RANGES.get(incident_type, (8, 15))
    return {
        "name":    info["name"],
        "number":  info["number"],
        "display": f"{info['name']} — {info['number']}" if info["number"] else info["name"],
        "eta_range": f"{eta_min}–{eta_max} minutes" if eta_max > 0 else "N/A",
    }
