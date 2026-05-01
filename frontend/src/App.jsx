import { useState, useRef, useEffect } from 'react'

// Components
import LoginOverlay from './components/LoginOverlay'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import VideoPlayer from './components/VideoPlayer'
import SearchGrid from './components/SearchGrid'

const API_BASE = "";

function App() {
  // Custom Player State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(false)
  const videoRef = useRef(null)

  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem("jam_bo_session") === "true" && localStorage.getItem("jam_bo_token") !== null)
  const [sessionUser, setSessionUser] = useState(localStorage.getItem("jam_bo_user") || "")
  const [isKicked, setIsKicked] = useState(false)
  const [jamConnected, setJamConnected] = useState(false)
  const wsRef = useRef(null)

  const getInitialJamId = () => {
    const urlJam = new URLSearchParams(window.location.search).get('jam');
    if (urlJam) return urlJam;
    
    // Create or retrieve a personal local session for users without invites
    let localJam = localStorage.getItem('jam_bo_local_id');
    if (!localJam) {
      localJam = `local_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('jam_bo_local_id', localJam);
    }
    return localJam;
  };

  const [jamId, setJamId] = useState(getInitialJamId())
  const [pendingSync, setPendingSync] = useState(null)
  const isInternalChange = useRef(false) // To prevent infinite loops on sync
  const lastSyncRef = useRef(0)

  // Chat state (messages live here because jam sync needs them)
  const [chatMessages, setChatMessages] = useState([])

  // ─── Jam WebSocket ───────────────────────────────────────────

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

    const token = localStorage.getItem("jam_bo_token");
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${rId}/${sessionUser}?token=${token}`;
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
        if (e.code === 4001) {
          setIsLoggedIn(false);
          setSessionUser("");
          localStorage.removeItem("jam_bo_session");
          localStorage.removeItem("jam_bo_user");
          localStorage.removeItem("jam_bo_token");
        }
      }
    };

    socket.onerror = (err) => console.error("Jam socket error", err);
  };

  const handleJamMessage = (data) => {
    console.log("Jam Inbound:", data.type, data);
    switch (data.type) {
      case 'PULSE': {
        if (!videoRef.current || isInternalChange.current) return;

        // Anti-stutter: Don't jump more than once every 2 seconds
        if (Date.now() - lastSyncRef.current < 2000) return;

        // Calculate drift from server-side timestamp
        const drift = (Date.now() / 1000) - data.last_updated;
        const authoritativeTime = data.value + drift;

        if (loading) {
          // If loading, just update the target sync destination so metadata handler uses it
          setPendingSync({ time: data.value, isPlaying: true, last_updated: data.last_updated });
          return;
        }

        const diff = Math.abs(videoRef.current.currentTime - authoritativeTime);
        // Soft sync threshold: only jump if drift > 1.2s to keep it smooth
        if (diff > 1.2 && videoRef.current.readyState >= 2) {
          isInternalChange.current = true;
          lastSyncRef.current = Date.now();
          videoRef.current.currentTime = authoritativeTime;
        }
        break;
      }
      case 'SYNC':
      case 'PLAY_PAUSE': {
        isInternalChange.current = true;
        let msgState = data.state;
        if (!msgState) {
          if (data.type === 'PLAY_PAUSE') msgState = { isPlaying: data.value, time: data.time, last_updated: data.last_updated || Date.now() / 1000 };
          if (data.type === 'SEEK') msgState = { time: data.value, last_updated: data.last_updated || Date.now() / 1000 };
        }
        const incomingTrack = data.track || msgState?.track;
        if (data.queue) setQueue(data.queue);

        // Drift calculation logic
        const getAdjustedTime = (state) => {
          let t = state?.time || 0;
          if (state?.isPlaying && state?.last_updated) {
            t += (Date.now() / 1000) - state.last_updated;
          }
          return t;
        };

        if (incomingTrack && currentTrack && incomingTrack.url === currentTrack.url) {
          const adjustedTime = getAdjustedTime(msgState);
          const timeDiff = Math.abs((videoRef.current?.currentTime || 0) - adjustedTime);

          if (msgState?.time !== undefined && timeDiff > 1.5) {
            if (videoRef.current?.readyState >= 2) {
              videoRef.current.currentTime = adjustedTime;
            } else {
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
        setChatMessages(prev => [...prev, {
          user: data.user,
          text: data.text,
          isSystem: data.isSystem,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);

        // NEW: When someone joins, wait 3s then send a sync pulse to help them lock in
        if (data.isSystem && data.text.includes('joined')) {
          setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) {
              emitJamAction('PULSE', { time: videoRef.current.currentTime });
            }
          }, 3000);
        }
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

  // ─── Chat ────────────────────────────────────────────────────

  const sendChat = (text) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg = { type: 'CHAT', user: sessionUser, text, ts: Date.now() };
    wsRef.current.send(JSON.stringify(msg));
    setChatMessages(prev => [...prev, { user: sessionUser, text, ts: msg.ts }]);
  };

  // ─── Jam Actions ─────────────────────────────────────────────

  const getRoomId = () => jamId || `solo_${sessionUser}`;

  // Keep-alive heartbeat (Server now handles sync pulses every 1s)
  useEffect(() => {
    if (isPlaying && jamConnected && !isInternalChange.current) {
      const interval = setInterval(() => {
        emitJamAction('KEEPALIVE_PULSE', { time: videoRef.current?.currentTime || 0 });
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isPlaying, jamConnected]);

  // Handle initial sync once metadata is ready
  const handleMetadataLoaded = () => {
    setDuration(videoRef.current.duration);
    if (pendingSync && currentTrack) {
      console.log("Applying metadata-aware sync:", pendingSync);
      applyGlobalSync(pendingSync);
    }
  };

  const onVideoPlaying = () => {
    // Snap to server time when video actually starts moving to eliminate "extraction gap"
    setLoading(false);
    if (jamConnected && !isInternalChange.current) {
      // Periodic pulses will keep us in sync, but onPlaying ensures we snap immediately
      console.log("Video started - playback confirmed");
    }
  };

  const applyGlobalSync = (state) => {
    if (!videoRef.current) return;
    isInternalChange.current = true;

    let adjustedTime = state.time || 0;
    if (state.isPlaying && state.last_updated) {
      adjustedTime += (Date.now() / 1000) - state.last_updated;
    }

    if (state.time !== undefined) {
      videoRef.current.currentTime = adjustedTime;
    }
    if (state.isPlaying) {
      videoRef.current.play().catch(() => {
        setIsPlaying(false);
        console.log("Autoplay blocked - click play to join the jam");
      });
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    setPendingSync(null);
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

  // ─── Queue & Playback ───────────────────────────────────────

  const fetchQueue = async () => {
    try {
      const response = await fetch(`${API_BASE}/queue?jam_id=${getRoomId()}`)
      const data = await response.json()
      setQueue(data.queue || [])
    } catch (err) {
      console.error('Failed to fetch queue:', err)
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

  const handleSeek = (time) => {
    if (videoRef.current) videoRef.current.currentTime = time;
    setCurrentTime(time);
    // Always send directly — user-initiated, bypass isInternalChange guard
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SEEK', value: time }));
    }
  };

  // ─── Auth ────────────────────────────────────────────────────

  const handleLogin = (username, token) => {
    setIsLoggedIn(true)
    setSessionUser(username)
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setSessionUser("")
    localStorage.removeItem("jam_bo_session")
    localStorage.removeItem("jam_bo_user")
    localStorage.removeItem("jam_bo_token")
  }

  // ─── Render ──────────────────────────────────────────────────

  if (isKicked || !isLoggedIn) {
    return (
      <LoginOverlay
        isKicked={isKicked}
        onLogin={handleLogin}
        onReconnect={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="app-layout">
      <Sidebar
        sessionUser={sessionUser}
        jamConnected={jamConnected}
        jamId={jamId}
        queue={queue}
        onStartJam={startJam}
        onCopyInvite={copyInvite}
        onLogout={handleLogout}
        onSkipToTrack={skipToTrack}
        onDeleteTrack={deleteTrack}
      >
        {/* Chat Panel - only show in active jam */}
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
            loading={loading}
            videoRef={videoRef}
            onTimeUpdate={() => setCurrentTime(videoRef.current.currentTime)}
            onLoadedMetadata={handleMetadataLoaded}
            onPlaying={onVideoPlaying}
            onEnded={() => playNext(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onPlayPause={handlePlayPause}
            onRestart={restartTrack}
            onPlayNext={playNext}
            onSeek={handleSeek}
          />

          <SearchGrid onAddToQueue={addToQueue} />
        </div>
      </main>
    </div>
  )
}

export default App
