import { useState, useRef, useEffect } from 'react'

import LoginOverlay from './components/LoginOverlay'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import VideoPlayer from './components/VideoPlayer'
import SearchGrid from './components/SearchGrid'
import TargetCursor from './components/TargetCursor'

import useJamSocket from './hooks/useJamSocket'
import useQueue from './hooks/useQueue'

const getInitialJamId = () => {
  const urlJam = new URLSearchParams(window.location.search).get('jam')
  if (urlJam) return urlJam

  let localJam = localStorage.getItem('jam_bo_local_id')
  if (!localJam) {
    localJam = `local_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('jam_bo_local_id', localJam)
  }
  return localJam
}

function App() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [queue, setQueue] = useState([])
  const videoRef = useRef(null)

  const [isLoggedIn, setIsLoggedIn] = useState(
    localStorage.getItem("jam_bo_session") === "true" && localStorage.getItem("jam_bo_token") !== null
  )
  const [sessionUser, setSessionUser] = useState(localStorage.getItem("jam_bo_user") || "")
  const [isKicked, setIsKicked] = useState(false)

  const [jamId, setJamId] = useState(getInitialJamId())
  const [chatMessages, setChatMessages] = useState([])

  const getRoomId = () => jamId || `solo_${sessionUser}`

  const handleForceLogout = () => {
    setIsLoggedIn(false)
    setSessionUser("")
    localStorage.removeItem("jam_bo_session")
    localStorage.removeItem("jam_bo_user")
    localStorage.removeItem("jam_bo_token")
  }

  const jam = useJamSocket({
    jamId,
    sessionUser,
    isLoggedIn,
    videoRef,
    currentTrack,
    isPlaying,
    loading: false,
    onSetIsPlaying: setIsPlaying,
    onSetCurrentTime: setCurrentTime,
    onSetCurrentTrack: setCurrentTrack,
    onSetQueue: setQueue,
    onSetLoading: () => { },
    onSetIsKicked: setIsKicked,
    onSetChatMessages: setChatMessages,
    onForceLogout: handleForceLogout,
  })

  const queueActions = useQueue({
    getRoomId,
    emitJamAction: jam.emitJamAction,
    onSetCurrentTrack: setCurrentTrack,
    onSetIsPlaying: setIsPlaying,
    onSetQueue: setQueue,
    videoRef,
  })

  useEffect(() => {
    jam.playNextRef.current = queueActions.playNext
    jam.restartTrackRef.current = queueActions.restartTrack
  })

  useEffect(() => {
    if (isLoggedIn && sessionUser) {
      queueActions.fetchQueue()
    }
  }, [isLoggedIn, sessionUser])

  const handleMetadataLoaded = () => {
    if (videoRef.current) setDuration(videoRef.current.duration)
    jam.handleMetadataLoaded()
  }

  const handleSeek = (time) => {
    if (videoRef.current) videoRef.current.currentTime = time
    setCurrentTime(time)
    jam.sendRaw({ type: 'SEEK', value: time })
  }

  const sendChat = (text) => {
    const msg = { type: 'CHAT', user: sessionUser, text, ts: Date.now() }
    jam.sendRaw(msg)
    setChatMessages(prev => [...prev, { user: sessionUser, text, ts: msg.ts }])
  }

  const startJam = () => {
    const newId = Math.random().toString(36).substring(7)
    setJamId(newId)
    window.history.pushState({}, '', `${window.location.origin}${window.location.pathname}?jam=${newId}`)
  }

  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?jam=${jamId}`)
    alert("Invite link copied to clipboard!")
  }

  const handleLogin = (username) => {
    setIsLoggedIn(true)
    setSessionUser(username)
  }

  if (isKicked || !isLoggedIn) {
    return (
      <>
        <TargetCursor targetSelector="button, input, a, .cursor-target, .video-card, .play-toggle" />
        <LoginOverlay
          isKicked={isKicked}
          onLogin={handleLogin}
          onReconnect={() => window.location.reload()}
        />
      </>
    )
  }

  return (
    <>
      <TargetCursor targetSelector="button, input, a, .cursor-target, .video-card, .play-toggle" />
      <div className="app-layout">
        <Sidebar
          sessionUser={sessionUser}
          jamConnected={jam.jamConnected}
          jamId={jamId}
          queue={queue}
          onStartJam={startJam}
          onCopyInvite={copyInvite}
          onLogout={handleForceLogout}
          onSkipToTrack={queueActions.skipToTrack}
          onDeleteTrack={queueActions.deleteTrack}
        >
          {jamId !== 'global' && (
            <ChatPanel
              chatMessages={chatMessages}
              sessionUser={sessionUser}
              onSendChat={sendChat}
            />
          )}
        </Sidebar>

        <main className="main-content">
          <div className="premium-container">
            <VideoPlayer
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              loading={queueActions.loading}
              videoRef={videoRef}
              onTimeUpdate={() => setCurrentTime(videoRef.current.currentTime)}
              onLoadedMetadata={handleMetadataLoaded}
              onPlaying={() => { }}
              onEnded={() => queueActions.playNext(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onPlayPause={() => queueActions.handlePlayPause(isPlaying, false)}
              onRestart={queueActions.restartTrack}
              onPlayNext={queueActions.playNext}
              onSeek={handleSeek}
            />

            <SearchGrid onAddToQueue={queueActions.addToQueue} />
          </div>
        </main>
      </div>
    </>
  )
}

export default App
