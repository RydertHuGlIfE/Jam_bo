import { useState, useRef, useEffect } from 'react'

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
  const [queue, setQueue] = useState([])
  const audioRef = useRef(null)

  // Fetch queue on mount
  useEffect(() => {
    fetchQueue()
  }, [])

  const fetchQueue = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/queue')
      const data = await response.json()
      setQueue(data.queue || [])
    } catch (err) {
      console.error('Failed to fetch queue:', err)
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query) return
    
    setLoading(true)
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

  const addToQueue = async (video, top = false) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/queue/add?top=${top}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: video.url,
          title: video.title,
          thumbnail: video.thumbnails[0]?.url || ''
        })
      })
      const data = await response.json()
      setQueue(data.queue || [])
      
      if (top && !isPlaying) {
        playNext()
      }
    } catch (err) {
      console.error('Failed to add to queue:', err)
    }
  }

  const playNext = async () => {
    setLoading(true)
    try {
      const response = await fetch('http://127.0.0.1:8000/queue/next')
      const data = await response.json()
      
      if (data.stream_url) {
        setStreamUrl(data.stream_url)
        setCurrentTitle(data.title)
        setIsPlaying(true)
        fetchQueue() 
      } else {
        setStreamUrl(null)
        setCurrentTitle('')
        setIsPlaying(false)
        setQueue([])
      }
    } catch (err) {
      console.error('Failed to play next:', err)
    } finally {
      setLoading(false)
    }
  }

  const skipToTrack = async (index) => {
    setLoading(true)
    try {
      const response = await fetch(`http://127.0.0.1:8000/queue/skip?index=${index}`)
      const data = await response.json()
      
      if (data.stream_url) {
        setStreamUrl(data.stream_url)
        setCurrentTitle(data.title)
        setIsPlaying(true)
        setQueue(data.queue || [])
      }
    } catch (err) {
      console.error('Failed to skip track:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    isPlaying ? audioRef.current.pause() : audioRef.current.play()
    setIsPlaying(!isPlaying)
  }

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  return (
    <div className="app-layout">
      {/* Main Content Area */}
      <main className="main-content">
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
                <p>Currently Playing</p>
              </div>
              
              <audio 
                ref={audioRef}
                src={streamUrl}
                onTimeUpdate={() => setCurrentTime(audioRef.current.currentTime)}
                onLoadedMetadata={() => setDuration(audioRef.current.duration)}
                onEnded={playNext}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                autoPlay
              />

              <div className="controls-row">
                <div className="main-controls">
                  <button className="aux-control" onClick={handleRestart} title="Restart">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
                  </button>

                  <button className="play-toggle" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M8 5v14l11-7z"/></svg>
                    )}
                  </button>

                  <button className="aux-control" onClick={playNext} title="Skip Next">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z"/></svg>
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
                    onChange={(e) => {
                      const time = Number(e.target.value)
                      audioRef.current.currentTime = time
                      setCurrentTime(time)
                    }}
                  />
                  <span className="time-display">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="player-footer">
                <a href={streamUrl} target="_blank" rel="noopener noreferrer">Direct Link</a>
              </div>
            </div>
          )}

          <div className="video-grid">
            {videos.map((video) => (
              <div key={video.id} className="video-card">
                <div className="thumbnail-container" onClick={() => addToQueue(video, true)}>
                  <img src={video.thumbnails[0]?.url} alt={video.title} />
                </div>
                <div className="video-info">
                  <div className="video-title" onClick={() => addToQueue(video, true)}>{video.title}</div>
                  <div className="video-meta">
                    {video.uploader}
                    <div className="queue-buttons">
                      <button 
                        className="btn-next"
                        onClick={(e) => { e.stopPropagation(); addToQueue(video, true); }} 
                        title="Play Next"
                      >
                        Next
                      </button>
                      <button 
                        className="btn-last"
                        onClick={(e) => { e.stopPropagation(); addToQueue(video, false); }} 
                        title="Add to Last"
                      >
                        + Queue
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <aside className="sidebar-queue">
        <div className="sidebar-header">
          <h2>Next in Queue</h2>
        </div>
        <div className="queue-list">
          {queue.length > 0 ? (
            queue.map((item, index) => (
              <div 
                key={index} 
                className="queue-item" 
                onClick={() => skipToTrack(index)}
              >
                <img src={item.thumbnail} alt="" className="queue-thumb" />
                <div className="queue-info">
                  <div className="queue-title">{item.title}</div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>Click to Skip to Here</span>
                </div>
              </div>
            ))
          ) : (
            <div className="queue-empty">Queue is empty</div>
          )}
        </div>
      </aside>
    </div>
  )
}

export default App
