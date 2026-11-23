import { useState, useEffect, useRef } from 'react'
import { Sun, Moon, Users, WifiOff, GitPullRequest, Copy, Check, Lock } from 'lucide-react'
import { getRandomColor, getInitialRoomFromUrl, copyToClipboard } from '../utils/helpers'
import AnimatedLogo from './AnimatedLogo'
import LogoBackground from './LogoBackground'

export default function JoinScreen({ onJoin, theme = 'dark', onToggleTheme }) {
  const cardRef = useRef(null)
  const [tab, setTab] = useState('join') // 'create' | 'join'
  const [userName, setUserName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [userColor, setUserColor] = useState(() => getRandomColor().hex)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [roomStatus, setRoomStatus] = useState(null) // { checking: boolean, exists: boolean, hasPassword: boolean, activeUsers: number }

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

  // Real-time polling & debounced room existence check (polls every 2.5s)
  useEffect(() => {
    const clean = (roomId || '').trim().toLowerCase()
    if (!clean) {
      setRoomStatus(null)
      return
    }

    let isCurrent = true

    const doCheck = async (showSpinner = false) => {
      try {
        if (showSpinner) {
          setRoomStatus((prev) => (prev ? { ...prev, checking: true } : { checking: true, exists: null }))
        }

        let httpBase = ''
        if (typeof window !== 'undefined' && window.location) {
          if (window.location.port === '5173') {
            httpBase = `http://${window.location.hostname || 'localhost'}:1234`
          }
        }

        const res = await fetch(`${httpBase}/api/room-check/${encodeURIComponent(clean)}`)
        if (res.ok) {
          const data = await res.json()
          if (isCurrent) {
            setRoomStatus({
              checking: false,
              exists: Boolean(data.exists),
              hasPassword: Boolean(data.hasPassword),
              activeUsers: data.activeUsers || 0
            })
          }
        } else {
          if (isCurrent) setRoomStatus(null)
        }
      } catch (_) {
        if (isCurrent) setRoomStatus(null)
      }
    }

    const timer = setTimeout(() => doCheck(true), 250)
    const pollInterval = setInterval(() => doCheck(false), 2500)

    return () => {
      isCurrent = false
      clearTimeout(timer)
      clearInterval(pollInterval)
    }
  }, [roomId])

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setError('')
    setRoomPassword('')
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

  const handleSubmit = async (e) => {
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

    let httpBase = ''
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.port === '5173') {
        httpBase = `http://${window.location.hostname || 'localhost'}:1234`
      }
    }

    setIsSubmitting(true)
    setError('')

    try {
      if (tab === 'join') {
        // Strict check: Room must exist before joining
        const checkRes = await fetch(`${httpBase}/api/room-check/${encodeURIComponent(cleanRoom)}`)
        const checkData = checkRes.ok ? await checkRes.json() : null

        if (!checkData || !checkData.exists) {
          setError('Room has not been created yet. Please switch to Create Room to create it.')
          setIsSubmitting(false)
          return
        }

        // If room is password protected, verify password
        if (checkData.hasPassword) {
          if (!roomPassword.trim()) {
            setError('This room is password-protected. Please enter the room password.')
            setIsSubmitting(false)
            return
          }

          const verifyRes = await fetch(`${httpBase}/api/rooms/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              room: cleanRoom,
              password: roomPassword.trim()
            })
          })
          const verifyData = verifyRes.ok ? await verifyRes.json() : null
          if (!verifyData || !verifyData.valid) {
            setError('Incorrect room password. Please try again.')
            setIsSubmitting(false)
            return
          }
        }
      } else if (tab === 'create') {
        // Register room on server with optional password
        await fetch(`${httpBase}/api/rooms/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: cleanRoom,
            password: roomPassword.trim()
          })
        })
      }

      localStorage.setItem('offcode_user_name', cleanName)
      onJoin({
        userName: cleanName,
        roomId: cleanRoom,
        userColor,
        password: roomPassword.trim()
      })
    } catch (err) {
      console.error('Error entering room:', err)
      setError('Connection check failed. Please try again.')
      setIsSubmitting(false)
    }
  }

  const cleanRoomForShare = (roomId || '').trim()
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  const shareUrl = cleanRoomForShare ? `${origin}/?room=${encodeURIComponent(cleanRoomForShare)}` : ''

  return (
    <div className="join-container">
      <LogoBackground cardRef={cardRef} />

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

      <div ref={cardRef} className="join-card">
        {/* Brand Header */}
        <div className="join-header">
          <div className="join-brand-row">
            <AnimatedLogo size={210} animated={true} />
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

            {/* Room Status Feedback & Comment */}
            {roomId.trim() && roomStatus && !roomStatus.checking && (
              <div
                className={`room-status-badge ${roomStatus.exists ? 'status-exists' : 'status-not-created'}`}
                style={{
                  marginTop: '8px',
                  padding: '7px 11px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  lineHeight: '1.45',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  backgroundColor: roomStatus.exists ? 'rgba(5, 150, 105, 0.12)' : 'rgba(217, 119, 6, 0.12)',
                  border: `1px solid ${roomStatus.exists ? 'rgba(5, 150, 105, 0.3)' : 'rgba(217, 119, 6, 0.3)'}`,
                  color: roomStatus.exists ? 'var(--color-success, #10b981)' : 'var(--color-warning, #f59e0b)'
                }}
              >
                {tab === 'join' ? (
                  roomStatus.exists ? (
                    <span>
                      ✓ <strong>Room found:</strong> Active with {roomStatus.activeUsers} collaborator{roomStatus.activeUsers === 1 ? '' : 's'} online.{roomStatus.hasPassword ? ' (Password required)' : ''}
                    </span>
                  ) : (
                    <span>
                      ⚠️ <strong>Room has not been created yet.</strong> Please create the room first.
                    </span>
                  )
                ) : (
                  roomStatus.exists ? (
                    <span>
                      ⚠️ <strong>Room is already created</strong> — you can join it or choose a new code.
                    </span>
                  ) : (
                    <span>
                      ✓ <strong>Room code available</strong> — ready to create.
                    </span>
                  )
                )}
              </div>
            )}
          </div>

          {/* Room Password Field for Create Room (Optional) */}
          {tab === 'create' && (
            <div className="form-group">
              <label htmlFor="create-room-password" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Lock size={13} style={{ color: 'var(--accent-primary)' }} />
                Room Password (Optional)
              </label>
              <input
                id="create-room-password"
                type="password"
                className="text-input"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder="Optional password to protect this room"
                maxLength={32}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                If set, collaborators must enter this password to join.
              </span>
            </div>
          )}

          {/* Room Password Field for Join Room (Required when room is protected) */}
          {tab === 'join' && roomStatus?.hasPassword && (
            <div className="form-group">
              <label htmlFor="join-room-password" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Lock size={13} style={{ color: 'var(--color-warning, #f59e0b)' }} />
                Room Password (Required)
              </label>
              <input
                id="join-room-password"
                type="password"
                className="text-input"
                value={roomPassword}
                onChange={(e) => {
                  setRoomPassword(e.target.value)
                  setError('')
                }}
                placeholder="Enter password set by room host"
                maxLength={32}
                autoFocus
              />
            </div>
          )}

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

          {tab === 'join' && roomStatus && !roomStatus.exists ? (
            <button
              type="button"
              className="btn-flat btn-primary btn-join"
              onClick={() => handleTabChange('create')}
              style={{ backgroundColor: 'var(--color-warning, #d97706)', borderColor: 'var(--color-warning, #d97706)' }}
            >
              Room Not Created — Click to Create Room
            </button>
          ) : (
            <button type="submit" className="btn-flat btn-primary btn-join" disabled={isSubmitting}>
              {isSubmitting ? 'Connecting...' : (tab === 'create' ? 'Create & Enter Room' : 'Join Room')}
            </button>
          )}
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

        {/* Crawlable SEO About Block */}
        <div className="join-seo-block">
          <h1 className="join-seo-title">OffCode</h1>
          <p className="join-seo-text">
            OffCode is a real-time collaborative code editor that works completely offline.
            Collaborate with live multiplayer editing, offline merge, per-user undo, and in-browser Python execution.
          </p>
        </div>
      </div>
    </div>
  )
}
