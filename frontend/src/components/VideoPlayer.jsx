import { useRef, useState } from 'react'
import { formatTime } from '../utils/formatTime'

export default function VideoPlayer({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  loading,
  videoRef,
  onTimeUpdate,
  onLoadedMetadata,
  onPlaying,
  onEnded,
  onPlay,
  onPause,
  onPlayPause,
  onRestart,
  onPlayNext,
  onSeek,
}) {
  if (!currentTrack) return null;

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      } else if (videoRef.current.msRequestFullscreen) {
        videoRef.current.msRequestFullscreen();
      }
    }
  };

  return (
    <div className="custom-player">
      <div className="player-info">
        <img src={currentTrack.thumbnail} alt="" className="player-thumb" />
        <div>
          <h3>{currentTrack.title}</h3>
          <p>Currently Playing</p>
        </div>
      </div>

      <div className="video-viewport">
        <video
          ref={videoRef}
          src={currentTrack.stream_url}
          className="main-video-element"
          onError={(e) => console.error("Video Playback Error:", e.target.error)}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onPlaying={onPlaying}
          onEnded={onEnded}
          onPlay={onPlay}
          onPause={onPause}
          autoPlay
        />
      </div>

      <div className="controls-row">
        <div className="main-controls">
          <button className="aux-control" onClick={() => onRestart(false)} title="Restart">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
          </button>

          <button className="play-toggle" onClick={() => onPlayPause(false)} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>

          <button className="aux-control" onClick={() => onPlayNext(false)} title="Skip Next">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z" /></svg>
          </button>

          <button className="aux-control" onClick={toggleFullscreen} title="Fullscreen">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
          </button>
        </div>

        <div className="progress-container">
          <span className="time-display">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="seek-bar"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
          />
          <span className="time-display">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}
