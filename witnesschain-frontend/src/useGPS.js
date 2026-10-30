// src/useGPS.js
import { useState, useEffect } from 'react'

export function useGPS() {
  const [location, setLocation] = useState({ lat: 0, lng: 0, address: '' })

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const data = await res.json()
        setLocation({
          lat: latitude,
          lng: longitude,
          address: data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
        })
      } catch {
        setLocation({ lat: latitude, lng: longitude, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` })
      }
    }, () => {
      setLocation({ lat: 0, lng: 0, address: 'Location access denied' })
    })
  }, [])

  return location
}