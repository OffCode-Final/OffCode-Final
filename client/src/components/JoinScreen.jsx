import { useState, useEffect } from 'react'
import { Sun, Moon, Users, WifiOff, GitPullRequest, Copy, Check } from 'lucide-react'
import { USER_COLORS, getRandomColor, getInitialRoomFromUrl, copyToClipboard } from '../utils/helpers'

export default function JoinScreen({ onJoin, theme = 'dark', onToggleTheme }) {
  const [tab, setTab] = useState('join') // 'create' | 'join'
  const [userName, setUserName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [userColor, setUserColor] = useState(USER_COLORS[0].hex)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const generateRandomRoom = () => {
    return `room-${Math.floor(1000 + Math.random() * 9000)}`
  }

  useEffect(() => {
    // If ?as=<name> is provided in URL, prioritize it
    const params = new URLSearchParams(window.location.search)
    const asParam = params.get('as')
    const roomParam = params.get('room')

    if (asParam && asParam.trim()) {
      setUserName(asParam.trim())
    } else {
      const savedName = localStorage.getItem('offcode_user_name')
      if (savedName) {
        setUserName(savedName)
      } else {
        const randomSuffix = Math.floor(100 + Math.random() * 900)
        setUserName(`Developer-${randomSuffix}`)
      }
    }

    if (roomParam && roomParam.trim()) {
      setRoomId(roomParam.trim())
      setTab('join')
    } else {
      const initial = getInitialRoomFromUrl()
      if (initial && initial !== 'hackathon-collab') {
        setRoomId(initial)
        setTab('join')
      } else {
        setRoomId(generateRandomRoom())
        setTab('create')
      }
    }

    // Randomize avatar color
    setUserColor(getRandomColor().hex)
  }, [])

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setError('')
    if (newTab === 'create' && !roomId) {
      setRoomId(generateRandomRoom())
    }
  }

  const handleCopyLink = async () => {
    const cleanRoom = (roomId || 'default').trim()
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
    const shareUrl = `${origin}/?room=${encodeURIComponent(cleanRoom)}`
    const ok = await copyToClipboard(shareUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const cleanName = userName.trim()
    const cleanRoom = roomId.trim()

    if (!cleanName) {
      setError('Please enter your name.')
      return
    }
    if (!cleanRoom) {
      setError('Please enter a room code.')
      return
    }

    setIsSubmitting(true)
    localStorage.setItem('offcode_user_name', cleanName)
    onJoin({
      userName: cleanName,
      roomId: cleanRoom,
      userColor
    })
  }

  const cleanRoomForShare = (roomId || '').trim()
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  const shareUrl = cleanRoomForShare ? `${origin}/?room=${encodeURIComponent(cleanRoomForShare)}` : ''

  return (
    <div className="join-container">
      {onToggleTheme && (
        <div className="join-theme-corner">
          <button
            type="button"
            className="btn-icon-bar btn-theme-toggle"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      )}

      <div className="join-card">
        {/* Brand Header */}
        <div className="join-header">
          <div className="join-brand-row">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="brand-logo-icon">
              <path d="M8 6L3 12L8 18" stroke="var(--accent-primary)" />
              <path d="M16 6L21 12L16 18" stroke="var(--accent-primary)" />
              <path d="M14 9A4 4 0 0 0 9.5 13" stroke="var(--text-muted)" />
              <path d="M10 15A4 4 0 0 0 14.5 11" stroke="var(--text-muted)" />
            </svg>
            <h2>OffCode</h2>
          </div>
          <p className="join-subtitle">
            Collaborative code editor that works offline.
          </p>
          <div className="join-feature-chips">
            <span className="join-chip"><Users size={12} /> Live cursors</span>
            <span className="join-chip"><WifiOff size={12} /> Works offline</span>
            <span className="join-chip"><GitPullRequest size={12} /> Review mode</span>
          </div>
        </div>

        {/* Segmented Control: Create Room vs Join Room */}
        <div className="join-segmented-control" role="tablist">
          <div className={`join-segmented-indicator ${tab}`} />
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'create'}
            className={`join-segmented-tab ${tab === 'create' ? 'active' : ''}`}
            onClick={() => handleTabChange('create')}
          >
            Create Room
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'join'}
            className={`join-segmented-tab ${tab === 'join' ? 'active' : ''}`}
            onClick={() => handleTabChange('join')}
          >
            Join Room
          </button>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="join-form">
          <div className="form-group">
            <label htmlFor="user-name">Your Name</label>
            <input
              id="user-name"
              type="text"
              className="text-input"
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value)
                setError('')
              }}
              placeholder="e.g. Alice"
              maxLength={24}
              autoFocus
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label htmlFor="room-id" style={{ margin: 0 }}>Room Code</label>
              {tab === 'create' && (
                <button
                  type="button"
                  className="btn-flat btn-secondary btn-xs"
                  onClick={() => setRoomId(generateRandomRoom())}
                  style={{ fontSize: '11px', padding: '1px 6px' }}
                >
                  Generate New
                </button>
              )}
            </div>
            <input
              id="room-id"
              type="text"
              className="text-input"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value)
                setError('')
              }}
              placeholder={tab === 'create' ? 'e.g. room-7429' : 'Paste room code or join existing'}
              maxLength={32}
            />
          </div>

          {/* Share Link Preview with Copy Button */}
          {shareUrl && (
            <div className="form-group">
              <label>Share Link</label>
              <div className="share-link-box">
                <span className="share-link-text">{shareUrl}</span>
                <button
                  type="button"
                  className="btn-flat btn-secondary btn-xs"
                  onClick={handleCopyLink}
                  style={{ flexShrink: 0 }}
                >
                  {copied ? (
                    <>
                      <Check size={12} />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Cursor & Presence Color</label>
            <div className="color-palette">
              {USER_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`color-swatch ${userColor === c.hex ? 'selected' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setUserColor(c.hex)}
                  title={c.name}
                />
              ))}
              <button
                type="button"
                className="btn-flat btn-secondary btn-xs"
                onClick={() => setUserColor(getRandomColor().hex)}
              >
                Random
              </button>
            </div>
          </div>

          <button type="submit" className="btn-flat btn-primary btn-join" disabled={isSubmitting}>
            {isSubmitting ? 'Connecting...' : (tab === 'create' ? 'Create & Enter Room' : 'Join Room')}
          </button>
        </form>

        {/* Footer line with connection hint and theme toggle */}
        <div className="join-footer">
          <span className="join-footer-hint">Direct peer sync via local WebSocket</span>
          {onToggleTheme && (
            <button
              type="button"
              className="btn-theme-toggle-link"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
