import { Wifi, WifiOff, Users, Code, Crown } from 'lucide-react'

export default function StatusBar({
  status,
  onToggleOnline,
  usersCount,
  activeLanguage,
  cursorPos,
  isHost,
  mode
}) {
  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return '#4ec9b0'
      case 'connecting':
        return '#cca700'
      case 'offline':
      default:
        return '#f48771'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'online':
        return 'Online'
      case 'connecting':
        return 'Connecting...'
      case 'offline':
      default:
        return 'Offline'
    }
  }

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <button
          type="button"
          className="status-bar-item status-bar-btn"
          onClick={onToggleOnline}
          title={status === 'offline' ? 'Click to connect and sync' : 'Click to go offline'}
        >
          <span
            className="status-indicator-dot"
            style={{ backgroundColor: getStatusColor() }}
          />
          {status === 'offline' ? (
            <WifiOff size={12} className="status-icon" />
          ) : (
            <Wifi size={12} className="status-icon" />
          )}
          <span>{getStatusText()}</span>
        </button>

        {isHost && (
          <span className="status-bar-item" title="You are the room host">
            <Crown size={12} className="status-icon" />
            <span>Host</span>
          </span>
        )}

        <span className="status-bar-item" title="Collaboration Mode">
          <span>Mode: {mode === 'review' ? 'Review' : 'Live'}</span>
        </span>
      </div>

      <div className="status-bar-right">
        {cursorPos && (
          <span className="status-bar-item" title="Cursor position">
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          </span>
        )}

        {activeLanguage && (
          <span className="status-bar-item" title="Language mode">
            <Code size={12} className="status-icon" />
            <span>{activeLanguage}</span>
          </span>
        )}

        <span className="status-bar-item" title="Collaborators currently connected">
          <Users size={12} className="status-icon" />
          <span>{usersCount} {usersCount === 1 ? 'collaborator' : 'collaborators'}</span>
        </span>
      </div>
    </footer>
  )
}
