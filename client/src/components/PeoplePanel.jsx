export default function PeoplePanel({
  users,
  activeFile,
  onJumpToUser,
  followingUserId,
  onToggleFollow,
  hostId,
  isHost = false,
  onTransferHost,
  onStopUser,
  onResumeUser,
  frozenUserIds
}) {
  return (
    <aside className="people-panel">
      <div className="people-header">
        <span className="people-title">PEOPLE</span>
        <span className="people-count">{users.length}</span>
      </div>

      <div className="people-list">
        {users.length === 0 ? (
          <div className="people-empty">No active collaborators.</div>
        ) : (
          users.map((u) => {
            const isFollowing = followingUserId === u.clientId
            const isUserHost = Boolean(
              hostId &&
                (u.userId === hostId ||
                  u.name?.toLowerCase() === hostId.toLowerCase() ||
                  String(u.clientId) === hostId)
            )
            const isUserStopped = Boolean(frozenUserIds && (frozenUserIds.has(u.userId) || (u.clientId && frozenUserIds.has(String(u.clientId)))))

            return (
              <div
                key={u.clientId}
                className={`person-row ${u.currentFile ? 'clickable' : ''} ${isFollowing ? 'following' : ''}`}
                onClick={() => {
                  if (onJumpToUser && u.currentFile) {
                    onJumpToUser(u)
                  }
                }}
                title={
                  u.currentFile
                    ? `Jump to ${u.name}'s cursor in ${u.currentFile} (Ln ${u.currentLine || 1})`
                    : `${u.name} is browsing`
                }
              >
                {/* 8px solid colored dot representing user color */}
                <span
                  className="person-dot"
                  style={{ backgroundColor: u.color }}
                />

                <div className="person-info">
                  <div className="person-name-line">
                    <span className="person-name">{u.name}</span>
                    {u.isYou && <span className="tag-muted">(you)</span>}
                    {isUserHost && <span className="tag-muted">(host)</span>}
                    {isUserStopped && (
                      <span
                        className="tag-stopped"
                        style={{
                          background: '#7f1d1d',
                          color: '#fca5a5',
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontWeight: 600
                        }}
                      >
                        Stopped
                      </span>
                    )}
                  </div>

                  <span className="person-loc">
                    {u.currentFile ? `${u.currentFile}:${u.currentLine || 1}` : 'browsing'}
                  </span>
                </div>

                {!u.isYou && (
                  <div className="person-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isHost && (
                      <>
                        <button
                          type="button"
                          className="btn-flat btn-stop-resume"
                          style={{
                            padding: '2px 6px',
                            fontSize: '11px',
                            borderRadius: '3px',
                            background: isUserStopped ? '#065f46' : '#7f1d1d',
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isUserStopped) {
                              if (onResumeUser) onResumeUser(u.userId)
                            } else {
                              if (window.confirm(`Stop ${u.name}'s editing?`)) {
                                if (onStopUser) onStopUser(u.userId)
                              }
                            }
                          }}
                          title={isUserStopped ? `Resume ${u.name}'s editing` : `Stop ${u.name} from editing`}
                        >
                          {isUserStopped ? 'Resume' : 'Stop'}
                        </button>

                        <button
                          type="button"
                          className="btn-flat btn-make-host"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm(`Make ${u.name} the host?`)) {
                              if (onTransferHost) onTransferHost(u.userId, u.name)
                            }
                          }}
                          title={`Make ${u.name} the host`}
                        >
                          Make host
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`btn-flat btn-follow ${isFollowing ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onToggleFollow) onToggleFollow(u.clientId)
                      }}
                      title={isFollowing ? `Stop following ${u.name}` : `Follow ${u.name}`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
