import { useState, useRef, useEffect } from 'react'

export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [recordingType, setRecordingType] = useState(null)
  const [blob, setBlob] = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [stream, setStream] = useState(null)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const autoStopRef = useRef(null)

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      clearTimeout(autoStopRef.current)
    }
  }, [])

  async function startRecording(type = 'video', facingMode = 'environment') {
    setBlob(null)
    setRecordingTime(0)
    setRecordingType(type)

    const constraints = type === 'video'
      ? { video: { facingMode }, audio: true }
      : { audio: true }

    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
    setStream(mediaStream)

    const recorder = new MediaRecorder(mediaStream)
    chunksRef.current = []
    recorder.ondataavailable = e => chunksRef.current.push(e.data)
    recorder.onstop = () => {
      const b = new Blob(chunksRef.current, {
        type: type === 'video' ? 'video/webm' : 'audio/webm'
      })
      setBlob(b)
      setRecording(false)
      setRecordingType(null)
      setStream(null)
      mediaStream.getTracks().forEach(t => t.stop())
      clearInterval(timerRef.current)
    }

    mediaRef.current = recorder
    recorder.start()
    setRecording(true)
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    autoStopRef.current = setTimeout(() => stopRecording(), 30000)
  }

  function stopRecording() {
    mediaRef.current?.stop()
    clearInterval(timerRef.current)
    clearTimeout(autoStopRef.current)
  }

  return { recording, recordingType, blob, startRecording, stopRecording, recordingTime, stream }
}