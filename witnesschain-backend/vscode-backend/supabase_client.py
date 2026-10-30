"""
supabase_client.py — Async helper to log community alerts to Supabase.
Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
(use the service role key here so VS Code backend can bypass RLS)
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")   # service role key for backend writes


async def log_community_alert(incident_type: str, severity: int, lat: float, lng: float):
    """
    Insert a row into the community_alerts table.
    Person 2's frontend reads this table to show the 500m banner.
    Silently skips if Supabase credentials are not configured.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return  # skip gracefully — works without Supabase during local dev

    url     = f"{SUPABASE_URL}/rest/v1/community_alerts"
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }
    payload = {
        "incident_type": incident_type,
        "severity":      severity,
        "lat":           lat,
        "lng":           lng,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json=payload, headers=headers)
    except Exception as e:
        print(f"[supabase] community alert log failed: {e}")
