import { useEffect, useRef } from 'react'
import { X, History } from 'lucide-react'
import { UPDATE_LOGS } from '../data/updateLogs'

export default function UpdateLogsModal({ isOpen, onClose }) {
  const currentVersion = UPDATE_LOGS[0]?.version || 'v1.1'
  const drawerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleClickOutside = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="updates-drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="updates-drawer-title">
      <aside className="updates-drawer" ref={drawerRef} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="updates-drawer-header">
          <div className="updates-drawer-title-row">
            <History size={16} strokeWidth={1.75} className="updates-drawer-icon" />
            <h3 id="updates-drawer-title" className="updates-drawer-title">Updates</h3>
            <span className="badge-release-version">{currentVersion}</span>
          </div>
          <button
            type="button"
            className="btn-icon-subtle btn-close-updates"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close updates"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Content list */}
        <div className="updates-drawer-body">
          {UPDATE_LOGS.map((release) => (
            <div key={release.version} className="update-release-section">
              <div className="update-release-header">
                <div className="update-release-badges">
                  <span className="badge-release-version">{release.version}</span>
                  {release.isCurrent && (
                    <span className="badge-release-current">Current</span>
                  )}
                </div>
                <div className="update-release-meta">
                  <span className="update-release-title">{release.title}</span>
                  <span className="update-release-date">• {release.releaseDate}</span>
                </div>
              </div>

              <ul className="update-logs-list">
                {release.logs.map((log, index) => (
                  <li key={index} className="update-log-bullet">
                    <span className="update-log-bullet-mark">•</span>
                    <div className="update-log-content">
                      <strong className="update-log-feature">{log.item}</strong>
                      <span className="update-log-sep"> – </span>
                      <span className="update-log-detail">{log.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="updates-drawer-footer">
          <span className="updates-drawer-note">OffCode {currentVersion} • Offline collaborative editor</span>
          <button type="button" className="btn-flat btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}
