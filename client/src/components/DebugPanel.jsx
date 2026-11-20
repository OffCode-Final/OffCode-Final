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
    <div className="debug-panel-drawer">
      <div className="debug-panel-header">
        <div className="debug-title-group">
          <span className="debug-icon">⚡</span>
          <h3>Demo & Debug Inspector</h3>
          <span className="debug-badge">Hackathon Toolkit</span>
        </div>
        <button
          type="button"
          className="btn-close-debug"
          onClick={onClose}
          title="Close Inspector"
        >
          ✕
        </button>
      </div>

      <div className="debug-grid">
        {/* Metric Cards */}
        <div className="debug-card">
          <span className="card-label">My Client ID</span>
          <span className="card-value client-id-text">{clientId || 'N/A'}</span>
          <span className="card-subtext">Unique CRDT Peer ID</span>
        </div>

        <div className="debug-card">
          <span className="card-label">Connection Status</span>
          <span className={`card-value status-${status}`}>
            {status ? status.toUpperCase() : 'UNKNOWN'}
          </span>
          <span className="card-subtext">Yjs Provider State</span>
        </div>

        <div className="debug-card">
          <span className="card-label">Collaborators in Room</span>
          <span className="card-value">{usersCount}</span>
          <span className="card-subtext">Peers in Awareness</span>
        </div>

        {/* Phase E: Mode, Host ID, and Pending Proposals Cards */}
        <div className="debug-card">
          <span className="card-label">Room Mode</span>
          <span className="card-value" style={{ color: mode === 'review' ? '#fbbf24' : '#34d399' }}>
            {mode === 'review' ? 'REVIEW' : 'LIVE'}
          </span>
          <span className="card-subtext">Shared CRDT Room State</span>
        </div>

        <div className="debug-card">
          <span className="card-label">Room Host ID</span>
          <span className="card-value client-id-text">{hostId || 'Electing...'}</span>
          <span className="card-subtext">Leader / Host Authority</span>
        </div>

        <div className="debug-card">
          <span className="card-label">Pending Proposals</span>
          <span className="card-value" style={{ color: pendingProposalsCount > 0 ? '#f87171' : '#94a3b8' }}>
            {pendingProposalsCount}
          </span>
          <span className="card-subtext">Awaiting Host Review</span>
        </div>

        {/* Per-File Undo/Redo Stacks */}
        <div className="debug-card debug-card-wide">
          <div className="card-header-row">
            <span className="card-label">Per-File Undo/Redo Stacks (Per-User History)</span>
            <span className="card-hint">Only local edits are tracked</span>
          </div>

          <div className="undo-table-container">
            <table className="debug-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Undo Depth (Ctrl+Z)</th>
                  <th>Redo Depth (Ctrl+Y)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(undoDepths).length === 0 ? (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      No edits performed yet. Type in an open file to record undo history.
                    </td>
                  </tr>
                ) : (
                  Object.entries(undoDepths).map(([file, depths]) => (
                    <tr
                      key={file}
                      className={file === activeFile ? 'active-row' : ''}
                    >
                      <td>
                        <strong>{file}</strong>
                        {file === activeFile && <span className="mini-badge">active</span>}
                      </td>
                      <td>
                        <span className="stack-badge undo-count">
                          {depths.undo} items
                        </span>
                      </td>
                      <td>
                        <span className="stack-badge redo-count">
                          {depths.redo} items
                        </span>
                      </td>
                      <td className="status-cell">
                        {depths.undo > 0 ? '✓ Ready to undo' : 'Clean'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Demo Actions Toolbar */}
      <div className="debug-actions-toolbar">
        <div className="actions-label">
          <strong>Demo Helper:</strong> Test concurrent multi-user editing and CRDT merge
        </div>
        <div className="actions-buttons">
          <button
            type="button"
            className="btn-debug-action"
            onClick={onSimulateRemoteEdit}
            title="Injects a simulated teammate edit on the active file via a remote origin"
          >
            🤖 Simulate Remote Edit on {activeFile || 'active file'}
          </button>
        </div>
      </div>

      {/* Live Event Log */}
      <div className="debug-events-section">
        <div className="events-header">
          <div className="events-title">
            <span>Live Activity Event Log</span>
            <span className="events-count">({eventsLog.length} events)</span>
          </div>
          <button
            type="button"
            className="btn-clear-logs"
            onClick={onClearLogs}
          >
            Clear Log
          </button>
        </div>

        <div className="events-log-container">
          {eventsLog.length === 0 ? (
            <div className="log-empty">No events logged yet.</div>
          ) : (
            eventsLog.map((ev) => (
              <div key={ev.id} className={`log-entry log-${ev.type}`}>
                <span className="log-time">{ev.time}</span>
                <span className="log-type-tag">[{ev.type}]</span>
                <span className="log-message">{ev.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
