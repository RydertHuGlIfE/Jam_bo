import { useState } from 'react'

const API_BASE = ""

/**
 * useQueue — Manages the queue and playback API calls.
 * Handles fetching, adding, skipping, deleting tracks and playing next.
 */
export default function useQueue({
  getRoomId,
  emitJamAction,
  onSetCurrentTrack,
  onSetIsPlaying,
  onSetQueue,
  videoRef,
}) {
  const [loading, setLoading] = useState(false)

  const fetchQueue = async () => {
    try {
      const response = await fetch(`${API_BASE}/queue?jam_id=${getRoomId()}`)
      const data = await response.json()
      onSetQueue(data.queue || [])
    } catch (err) {
      console.error('Failed to fetch queue:', err)
    }
  }

  const addToQueue = async (video, top = false) => {
    try {
      const response = await fetch(`${API_BASE}/queue/add?top=${top}&jam_id=${getRoomId()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: video.url,
          title: video.title,
          thumbnail: video.thumbnails[0]?.url || ''
        })
      })
      const data = await response.json()
      onSetQueue(data.queue || [])

      if (top) {
        playNext(false)
      }
    } catch (err) {
      console.error('Failed to add to queue:', err)
    }
  }

  const playNext = async (fromRemote = false) => {
    if (loading) return
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/queue/next?jam_id=${getRoomId()}`)
      const data = await response.json()

      if (data.stream_url) {
        onSetCurrentTrack(data)
        onSetIsPlaying(true)
        onSetQueue(data.queue || [])
        if (!fromRemote) emitJamAction('TRACK_CHANGE', { track: data })
      } else {
        if (!fromRemote) emitJamAction('NEXT_TRACK', {})
        onSetCurrentTrack(null)
        onSetIsPlaying(false)
        onSetQueue([])
      }
    } catch (err) {
      console.error('Failed to play next:', err)
    } finally {
      setLoading(false)
    }
  }

  const skipToTrack = async (index, fromRemote = false) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/queue/skip?index=${index}&jam_id=${getRoomId()}`)
      const data = await response.json()

      if (data.stream_url) {
        onSetCurrentTrack(data)
        onSetIsPlaying(true)
        onSetQueue(data.queue || [])
        if (!fromRemote) emitJamAction('TRACK_CHANGE', { track: data })
      }
    } catch (err) {
      console.error('Failed to skip track:', err)
    } finally {
      setLoading(false)
    }
  }

  const deleteTrack = async (index, e) => {
    e.stopPropagation()
    try {
      const response = await fetch(`${API_BASE}/queue/delete?index=${index}&jam_id=${getRoomId()}`)
      const data = await response.json()
      onSetQueue(data.queue || [])
    } catch (err) {
      console.error('Failed to delete track:', err)
    }
  }

  const restartTrack = (fromRemote = false) => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play()
      onSetIsPlaying(true)
      if (!fromRemote) emitJamAction('RESTART', {})
    }
  }

  const handlePlayPause = (isPlaying, fromRemote = false) => {
    if (isPlaying) {
      videoRef.current.pause()
      onSetIsPlaying(false)
      if (!fromRemote) emitJamAction('PLAY_PAUSE', { value: false, time: videoRef.current.currentTime })
    } else {
      videoRef.current.play()
      onSetIsPlaying(true)
      if (!fromRemote) emitJamAction('PLAY_PAUSE', { value: true, time: videoRef.current.currentTime })
    }
  }

  return {
    loading,
    fetchQueue,
    addToQueue,
    playNext,
    skipToTrack,
    deleteTrack,
    restartTrack,
    handlePlayPause,
  }
}
