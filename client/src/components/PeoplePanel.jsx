export default function PeoplePanel({ users, activeFile }) {
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

            return (
              <div key={u.clientId} className="person-item">
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
                  </div>
                  <div className="person-file-status">
                    {u.currentFile ? (
                      <span className={`file-view-status ${isViewingSame ? 'same-file' : ''}`}>
                        {isViewingSame ? '👁️ ' : '📄 '}
                        {u.currentFile}
                      </span>
                    ) : (
                      <span className="file-view-status muted">browsing...</span>
                    )}
                  </div>
                </div>
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
            <p>Edits and cursors sync automatically between everyone in this room.</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
