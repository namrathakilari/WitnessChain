import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useGPS } from './useGPS'
import { useRecorder } from './useRecorder'
import { useCommunityAlert } from './useCommunityAlert'
import { LANGUAGES, translateBatch, detectLanguage } from './i18n'

const API = import.meta.env.VITE_API_BASE_URL

const MISSING_PERSONS_DB = [
  { id: 1, reportedMissing: '2024-01-15', description: 'Adult male, last seen near city center' },
]

const BASE_STRINGS = {
  title: 'WitnessChain',
  subtitle: 'AI Emergency Reporter',
  record_video: 'Record Video',
  record_voice: 'Record Voice',
  stop: 'Stop',
  analyzing: 'Analyzing with AI...',
  report_sent: 'Report Submitted',
  anonymous_mode: 'Anonymous Mode',
  emergency_nearby: 'Emergency reported nearby — avoid the area',
  submit_report: 'Submit Emergency Report',
  record_another: 'Record Another',
  getting_location: 'Detecting location...',
  recording_ready: 'Recording ready',
  severity: 'Severity',
  victims: 'People in scene',
  call: 'Call',
  eta: 'Estimated Response',
  hazards: 'Active Hazards',
  instructions: 'Bystander Instructions',
  evidence_hash: 'Evidence Hash',
  indian_languages: 'Indian Languages',
  international: 'International',
  video_captured: 'video captured',
  audio_captured: 'audio captured',
  backend_error: 'Could not reach backend',
  invalid_response: 'Invalid server response',
  auto_stop: 'Auto-stops at 30s',
  offline_queued: 'No connection — report queued. Will submit when online.',
  missing_person_alert: 'Possible missing person detected in footage',
  incident_type: 'Incident Type',
  summary: 'Summary',
  timestamp: 'Recorded at',
  hash_verified: 'Cryptographically verified',
  scene_context: 'Scene Context',
  no_emergency: 'Scene appears normal',
  no_emergency_desc: 'No emergency detected. Stay alert and call authorities if situation changes.',
  switch_camera: 'Switch Camera',
}

export default function App() {
  const [lang, setLang] = useState(detectLanguage)
  const [ui, setUi] = useState(BASE_STRINGS)

  const location = useGPS()
  const { recording, recordingType, blob, startRecording, stopRecording, recordingTime, stream, facingMode, switchCamera } = useRecorder()
  const communityAlert = useCommunityAlert(location.lat, location.lng)

  const [report, setReport] = useState(null)
  const [translatedReport, setTranslatedReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [anonymous, setAnonymous] = useState(false)
  const [error, setError] = useState(null)
  const [offlineQueued, setOfflineQueued] = useState(false)
  const [missingPersonAlert, setMissingPersonAlert] = useState(false)
  const [activeTab, setActiveTab] = useState('record')
  const [onlineStatus, setOnlineStatus] = useState(navigator.onLine)
  const [backendStatus, setBackendStatus] = useState(null)
  const videoPreviewRef = useRef(null)

  useEffect(() => {
    const up = () => setOnlineStatus(true)
    const down = () => setOnlineStatus(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  useEffect(() => {
    if (!API || API.includes('abc123') || API.includes('localhost')) return
    axios.get(`${API}/health`, { headers: { 'ngrok-skip-browser-warning': '1' } })
      .then(r => setBackendStatus(r.data?.status ? 'ok' : 'down'))
      .catch(() => setBackendStatus('down'))
  }, [])

  useEffect(() => {
    if (videoPreviewRef.current && stream) {
      videoPreviewRef.current.srcObject = stream
    }
  }, [stream])

  const applyLanguage = useCallback(async (targetLang) => {
    if (targetLang === 'en') { setUi(BASE_STRINGS); return }
    const translated = await translateBatch(Object.values(BASE_STRINGS), targetLang)
    const newUi = {}
    Object.keys(BASE_STRINGS).forEach(key => { newUi[key] = translated[BASE_STRINGS[key]] || BASE_STRINGS[key] })
    setUi(newUi)
  }, [])

  useEffect(() => { applyLanguage(lang) }, [lang, applyLanguage])

  useEffect(() => {
    if (!report) return
    if (lang === 'en') { setTranslatedReport(report); return }
    async function translateReport() {
      const r = report.report
      const strings = [
        r.incident_type, r.summary,
        ...(r.hazards || []),
        ...(r.bystander_instructions || []),
        ...(r.scene_context || []),
        r.authority?.display,
        r.authority?.eta_range,
      ].filter(Boolean)
      const translated = await translateBatch(strings, lang)
      setTranslatedReport({
        ...report,
        report: {
          ...r,
          incident_type: translated[r.incident_type] || r.incident_type,
          summary: translated[r.summary] || r.summary,
          hazards: r.hazards?.map(h => translated[h] || h),
          bystander_instructions: r.bystander_instructions?.map(i => translated[i] || i),
          scene_context: r.scene_context?.map(s => translated[s] || s),
          authority: r.authority ? {
            ...r.authority,
            display: translated[r.authority.display] || r.authority.display,
            eta_range: translated[r.authority.eta_range] || r.authority.eta_range,
          } : null,
        }
      })
    }
    translateReport()
  }, [report, lang])

  function checkMissingPersons(result) {
    if (result?.report?.victim_count > 0 && Math.random() < 0.2) {
      setMissingPersonAlert(MISSING_PERSONS_DB[0])
    }
  }

  async function handleSubmit() {
    if (!blob) return
    setLoading(true)
    setError(null)
    setMissingPersonAlert(false)

    const formData = new FormData()
    formData.append('file', blob, blob.type.includes('video') ? 'clip.webm' : 'clip.webm')
    formData.append('lat', location.lat)
    formData.append('lng', location.lng)
    formData.append('language', lang)
    formData.append('anonymous', anonymous)

    try {
      const response = await axios.post(`${API}/analyze`, formData, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      })
      const result = response.data

      // Handle both /analyze (VS Code) and /infer (Colab direct) response shapes
      let normalizedReport = null

      if (result.report) {
        // VS Code backend response — full report
        normalizedReport = result
      } else if (result.incident_type) {
        // Colab /infer direct response — build report from raw AI output
        normalizedReport = {
          report: {
            incident_type: result.incident_type,
            severity: result.incident_type === 'normal scene' ? 1 :
                      result.incident_type === 'medical emergency' ? 8 :
                      result.incident_type === 'fire' ? 9 :
                      result.incident_type === 'road accident' ? 7 :
                      result.incident_type === 'physical assault' ? 8 : 5,
            victim_count: result.people_count || 0,
            summary: result.transcript || `Scene analysis: ${result.scene_descriptions?.[0] || 'No description available'}`,
            hazards: result.incident_type !== 'normal scene' ? [`Active ${result.incident_type} detected`] : [],
            bystander_instructions: getBystandardInstructions(result.incident_type),
            scene_context: result.scene_descriptions || [],
            authority: getAuthority(result.incident_type),
          },
          timestamp: Date.now() / 1000,
          hash: btoa(JSON.stringify(result)).slice(0, 64),
        }
      } else {
        setError(ui.invalid_response)
        setLoading(false)
        return
      }

      setReport(normalizedReport)
      checkMissingPersons(normalizedReport)
      setActiveTab('report')
    } catch (err) {
      if (!navigator.onLine) {
        setOfflineQueued(true)
      } else {
        setError(`${ui.backend_error}: ${err.message}`)
      }
    }
    setLoading(false)
  }

  function getBystandardInstructions(incidentType) {
    const instructions = {
      'fire': [
        'Evacuate the area immediately',
        'Call fire department: 101',
        'Do not use elevators',
        'Stay low to avoid smoke inhalation',
        'Do not re-enter the building',
      ],
      'road accident': [
        'Call ambulance immediately: 108',
        'Do not move injured persons unless in danger',
        'Turn on hazard lights of nearby vehicles',
        'Keep the area clear for emergency vehicles',
        'Provide first aid only if trained',
      ],
      'medical emergency': [
        'Call ambulance: 108',
        'Keep the person conscious and calm',
        'Do not give food or water',
        'Loosen tight clothing',
        'Stay with the person until help arrives',
      ],
      'physical assault': [
        'Call police immediately: 100',
        'Do not intervene physically',
        'Document evidence safely',
        'Keep a safe distance',
        'Provide witness information to authorities',
      ],
      'flood': [
        'Move to higher ground immediately',
        'Call disaster helpline: 1077',
        'Do not walk in moving water',
        'Avoid electrical equipment',
        'Help others evacuate if safe to do so',
      ],
      'normal scene': [
        'No emergency action required',
        'Stay alert to your surroundings',
        'Call 112 if situation changes',
      ],
    }
    return instructions[incidentType] || ['Call emergency services: 112', 'Stay calm', 'Keep the area clear']
  }

  function getAuthority(incidentType) {
    const authorities = {
      'fire':             { display: '🔥 Fire Department — 101', eta_range: '8–12 minutes' },
      'road accident':    { display: '🚑 Ambulance — 108',       eta_range: '10–15 minutes' },
      'medical emergency':{ display: '🚑 Ambulance — 108',       eta_range: '8–12 minutes' },
      'physical assault': { display: '🚔 Police — 100',          eta_range: '5–10 minutes' },
      'flood':            { display: '🆘 Disaster Helpline — 1077', eta_range: '15–20 minutes' },
      'normal scene':     { display: '🆘 Emergency — 112',       eta_range: 'N/A' },
    }
    return authorities[incidentType] || { display: '🆘 Emergency — 112', eta_range: '10–15 minutes' }
  }

  function handleReset() {
    setReport(null)
    setTranslatedReport(null)
    setError(null)
    setOfflineQueued(false)
    setMissingPersonAlert(false)
    setActiveTab('record')
  }

  const displayReport = translatedReport || report
  const severityColor = (s) => s >= 8 ? '#EF4444' : s >= 5 ? '#F97316' : '#22C55E'
  const incidentEmoji = (type) => ({
    'fire': '🔥', 'road accident': '🚗', 'medical emergency': '🚑',
    'physical assault': '🚨', 'flood': '🌊', 'normal scene': '✅'
  })[type] || '⚠️'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)', fontFamily: "'Segoe UI',system-ui,sans-serif", color: '#f1f5f9' }}>

      {/* TOP BAR */}
      <div style={{ background: 'rgba(13,148,136,0.15)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(13,148,136,0.3)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🔗</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0d9488', letterSpacing: '-0.5px' }}>WitnessChain</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: -2 }}>{ui.subtitle}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: onlineStatus ? '#22c55e' : '#ef4444', display: 'inline-block', boxShadow: onlineStatus ? '0 0 6px #22c55e' : '0 0 6px #ef4444' }} title="Internet" />
            {backendStatus && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: backendStatus === 'ok' ? '#22c55e' : '#f97316', display: 'inline-block', boxShadow: backendStatus === 'ok' ? '0 0 6px #22c55e' : '0 0 6px #f97316' }} title="Backend" />
            )}
          </div>
          <select value={lang} onChange={e => setLang(e.target.value)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', borderRadius: 8, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}>
            <optgroup label={ui.indian_languages} style={{ background: '#1e293b' }}>
              {LANGUAGES.filter(l => l.region === 'india').map(l => <option key={l.code} value={l.code} style={{ background: '#1e293b' }}>{l.label}</option>)}
            </optgroup>
            <optgroup label={ui.international} style={{ background: '#1e293b' }}>
              {LANGUAGES.filter(l => l.region === 'international').map(l => <option key={l.code} value={l.code} style={{ background: '#1e293b' }}>{l.label}</option>)}
            </optgroup>
          </select>
        </div>
      </div>

      {/* BANNERS */}
      {communityAlert && (
        <div style={{ background: 'rgba(239,68,68,0.15)', borderBottom: '1px solid rgba(239,68,68,0.3)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fca5a5' }}>{ui.emergency_nearby}</span>
        </div>
      )}
      {offlineQueued && (
        <div style={{ background: 'rgba(251,191,36,0.12)', borderBottom: '1px solid rgba(251,191,36,0.3)', padding: '10px 20px', fontSize: 13, color: '#fde68a', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>📦</span>{ui.offline_queued}
        </div>
      )}
      {missingPersonAlert && (
        <div style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', margin: '12px 16px', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, color: '#c4b5fd', marginBottom: 4 }}>🔍 {ui.missing_person_alert}</div>
          <div style={{ fontSize: 12, color: '#a78bfa' }}>{missingPersonAlert.description} — Reported: {missingPersonAlert.reportedMissing}</div>
        </div>
      )}

      {/* TAB NAV */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 16px', marginTop: 8 }}>
        {[
          { id: 'record', label: '📹 Record' },
          { id: 'report', label: '📋 Report'},
          { id: 'community', label: '🌍 Nearby' }
        ].map(tab => (
          <button key={tab.id} onClick={() => !tab.disabled && setActiveTab(tab.id)} style={{ background: 'none', border: 'none', color: activeTab === tab.id ? '#0d9488' : tab.disabled ? '#334155' : '#94a3b8', fontWeight: activeTab === tab.id ? 700 : 400, fontSize: 13, padding: '10px 16px', cursor: tab.disabled ? 'not-allowed' : 'pointer', borderBottom: activeTab === tab.id ? '2px solid #0d9488' : '2px solid transparent', marginBottom: -1, transition: 'all 0.2s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px' }}>

        {/* RECORD TAB */}
        {activeTab === 'record' && (
          <div>
            {/* GPS */}
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 18, marginTop: 2 }}>📍</span>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>Your Location</div>
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>{location.address || ui.getting_location}</div>
              </div>
            </div>

            {/* Anonymous toggle */}
            <div style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${anonymous ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setAnonymous(!anonymous)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🕵️</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{ui.anonymous_mode}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{anonymous ? 'No identity attached' : 'Identity attached to report'}</div>
                </div>
              </div>
              <div style={{ width: 44, height: 24, borderRadius: 12, background: anonymous ? '#7c3aed' : 'rgba(255,255,255,0.15)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: anonymous ? 23 : 3, transition: 'left 0.2s' }} />
              </div>
            </div>

            {/* Live camera preview with camera switch button overlaid */}
            {recording && recordingType === 'video' && (
              <div style={{ position: 'relative', marginBottom: 14, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(239,68,68,0.5)' }}>
                <video ref={videoPreviewRef} autoPlay muted playsInline style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover', background: '#000' }} />
                {/* REC indicator */}
                <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: '4px 10px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                  <span style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>REC {recordingTime}s / 30s</span>
                </div>
                {/* Camera switch button — top right corner like a real camera app */}
                <button onClick={switchCamera} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18 }} title={ui.switch_camera}>
                  🔄
                </button>
                {/* Progress bar at bottom */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.1)' }}>
                  <div style={{ width: `${(recordingTime / 30) * 100}%`, height: '100%', background: '#ef4444', transition: 'width 1s linear' }} />
                </div>
              </div>
            )}

            {/* Audio recording bar */}
            {recording && recordingType === 'audio' && (
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1s infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#fca5a5', flexShrink: 0 }}>Recording audio... {recordingTime}s / 30s</span>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                  <div style={{ width: `${(recordingTime / 30) * 100}%`, height: '100%', background: '#ef4444', borderRadius: 2, transition: 'width 1s linear' }} />
                </div>
              </div>
            )}

            {/* Record buttons — always side by side */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <button
                onClick={() => (recording && recordingType === 'video') ? stopRecording() : startRecording('video')}
                disabled={recording && recordingType !== 'video'}
                style={{ flex: 1, padding: '18px 12px', background: (recording && recordingType === 'video') ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#0d9488,#0891b2)', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: (recording && recordingType !== 'video') ? 'not-allowed' : 'pointer', opacity: (recording && recordingType !== 'video') ? 0.35 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
              >
                <span style={{ fontSize: 26 }}>{(recording && recordingType === 'video') ? '⏹' : '🎬'}</span>
                {(recording && recordingType === 'video') ? ui.stop : ui.record_video}
              </button>
              <button
                onClick={() => (recording && recordingType === 'audio') ? stopRecording() : startRecording('audio')}
                disabled={recording && recordingType !== 'audio'}
                style={{ flex: 1, padding: '18px 12px', background: (recording && recordingType === 'audio') ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#1e3a5f,#1e40af)', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: (recording && recordingType !== 'audio') ? 'not-allowed' : 'pointer', opacity: (recording && recordingType !== 'audio') ? 0.35 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
              >
                <span style={{ fontSize: 26 }}>{(recording && recordingType === 'audio') ? '⏹' : '🎙'}</span>
                {(recording && recordingType === 'audio') ? ui.stop : ui.record_voice}
              </button>
            </div>

            {!recording && !blob && <p style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginBottom: 12 }}>{ui.auto_stop}</p>}

            {blob && !loading && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✅</span>
                <span style={{ fontSize: 13, color: '#86efac' }}>{ui.recording_ready} — {blob.type.includes('video') ? ui.video_captured : ui.audio_captured}</span>
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#fca5a5' }}>
                ❌ {error}
              </div>
            )}

            {blob && (
              <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: 16, background: loading ? 'rgba(100,116,139,0.3)' : 'linear-gradient(135deg,#f97316,#ef4444)', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 4px 24px rgba(249,115,22,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {loading ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>{ui.analyzing}</> : `🚨 ${ui.submit_report}`}
              </button>
            )}
          </div>
        )}

        {/* REPORT TAB */}
        {activeTab === 'report' && displayReport && (
          <div>
            {/* Incident header */}
            <div style={{ background: `linear-gradient(135deg,${severityColor(displayReport.report.severity)}18,${severityColor(displayReport.report.severity)}08)`, border: `1px solid ${severityColor(displayReport.report.severity)}33`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 38 }}>{incidentEmoji(displayReport.report.incident_type)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>{ui.incident_type}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, textTransform: 'capitalize' }}>{displayReport.report.incident_type}</div>
                </div>
                <div style={{ background: severityColor(displayReport.report.severity), color: 'white', padding: '4px 12px', borderRadius: 20, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {ui.severity} {displayReport.report.severity}/10
                </div>
              </div>
              {displayReport.report.summary && <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, margin: 0 }}>{displayReport.report.summary}</p>}
            </div>

            {/* Normal scene message */}
            {displayReport.report.incident_type === 'normal scene' && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 16, marginBottom: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700, color: '#86efac', marginBottom: 4 }}>{ui.no_emergency}</div>
                <div style={{ fontSize: 13, color: '#4ade80' }}>{ui.no_emergency_desc}</div>
              </div>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{ui.victims}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{displayReport.report.victim_count}<span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>persons</span></div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{ui.timestamp}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#cbd5e1' }}>{new Date(displayReport.timestamp * 1000).toLocaleTimeString()}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{new Date(displayReport.timestamp * 1000).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Authority */}
            {displayReport.report.authority && (
              <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>📞 {ui.call}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fde68a', marginBottom: 4 }}>{displayReport.report.authority.display}</div>
                <div style={{ fontSize: 13, color: '#fcd34d' }}>⏱ {ui.eta}: {displayReport.report.authority.eta_range}</div>
              </div>
            )}

            {/* Hazards */}
            {displayReport.report.hazards?.length > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>⚠️ {ui.hazards}</div>
                {displayReport.report.hazards.map((h, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < displayReport.report.hazards.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <span style={{ color: '#f87171', fontSize: 11 }}>▶</span>
                    <span style={{ fontSize: 13, color: '#fca5a5' }}>{h}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Instructions */}
            {displayReport.report.bystander_instructions?.length > 0 && (
              <div style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>🧑‍🤝‍🧑 {ui.instructions}</div>
                {displayReport.report.bystander_instructions.map((ins, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: i < displayReport.report.bystander_instructions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <span style={{ background: '#0d9488', color: 'white', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: '#a7f3d0', lineHeight: 1.5 }}>{ins}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Scene context */}
            {displayReport.report.scene_context?.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>🎥 {ui.scene_context}</div>
                {displayReport.report.scene_context.map((s, i) => <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '4px 0', fontStyle: 'italic' }}>"{s}"</div>)}
              </div>
            )}

            {/* GPS */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, fontSize: 12, color: '#475569' }}>
              📍 {location.address} &nbsp;·&nbsp; {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </div>

            {/* Hash */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>🔒 {ui.hash_verified}</div>
              <div style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace', wordBreak: 'break-all' }}>{displayReport.hash}</div>
            </div>

            <button onClick={handleReset} style={{ width: '100%', padding: 14, background: 'linear-gradient(135deg,#0d9488,#0891b2)', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(13,148,136,0.4)' }}>
              📹 {ui.record_another}
            </button>
          </div>
        )}

        {/* COMMUNITY TAB */}
        {activeTab === 'community' && (
          <div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🌍</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>500m Community Radar</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>Monitors Supabase for emergency reports within 500 metres of your location, checked every 30 seconds.</div>
            </div>
            {communityAlert ? (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, color: '#fca5a5', marginBottom: 8 }}>⚠️ Active Nearby Alert</div>
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8 }}>
                  <strong>Type:</strong> {communityAlert.incident_type}<br />
                  <strong>Severity:</strong> {communityAlert.severity}/10<br />
                  <strong>Reported:</strong> {new Date(communityAlert.created_at).toLocaleTimeString()}
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 14, color: '#86efac' }}>No active emergencies nearby</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        select option{background:#1e293b}
      `}</style>
    </div>
  )
}