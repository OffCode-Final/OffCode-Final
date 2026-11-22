import { useState, useRef, useEffect } from 'react'
import {
  Play,
  Square,
  Save,
  Undo2,
  Redo2,
  MoreVertical,
  Download,
  Terminal,
  Wifi,
  WifiOff,
  LogOut,
  Copy,
  Check,
  GitPullRequest,
  Send,
  MessageSquare,
  Highlighter,
  Sun,
  Moon,
  Crown,
  Loader2,
  Folder,
  Users,
  Key,
  Trash2,
  History
} from 'lucide-react'
import { getFileExtension } from '../utils/helpers'
import UpdateLogsModal from './UpdateLogsModal'
import { UPDATE_LOGS } from '../data/updateLogs'

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
  activeFile,
  onRunCode,
  isRunning,
  onStopCode,
  isHost,
  mode = 'free',
  onSetMode,
  pendingProposalsCount = 0,
  onOpenReviewDrawer,
  onOpenPushDraft,
  isChatOpen = false,
  onToggleChat,
  unreadChatCount = 0,
  isStopped = false,
  showUserChanges = false,
  onToggleShowUserChanges,
  theme = 'dark',
  onToggleTheme,
  onToggleMobileSidebar,
  onToggleMobilePeople,
  onOpenAiKeyModal,
  onRemoveAiKey,
  hasAiKey = false
}) {
  const [copied, setCopied] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isUpdateLogsOpen, setIsUpdateLogsOpen] = useState(false)
  const currentVersion = UPDATE_LOGS[0]?.version || 'v1.1'
  const moreRef = useRef(null)
  const moreButtonRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setIsMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard navigation for dropdown
  const handleDropdownKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsMoreOpen(false)
      moreButtonRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const items = moreRef.current?.querySelectorAll('.dropdown-item')
      if (!items || items.length === 0) return
      const currentIndex = Array.from(items).indexOf(document.activeElement)
      const nextIndex = (currentIndex + 1) % items.length
      items[nextIndex]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const items = moreRef.current?.querySelectorAll('.dropdown-item')
      if (!items || items.length === 0) return
      const currentIndex = Array.from(items).indexOf(document.activeElement)
      const prevIndex = (currentIndex - 1 + items.length) % items.length
      items[prevIndex]?.focus()
    }
  }

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const ext = getFileExtension(activeFile)
  const canRun = ['py', 'js', 'jsx', 'mjs', 'html', 'htm'].includes(ext)
  const runTooltip = !activeFile
    ? 'No file open'
    : canRun
    ? `Run ${activeFile} (Ctrl+Enter)`
    : "Running this language is not supported offline"

  return (
    <header className="topbar">
      {/* Left: Project title & Room identifier */}
      <div className="topbar-left">
        <button
          type="button"
          className="btn-icon-bar btn-mobile-nav"
          onClick={onToggleMobileSidebar}
          title="Toggle Explorer"
          aria-label="Toggle Explorer"
        >
          <Folder size={15} />
        </button>
        <div className="app-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="brand-logo-icon">
            <path d="M8 6L3 12L8 18" stroke="var(--accent-primary)" />
            <path d="M16 6L21 12L16 18" stroke="var(--accent-primary)" />
            <path d="M14 9A4 4 0 0 0 9.5 13" stroke="var(--text-muted)" />
            <path d="M10 15A4 4 0 0 0 14.5 11" stroke="var(--text-muted)" />
          </svg>
          <span className="brand-name">OffCode</span>
          <span className="brand-separator">/</span>
          <button
            type="button"
            className="btn-room-badge"
            onClick={handleCopyLink}
            title={copied ? "Copied invite link!" : `Room: ${roomId} (click to copy link)`}
          >
            <span className="room-name">{roomId}</span>
            {copied ? <Check size={11} className="room-copy-icon" /> : <Copy size={11} className="room-copy-icon" />}
          </button>
        </div>

        {/* Host Mode Switch & Review Controls */}
        {isHost ? (
          <div className="topbar-mode-group">
            <span className="host-tag"><Crown size={11} /> Host</span>
            <div className="topbar-mode-segmented" role="tablist">
              <div className={`mode-segmented-indicator ${mode === 'review' ? 'review' : 'live'}`} />
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'free' || mode === 'live'}
                className={`mode-segmented-tab ${mode === 'free' || mode === 'live' ? 'active' : ''}`}
                onClick={() => onSetMode && onSetMode('live')}
                title="Live Mode: Direct concurrent editing"
              >
                Live
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'review'}
                className={`mode-segmented-tab ${mode === 'review' ? 'active' : ''}`}
                onClick={() => onSetMode && onSetMode('review')}
                title="Review Mode: Collaborators work in drafts"
              >
                Review
              </button>
            </div>

            <button
              type="button"
              className="btn-toolbar btn-proposals"
              onClick={onOpenReviewDrawer}
              title="Open Proposals Review & Diff"
            >
              <GitPullRequest size={13} />
              <span>Proposals</span>
              {pendingProposalsCount > 0 && (
                <span className="badge-count">{pendingProposalsCount}</span>
              )}
            </button>
          </div>
        ) : (
          mode === 'review' && (
            <div className="topbar-mode-group">
              <span className="review-mode-tag">Review Mode</span>
              <button
                type="button"
                className="btn-toolbar btn-push-draft-top"
                onClick={onOpenPushDraft}
                disabled={!activeFile || isStopped}
                title={isStopped ? 'Editing stopped by host' : 'Push draft changes for host review'}
              >
                <Send size={13} />
                <span>Push draft</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Right: Grouped button actions with dividers */}
      <div className="topbar-right">
        {/* Group 1: Undo / Redo */}
        <div className="topbar-group">
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onUndo}
            disabled={!canUndo || isStopped}
            title={isStopped ? 'Editing stopped by host' : (canUndo ? `Undo  Ctrl+Z (${undoDepth})` : 'Undo  Ctrl+Z')}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onRedo}
            disabled={!canRedo || isStopped}
            title={isStopped ? 'Editing stopped by host' : (canRedo ? `Redo  Ctrl+Y (${redoDepth})` : 'Redo  Ctrl+Y')}
          >
            <Redo2 size={15} />
          </button>
        </div>

        <div className="topbar-divider" />

        {/* Group 2: Run & Save */}
        <div className="topbar-group">
          {isRunning ? (
            <button
              type="button"
              className="btn-flat btn-danger btn-stop-top"
              onClick={onStopCode}
              title="Stop running execution"
            >
              <Loader2 size={13} className="spin-icon" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-flat btn-primary btn-run"
              onClick={onRunCode}
              disabled={!canRun}
              title={runTooltip}
            >
              <Play size={13} />
              <span>Run</span>
            </button>
          )}

          <button
            type="button"
            className="btn-flat btn-secondary btn-save"
            onClick={onSaveCurrentFile}
            disabled={!activeFile}
            title={`Save "${activeFile || 'current file'}" to computer (Ctrl+S)`}
          >
            <Save size={13} />
            <span>Save</span>
          </button>
        </div>

        <div className="topbar-divider" />

        {/* Group 3: Chat, Updates, Theme, More */}
        <div className="topbar-group">
          <button
            type="button"
            className={`btn-flat btn-secondary btn-chat-toggle ${isChatOpen ? 'active' : ''}`}
            onClick={onToggleChat}
            title={isChatOpen ? 'Close chat' : (unreadChatCount > 0 ? `Open chat (${unreadChatCount} unread)` : 'Open chat')}
          >
            <MessageSquare size={13} />
            <span>Chat</span>
            {unreadChatCount > 0 && !isChatOpen && (
              <span className="badge-unread-count">{unreadChatCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`btn-flat btn-secondary btn-update-logs ${isUpdateLogsOpen ? 'active' : ''}`}
            onClick={() => setIsUpdateLogsOpen(!isUpdateLogsOpen)}
            title={`View update logs (${currentVersion})`}
          >
            <History size={13} />
            <span>Updates</span>
            <span className="badge-update-tag">{currentVersion}</span>
          </button>

          <button
            type="button"
            className="btn-icon-bar btn-theme-toggle"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            type="button"
            className="btn-icon-bar btn-mobile-people"
            onClick={onToggleMobilePeople}
            title="Toggle Collaborators"
            aria-label="Toggle Collaborators"
          >
            <Users size={15} />
          </button>

          <div className="more-menu-wrapper" ref={moreRef} onKeyDown={handleDropdownKeyDown}>
            <button
              ref={moreButtonRef}
              type="button"
              className={`btn-icon-bar btn-more ${isMoreOpen ? 'active' : ''}`}
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              title="More actions"
              aria-haspopup="true"
              aria-expanded={isMoreOpen}
            >
              <MoreVertical size={16} />
            </button>

            {isMoreOpen && (
              <div className="more-dropdown-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    if (onToggleTheme) onToggleTheme()
                    setIsMoreOpen(false)
                  }}
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className={`dropdown-item btn-toggle-user-changes ${showUserChanges ? 'active' : ''}`}
                  onClick={() => {
                    if (onToggleShowUserChanges) onToggleShowUserChanges()
                  }}
                  title={showUserChanges ? 'Hide collaborator changes' : 'Show collaborator changes with colored underlines'}
                >
                  <Highlighter size={14} />
                  <span style={{ flex: 1, textAlign: 'left' }}>Show User Changes</span>
                  <span
                    className="toggle-indicator-badge"
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-xs)',
                      background: showUserChanges ? 'var(--color-success-bg)' : 'var(--bg-active-row)',
                      color: showUserChanges ? 'var(--color-success)' : 'var(--text-muted)',
                      marginLeft: '8px'
                    }}
                  >
                    {showUserChanges ? 'ON' : 'OFF'}
                  </span>
                </button>

                <div className="dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    setIsMoreOpen(false)
                    if (onOpenAiKeyModal) onOpenAiKeyModal()
                  }}
                >
                  <Key size={14} />
                  <span>Change AI key</span>
                </button>

                {hasAiKey && (
                  <button
                    type="button"
                    role="menuitem"
                    className="dropdown-item text-danger"
                    onClick={() => {
                      setIsMoreOpen(false)
                      if (onRemoveAiKey) onRemoveAiKey()
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Remove AI key</span>
                  </button>
                )}

                <div className="dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    setIsUpdateLogsOpen(true)
                    setIsMoreOpen(false)
                  }}
                >
                  <History size={14} />
                  <span>Update logs ({currentVersion})</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    onDownloadAllZip()
                    setIsMoreOpen(false)
                  }}
                >
                  <Download size={14} />
                  <span>Download all (.zip)</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    onToggleDebug()
                    setIsMoreOpen(false)
                  }}
                >
                  <Terminal size={14} />
                  <span>Debug panel</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    onToggleOnline()
                    setIsMoreOpen(false)
                  }}
                >
                  {status === 'offline' ? (
                    <>
                      <Wifi size={14} />
                      <span>Go online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff size={14} />
                      <span>Go offline</span>
                    </>
                  )}
                </button>

                <div className="dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    handleCopyLink()
                    setIsMoreOpen(false)
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Link copied' : 'Copy room link'}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item text-danger"
                  onClick={() => {
                    setIsMoreOpen(false)
                    onLeaveRoom()
                  }}
                >
                  <LogOut size={14} />
                  <span>Exit room</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isUpdateLogsOpen && (
        <UpdateLogsModal
          isOpen={isUpdateLogsOpen}
          onClose={() => setIsUpdateLogsOpen(false)}
        />
      )}
    </header>
  )
}
