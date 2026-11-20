import { useState } from 'react'

export default function TopBar({
  roomId,
  userName,
  userColor,
  status,
  onToggleOnline,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoDepth,
  redoDepth,
  showDebug,
  onToggleDebug,
  onLeaveRoom,
  onSaveCurrentFile,
  onDownloadAllZip,
  activeFile
}) {
  const [copied, setCopied] = useState(false)
  const [savedToast, setSavedToast] = useState(false)

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleSaveClick = () => {
    onSaveCurrentFile()
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 1800)
  }

  const getStatusBadge = () => {
    switch (status) {
      case 'online':
        return (
          <div className="status-badge status-online" title="Connected and actively syncing">
            <span className="status-dot"></span>
            <span className="status-text">Online</span>
          </div>
        )
      case 'offline':
        return (
          <div className="status-badge status-offline" title="Offline mode: changes saved locally">
            <span className="status-dot"></span>
            <span className="status-text">Offline</span>
          </div>
        )
      case 'connecting':
      default:
        return (
          <div className="status-badge status-connecting" title="Connecting to peers...">
            <span className="status-dot pulsing"></span>
            <span className="status-text">Connecting...</span>
          </div>
        )
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="app-brand">
          <span className="brand-logo">⚡</span>
          <span className="brand-name">OffCode</span>
        </div>

        <div className="room-info">
          <span className="room-label">Room:</span>
          <span className="room-name" title={`Room: ${roomId}`}>
            {roomId}
          </span>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={handleCopyLink}
            title="Copy shareable room link to clipboard"
          >
            {copied ? '✓ Copied' : '🔗 Copy Link'}
          </button>
        </div>

        {/* Save Current File & Download All .zip (Phase A) */}
        <div className="file-actions-group">
          <button
            type="button"
            className="btn-toolbar btn-save"
            onClick={handleSaveClick}
            disabled={!activeFile}
            title={`Download "${activeFile || 'current file'}" to your computer (Ctrl+S)`}
          >
            {savedToast ? '✓ Saved!' : '💾 Save'}
          </button>
          <button
            type="button"
            className="btn-toolbar btn-download-all"
            onClick={onDownloadAllZip}
            title="Download all workspace files as a .zip archive"
          >
            📦 Download All (.zip)
          </button>
        </div>
      </div>

      <div className="topbar-center">
        {/* Undo and Redo buttons for Per-User Undo */}
        <div className="undo-redo-group">
          <button
            type="button"
            className="btn-toolbar"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo ONLY your local changes (Ctrl+Z)"
          >
            ↩ Undo {undoDepth > 0 ? `(${undoDepth})` : ''}
          </button>
          <button
            type="button"
            className="btn-toolbar"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo your local changes (Ctrl+Shift+Z / Ctrl+Y)"
          >
            ↪ Redo {redoDepth > 0 ? `(${redoDepth})` : ''}
          </button>
        </div>

        {/* Connection status badge */}
        {getStatusBadge()}

        {/* Live offline/online demo toggle */}
        <button
          type="button"
          className={`btn-toggle-network ${status === 'offline' ? 'btn-reconnect' : 'btn-disconnect'}`}
          onClick={onToggleOnline}
          title={status === 'offline' ? 'Click to reconnect and auto-merge' : 'Click to simulate offline mode'}
        >
          {status === 'offline' ? '⚡ Go Online' : '🔌 Go Offline'}
        </button>
      </div>

      <div className="topbar-right">
        {/* Toggle Debug / Demo Panel */}
        <button
          type="button"
          className={`btn-toolbar btn-debug ${showDebug ? 'active' : ''}`}
          onClick={onToggleDebug}
          title="Toggle Hackathon Demo & Debug Inspector"
        >
          🔍 Demo Panel
        </button>

        {/* Current user badge */}
        <div className="user-profile-badge" title={`Signed in as ${userName}`}>
          <span
            className="user-avatar-dot"
            style={{ backgroundColor: userColor }}
          />
          <span className="user-profile-name">{userName}</span>
        </div>

        {/* Leave Room button */}
        <button
          type="button"
          className="btn-toolbar btn-leave"
          onClick={onLeaveRoom}
          title="Leave this workspace and return to join screen"
        >
          Exit
        </button>
      </div>
    </header>
  )
}
