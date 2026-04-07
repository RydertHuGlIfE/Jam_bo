import { useState, useRef } from 'react'

function App() {
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [streamUrl, setStreamUrl] = useState(null)
  
  // Custom Player State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTitle, setCurrentTitle] = useState('')
  const audioRef = useRef(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query) return
    
    setLoading(true)
    setStreamUrl(null)
    try {
      const response = await fetch(`http://127.0.0.1:8000/search?query=${encodeURIComponent(query)}`)
      const data = await response.json()
      setVideos(data.entries || [])
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleWatch = async (url) => {
    setLoading(true)
    try {
      const response = await fetch(`http://127.0.0.1:8000/watch?url=${encodeURIComponent(url)}`)
      const data = await response.json()
      setStreamUrl(data.stream_url)
      setCurrentTitle(data.title || 'Unknown Track')
      setIsPlaying(true)
    } catch (err) {
      console.error('Watch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const handleSeek = (e) => {
    const time = Number(e.target.value)
    audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  return (
    <div className="premium-container">
      <h1>Jam_bo Audio</h1>
      
      <form className="search-form" onSubmit={handleSearch}>
        <input 
          type="text" 
          className="search-input"
          placeholder="Search for audio..." 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {streamUrl && (
        <div className="custom-player">
          <div className="player-info">
            <h3>{currentTitle}</h3>
            <p>Listening Mode Ready</p>
          </div>
          
          <audio 
            ref={audioRef}
            src={streamUrl}
            onTimeUpdate={() => setCurrentTime(audioRef.current.currentTime)}
            onLoadedMetadata={() => setDuration(audioRef.current.duration)}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            autoPlay
          />

          <div className="controls-row">
            <button className="play-toggle" onClick={togglePlay}>
              {isPlaying ? (
                <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            
            <div className="progress-container">
              <span className="time-display">{formatTime(currentTime)}</span>
              <input 
                type="range" 
                className="seek-bar"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
              />
              <span className="time-display">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="player-footer">
            <a href={streamUrl} target="_blank" rel="noopener noreferrer">Download / Direct Link</a>
          </div>
        </div>
      )}

      <div className="video-grid">
        {videos.map((video) => (
          <div key={video.id} className="video-card" onClick={() => handleWatch(video.url)}>
            <div className="thumbnail-container">
              <img src={video.thumbnails[0]?.url} alt={video.title} />
            </div>
            <div className="video-info">
              <div className="video-title">{video.title}</div>
              <div className="video-meta">
                {video.uploader}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
