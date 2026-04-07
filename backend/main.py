from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp 
import vlc
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

try:
    auth_data = os.getenv("APP_USERS", "{}")
    if auth_data.startswith(("'","\"")) and auth_data.endswith(("'","\"")):
        auth_data = auth_data[1:-1]
    user_dict = json.loads(auth_data)
except Exception as e:
    print(f"--- FAILED TO LOAD USERS: {e} ---")
    user_dict = {}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Jammanager:
    def __init__(self): 
        # room_id -> set of WebSockets
        self.rooms: dict[str, set[WebSocket]] = {}
        # username -> active WebSocket
        self.user_sess: dict[str, WebSocket] = {}
        # room_id -> { "isPlaying": bool, "time": float }
        self.room_states: dict[str, dict] = {}

    async def connect(self, room_id: str, username: str, ws: WebSocket):
        await ws.accept()
        
        # Single-session: Kick old socket
        if username in self.user_sess:
            try:
                await self.user_sess[username].send_json({"type": "KICKED"})
                await self.user_sess[username].close()
            except:
                pass
        # Initial state sync
        state = self.room_states.get(room_id, {})
        await ws.send_json({"type": "SYNC", "state": state, "queue": track_queue})
        
        self.user_sess[username] = ws

        # Join Room
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
            self.room_states[room_id] = {"isPlaying": False, "time": 0, "track": None}
        self.rooms[room_id].add(ws)

        # Initial Sync
        try:
            await ws.send_json({
                "type": "SYNC", 
                "state": self.room_states[room_id]
            })
        except:
            pass

    async def disconnect(self, room_id: str, username: str, ws: WebSocket):
        if room_id in self.rooms:
            self.rooms[room_id].discard(ws)
            # Cleanup if room is empty
            if not self.rooms[room_id]:
                if room_id in self.rooms: del self.rooms[room_id]
                if room_id in self.room_states: del self.room_states[room_id]
                print(f"--- Jam Session {room_id} closed (all left) ---")

        if self.user_sess.get(username) == ws:
            del self.user_sess[username]

    async def broadcast_all(self, message: dict):
        for room_id in self.rooms:
            for ws in list(self.rooms[room_id]):
                try:
                    await ws.send_json(message)
                except:
                    pass

    async def broadcast(self, room_id: str, message: dict, sender: WebSocket):
        for ws in list(self.rooms.get(room_id, [])):
            try:
                if ws != sender:
                    await ws.send_json(message)
            except:
                pass

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
            elif type == "PLAY_PAUSE":
                manager.room_states[room_id]["isPlaying"] = data.get("value", False)
            elif type == "TRACK_CHANGE":
                manager.room_states[room_id]["track"] = data.get("track")
                manager.room_states[room_id]["time"] = 0
                manager.room_states[room_id]["isPlaying"] = True
            elif type == "RESTART":
                manager.room_states[room_id]["time"] = 0
                manager.room_states[room_id]["isPlaying"] = True
            elif type == "NEXT_TRACK":
                pass
                
            # Broadcast to others in the same room
            await manager.broadcast(room_id, data, websocket)
    except WebSocketDisconnect:
        await manager.disconnect(room_id, username, websocket)
    except Exception:
        await manager.disconnect(room_id, username, websocket)

class LoginRequest(BaseModel):
    username: str
    password: str
        

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
        for track in track_queue:
            if track.get("cached_url") is None:
                ydl_opts = {
                    'format': 'bestaudio/best',
                    'quiet': True,
                    'noplaylist': True,
                    'cookiesfrombrowser': ('chromium',) ,
                    'no_warnings': True
                }
                try:          
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = await asyncio.to_thread(ydl.extract_info, track['url'], download=False)
                        track["cached_url"] = info.get("url")
                        print(f"caching{track['title']} complete")
                except Exception as e:
                    print("Error caching")
        await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cacher_worker())

@app.get("/")
async def root():
    return {"message": "FastAPI is running"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/search")
async def ytsearch(query: str):
    with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True}) as ydl:
        data = ydl.extract_info(f"ytsearch10:{query}", download=False)
        return data

track_queue = []

class Track(BaseModel):
    url: str
    title: str
    thumbnail: str
    cached_url: Optional[str] = None

@app.post("/queue/add")
async def add_queue(track: Track, top: bool = Query(False)):
    if top:
        track_queue.insert(0, track.dict())
    else:
        track_queue.append(track.dict())
    await manager.broadcast_all({"type": "QUEUE_UPDATE", "queue": track_queue})
    return {"queue": track_queue}


@app.get("/queue")
async def get_queue():
    return {"queue": track_queue}


@app.get("/queue/delete")
async def delete_track(index: int):
    if not track_queue or index >= len(track_queue):
        return {"message": "Invalid index or empty queue"}
    

    del track_queue[index]
    await manager.broadcast_all({"type": "QUEUE_UPDATE", "queue": track_queue})
    return {"queue": track_queue}

@app.get("/queue/skip")
async def skip_to_track(index: int):
    if not track_queue or index >= len(track_queue):
        return {"message": "Invalid index or empty queue"}
    target_track = track_queue[index]
    
    del track_queue[0:index+1]
    
    await manager.broadcast_all({"type": "QUEUE_UPDATE", "queue": track_queue})
    if target_track.get("cached_url"):
        print("cache found")
        return {
            "stream_url": target_track.get("cached_url"), 
            "title": target_track.get("title"),
            "thumbnail": target_track.get('thumbnail'),
            "queue": track_queue
        }
    else:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'noplaylist': True,
            'cookiesfrombrowser': ('chromium',)  ,
            'no_warnings': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target_track['url'], download=False)
            return {
                "stream_url": info.get("url"), 
                "title": info.get("title"),
                "thumbnail": target_track.get('thumbnail'),
                "queue": track_queue
            }

@app.get("/queue/next")
async def next_queue():
    if not track_queue:
        return {"message": "Queue is empty"}
    
    next_track = track_queue.pop(0)


    await manager.broadcast_all({"type": "QUEUE_UPDATE", "queue": track_queue})
    if next_track.get("cached_url"):
        print("cache found")
        return {
            "stream_url": next_track.get("cached_url"), 
            "title": next_track.get("title"),
            "thumbnail": next_track.get('thumbnail'),
            "queue": track_queue
        }
    else:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'noplaylist': True,
            'cookiesfrombrowser': ('chromium',) ,
            'no_warnings': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(next_track['url'], download=False)
            return {
                "stream_url": info.get("url"), 
                "title": info.get("title"),
                "thumbnail": next_track.get('thumbnail'),
                "queue": track_queue
            }
