from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp 
import vlc
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import os
from dotenv import load_dotenv
import os 
load_dotenv()

try:
    user_dict = json.loads(os.getenv("APP_USERS", "{}"))
except Exception:
    user_dict = {}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

try:
    auth_data = os.getenv("APP_USERS", "{}")
    print(f"--- Debug: Raw APP_USERS from env: {auth_data} ---")
    
    # Robustly handle single quotes or other wrapping characters
    if auth_data.startswith(("'","\"")) and auth_data.endswith(("'","\"")):
        auth_data = auth_data[1:-1]
        
    user_dict = json.loads(auth_data)
    print(f"--- Loaded {len(user_dict)} users from .env: {list(user_dict.keys())} ---")
except Exception as e:
    print(f"--- FAILED TO LOAD USERS: {e} ---")
    user_dict = {}

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
    return {"queue": track_queue}


@app.get("/queue")
async def get_queue():
    return {"queue": track_queue}


@app.get("/queue/delete")
async def delete_track(index: int):
    if not track_queue or index >= len(track_queue):
        return {"message": "Invalid index or empty queue"}
    

    del track_queue[index]
    return {"queue": track_queue}

@app.get("/queue/skip")
async def skip_to_track(index: int):
    if not track_queue or index >= len(track_queue):
        return {"message": "Invalid index or empty queue"}
    target_track = track_queue[index]
    
    del track_queue[0:index+1]
    
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
