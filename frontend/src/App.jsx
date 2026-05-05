import { useState, useRef, useEffect } from 'react'


import LoginOverlay from './components/LoginOverlay'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import VideoPlayer from './components/VideoPlayer'
import SearchGrid from './components/SearchGrid'
import ClickSpark from './components/ClickSpark'
import TargetCursor from './components/TargetCursor'


import useJamSocket from './hooks/useJamSocket'
import useQueue from './hooks/useQueue'

// ... (getInitialJamId unchanged)

function App() {
  // ... (states and hooks unchanged)

  if (isKicked || !isLoggedIn) {
    return (
      <>
        <TargetCursor targetSelector="button, input, a, .cursor-target" />
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
      <TargetCursor targetSelector="button, input, a, .cursor-target" />
      <ClickSpark
        sparkColor="#0a613dff"
        sparkSize={10}
        sparkRadius={15}
        sparkCount={8}
        duration={500}
      >
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

        </div >
      </ClickSpark>
    </>
  )
}

export default App

