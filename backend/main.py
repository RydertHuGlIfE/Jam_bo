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


@app.get("/queue/skip?index=N")
async def queue_index(index: int):
    track_queue.pop(index)
    return {"queue": track_queue}

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
            "thumbnail": next_track.get('thumbnail')
        }
