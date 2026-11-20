export default function PeoplePanel({
  users,
  activeFile,
  onJumpToUser,
  followingUserId,
  onToggleFollow,
  hostId
}) {
  return (
    <aside className="people-panel">
      <div className="people-header">
        <span className="people-title">PEOPLE</span>
        <span className="people-count-pill">{users.length} active</span>
      </div>

      <div className="people-list">
        {users.length === 0 ? (
          <div className="people-empty">No active users detected.</div>
        ) : (
          users.map((u) => {
            const isViewingSame = u.currentFile === activeFile
            const isFollowing = followingUserId === u.clientId
            const isUserHost = Boolean(
              hostId &&
              (u.userId === hostId ||
                u.name?.toLowerCase() === hostId.toLowerCase() ||
                String(u.clientId) === hostId)
            )

            return (
              <div
                key={u.clientId}
                className={`person-item ${u.currentFile ? 'clickable' : ''} ${isFollowing ? 'following-active' : ''}`}
                onClick={() => {
                  if (onJumpToUser && u.currentFile) {
                    onJumpToUser(u)
                  }
                }}
                title={
                  u.currentFile
                    ? `Click to jump to ${u.name}'s file and cursor (Ln ${u.currentLine || 1})`
                    : `${u.name} is browsing`
                }
              >
                <div className="person-avatar-wrapper">
                  <div
                    className="person-avatar"
                    style={{ backgroundColor: u.color }}
                  >
                    {u.name ? u.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <span className="person-online-dot"></span>
                </div>

                <div className="person-details">
                  <div className="person-name-row">
                    <span className="person-name" style={{ color: u.color }}>
                      {u.name}
                    </span>
                    {u.isYou && <span className="you-pill">you</span>}
                    {isUserHost && <span className="host-pill">HOST</span>}
                  </div>

                  <div className="person-file-status">
                    {u.currentFile ? (
                      <span className={`file-view-status ${isViewingSame ? 'same-file' : ''}`}>
                        {isViewingSame ? '👁️ ' : '📄 '}
                        <strong>{u.currentFile}</strong>
                        <span className="line-number-tag"> : Ln {u.currentLine || 1}</span>
                      </span>
                    ) : (
                      <span className="file-view-status muted">browsing...</span>
                    )}
                  </div>
                </div>

                {/* Follow Mode Toggle Button for Remote Peers */}
                {!u.isYou && (
                  <button
                    type="button"
                    className={`btn-follow ${isFollowing ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onToggleFollow) {
                        onToggleFollow(u.clientId)
                      }
                    }}
                    title={
                      isFollowing
                        ? `Stop following ${u.name}`
                        : `Follow ${u.name} (auto-navigate and scroll to their cursor)`
                    }
                  >
                    {isFollowing ? '✓ Following' : '🎯 Follow'}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="people-footer">
        <div className="sync-indicator-card">
          <span className="sync-icon">🔄</span>
          <div className="sync-info">
            <strong>CRDT Sync Engine</strong>
            <p>Edits, cursors, and line locations sync automatically in real-time.</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
