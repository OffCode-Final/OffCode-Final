import { useEffect } from 'react'
import { X, History, Sparkles, CheckCircle2 } from 'lucide-react'
import { UPDATE_LOGS } from '../data/updateLogs'

export default function UpdateLogsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop update-logs-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="update-logs-title">
      <div className="modal-card update-logs-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="update-logs-header">
          <div className="update-logs-header-left">
            <div className="update-logs-icon-wrapper">
              <History size={16} />
            </div>
            <div>
              <h3 id="update-logs-title" className="update-logs-title">Update Logs</h3>
              <p className="update-logs-subtitle">Track new features, improvements, and bug fixes</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon-bar btn-modal-close"
            onClick={onClose}
            title="Close update logs (Esc)"
            aria-label="Close update logs"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content list */}
        <div className="update-logs-body">
          {UPDATE_LOGS.map((release) => (
            <div key={release.version} className="update-release-section">
              <div className="update-release-header">
                <div className="update-release-badges">
                  <span className="badge-release-version">{release.version}</span>
                  {release.isCurrent && (
                    <span className="badge-release-current">
                      <Sparkles size={11} />
                      Current
                    </span>
                  )}
                </div>
                <div className="update-release-meta">
                  <span className="update-release-title">{release.title}</span>
                  <span className="update-release-date">• {release.releaseDate}</span>
                </div>
              </div>

              <ol className="update-logs-list">
                {release.logs.map((log, index) => (
                  <li key={index} className="update-log-item">
                    <span className="update-log-number">{index + 1}.</span>
                    <div className="update-log-content">
                      <strong className="update-log-feature">{log.item}</strong>
                      <span className="update-log-sep"> – </span>
                      <span className="update-log-detail">{log.detail}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="update-logs-footer">
          <div className="update-logs-footer-info">
            <CheckCircle2 size={13} className="text-success" />
            <span>OffCode v1.0 • All features verified & active</span>
          </div>
          <button type="button" className="btn-flat btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
