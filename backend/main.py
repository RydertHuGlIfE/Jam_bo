from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp 
import vlc
from pydantic import BaseModel
from typing import Optional

ins = vlc.Instance()
player = ins.media_player_new()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/queue/skip")
async def skip_to_track(index: int):
    if not track_queue or index >= len(track_queue):
        return {"message": "Invalid index or empty queue"}
    
    # Identify the track to play
    target_track = track_queue[index]
    
    # Skip all intermediate tracks up to and including the target
    del track_queue[0:index+1]
    
    # Extract the stream URL for the selected track
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'noplaylist': True,
        'cookiesfrombrowser': ('chromium',) 
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

    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'noplaylist': True,
        'cookiesfrombrowser': ('chromium',) 
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(next_track['url'], download=False)
        return {
            "stream_url": info.get("url"), 
            "title": info.get("title"),
            "thumbnail": next_track.get('thumbnail'),
            "queue": track_queue
        }
