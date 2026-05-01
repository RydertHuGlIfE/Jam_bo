export default function Sidebar({ 
  sessionUser, 
  jamConnected, 
  jamId, 
  queue, 
  onStartJam, 
  onCopyInvite, 
  onLogout, 
  onSkipToTrack, 
  onDeleteTrack,
  children  // ChatPanel gets passed as children
}) {
  return (
    <aside className="sidebar-queue">
      <div className="sidebar-header">
        <h2>Jam_bo</h2>
        <div className="user-profile">
          <span className={jamConnected ? "jam-active" : ""}>
            {jamConnected ? "● " : ""}{sessionUser}
          </span>
          {jamId === 'global' || jamId.startsWith('local_') ? (
            <button className="btn-jam-start" onClick={onStartJam}>Start Jam</button>
          ) : (
            <button className="btn-jam-copy" onClick={onCopyInvite}>Copy Invite</button>
          )}
          <button className="logout-link" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="queue-section">
        <h3>Next in Queue</h3>
        <div className="queue-list">
          {queue.length > 0 ? (
            queue.map((item, index) => (
              <div
                key={index}
                className="queue-item"
                onClick={() => onSkipToTrack(index)}
              >
                <img src={item.thumbnail} alt="" className="queue-thumb" />
                <div className="queue-info">
                  <div className="queue-title">{item.title}</div>
                  <span className="queue-hint">Click to Skip</span>
                </div>
                <button
                  className="btn-delete-queue"
                  onClick={(e) => onDeleteTrack(index, e)}
                  title="Remove from queue"
                >
                  &times;
                </button>
              </div>
            ))
          ) : (
            <div className="queue-empty">Queue is empty</div>
          )}
        </div>
      </div>

      {children}
    </aside>
  )
}
