import { useState, useRef, useEffect } from 'react'
const API_BASE = "";

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
  const videoRef = useRef(null)

  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem("jam_bo_session") === "true")
  const [sessionUser, setSessionUser] = useState(localStorage.getItem("jam_bo_user") || "")
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginError, setLoginError] = useState("")
  const [isKicked, setIsKicked] = useState(false)
  const [jamConnected, setJamConnected] = useState(false)
  const wsRef = useRef(null)
  const [jamId, setJamId] = useState(new URLSearchParams(window.location.search).get('jam') || 'global')
  const [pendingSync, setPendingSync] = useState(null)
  const isInternalChange = useRef(false) // To prevent infinite loops on sync

  // Chat state
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const chatEndRef = useRef(null)
  const emojiPanelRef = useRef(null)

  const EMOJIS = [
    '😅', '😶', '🥲', '😑', '🙂', '🙃', '😁', '😺',
    '😂', '😭', '💀', '🔥', '❤️', '😍', '🥹', '😊', '😎', '🤩',
    '🫡', '🤙', '👀', '💯', '🎵', '🎶', '🎤', '🎧', '🥳', '🤯',
    '😤', '😩', '🫠', '😴', '🤤', '👻', '💥', '✨', '🌟', '💫',
    '🍕', '🍔', '🍜', '🧃', '🧋', '🫶', '🤝', '👑', '🐐', '🚀'
  ]

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiPanelRef.current && !emojiPanelRef.current.contains(e.target)) {
        setEmojiOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch queue on mount
  useEffect(() => {
    if (isLoggedIn && sessionUser) {
      fetchQueue();
      initJamSocket(jamId);
      return () => {
        if (wsRef.current) {
          // Unbind handlers to prevent state updates on unmount
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          
          // Only close if it's already OPEN. 
          // Closing in CONNECTING state triggers the browser's "closed before established" error.
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
          }
          wsRef.current = null;
        }
      }
    }
  }, [isLoggedIn, jamId, sessionUser])

  const initJamSocket = (rId) => {
    if (wsRef.current) wsRef.current.close();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${rId}/${sessionUser}`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('Jam socket connected');
      setJamConnected(true);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleJamMessage(data);
    };

    socket.onclose = (e) => {
      if (wsRef.current === socket) {
        console.log('Jam socket disconnected', e.code);
        setJamConnected(false);
        wsRef.current = null;
      }
    };

    socket.onerror = (err) => console.error("Jam socket error", err);
  };

  const handleJamMessage = (data) => {
    console.log("Jam Inbound:", data.type, data);
    switch (data.type) {
      case 'SYNC':
      case 'PLAY_PAUSE': {
        isInternalChange.current = true;
        let msgState = data.state;
        if (!msgState) {
          if (data.type === 'PLAY_PAUSE') msgState = { isPlaying: data.value };
          if (data.type === 'SEEK') msgState = { time: data.value };
        }
        const incomingTrack = data.track || msgState?.track;
        if (data.queue) setQueue(data.queue);

        // Case 1: Same song already loaded - apply controls, defer seek if not ready
        if (incomingTrack && currentTrack && incomingTrack.url === currentTrack.url) {
          const timeDiff = Math.abs((videoRef.current?.currentTime || 0) - (msgState?.time || 0));
          if (msgState?.time !== undefined && timeDiff > 2) {
            if (videoRef.current?.readyState >= 2) {
              videoRef.current.currentTime = msgState.time;
            } else {
              // Video not ready yet, store for metadata load
              setPendingSync(msgState);
            }
          }
          if (msgState?.isPlaying !== undefined) {
            if (msgState.isPlaying) videoRef.current?.play().catch(() => setIsPlaying(false));
            else videoRef.current?.pause();
            setIsPlaying(msgState.isPlaying);
          }
          setPendingSync(null);
        }
        // Case 2: New song - set track and wait for metadata to apply sync
        else if (incomingTrack) {
          setCurrentTrack(incomingTrack);
          setPendingSync(msgState);
        }
        // Case 3: Host Claim - introduce ourselves
        else if (currentTrack) {
          console.log("Empty room joined, claiming with local track:", currentTrack.title);
          const payload = { type: 'TRACK_CHANGE', track: currentTrack };
          wsRef.current?.send(JSON.stringify(payload));
        }
        // Case 4: No track info - stateless controls
        else {
          if (msgState?.isPlaying) { videoRef.current?.play().catch(() => { }); setIsPlaying(true); }
          else { videoRef.current?.pause(); setIsPlaying(false); }
          if (msgState?.time !== undefined && videoRef.current) videoRef.current.currentTime = msgState.time;
        }
        break;
      }
      case 'RESTART':
        restartTrack(true);
        break;
      case 'NEXT_TRACK':
        playNext(true);
        break;
      case 'TRACK_CHANGE':
        isInternalChange.current = true;
        // Set the full track with stream_url so the video element src changes
        setCurrentTrack(data.track);
        setCurrentTime(0);
        // pendingSync will apply play + seek when metadata is loaded
        setPendingSync({ isPlaying: true, time: data.time || 0 });
        break;
      case 'CHAT':
        setChatMessages(prev => [...prev, { user: data.user, text: data.text, ts: data.ts }]);
        break;
      case 'SEEK':
        isInternalChange.current = true;
        if (videoRef.current) videoRef.current.currentTime = data.value;
        setCurrentTime(data.value);
        break;
      case 'QUEUE_UPDATE':
        setQueue(data.queue || []);
        break;
      case 'PING':
        if (isPlaying && currentTrack) {
          // Respond with full track state so joiner can actually play the song
          const payload = {
            type: 'SYNC',
            state: {
              track: currentTrack, // includes stream_url
              time: videoRef.current?.currentTime || 0,
              isPlaying: true
            }
          };
          wsRef.current?.send(JSON.stringify(payload));
        }
        break;
      case 'KICKED':
        setIsKicked(true);
        handleLogout();
        break;
    }
    // Guaranteed reset after state updates settle
    setTimeout(() => {
      isInternalChange.current = false;
    }, 300);
  };

  const sendChat = (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg = { type: 'CHAT', user: sessionUser, text, ts: Date.now() };
    wsRef.current.send(JSON.stringify(msg));
    setChatMessages(prev => [...prev, { user: sessionUser, text, ts: msg.ts }]);
    setChatInput('');
  };

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  const getRoomId = () => jamId || `solo_${sessionUser}`;

  // Heartbeat to keep server state fresh for new joiners
  useEffect(() => {
    if (isPlaying && jamConnected && !isInternalChange.current) {
      const interval = setInterval(() => {
        emitJamAction('PULSE', { time: videoRef.current?.currentTime || 0 });
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isPlaying, jamConnected]);

  // Handle initial sync once metadata is ready
  const handleMetadataLoaded = () => {
    setDuration(videoRef.current.duration);
    if (pendingSync && currentTrack) {
      console.log("Applying metadata-aware sync:", pendingSync);
      isInternalChange.current = true;
      if (pendingSync.time !== undefined) {
        videoRef.current.currentTime = pendingSync.time;
      }
      if (pendingSync.isPlaying) {
        videoRef.current.play().catch(() => {
          // Autoplay blocked - mark as paused so user can click play
          // The seek position is already set, so clicking play will start at the right time
          setIsPlaying(false);
          console.log("Autoplay blocked - click play to join the jam");
        });
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      setPendingSync(null);
    }
  };

  const startJam = () => {
    const newId = Math.random().toString(36).substring(7);
    setJamId(newId);
    const newUrl = `${window.location.origin}${window.location.pathname}?jam=${newId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const copyInvite = () => {
    const link = `${window.location.origin}${window.location.pathname}?jam=${jamId}`;
    navigator.clipboard.writeText(link);
    alert("Invite link copied to clipboard!");
  };

  const emitJamAction = (type, value) => {
    if (isInternalChange.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = (typeof value === 'object' && value !== null)
        ? { type, ...value }
        : { type, value };
      console.log("Jam Outbound:", type, payload);
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  const fetchQueue = async () => {
    try {
      const response = await fetch(`${API_BASE}/queue?jam_id=${getRoomId()}`)
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
      const res = await fetch(`${API_BASE}/login`, {
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
      const response = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`)
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
      const response = await fetch(`${API_BASE}/queue/add?top=${top}&jam_id=${getRoomId()}`, {
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
        playNext(false)
      }
    } catch (err) {
      console.error('Failed to add to queue:', err)
    }
  }

  const playNext = async (fromRemote = false) => {
    if (loading) return
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/queue/next?jam_id=${getRoomId()}`)
      const data = await response.json()

      if (data.stream_url) {
        setCurrentTrack(data)
        setIsPlaying(true)
        setQueue(data.queue || [])
        if (!fromRemote) emitJamAction('TRACK_CHANGE', { track: data })
      } else {
        if (!fromRemote) emitJamAction('NEXT_TRACK', {})
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

  const skipToTrack = async (index, fromRemote = false) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/queue/skip?index=${index}&jam_id=${getRoomId()}`)
      const data = await response.json()

      if (data.stream_url) {
        setCurrentTrack(data)
        setIsPlaying(true)
        setQueue(data.queue || [])
        if (!fromRemote) emitJamAction('TRACK_CHANGE', { track: data })
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
      const response = await fetch(`${API_BASE}/queue/delete?index=${index}&jam_id=${getRoomId()}`)
      const data = await response.json()
      setQueue(data.queue || [])
    } catch (err) {
      console.error('Failed to delete track:', err)
    }
  }

  const restartTrack = (fromRemote = false) => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setIsPlaying(true);
      if (!fromRemote) emitJamAction('RESTART', {});
    }
  };

  const handlePlayPause = (fromRemote = false) => {
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      if (!fromRemote) emitJamAction('PLAY_PAUSE', { value: false, time: videoRef.current.currentTime });
    } else {
      videoRef.current.play();
      setIsPlaying(true);
      if (!fromRemote) emitJamAction('PLAY_PAUSE', { value: true, time: videoRef.current.currentTime });
    }
  };

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

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  if (isKicked) {
    return (
      <div className="login-overlay">
        <div className="login-card">
          <h2 style={{ color: 'var(--accent-orange)' }}>Disconnected</h2>
          <p style={{ marginBottom: '20px' }}>You have been logged in on another device.</p>
          <button className="login-btn" onClick={() => window.location.reload()}>Reconnect</button>
        </div>
      </div>
    )
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
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
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
            <span className={jamConnected ? "jam-active" : ""}>
              {jamConnected ? "● " : ""}{sessionUser}
            </span>
            {jamId === 'global' ? (
              <button className="btn-jam-start" onClick={startJam}>Start Jam</button>
            ) : (
              <button className="btn-jam-copy" onClick={copyInvite}>Copy Invite</button>
            )}
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

        {/* Chat Panel - only show in active jam */}
        {jamId !== 'global' && (
          <div className="chat-panel">
            <button className="chat-toggle" onClick={() => setChatOpen(o => !o)}>
              💬 {chatOpen ? 'Hide Chat' : 'Jam Chat'}
              {!chatOpen && chatMessages.length > 0 && <span className="chat-badge">{chatMessages.length}</span>}
            </button>
            {chatOpen && (
              <div className="chat-body">
                <div className="chat-messages">
                  {chatMessages.length === 0 && <div className="chat-empty">No messages yet. Say hi! 👋</div>}
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`chat-msg ${m.user === sessionUser ? 'chat-msg-self' : ''}`}>
                      <span className="chat-user">{m.user}: </span>
                      <span className="chat-text">{m.text}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="chat-input-area" ref={emojiPanelRef}>
                  {emojiOpen && (
                    <div className="emoji-panel">
                      {EMOJIS.map((emoji, i) => (
                        <button
                          key={i}
                          className="emoji-btn"
                          type="button"
                          onClick={() => setChatInput(prev => prev + emoji)}
                        >{emoji}</button>
                      ))}
                    </div>
                  )}
                  <form className="chat-form" onSubmit={sendChat}>
                    <button
                      type="button"
                      className="emoji-toggle-btn"
                      onClick={() => setEmojiOpen(o => !o)}
                    >😊</button>
                    <input
                      type="text"
                      className="chat-input-field"
                      placeholder="Say something..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                    />
                    <button type="submit" className="chat-send-btn">→</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
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

              <div className="video-viewport">
                <video
                  ref={videoRef}
                  src={currentTrack.stream_url}
                  className="main-video-element"
                  onError={(e) => console.error("Video Playback Error:", e.target.error)}
                  onTimeUpdate={() => setCurrentTime(videoRef.current.currentTime)}
                  onLoadedMetadata={handleMetadataLoaded}
                  onEnded={() => playNext(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  autoPlay
                />
              </div>

              <div className="controls-row">
                <div className="main-controls">
                  <button className="aux-control" onClick={() => restartTrack(false)} title="Restart">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                  </button>

                  <button className="play-toggle" onClick={() => handlePlayPause(false)} title={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>

                  <button className="aux-control" onClick={() => playNext(false)} title="Skip Next">
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
                    onChange={(e) => {
                      const time = Number(e.target.value)
                      if (videoRef.current) videoRef.current.currentTime = time
                      setCurrentTime(time)
                      // Always send directly — user-initiated, bypass isInternalChange guard
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: 'SEEK', value: time }))
                      }
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
