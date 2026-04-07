from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from youtubesearchpython import VideosSearch as vss
import yt_dlp 

app = FastAPI()

# Enable CORS for the frontend
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
    vsearch = vss(query, limit=10)
    return vsearch.result()


@app.get("/watch")
async def watch(url: str):
    with yt_dlp.YoutubeDL({'format': 'best', 'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        return {"stream_url": info.get("url")}