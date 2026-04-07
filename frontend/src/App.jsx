import { useState, useRef, useEffect } from 'react'

function App() {
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Custom Player State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [queue, setQueue] = useState([])
  const audioRef = useRef(null)

  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem("jam_bo_session") === "true")
  const [sessionUser, setSessionUser] = useState(localStorage.getItem("jam_bo_user") || "")
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginError, setLoginError] = useState("")

  // Fetch queue on mount
  useEffect(() => {
    if (isLoggedIn) fetchQueue()
  }, [isLoggedIn])

  const fetchQueue = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/queue')
      const data = await response.json()
      setQueue(data.queue || [])
    } catch (err) {
      console.error('Failed to fetch queue:', err)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError("")
    try {
      const res = await fetch(`http://127.0.0.1:8000/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsLoggedIn(true)
        setSessionUser(data.user)
        localStorage.setItem("jam_bo_session", "true")
        localStorage.setItem("jam_bo_user", data.user)
      } else {
        setLoginError(data.message)
      }
    } catch (err) {
      setLoginError("Server connection failed")
    }
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setSessionUser("")
    localStorage.removeItem("jam_bo_session")
    localStorage.removeItem("jam_bo_user")
  }

  const handleSearch = async (e) => {
    e && e.preventDefault()
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
        setCurrentTrack(data)
        setIsPlaying(true)
        setQueue(data.queue || [])
      } else {
        setCurrentTrack(null)
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
        setCurrentTrack(data)
        setIsPlaying(true)
        setQueue(data.queue || [])
      }
    } catch (err) {
      console.error('Failed to skip track:', err)
    } finally {
      setLoading(false)
    }
  }

  const deleteTrack = async (index, e) => {
    e.stopPropagation()
    try {
      const response = await fetch(`http://127.0.0.1:8000/queue/delete?index=${index}`)
      const data = await response.json()
      setQueue(data.queue || [])
    } catch (err) {
      console.error('Failed to delete track:', err)
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

  if (!isLoggedIn) {
    return (
      <div className="login-overlay">
        <div className="login-card">
          <h2>Jam_bo</h2>
          <form className="login-form" onSubmit={handleLogin}>
            <input 
              type="text" 
              placeholder="Username" 
              value={loginForm.username}
              onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
              required
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={loginForm.password}
              onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
              required
            />
            <button type="submit" className="login-btn">Enter the Jam</button>
            {loginError && <p className="login-error">{loginError}</p>}
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-layout">
      {/* Sidebar Area */}
      <aside className="sidebar-queue">
        <div className="sidebar-header">
          <h2>Jam_bo</h2>
          <div className="user-profile">
             <span>{sessionUser}</span>
             <button className="logout-link" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        
        <div className="queue-section">
          <h3>Next in Queue</h3>
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
                    <span className="queue-hint">Click to Skip</span>
                  </div>
                  <button 
                    className="btn-delete-queue" 
                    onClick={(e) => deleteTrack(index, e)}
                    title="Remove from queue"
                  >
                    &times;
                  </button>
                </div>
              ))
            ) : (
              <div className="queue-empty">Queue is empty</div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="premium-container">
          <form className="search-form" onSubmit={handleSearch}>
            <input 
              type="text" 
              className="search-input"
              placeholder="Search for vibes..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {currentTrack && (
            <div className="custom-player">
              <div className="player-info">
                 <img src={currentTrack.thumbnail} alt="" className="player-thumb" />
                 <div>
                    <h3>{currentTrack.title}</h3>
                    <p>Currently Playing</p>
                 </div>
              </div>
              
              <audio 
                ref={audioRef}
                src={currentTrack.stream_url}
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
            </div>
          )}

          <div className="video-grid">
            {videos.map((video, idx) => (
              <div key={idx} className="video-card">
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
                      >
                        Next
                      </button>
                      <button 
                        className="btn-last"
                        onClick={(e) => { e.stopPropagation(); addToQueue(video, false); }} 
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
    </div>
  )
}

export default App
