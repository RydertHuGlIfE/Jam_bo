import { useState } from 'react'

function App() {
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [streamUrl, setStreamUrl] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query) return
    
    setLoading(true)
    setStreamUrl(null)
    try {
      const response = await fetch(`http://127.0.0.1:8000/search?query=${encodeURIComponent(query)}`)
      const data = await response.json()
      // youtubesearchpython returns data.result as an array
      setVideos(data.result || [])
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleWatch = async (url) => {
    setLoading(true)
    try {
      const response = await fetch(`http://127.0.0.1:8000/watch?url=${encodeURIComponent(url)}`)
      const data = await response.json()
      setStreamUrl(data.stream_url)
      // Log for user to see, or we could open a player
      console.log('Stream URL extracted:', data.stream_url)
    } catch (err) {
      console.error('Watch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="premium-container">
      <h1>Jam_bo Video</h1>
      
      <form className="search-form" onSubmit={handleSearch}>
        <input 
          type="text" 
          className="search-input"
          placeholder="Search YouTube..." 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {streamUrl && (
        <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--surface-color)', borderRadius: '12px' }}>
          <h3>Stream URL Ready!</h3>
          <p style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{streamUrl}</p>
          <a href={streamUrl} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem' }}>
            Open Stream
          </a>
        </div>
      )}

      <div className="video-grid">
        {videos.map((video) => (
          <div key={video.id} className="video-card" onClick={() => handleWatch(video.link)}>
            <div className="thumbnail-container">
              <img src={video.thumbnails[0].url} alt={video.title} />
            </div>
            <div className="video-info">
              <div className="video-title">{video.title}</div>
              <div className="video-meta">
                {video.channel.name} • {video.publishedTime}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
