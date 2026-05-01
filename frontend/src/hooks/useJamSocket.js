import { useState, useRef, useEffect } from 'react'

/**
 * useJamSocket — Manages the WebSocket connection to the Jam server.
 * Handles connecting, disconnecting, message routing, and sync logic.
 * 
 * Returns jam state + action emitters for the rest of the app.
 */
export default function useJamSocket({
  jamId,
  sessionUser,
  isLoggedIn,
  videoRef,
  // Callbacks so the hook can update App-level state
  onSetIsPlaying,
  onSetCurrentTime,
  onSetCurrentTrack,
  onSetQueue,
  onSetLoading,
  onSetIsKicked,
  onSetChatMessages,
  onForceLogout,
  // Read-only refs/values the hook needs from App
  currentTrack,
  isPlaying,
  loading,
}) {
  const wsRef = useRef(null)
  const [jamConnected, setJamConnected] = useState(false)
  const [pendingSync, setPendingSync] = useState(null)
  const isInternalChange = useRef(false)
  const lastSyncRef = useRef(0)

  // ─── Connect / Disconnect ────────────────────────────────────

  useEffect(() => {
    if (isLoggedIn && sessionUser) {
      initSocket(jamId)
      return () => {
        if (wsRef.current) {
          wsRef.current.onopen = null
          wsRef.current.onmessage = null
          wsRef.current.onerror = null
          wsRef.current.onclose = null
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close()
          }
          wsRef.current = null
        }
      }
    }
  }, [isLoggedIn, jamId, sessionUser])

  const initSocket = (rId) => {
    if (wsRef.current) wsRef.current.close()

    const token = localStorage.getItem("jam_bo_token")
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/${rId}/${sessionUser}?token=${token}`
    const socket = new WebSocket(wsUrl)
    wsRef.current = socket

    socket.onopen = () => {
      console.log('Jam socket connected')
      setJamConnected(true)
    }

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleMessage(data)
    }

    socket.onclose = (e) => {
      if (wsRef.current === socket) {
        console.log('Jam socket disconnected', e.code)
        setJamConnected(false)
        wsRef.current = null
        if (e.code === 4001) onForceLogout()
      }
    }

    socket.onerror = (err) => console.error("Jam socket error", err)
  }

  // ─── Emit (send to server) ──────────────────────────────────

  const emitJamAction = (type, value) => {
    if (isInternalChange.current) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = (typeof value === 'object' && value !== null)
        ? { type, ...value }
        : { type, value }
      console.log("Jam Outbound:", type, payload)
      wsRef.current.send(JSON.stringify(payload))
    }
  }

  const sendRaw = (payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }

  // ─── Keep-alive heartbeat ───────────────────────────────────

  useEffect(() => {
    if (isPlaying && jamConnected && !isInternalChange.current) {
      const interval = setInterval(() => {
        emitJamAction('KEEPALIVE_PULSE', { time: videoRef.current?.currentTime || 0 })
      }, 10000)
      return () => clearInterval(interval)
    }
  }, [isPlaying, jamConnected])

  // ─── Sync helpers ───────────────────────────────────────────

  const applyGlobalSync = (state) => {
    if (!videoRef.current) return
    isInternalChange.current = true

    let adjustedTime = state.time || 0
    if (state.isPlaying && state.last_updated) {
      adjustedTime += (Date.now() / 1000) - state.last_updated
    }

    if (state.time !== undefined) {
      videoRef.current.currentTime = adjustedTime
    }
    if (state.isPlaying) {
      videoRef.current.play().catch(() => {
        onSetIsPlaying(false)
        console.log("Autoplay blocked - click play to join the jam")
      })
      onSetIsPlaying(true)
    } else {
      videoRef.current.pause()
      onSetIsPlaying(false)
    }
    setPendingSync(null)
  }

  // Called by VideoPlayer when metadata loads
  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      // duration is set by the caller after this returns
      if (pendingSync && currentTrack) {
        console.log("Applying metadata-aware sync:", pendingSync)
        applyGlobalSync(pendingSync)
      }
    }
  }

  // ─── Inbound message handler ────────────────────────────────

  // These are declared as refs so the message handler always has
  // fresh references without needing to re-bind the socket.
  const playNextRef = useRef(null)
  const restartTrackRef = useRef(null)

  const handleMessage = (data) => {
    console.log("Jam Inbound:", data.type, data)
    switch (data.type) {
      case 'PULSE': {
        if (!videoRef.current || isInternalChange.current) return
        if (Date.now() - lastSyncRef.current < 2000) return

        const drift = (Date.now() / 1000) - data.last_updated
        const authoritativeTime = data.value + drift

        if (loading) {
          setPendingSync({ time: data.value, isPlaying: true, last_updated: data.last_updated })
          return
        }

        const diff = Math.abs(videoRef.current.currentTime - authoritativeTime)
        if (diff > 1.2 && videoRef.current.readyState >= 2) {
          isInternalChange.current = true
          lastSyncRef.current = Date.now()
          videoRef.current.currentTime = authoritativeTime
        }
        break
      }

      case 'SYNC':
      case 'PLAY_PAUSE': {
        isInternalChange.current = true
        let msgState = data.state
        if (!msgState) {
          if (data.type === 'PLAY_PAUSE') msgState = { isPlaying: data.value, time: data.time, last_updated: data.last_updated || Date.now() / 1000 }
          if (data.type === 'SEEK') msgState = { time: data.value, last_updated: data.last_updated || Date.now() / 1000 }
        }
        const incomingTrack = data.track || msgState?.track
        if (data.queue) onSetQueue(data.queue)

        const getAdjustedTime = (state) => {
          let t = state?.time || 0
          if (state?.isPlaying && state?.last_updated) {
            t += (Date.now() / 1000) - state.last_updated
          }
          return t
        }

        if (incomingTrack && currentTrack && incomingTrack.url === currentTrack.url) {
          const adjustedTime = getAdjustedTime(msgState)
          const timeDiff = Math.abs((videoRef.current?.currentTime || 0) - adjustedTime)

          if (msgState?.time !== undefined && timeDiff > 1.5) {
            if (videoRef.current?.readyState >= 2) {
              videoRef.current.currentTime = adjustedTime
            } else {
              setPendingSync(msgState)
            }
          }
          if (msgState?.isPlaying !== undefined) {
            if (msgState.isPlaying) videoRef.current?.play().catch(() => onSetIsPlaying(false))
            else videoRef.current?.pause()
            onSetIsPlaying(msgState.isPlaying)
          }
          setPendingSync(null)
        }
        else if (incomingTrack) {
          onSetCurrentTrack(incomingTrack)
          setPendingSync(msgState)
        }
        else if (currentTrack) {
          console.log("Empty room joined, claiming with local track:", currentTrack.title)
          sendRaw({ type: 'TRACK_CHANGE', track: currentTrack })
        }
        else {
          if (msgState?.isPlaying) { videoRef.current?.play().catch(() => { }); onSetIsPlaying(true) }
          else { videoRef.current?.pause(); onSetIsPlaying(false) }
          if (msgState?.time !== undefined && videoRef.current) videoRef.current.currentTime = msgState.time
        }
        break
      }

      case 'RESTART':
        restartTrackRef.current?.(true)
        break

      case 'NEXT_TRACK':
        playNextRef.current?.(true)
        break

      case 'TRACK_CHANGE':
        isInternalChange.current = true
        onSetCurrentTrack(data.track)
        onSetCurrentTime(0)
        setPendingSync({ isPlaying: true, time: data.time || 0 })
        break

      case 'CHAT':
        onSetChatMessages(prev => [...prev, {
          user: data.user,
          text: data.text,
          isSystem: data.isSystem,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }])
        // When someone joins, wait 3s then send a sync pulse
        if (data.isSystem && data.text.includes('joined')) {
          setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) {
              emitJamAction('PULSE', { time: videoRef.current.currentTime })
            }
          }, 3000)
        }
        break

      case 'SEEK':
        isInternalChange.current = true
        if (videoRef.current) videoRef.current.currentTime = data.value
        onSetCurrentTime(data.value)
        break

      case 'QUEUE_UPDATE':
        onSetQueue(data.queue || [])
        break

      case 'PING':
        if (isPlaying && currentTrack) {
          sendRaw({
            type: 'SYNC',
            state: {
              track: currentTrack,
              time: videoRef.current?.currentTime || 0,
              isPlaying: true
            }
          })
        }
        break

      case 'KICKED':
        onSetIsKicked(true)
        onForceLogout()
        break
    }

    // Reset internal change flag after state updates settle
    setTimeout(() => { isInternalChange.current = false }, 300)
  }

  return {
    jamConnected,
    pendingSync,
    isInternalChange,
    emitJamAction,
    sendRaw,
    handleMetadataLoaded,
    applyGlobalSync,
    // Expose refs so App can wire up playNext/restartTrack after they're defined
    playNextRef,
    restartTrackRef,
  }
}
