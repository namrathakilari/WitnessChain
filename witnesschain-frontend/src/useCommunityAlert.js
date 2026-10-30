import { useState, useEffect } from 'react'
import { supabase } from './supabase'

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function useCommunityAlert(userLat, userLng) {
  const [alert, setAlert] = useState(null)

  useEffect(() => {
    if (!userLat || !userLng) return

    async function checkAlerts() {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('community_alerts')
        .select('*')
        .gte('created_at', thirtyMinutesAgo)

      const nearby = data?.find(a => haversineDistance(userLat, userLng, a.lat, a.lng) < 500)
      if (nearby) setAlert(nearby)
    }

    checkAlerts()
    const interval = setInterval(checkAlerts, 30000)
    return () => clearInterval(interval)
  }, [userLat, userLng])

  return alert
}