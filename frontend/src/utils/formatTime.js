// Format seconds into m:ss display
export const formatTime = (time) => {
  if (isNaN(time)) return '0:00'
  const mins = Math.floor(time / 60)
  const secs = Math.floor(time % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}
