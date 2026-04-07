from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from youtubesearchpython import VideosSearch as vss
import yt_dlp 
import vlc

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


@app.get("/watch")
async def watch(url: str):
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'noplaylist': True,
        'cookiesfrombrowser': ('chromium',) 
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return {"stream_url": info.get("url"), "title": info.get("title")}