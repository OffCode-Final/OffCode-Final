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
  MessageSquare
} from 'lucide-react'
import { getFileExtension } from '../utils/helpers'

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
  unreadChatCount = 0
}) {
  const [copied, setCopied] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const moreRef = useRef(null)

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
        <div className="app-brand">
          <span className="brand-name">OffCode</span>
          <span className="brand-separator">/</span>
          <span className="room-name" title={`Room code: ${roomId}`}>
            {roomId}
          </span>
        </div>

        {/* Host Mode Switch & Review Controls */}
        {isHost ? (
          <div className="topbar-mode-group">
            <span className="host-tag">Host</span>
            <div className="mode-switch">
              <button
                type="button"
                className={`btn-mode-tab ${mode === 'free' ? 'active' : ''}`}
                onClick={() => onSetMode && onSetMode('free')}
                title="Live Mode: Direct concurrent editing"
              >
                Live
              </button>
              <button
                type="button"
                className={`btn-mode-tab ${mode === 'review' ? 'active' : ''}`}
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
              <GitPullRequest size={14} />
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
                disabled={!activeFile}
                title="Push draft changes for host review"
              >
                <Send size={13} />
                <span>Push draft</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Right: Undo/Redo icon buttons, Run, Save, More dropdown */}
      <div className="topbar-right">
        {/* Undo / Redo icon buttons */}
        <div className="icon-actions-group">
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onUndo}
            disabled={!canUndo}
            title={canUndo ? `Undo your edits (Ctrl+Z) [${undoDepth}]` : 'Undo (Ctrl+Z)'}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onRedo}
            disabled={!canRedo}
            title={canRedo ? `Redo your edits (Ctrl+Shift+Z / Ctrl+Y) [${redoDepth}]` : 'Redo (Ctrl+Shift+Z)'}
          >
            <Redo2 size={15} />
          </button>
        </div>

        {/* Run / Stop Code */}
        {isRunning ? (
          <button
            type="button"
            className="btn-flat btn-danger btn-stop-top"
            onClick={onStopCode}
            title="Stop running execution"
          >
            <Square size={13} />
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

        {/* Save Current File */}
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

        {/* Chat Sidebar Toggle */}
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

        {/* More Actions Dropdown Menu */}
        <div className="more-menu-wrapper" ref={moreRef}>
          <button
            type="button"
            className={`btn-icon-bar btn-more ${isMoreOpen ? 'active' : ''}`}
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            title="More actions"
          >
            <MoreVertical size={16} />
          </button>

          {isMoreOpen && (
            <div className="more-dropdown-menu">
              <button
                type="button"
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
    </header>
  )
}
