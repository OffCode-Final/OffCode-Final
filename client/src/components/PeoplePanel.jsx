import { Users, ChevronRight, Crown, PauseCircle, PlayCircle, ShieldCheck } from 'lucide-react'

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
  frozenUserIds,
  isCollapsed = false,
  onToggleCollapse
}) {
  // Collapsed rail mode (40px)
  if (isCollapsed) {
    return (
      <aside className="people-rail" onClick={onToggleCollapse} title="Expand People Panel">
        <div className="people-rail-count-badge">
          <Users size={14} strokeWidth={1.75} />
          <span>{users.length}</span>
        </div>

        <div className="people-rail-avatars">
          {users.slice(0, 5).map((u) => (
            <div
              key={u.clientId}
              className="person-avatar rail-avatar"
              style={{ backgroundColor: u.color || 'var(--accent-primary)' }}
              title={u.name}
            >
              {(u.name || '?').charAt(0).toUpperCase()}
            </div>
          ))}
          {users.length > 5 && (
            <span className="people-rail-more">+{users.length - 5}</span>
          )}
        </div>
      </aside>
    )
  }

  return (
    <aside className="people-panel">
      <div className="people-header">
        <div className="people-title-row">
          <span className="people-title">PEOPLE</span>
          <span className="people-count">{users.length}</span>
        </div>
        <button
          type="button"
          className="btn-icon-subtle btn-collapse-panel"
          onClick={onToggleCollapse}
          title="Collapse People Panel"
          aria-label="Collapse People Panel"
        >
          <ChevronRight size={14} strokeWidth={1.75} />
        </button>
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
            const isUserStopped = Boolean(
              frozenUserIds &&
                (frozenUserIds.has(u.userId) ||
                  (u.clientId && frozenUserIds.has(String(u.clientId))))
            )

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
                <div className="person-row-top">
                  {/* 28px initial-letter avatar with presence ring */}
                  <div className="person-avatar-wrap">
                    <div
                      className="person-avatar"
                      style={{ backgroundColor: u.color || 'var(--accent-primary)' }}
                      aria-hidden="true"
                    >
                      {(u.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <span className="person-presence-ring" />
                  </div>

                  <div className="person-info">
                    <div className="person-name-line">
                      <span className="person-name">{u.name}</span>
                      {u.isYou && <span className="tag-muted">(you)</span>}
                      {isUserHost && (
                        <span className="tag-muted host-tag-pill">
                          <Crown size={10} strokeWidth={1.75} />
                          <span>HOST</span>
                        </span>
                      )}
                      {isUserStopped && (
                        <span className="tag-stopped">
                          Stopped
                        </span>
                      )}
                    </div>

                    <span className="person-loc">
                      {u.currentFile ? `${u.currentFile}:${u.currentLine || 1}` : 'browsing'}
                    </span>
                  </div>
                </div>

                {!u.isYou && (
                  <div
                    className="person-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isHost && (
                      <>
                        <button
                          type="button"
                          className={`btn-ghost-action btn-stop-resume ${isUserStopped ? 'stopped' : 'active'}`}
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
                          title={isUserStopped ? `Resume ${u.name}'s editing` : `Stop ${u.name}'s editing`}
                          aria-label={isUserStopped ? `Resume ${u.name}'s editing` : `Stop ${u.name}'s editing`}
                        >
                          {isUserStopped ? (
                            <PlayCircle size={13} strokeWidth={1.75} />
                          ) : (
                            <PauseCircle size={13} strokeWidth={1.75} />
                          )}
                        </button>

                        {!isUserHost && (
                          <button
                            type="button"
                            className="btn-ghost-action btn-make-host"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (window.confirm(`Transfer host privileges to ${u.name}?`)) {
                                if (onTransferHost) onTransferHost(u.userId)
                              }
                            }}
                            title={`Make ${u.name} the room host`}
                            aria-label={`Make ${u.name} the room host`}
                          >
                            <ShieldCheck size={13} strokeWidth={1.75} />
                          </button>
                        )}
                      </>
                    )}
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
