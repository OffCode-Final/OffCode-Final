import { useState, useRef, useEffect } from 'react'
import {
  Play,
  Save,
  Undo2,
  Redo2,
  MoreVertical,
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
  History,
  Sliders,
  WifiOff,
  Terminal
} from 'lucide-react'
import { getFileExtension, copyToClipboard } from '../utils/helpers'
import UpdateLogsModal from './UpdateLogsModal'
import { UPDATE_LOGS } from '../data/updateLogs'

function TopBarBrandMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className="topbar-brand-mark"
    >
      <g transform="translate(6, 12) scale(0.72) translate(-115.9, -98.6)">
        {/* Blue { */}
        <path
          d="M153.81640625 196.712890625V184.794921875C144.693359375 184.794921875 142.3203125 181.26171875 142.3203125 173.720703125V162.27734375C142.3203125 156.529296875 140.2109375 150.833984375 129.927734375 148.25V147.08984375C140.2109375 144.55859375 142.3203125 138.916015625 142.3203125 133.115234375V121.619140625C142.3203125 114.025390625 144.693359375 110.59765625 153.81640625 110.59765625V98.626953125C138.3125 98.626953125 127.66015625 101.52734375 127.66015625 120.08984375V129.318359375C127.66015625 136.806640625 124.91796875 140.181640625 117.166015625 140.498046875H115.900390625V154.841796875H117.166015625C124.91796875 155.158203125 127.66015625 158.5859375 127.66015625 166.07421875V175.25C127.66015625 193.865234375 138.3125 196.712890625 153.81640625 196.712890625Z"
          fill="#3B82F6"
        />
        {/* Cursor line between braces */}
        <line
          x1="173"
          y1="106"
          x2="173"
          y2="188"
          stroke="var(--text-main)"
          strokeWidth="11"
          strokeLinecap="round"
        />
        {/* Orange } */}
        <path
          d="M192.521484375 196.712890625C207.97265625 196.712890625 218.625 193.865234375 218.625 175.25V166.07421875C218.625 158.216796875 221.630859375 154.841796875 230.384765625 154.7890625V140.55078125H230.279296875C221.630859375 140.498046875 218.625 137.17578125 218.625 129.318359375V120.08984375C218.625 101.52734375 207.97265625 98.626953125 192.521484375 98.626953125V110.59765625C201.64453125 110.59765625 204.017578125 114.078125 204.017578125 121.619140625V133.115234375C204.017578125 138.86328125 206.126953125 144.505859375 216.357421875 147.08984375V148.302734375C206.126953125 150.833984375 204.017578125 156.529296875 204.017578125 162.27734375V173.720703125C204.017578125 181.26171875 201.64453125 184.794921875 192.521484375 184.794921875Z"
          fill="#F97316"
        />
      </g>
    </svg>
  )
}

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
  hasAiKey = false,
  onToggleCustomize,
  isCustomizeOpen = false,
  canRunActive = false,
  runTooltipText = 'Run code (Ctrl+Enter)'
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

  const handleCopyLink = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
    const inviteUrl = `${origin}${pathname}?room=${encodeURIComponent(roomId)}`
    const ok = await copyToClipboard(inviteUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <header className="topbar">
      {/* Left: Favicon mark, separator, room chip, host badge, mode switch, proposals */}
      <div className="topbar-left">
        <button
          type="button"
          className="btn-icon-bar btn-mobile-nav"
          onClick={onToggleMobileSidebar}
          title="Toggle Explorer"
          aria-label="Toggle Explorer"
        >
          <Folder size={16} strokeWidth={1.75} />
        </button>

        <div className="app-brand">
          <TopBarBrandMark />
          <span className="brand-separator" aria-hidden="true">/</span>
          <button
            type="button"
            className="btn-room-badge"
            onClick={handleCopyLink}
            title={copied ? 'Copied invite link!' : `Room: ${roomId} (click to copy link)`}
            aria-label={`Copy invite link for room ${roomId}`}
          >
            <span className="room-name">{roomId}</span>
            {copied ? (
              <Check size={12} strokeWidth={1.75} className="room-copy-icon" />
            ) : (
              <Copy size={12} strokeWidth={1.75} className="room-copy-icon" />
            )}
          </button>
        </div>

        {/* Host Badge */}
        {isHost && (
          <span className="host-tag">
            <Crown size={12} strokeWidth={1.75} />
            <span>Host</span>
          </span>
        )}

        {/* Host Mode Switch & Review Controls */}
        {isHost ? (
          <div className="topbar-mode-group">
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
              <GitPullRequest size={14} strokeWidth={1.75} />
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
                <Send size={14} strokeWidth={1.75} />
                <span>Push draft</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Right: Grouped button actions with hairline dividers */}
      <div className="topbar-right">
        {/* Group 1: Undo / Redo */}
        <div className="topbar-group">
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onUndo}
            disabled={!canUndo || isStopped}
            title={isStopped ? 'Editing stopped by host' : (canUndo ? `Undo  Ctrl+Z (${undoDepth})` : 'Undo  Ctrl+Z')}
            aria-label="Undo"
          >
            <Undo2 size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onRedo}
            disabled={!canRedo || isStopped}
            title={isStopped ? 'Editing stopped by host' : (canRedo ? `Redo  Ctrl+Y (${redoDepth})` : 'Redo  Ctrl+Y')}
            aria-label="Redo"
          >
            <Redo2 size={16} strokeWidth={1.75} />
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
              <Loader2 size={14} strokeWidth={1.75} className="spin-icon" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-flat btn-primary btn-run"
              onClick={onRunCode}
              disabled={!canRunActive}
              title={runTooltipText}
            >
              <Play size={14} strokeWidth={1.75} />
              <span>Run</span>
            </button>
          )}

          <button
            type="button"
            className="btn-toolbar btn-ghost"
            onClick={onSaveCurrentFile}
            disabled={!activeFile}
            title={`Save "${activeFile || 'current file'}" to computer (Ctrl+S)`}
            aria-label="Save file"
          >
            <Save size={16} strokeWidth={1.75} />
            <span>Save</span>
          </button>
        </div>

        <div className="topbar-divider" />

        {/* Group 3: Chat, Updates, Theme, Mobile People, More */}
        <div className="topbar-group">
          <button
            type="button"
            className={`btn-toolbar btn-ghost btn-chat-toggle ${isChatOpen ? 'active' : ''}`}
            onClick={onToggleChat}
            title={isChatOpen ? 'Close chat' : (unreadChatCount > 0 ? `Open chat (${unreadChatCount} unread)` : 'Open chat')}
            aria-label="Toggle Chat"
          >
            <MessageSquare size={16} strokeWidth={1.75} />
            <span>Chat</span>
            {unreadChatCount > 0 && !isChatOpen && (
              <span className="badge-unread-count">{unreadChatCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`btn-toolbar btn-ghost btn-update-logs ${isUpdateLogsOpen ? 'active' : ''}`}
            onClick={() => setIsUpdateLogsOpen(!isUpdateLogsOpen)}
            title={`View update logs (${currentVersion})`}
            aria-label="View update logs"
          >
            <History size={16} strokeWidth={1.75} />
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
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          </button>

          <button
            type="button"
            className={`btn-icon-bar btn-customize-toggle ${isCustomizeOpen ? 'active' : ''}`}
            onClick={onToggleCustomize}
            title="Customize editor"
            aria-label="Customize editor"
          >
            <Sliders size={16} strokeWidth={1.75} />
          </button>

          <button
            type="button"
            className="btn-icon-bar btn-mobile-people"
            onClick={onToggleMobilePeople}
            title="Toggle Collaborators"
            aria-label="Toggle Collaborators"
          >
            <Users size={16} strokeWidth={1.75} />
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
              aria-label="More actions"
            >
              <MoreVertical size={16} strokeWidth={1.75} />
            </button>

            {isMoreOpen && (
              <div className="more-dropdown-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={`dropdown-item btn-toggle-user-changes ${showUserChanges ? 'active' : ''}`}
                  onClick={() => {
                    if (onToggleShowUserChanges) onToggleShowUserChanges()
                  }}
                  title={showUserChanges ? 'Hide collaborator changes' : 'Show collaborator changes with colored underlines'}
                >
                  <Highlighter size={14} strokeWidth={1.75} />
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
                  <Key size={14} strokeWidth={1.75} />
                  <span>{hasAiKey ? 'Change AI key' : 'Add AI key'}</span>
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
                    <Trash2 size={14} strokeWidth={1.75} />
                    <span>Remove AI key</span>
                  </button>
                )}

                <div className="dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className={`dropdown-item ${status === 'offline' ? 'active' : ''}`}
                  onClick={() => {
                    setIsMoreOpen(false)
                    if (onToggleOnline) onToggleOnline()
                  }}
                >
                  <WifiOff size={14} strokeWidth={1.75} />
                  <span style={{ flex: 1, textAlign: 'left' }}>Simulate Offline</span>
                  <span
                    className="toggle-indicator-badge"
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-xs)',
                      background: status === 'offline' ? 'var(--color-warning-bg, #fef3c7)' : 'var(--bg-active-row)',
                      color: status === 'offline' ? 'var(--color-warning, #d97706)' : 'var(--text-muted)',
                      marginLeft: '8px'
                    }}
                  >
                    {status === 'offline' ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className={`dropdown-item ${showDebug ? 'active' : ''}`}
                  onClick={() => {
                    setIsMoreOpen(false)
                    if (onToggleDebug) onToggleDebug()
                  }}
                >
                  <Terminal size={14} strokeWidth={1.75} />
                  <span style={{ flex: 1, textAlign: 'left' }}>Debug Inspector</span>
                  <span
                    className="toggle-indicator-badge"
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-xs)',
                      background: showDebug ? 'var(--color-success-bg)' : 'var(--bg-active-row)',
                      color: showDebug ? 'var(--color-success)' : 'var(--text-muted)',
                      marginLeft: '8px'
                    }}
                  >
                    {showDebug ? 'ON' : 'OFF'}
                  </span>
                </button>

                <div className="dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    setIsMoreOpen(false)
                    if (onDownloadAllZip) onDownloadAllZip()
                  }}
                >
                  <Save size={14} strokeWidth={1.75} />
                  <span>Download ZIP</span>
                </button>

                <div className="dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item text-danger"
                  onClick={() => {
                    setIsMoreOpen(false)
                    if (onLeaveRoom) onLeaveRoom()
                  }}
                >
                  <span>Leave Room</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isUpdateLogsOpen && (
        <UpdateLogsModal isOpen={isUpdateLogsOpen} onClose={() => setIsUpdateLogsOpen(false)} />
      )}
    </header>
  )
}
