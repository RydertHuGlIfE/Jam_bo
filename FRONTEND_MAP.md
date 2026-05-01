# Jam_bo Frontend — Detailed File & Function Map

> Pura frontend ka detailed breakdown — kaunsa code kahan hai, kya karta hai, aur kyun karta hai.

---

## Directory Structure

```
frontend/src/
├── App.jsx                      ← Main orchestrator (sab ko jodta hai)
├── main.jsx                     ← Entry point (React DOM render)
├── index.css                    ← All styles
├── components/
│   ├── LoginOverlay.jsx         ← Login screen + kicked screen
│   ├── Sidebar.jsx              ← Left panel (user info, queue list)
│   ├── ChatPanel.jsx            ← Jam Chat (messages, emoji, input)
│   ├── VideoPlayer.jsx          ← Video + playback controls
│   └── SearchGrid.jsx           ← Search bar + YouTube results grid
├── hooks/
│   ├── useJamSocket.js          ← WebSocket connection + sync logic
│   └── useQueue.js              ← Queue API calls + playback actions
└── utils/
    ├── crypto.js                ← SHA-256 password hashing
    └── formatTime.js            ← Time formatting (seconds → m:ss)
```

---

## App.jsx — The Boss (206 lines)

Ye file khud kuch heavy nahi karti. Bas sab hooks aur components ko wire karta hai — 
isko samjho ek controller jaisa, jo baaki sab files ko connect karta hai.

### State jo yahan rehta hai:

| State | Type | Kya hai | Kyun yahan hai |
|---|---|---|---|
| `isPlaying` | boolean | Video chal raha hai ya nahi | VideoPlayer aur useJamSocket dono ko chahiye |
| `currentTime` | number | Video ka current position (seconds) | VideoPlayer seekbar ke liye |
| `duration` | number | Video ki total length (seconds) | VideoPlayer seekbar max value |
| `currentTrack` | object/null | Abhi ka gaana `{title, url, thumbnail, stream_url}` | Player, sync, aur queue sab ko chahiye |
| `queue` | array | Upcoming tracks ki list | Sidebar queue list + useQueue API calls |
| `isLoggedIn` | boolean | User logged in hai ya nahi | Agar false → LoginOverlay dikhao |
| `sessionUser` | string | Logged-in username (e.g. "ryder") | Chat, WebSocket URL, aur Sidebar mein dikhana |
| `isKicked` | boolean | Kisi ne doosre device se login kiya | True → "Disconnected" screen dikhao |
| `jamId` | string | Current room ID | WebSocket URL mein jaata hai, e.g. `/ws/abc123/ryder` |
| `chatMessages` | array | Chat messages ki list | ChatPanel mein render hoti hai |

### Functions — Detail:

#### `getInitialJamId()`
- **Kab chalta hai:** App load hone pe, sirf ek baar
- **Logic:**
  1. URL check karo: `?jam=abc123` hai? → use `abc123`
  2. Nahi hai? → localStorage mein `jam_bo_local_id` check karo
  3. Wo bhi nahi? → Random ID banao (`local_r4nd0m`), localStorage mein save karo
- **Kyun:** Har user ko apna private room milta hai by default. Shared jam link se override hota hai

#### `handleForceLogout()`
- **Kab chalta hai:** Logout button, ya invalid token, ya kicked
- **Logic:** `isLoggedIn=false`, `sessionUser=""`, localStorage se `jam_bo_session`, `jam_bo_user`, `jam_bo_token` hatao
- **Kyun:** Poora session clean karna padta hai taaki WebSocket reconnect na kare

#### `handleMetadataLoaded()`
- **Kab chalta hai:** Video element ka `onLoadedMetadata` event fire hone pe
- **Logic:**
  1. `videoRef.current.duration` se duration set karo (seekbar ke liye)
  2. `jam.handleMetadataLoaded()` call karo — agar pending sync hai toh apply karo
- **Kyun:** Jab tak metadata nahi load hota, video ko seek nahi kar sakte. Isliye sync yahan apply hota hai

#### `handleSeek(time)`
- **Kab chalta hai:** User seekbar drag karta hai
- **Logic:**
  1. `videoRef.current.currentTime = time` — video jump karo
  2. `setCurrentTime(time)` — UI update
  3. `jam.sendRaw({type:'SEEK', value: time})` — server ko batao
- **Kyun:** Seek direct bhejte hain `sendRaw` se, `emitJamAction` nahi, kyunki user-initiated action hai aur `isInternalChange` guard bypass karna hai

#### `sendChat(text)`
- **Kab chalta hai:** User chat mein message type karke send karta hai
- **Logic:**
  1. `{type:'CHAT', user, text, ts}` object banao
  2. WebSocket se bhejo (`jam.sendRaw`)
  3. Local `chatMessages` mein bhi add karo (taaki apna message turant dikhe, server ka wait na kare)
- **Kyun:** Optimistic update — apna message instantly dikhta hai, doosron ka server se aata hai

#### `startJam()`
- **Kab chalta hai:** "Start Jam" button click
- **Logic:**
  1. Random 6-char ID banao (e.g. `pc7fuq`)
  2. `setJamId(newId)` — WebSocket naye room se connect hoga (useEffect trigger)
  3. URL update karo: `?jam=pc7fuq` — browser address bar mein dikhe
- **Kyun:** Naya jam session create karna hai. URL mein jam ID daalne se share karna easy ho jaata hai

#### `copyInvite()`
- **Kab chalta hai:** "Copy Invite" button click
- **Logic:** `navigator.clipboard.writeText(fullUrl)` + alert
- **Kyun:** One-click sharing. Doosra banda ye link open karega → `getInitialJamId()` URL se jam ID pakad lega

#### `handleLogin(username)`
- **Kab chalta hai:** LoginOverlay se successful login ke baad callback aata hai
- **Logic:** `isLoggedIn=true`, `sessionUser=username`
- **Note:** localStorage save LoginOverlay mein already ho chuka hota hai. Yahan sirf React state update hota hai

---

## hooks/useJamSocket.js — WebSocket Brain (314 lines)

**Ye file sabse complex hai.** Poora WebSocket connection, server se aane wale messages ka handling, 
aur multi-user sync logic — sab yahan hota hai.

### Kaise kaam karta hai (high level):

```
App load → useJamSocket hook initialize
  → initSocket() → WebSocket connect: ws://host/ws/{roomId}/{user}?token=xxx
  → Server accepts → onopen fires → jamConnected = true
  → Server sends SYNC message → handleMessage() → video state set
  → Server sends PULSE every 1s → handleMessage() → time drift check → seek if needed
  → User does something → emitJamAction() → sends to server → server broadcasts to others
```

### Returns:

| Return Value | Type | Kya hai |
|---|---|---|
| `jamConnected` | boolean | WebSocket connected hai ya nahi. Sidebar mein green dot dikhata hai |
| `emitJamAction(type, value)` | function | Server ko message bhejo (with guards) |
| `sendRaw(payload)` | function | Direct JSON bhejo bina kisi guard ke |
| `handleMetadataLoaded()` | function | Pending sync apply karo jab video metadata ready ho |
| `playNextRef` | ref | App isme `playNext` function dalta hai (circular dependency fix) |
| `restartTrackRef` | ref | App isme `restartTrack` function dalta hai |

### Internal Functions — Detail:

#### `initSocket(roomId)`
- **Kab chalta hai:** `useEffect` mein — jab `isLoggedIn`, `jamId`, ya `sessionUser` change ho
- **Logic:**
  1. Purana socket band karo (agar hai)
  2. localStorage se token lo
  3. Protocol decide karo: `https:` → `wss:`, `http:` → `ws:`
  4. URL banao: `ws://host/ws/{roomId}/{username}?token={token}`
  5. `new WebSocket(url)` — connection shuru
  6. Event handlers lagao: `onopen`, `onmessage`, `onclose`, `onerror`
- **onclose special case:** Agar server `code=4001` bhejta hai → token invalid hai → force logout

#### `emitJamAction(type, value)`
- **Kab chalta hai:** Jab bhi user kuch karta hai (play, pause, seek, etc.)
- **Logic:**
  1. **Guard 1:** `isInternalChange.current === true`? → SKIP (kyunki ye action server se aaya tha, wapas bhejne ka koi matlab nahi → infinite loop prevention)
  2. **Guard 2:** Socket OPEN hai? → Haan toh bhejo
  3. Payload banao: `{type, ...value}` ya `{type, value}`
- **Kyun guards:** Bina guards ke: User A plays → Server tells B → B plays → B emits PLAY → Server tells A → A plays → ... (infinite loop)

#### `sendRaw(payload)`
- **Difference from emitJamAction:** No `isInternalChange` guard. Sirf socket OPEN check.
- **Kab use hota hai:** SEEK (user-initiated, bypass chahiye), CHAT messages

#### `applyGlobalSync(state)`
- **Kab chalta hai:** Jab room join karo ya metadata load ho aur pending sync ho
- **Logic:**
  1. **Drift calculation:** Server ne `last_updated` timestamp bheja → current time - last_updated = drift → adjusted time = state.time + drift
  2. `videoRef.current.currentTime = adjustedTime` — seek to correct position
  3. `state.isPlaying === true`? → `video.play()` (catch error for autoplay block)
  4. `pendingSync = null` — applied, ab zaroorat nahi
- **Kyun drift calculation:** Server says "time=30s, updated 2s ago" → actual time = 32s. Bina drift ke sab 2s peeche hote

#### `handleMetadataLoaded()`
- **Logic:** Agar `pendingSync` hai aur `currentTrack` bhi hai → `applyGlobalSync(pendingSync)`
- **Kyun:** Video element ko `currentTime` set karne ke liye metadata loaded hona zaroori hai. Pehle set karoge toh kuch nahi hoga

### handleMessage(data) — Message Router:

Ye function sabse important hai. Server se aane wale har message ka type check karke appropriate action leta hai.

#### `PULSE` — Server Heartbeat (har 1 second)
- Server har 1s pe current time bhejta hai
- **Anti-stutter:** Agar last sync 2s se kam pehle hua → ignore karo (nahi toh video stutter karega)
- **Drift:** `authoritativeTime = data.value + (now - data.last_updated)`
- **Threshold:** Agar local time aur server time mein `> 1.2s` ka fark hai → seek. Nahi toh ignore (smooth rehne do)
- **Loading state:** Agar video abhi load ho raha hai → pendingSync mein save karo, metadata load hone pe apply hoga

#### `SYNC` — Full State (room join pe milta hai)
- Poora room state aata hai: track info, time, isPlaying, queue
- **4 cases:**
  1. **Same track chal raha hai:** Sirf time sync karo (agar drift > 1.5s)
  2. **Naya track hai:** `setCurrentTrack()` + `pendingSync` set karo (metadata load hone pe apply hoga)
  3. **Empty room join kiya but locally kuch chal raha hai:** Apna track server ko bhejo ("host claim")
  4. **Kuch bhi nahi hai:** Bas play/pause aur time set karo

#### `PLAY_PAUSE` — Kisi ne play/pause kiya
- Same logic as SYNC but specifically for play/pause toggle
- `isInternalChange = true` set hota hai taaki local toggle wapas emit na ho

#### `TRACK_CHANGE` — Naya gaana start hua
- `setCurrentTrack(data.track)` — video src badal jaata hai
- `setCurrentTime(0)` — 0 se shuru
- `pendingSync = {isPlaying: true, time: 0}` — metadata load hone pe auto-play

#### `CHAT` — Chat message aayi
- Message `chatMessages` array mein add karo
- **Special:** Agar "joined" system message hai → 3 second baad PULSE bhejo (naye user ko sync karne ke liye)

#### `SEEK` — Kisi ne seekbar drag kiya
- `videoRef.current.currentTime = data.value` — jump karo
- `isInternalChange = true` — wapas emit mat karo

#### `QUEUE_UPDATE` — Server ne queue change kiya
- `setQueue(data.queue)` — local queue replace karo

#### `PING` — Naya user room mein aaya
- Agar locally kuch chal raha hai → apna full state (track + time + isPlaying) bhejo
- Ye naye user ko help karta hai sync hone mein

#### `KICKED` — Doosre device se login
- `isKicked = true` → disconnect screen dikhao
- `forceLogout()` → session clear

### Keep-alive Heartbeat (useEffect):
- Agar `isPlaying` aur `jamConnected` hai → har 10 second pe `KEEPALIVE_PULSE` bhejo
- **Kyun:** Server ko pata rahe ki client alive hai aur video chal raha hai. Bina iske server samjhega client disconnect ho gaya

### `isInternalChange` Ref — The Infinite Loop Killer:
- **Problem:** User A plays → emits PLAY_PAUSE → Server sends to B → B plays → B emits PLAY_PAUSE → Server sends to A → A plays → ... FOREVER
- **Solution:** Jab bhi server se message aata hai → `isInternalChange = true`. Iska matlab "ye action mera nahi hai, wapas emit mat karo"
- 300ms baad `false` ho jaata hai (state updates settle hone ke baad)

---

## hooks/useQueue.js — Queue & Playback API (137 lines)

Backend ke `/queue/*` endpoints se baat karta hai. Saare HTTP API calls yahan hain.

### Returns:

| Function | API Call | Kya karta hai |
|---|---|---|
| `loading` | — | Boolean: kuch load ho raha hai ya nahi |
| `fetchQueue()` | `GET /queue?jam_id=xxx` | Server se current queue fetch karo |
| `addToQueue(video, top)` | `POST /queue/add?top=true&jam_id=xxx` | Gaana queue mein daalo. `top=true` → sabse pehle, `false` → sabse last |
| `playNext(fromRemote)` | `GET /queue/next?jam_id=xxx` | Queue se first track nikalo, stream URL lo, play karo |
| `skipToTrack(index)` | `GET /queue/skip?index=2&jam_id=xxx` | Index 0 se index tak saare tracks skip karo, target track play karo |
| `deleteTrack(index, e)` | `GET /queue/delete?index=2&jam_id=xxx` | Queue se specific track hatao |
| `restartTrack(fromRemote)` | — | `videoRef.current.currentTime = 0` + play |
| `handlePlayPause(isPlaying)` | — | Toggle play/pause + `emitJamAction` se server ko batao |

### `addToQueue(video, top)` — Detail:
1. POST request bhejo with `{url, title, thumbnail}`
2. Response mein updated queue aati hai → `setQueue()`
3. Agar `top=true` hai → `playNext()` call karo (turant bajao)

### `playNext(fromRemote)` — Detail:
1. Agar `loading=true` → return (double-click prevention)
2. `GET /queue/next` — server queue se pehla track nikalta hai aur stream URL deta hai
3. Agar `stream_url` mila → track set karo, play karo
4. Agar `fromRemote=false` → `emitJamAction('TRACK_CHANGE')` — doosre users ko batao
5. Agar queue empty hai → `setCurrentTrack(null)`, sab reset

### `handlePlayPause(isPlaying, fromRemote)` — Detail:
- `isPlaying=true` → pause karo + emit `{type:'PLAY_PAUSE', value:false, time:currentTime}`
- `isPlaying=false` → play karo + emit `{type:'PLAY_PAUSE', value:true, time:currentTime}`
- `fromRemote=true` → emit mat karo (server se aaya hai, wapas bhejne ka koi matlab nahi)

---

## components/LoginOverlay.jsx — Login Screen (81 lines)

### Kab dikhta hai:
- `isLoggedIn === false` → Normal login form
- `isKicked === true` → "Disconnected — You have been logged in on another device" + Reconnect button

### State (local — sirf iske andar):
| State | Kya hai |
|---|---|
| `loginForm` | `{username: "", password: ""}` — form input values |
| `loginError` | Error message string, empty = no error |

### `handleLogin(e)` — Step by Step:
1. `e.preventDefault()` — page reload roko
2. `setLoginError("")` — purani error hatao
3. `sha256(loginForm.password)` — password hash karo (crypto.js se)
4. `POST /login` bhejo: `{username, password: hashedPassword}`
5. Response `success=true`? →
   - localStorage mein save: `jam_bo_session`, `jam_bo_user`, `jam_bo_token`
   - `onLogin(username)` callback → App mein `isLoggedIn=true` ho jaata hai
6. Response `success=false`? → `setLoginError(data.message)` (e.g. "Invalid password")
7. Network error? → `setLoginError("Server connection failed")`

### **Kyun password frontend pe hash hota hai:**
Network tab mein plain text password na dikhe. Server pe double hash stored hai:
`stored = SHA256(SHA256(plaintext))`. Frontend bhejta hai `SHA256(plaintext)`, server usko dobara hash karke compare karta hai.

---

## components/Sidebar.jsx — Left Panel (63 lines)

### Props (sab App se aate hain):
| Prop | Kya karta hai |
|---|---|
| `sessionUser` | Username dikhata hai (e.g. "● ryder" with green dot) |
| `jamConnected` | `true` → green dot + "●" prefix |
| `jamId` | Agar `local_*` ya `global` → "Start Jam" button. Otherwise → "Copy Invite" button |
| `queue` | Array of tracks → queue list render karo |
| `onStartJam` | "Start Jam" click → `App.startJam()` |
| `onCopyInvite` | "Copy Invite" click → `App.copyInvite()` |
| `onLogout` | "Logout" click → `App.handleForceLogout()` |
| `onSkipToTrack(index)` | Queue item click → skip to that track |
| `onDeleteTrack(index, e)` | × button click → delete from queue |
| `children` | ChatPanel component yahan render hota hai (via React children pattern) |

### Queue item structure:
```
┌──────────────────────────────┐
│ [thumb] Title of the song    │ ← click → onSkipToTrack(index)
│          Click to Skip    [×]│ ← × click → onDeleteTrack(index)
└──────────────────────────────┘
```

---

## components/ChatPanel.jsx — Jam Chat (97 lines)

### State (local):
| State | Kya hai |
|---|---|
| `chatInput` | Input field ka text |
| `chatOpen` | Chat panel open hai ya collapsed (toggle button) |
| `emojiOpen` | Emoji picker visible hai ya nahi |

### Props:
| Prop | Kyun App se aata hai |
|---|---|
| `chatMessages` | App mein rehta hai kyunki useJamSocket bhi messages add karta hai (incoming) |
| `sessionUser` | Apne messages ko alag color/style dene ke liye (right-aligned) |
| `onSendChat(text)` | App.sendChat() → WebSocket se bhejo |

### `sendChat(e)` — Step by Step:
1. Form submit prevent karo
2. `chatInput.trim()` — whitespace hatao
3. Empty hai? → return (kuch mat bhejo)
4. `onSendChat(text)` call karo → App mein jaake WebSocket se bhejta hai
5. `setChatInput('')` — input field clear karo

### Auto-behaviors:
- **Auto-scroll:** Jab `chatMessages` change ho ya `chatOpen` ho → bottom pe scroll karo (`chatEndRef.scrollIntoView`)
- **Outside click:** Emoji panel ke baahr click → emoji panel band (`mousedown` listener)

### Emoji List:
50 emojis hardcoded hain: 😅😶🥲😑🙂🙃😁😺... etc. Emoji click → `chatInput` mein append

### Message rendering:
```
┌─────────────────────────┐
│ ryder: bhai kya gaana hai │  ← normal message (left aligned)
│         fire bhai 🔥 :you │  ← your message (right aligned, chat-msg-self class)
│ ┌emoji─picker──────────┐ │
│ │😅😶🥲😑🙂🙃😁😺│ │
│ └──────────────────────┘ │
│ [😊] [Say something...] [→]│
└─────────────────────────┘
```

---

## components/VideoPlayer.jsx — Video + Controls (100 lines)

### Early return:
`if (!currentTrack) return null` — koi gaana nahi chal raha → kuch render mat karo

### Props:
| Prop | Kya hai |
|---|---|
| `currentTrack` | `{title, thumbnail, stream_url}` — video src isme hai |
| `isPlaying` | Play/pause icon toggle |
| `currentTime` / `duration` | Seekbar position aur max |
| `videoRef` | **Shared ref** — App se aata hai kyunki useJamSocket ko bhi chahiye |
| `onSeek(time)` | Seekbar drag → App.handleSeek() |
| `onPlayPause()` / `onRestart()` / `onPlayNext()` | Button clicks |
| `onTimeUpdate` / `onLoadedMetadata` / etc. | Video element events |

### `toggleFullscreen()`:
Browser-compatible fullscreen: `requestFullscreen()` → `webkitRequestFullscreen()` → `msRequestFullscreen()`

### Layout:
```
┌─────────────────────────────┐
│ [thumb] Song Title           │ ← player-info
│         Currently Playing    │
├─────────────────────────────┤
│                              │
│         VIDEO ELEMENT        │ ← <video> tag with stream_url
│                              │
├─────────────────────────────┤
│  [⏮] [⏯] [⏭] [⛶]          │ ← controls
│  0:45 ════════●══════ 3:22  │ ← seekbar
└─────────────────────────────┘
```

---

## components/SearchGrid.jsx — Search + Results (72 lines)

### State (fully local — App ko isse koi matlab nahi):
| State | Kya hai |
|---|---|
| `query` | Search input text |
| `videos` | Search results array |
| `loading` | Searching... indicator |

### Props:
| Prop | Kya hai |
|---|---|
| `onAddToQueue(video, top)` | Result click → queue mein daalo |

### `handleSearch(e)`:
1. Empty query? → return
2. `GET /search?query=encoded_text`
3. Response mein `entries` array → `setVideos()`

### Result card layout:
```
┌──────────────────────────────┐
│ ┌────────┐                    │
│ │THUMBNAIL│ ← click → addToQueue(video, true) = play next
│ └────────┘                    │
│ Song Title ← click → same    │
│ Channel Name  [Next] [+Queue] │
│                ↑        ↑     │
│           top=true  top=false │
└──────────────────────────────┘
```

---

## utils/crypto.js (7 lines)

### `sha256(message)`:
1. `TextEncoder().encode(message)` — string ko bytes mein convert
2. `crypto.subtle.digest('SHA-256', bytes)` — browser ka built-in SHA-256
3. Bytes ko hex string mein convert: `[0xab, 0xcd]` → `"abcd"`
4. Return hex hash string (64 characters)

---

## utils/formatTime.js (7 lines)

### `formatTime(seconds)`:
- `NaN` → `"0:00"`
- `125` → `"2:05"`
- `0` → `"0:00"`
- Used in VideoPlayer seekbar time display

---

## Data Flow — Step by Step Scenarios

### Scenario 1: User logs in
```
User types username + password → clicks "Enter the Jam"
  → LoginOverlay.handleLogin()
    → sha256(password) = "37a67b..."
    → POST /login {username: "ryder", password: "37a67b..."}
    → Server: sha256("37a67b...") = "25aa34..." == stored hash? YES
    → Response: {success: true, token: "abc123..."}
    → localStorage.setItem("jam_bo_token", "abc123...")
    → App.handleLogin("ryder")
      → isLoggedIn = true (triggers useEffect)
        → useJamSocket.initSocket() → WebSocket connects
        → useQueue.fetchQueue() → GET /queue
```

### Scenario 2: User searches and plays a song
```
User types "is tarah sonu nigam" → clicks Search
  → SearchGrid.handleSearch()
    → GET /search?query=is%20tarah%20sonu%20nigam
    → Results grid renders

User clicks thumbnail
  → SearchGrid → onAddToQueue(video, true)
    → App → useQueue.addToQueue(video, top=true)
      → POST /queue/add?top=true&jam_id=rc4i2g
      → useQueue.playNext()
        → GET /queue/next?jam_id=rc4i2g
        → Server: yt-dlp extracts stream URL
        → Response: {stream_url: "https://...", title: "Is Tarah...", ...}
        → setCurrentTrack(data) → VideoPlayer renders with <video src="...">
        → emitJamAction('TRACK_CHANGE', {track: data})
          → WebSocket → Server → broadcasts to all others in room
```

### Scenario 3: Second user joins via link
```
User B opens: https://jambo.app/?jam=rc4i2g
  → getInitialJamId() → returns "rc4i2g" (from URL)
  → Sees login screen → logs in as "guest"
  → WebSocket connects: /ws/rc4i2g/guest?token=xxx
  → Server sends SYNC: {track: {...}, time: 45, isPlaying: true, queue: [...]}
  → handleMessage(SYNC):
    → setCurrentTrack(track) → video element loads
    → pendingSync = {time: 45, isPlaying: true}
    → Video metadata loads → handleMetadataLoaded()
      → applyGlobalSync() → video.currentTime = 45 + drift → video.play()
  → Server sends PULSE every 1s → keeps User B in sync with User A
```

### Scenario 4: Chat message flow
```
User A types "bhai fire gaana hai 🔥" → clicks send
  → ChatPanel.sendChat()
    → onSendChat("bhai fire gaana hai 🔥")
      → App.sendChat()
        → jam.sendRaw({type:'CHAT', user:'ryder', text:'bhai fire gaana hai 🔥'})
        → setChatMessages([...prev, {user:'ryder', text:'...'}]) ← instant local update

Server receives CHAT → broadcasts to User B
  → User B: handleMessage(CHAT)
    → setChatMessages([...prev, {user:'ryder', text:'bhai fire gaana hai 🔥'}])
    → ChatPanel re-renders → auto-scrolls to bottom
```
