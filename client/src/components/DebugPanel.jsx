import { X, Trash2, Cpu } from 'lucide-react'

export default function DebugPanel({
  isOpen,
  onClose,
  clientId,
  status,
  usersCount,
  undoDepths,
  eventsLog,
  onClearLogs,
  onSimulateRemoteEdit,
  activeFile,
  mode = 'free',
  hostId = null,
  pendingProposalsCount = 0
}) {
  if (!isOpen) return null

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="debug-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <span className="drawer-title">Debug & CRDT Inspector</span>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            title="Close inspector"
          >
            <X size={15} />
          </button>
        </div>

        <div className="debug-drawer-content">
          {/* Key Metric Stats Grid */}
          <div className="debug-stats-grid">
            <div className="stat-card">
              <span className="stat-label">Client ID</span>
              <span className="stat-val mono">{clientId || 'N/A'}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Connection</span>
              <span className="stat-val status-val">{status ? status.toUpperCase() : 'UNKNOWN'}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Collaborators</span>
              <span className="stat-val">{usersCount}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Room Mode</span>
              <span className="stat-val">{mode === 'review' ? 'REVIEW' : 'LIVE'}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Host ID</span>
              <span className="stat-val mono">{hostId || 'Electing...'}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Pending Proposals</span>
              <span className="stat-val">{pendingProposalsCount}</span>
            </div>
          </div>

          {/* Undo/Redo Stacks Table */}
          <div className="debug-section">
            <div className="debug-section-head">
              <span>Per-User Undo Stacks</span>
            </div>

            <table className="debug-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Undo (Ctrl+Z)</th>
                  <th>Redo (Ctrl+Y)</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(undoDepths).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted">No undo entries yet.</td>
                  </tr>
                ) : (
                  Object.entries(undoDepths).map(([key, d]) => (
                    <tr key={key}>
                      <td className="mono">{key}</td>
                      <td>{d.undo}</td>
                      <td>{d.redo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Event Log */}
          <div className="debug-section">
            <div className="debug-section-head">
              <span>Activity Log ({eventsLog.length})</span>
              <div className="section-actions">
                <button
                  type="button"
                  className="btn-flat btn-secondary btn-xs"
                  onClick={onSimulateRemoteEdit}
                  title="Simulate remote teammate concurrent edit"
                >
                  <Cpu size={12} />
                  <span>Simulate remote edit</span>
                </button>
                <button
                  type="button"
                  className="btn-flat btn-secondary btn-xs"
                  onClick={onClearLogs}
                  title="Clear log"
                >
                  <Trash2 size={12} />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <div className="events-log-container">
              {eventsLog.length === 0 ? (
                <div className="events-empty">No activity recorded.</div>
              ) : (
                eventsLog.map((ev) => (
                  <div key={ev.id} className="event-log-row">
                    <span className="event-time">{ev.time}</span>
                    <span className="event-type">[{ev.type}]</span>
                    <span className="event-msg">{ev.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
