from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp 
import vlc
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import os
import time
from dotenv import load_dotenv
from contextlib import asynccontextmanager

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

@asynccontextmanager
async def lifespan(app:FastAPI):
    asyncio.create_task(cacher_worker())
    yield
    

app = FastAPI(lifespan=lifespan)

try:
    auth_data = os.getenv("APP_USERS", "{}")
    if auth_data.startswith(("'","\"")) and auth_data.endswith(("'","\"")):
        auth_data = auth_data[1:-1]
    user_dict = json.loads(auth_data)
except Exception as e:
    print(f"--- FAILED TO LOAD USERS: {e} ---")
    user_dict = {}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Jammanager:
    def __init__(self): 
        self.rooms: dict[str, set[WebSocket]] = {}
        self.user_sess: dict[str, WebSocket] = {}
        # room_id -> { "isPlaying": bool, "time": float }
        self.room_states: dict[str, dict] = {}
        # room_id -> list of tracks
        self.room_queues: dict[str, list] = {}

    async def connect(self, room_id: str, username: str, ws: WebSocket):
        await ws.accept()

        if username in self.user_sess:
            try:
                await self.user_sess[username].send_json({"type": "KICKED"})
                await self.user_sess[username].close()
            except:
                pass
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
            self.room_states[room_id] = {"isPlaying": False, "time": 0, "track": None, "last_updated": time.time()}
            self.room_queues[room_id] = []
        
        await ws.send_json({
            "type": "SYNC", 
            "state": self.room_states[room_id],
            "queue": self.room_queues[room_id]
        })
        
        await self.broadcast(room_id, {"type": "PING", "user": username}, ws)
        
        self.rooms[room_id].add(ws)
        self.user_sess[username] = ws

    async def disconnect(self, room_id: str, username: str, ws: WebSocket):
        if room_id in self.rooms:
            self.rooms[room_id].discard(ws)
            if not self.rooms[room_id]:
                if room_id in self.rooms: del self.rooms[room_id]
                if room_id in self.room_states: del self.room_states[room_id]
                if room_id in self.room_queues: del self.room_queues[room_id]
                print(f"--- Jam Session {room_id} closed (all left) ---")

        if self.user_sess.get(username) == ws:
            del self.user_sess[username]

    async def broadcast_room_queue(self, room_id: str):
        queue = self.room_queues.get(room_id, [])
        await self.broadcast(room_id, {"type": "QUEUE_UPDATE", "queue": queue}, None)

    async def broadcast(self, room_id: str, message: dict, sender: WebSocket):
        for ws in list(self.rooms.get(room_id, [])):
            try:
                if ws != sender:
                    await ws.send_json(message)
            except:
                pass


#class definer
manager = Jammanager()



@app.websocket("/ws/{room_id}/{username}")
async def jam_websocket(websocket: WebSocket, room_id: str, username: str):
    await manager.connect(room_id, username, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            # Update source-of-truth state
            type = data.get("type")
            if type == "SEEK":
                manager.room_states[room_id]["time"] = data.get("value", 0)
                manager.room_states[room_id]["last_updated"] = time.time()
            elif type == "PLAY_PAUSE":
                val = data.get("value")
                is_playing = val if isinstance(val, bool) else val.get("value") if isinstance(val, dict) else False
                manager.room_states[room_id]["isPlaying"] = is_playing
                manager.room_states[room_id]["last_updated"] = time.time()
                if isinstance(val, dict) and "time" in val:
                    manager.room_states[room_id]["time"] = val["time"]
            elif type == "TRACK_CHANGE":
                manager.room_states[room_id]["track"] = data.get("track")
                manager.room_states[room_id]["time"] = 0
                manager.room_states[room_id]["isPlaying"] = True
                manager.room_states[room_id]["last_updated"] = time.time()
            elif type == "RESTART":
                manager.room_states[room_id]["time"] = 0
                manager.room_states[room_id]["isPlaying"] = True
                manager.room_states[room_id]["last_updated"] = time.time()
            elif type == "NEXT_TRACK":
                pass
            elif type == "PULSE":
                manager.room_states[room_id]["time"] = data.get("value", data.get("time", 0))
                manager.room_states[room_id]["last_updated"] = time.time()
                continue 
            elif type == "CHAT":
                pass 

            # Broadcast to others in the same room
            data["last_updated"] = manager.room_states[room_id].get("last_updated")
            await manager.broadcast(room_id, data, websocket)
    except WebSocketDisconnect:
        await manager.disconnect(room_id, username, websocket)
    except Exception:
        await manager.disconnect(room_id, username, websocket)

class LoginRequest(BaseModel):
    username: str
    password: str
        

track_queue = []

@app.post("/login")
async def login(request: LoginRequest):
    username = request.username.strip()
    password = request.password.strip()
    print(f"--- Login attempt --- User: [{username}] Password: [{password}]")
    
    if username not in user_dict:
        print(f"--- Error: User [{username}] not found in {list(user_dict.keys())}")
        return {"success": False, "message": "User not found"}
        
    stored_password = user_dict.get(username)
    if stored_password == password:
        print(f"--- Login SUCCESS for {username} ---")
        return {"success": True, "message": "Login successful", "user": username}
    else:
        print(f"--- Error: Password mismatch for {username}. Expected: [{stored_password}], Got: [{password}]")
        return {"success": False, "message": "Invalid password"}

async def cacher_worker():
    while True:
        for room_id in list(manager.room_queues.keys()):
            for track in manager.room_queues[room_id]:
                if track.get("cached_url") is None:
                    ydl_opts = {
                        'format': 'best[ext=mp4]/best',
                        'quiet': True,
                        'noplaylist': True,
                        'cookiesfrombrowser': ('chromium',) ,
                        'no_warnings': True
                    }
                    try:          
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = await asyncio.to_thread(ydl.extract_info, track['url'], download=False)
                            track["cached_url"] = info.get("url")
                            print(f"caching: {track['title']} complete (Room: {room_id})")
                    except Exception as e:
                        print(f"Error caching track in room {room_id}")
        await asyncio.sleep(1)


@app.get("/")
async def root():
    return {"message": "FastAPI is running"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}


class Track(BaseModel):
    url: str
    title: str
    thumbnail: str
    cached_url: Optional[str] = None

@app.get("/search")
async def ytsearch(query: str):
    def _search():
        with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True}) as ydl:
            return ydl.extract_info(f"ytsearch10:{query}", download=False)
    data = await asyncio.to_thread(_search)
    return data

@app.post("/queue/add")
async def add_queue(track: Track, top: bool = Query(False), jam_id: str = "global"):
    if jam_id not in manager.room_queues:
        manager.room_queues[jam_id] = []
    
    q = manager.room_queues[jam_id]
    if top:
        q.insert(0, track.model_dump())
    else:
        q.append(track.model_dump())
    
    await manager.broadcast_room_queue(jam_id)
    return {"queue": q}


@app.get("/queue")
async def get_queue(jam_id: str = "global"):
    return {"queue": manager.room_queues.get(jam_id, [])}


@app.get("/queue/delete")
async def delete_track(index: int, jam_id: str = "global"):
    q = manager.room_queues.get(jam_id, [])
    if not q or index >= len(q):
        return {"message": "Invalid index or empty queue"}
    
    del q[index]
    await manager.broadcast_room_queue(jam_id)
    return {"queue": q}

@app.get("/queue/skip")
async def skip_to_track(index: int, jam_id: str = "global"):
    if jam_id not in manager.room_queues:
        manager.room_queues[jam_id] = []
    if jam_id not in manager.room_states:
        manager.room_states[jam_id] = {"isPlaying": False, "time": 0, "track": None}
        
    q = manager.room_queues[jam_id]
    if not q or index >= len(q):
        return {"message": "Invalid index or empty queue"}
    target_track = q[index]
    
    del q[0:index+1]
    
    await manager.broadcast_room_queue(jam_id)
    
    manager.room_states[jam_id]["time"] = 0
    manager.room_states[jam_id]["isPlaying"] = True

    if target_track.get("cached_url"):
        stream_url = target_track.get("cached_url")
        manager.room_states[jam_id]["track"] = {**target_track, "stream_url": stream_url}
        # Broadcast with stream_url so all clients can play
        await manager.broadcast(jam_id, {"type": "TRACK_CHANGE", "track": {**target_track, "stream_url": stream_url}}, None)
        return {
            "stream_url": stream_url, 
            "title": target_track.get("title"),
            "thumbnail": target_track.get('thumbnail'),
            "queue": q
        }
    else:
        ydl_opts = {
            'format': 'best[ext=mp4]/best',
            'quiet': True,
            'noplaylist': True,
            'cookiesfrombrowser': ('chromium',)  ,
            'no_warnings': True
        }
        def _fetch_skip():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(target_track['url'], download=False)
        info = await asyncio.to_thread(_fetch_skip)
        stream_url = info.get("url")
        manager.room_states[jam_id]["track"] = {**target_track, "stream_url": stream_url}
        await manager.broadcast(jam_id, {"type": "TRACK_CHANGE", "track": {**target_track, "stream_url": stream_url}}, None)
        return {
            "stream_url": stream_url, 
            "title": info.get("title"),
            "thumbnail": target_track.get('thumbnail'),
            "queue": q
        }

@app.get("/queue/next")
async def next_queue(jam_id: str = "global"):
    if jam_id not in manager.room_queues:
        manager.room_queues[jam_id] = []
    if jam_id not in manager.room_states:
        manager.room_states[jam_id] = {"isPlaying": False, "time": 0, "track": None}
        
    q = manager.room_queues[jam_id]
    if not q:
        return {"message": "Queue is empty"}
    
    next_track = q.pop(0)
    await manager.broadcast_room_queue(jam_id)
    
    # Update room state
    manager.room_states[jam_id]["time"] = 0
    manager.room_states[jam_id]["isPlaying"] = True

    if next_track.get("cached_url"):
        stream_url = next_track.get("cached_url")
        manager.room_states[jam_id]["track"] = {**next_track, "stream_url": stream_url}
        await manager.broadcast(jam_id, {"type": "TRACK_CHANGE", "track": {**next_track, "stream_url": stream_url}}, None)
        return {
            "stream_url": stream_url, 
            "title": next_track.get("title"),
            "thumbnail": next_track.get('thumbnail'),
            "queue": q
        }
    else:
        ydl_opts = {
            'format': 'best[ext=mp4]/best',
            'quiet': True,
            'noplaylist': True,
            'cookiesfrombrowser': ('chromium',) ,
            'no_warnings': True
        }
        def _fetch_next():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(next_track['url'], download=False)
        info = await asyncio.to_thread(_fetch_next)
        stream_url = info.get("url")
        manager.room_states[jam_id]["track"] = {**next_track, "stream_url": stream_url}
        await manager.broadcast(jam_id, {"type": "TRACK_CHANGE", "track": {**next_track, "stream_url": stream_url}}, None)
        return {
            "stream_url": stream_url, 
            "title": info.get("title"),
            "thumbnail": next_track.get('thumbnail'),
            "queue": q
        }
