import { useState } from 'react'

const API_BASE = "";

export default function SearchGrid({ onAddToQueue }) {
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)

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

  return (
    <>
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

      <div className="video-grid">
        {videos.map((video, idx) => (
          <div key={idx} className="video-card">
            <div className="thumbnail-container" onClick={() => onAddToQueue(video, true)}>
              <img src={video.thumbnails[0]?.url} alt={video.title} />
            </div>
            <div className="video-info">
              <div className="video-title" onClick={() => onAddToQueue(video, true)}>{video.title}</div>
              <div className="video-meta">
                {video.uploader}
                <div className="queue-buttons">
                  <button
                    className="btn-next"
                    onClick={(e) => { e.stopPropagation(); onAddToQueue(video, true); }}
                  >
                    Next
                  </button>
                  <button
                    className="btn-last"
                    onClick={(e) => { e.stopPropagation(); onAddToQueue(video, false); }}
                  >
                    + Queue
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
