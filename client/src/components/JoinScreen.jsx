import { useState, useEffect, useRef } from 'react'
import { Sun, Moon, Lock, Copy, Check } from 'lucide-react'
import {
  siTypescript,
  siJavascript,
  siPython,
  siRust,
  siGo,
  siCplusplus,
  siC,
  siOpenjdk,
  siPhp,
  siRuby
} from 'simple-icons'
import { getInitialRoomFromUrl, copyToClipboard } from '../utils/helpers'
import AnimatedLogo from './AnimatedLogo'

const SUPPORTED_LANG_MARKS = [
  { name: 'TypeScript', short: 'TS', icon: siTypescript, hex: '3178C6' },
  { name: 'JavaScript', short: 'JS', icon: siJavascript, hex: 'F7DF1E' },
  { name: 'Python', short: 'Python', icon: siPython, hex: '3776AB' },
  { name: 'Rust', short: 'Rust', icon: siRust, hex: 'DEA584' },
  { name: 'Go', short: 'Go', icon: siGo, hex: '00ADD8' },
  { name: 'C++', short: 'C++', icon: siCplusplus, hex: '00599C' },
  { name: 'C', short: 'C', icon: siC, hex: 'A8B9CC' },
  { name: 'Java', short: 'Java', icon: siOpenjdk, hex: 'ED8B00' },
  { name: 'PHP', short: 'PHP', icon: siPhp, hex: '777BB4' },
  { name: 'Ruby', short: 'Ruby', icon: siRuby, hex: 'CC342D' }
]

function FloatingBackground() {
  return (
    <div className="join-floating-background" aria-hidden="true">
      <div className="bg-float-icon icon-python" style={{ top: '8%', left: '3%', width: '56px', height: '56px', animationDuration: '22s', animationDelay: '-2s' }}>
        <svg viewBox="0 0 48 48"><path d="M24 4c-9 0-8 4-8 4v5h8v2H12S4 14 4 24s6 10 6 10h4v-5s0-6 6-6h9s5 0 5-5V9s1-5-10-5z" fill="#3776ab"/><path d="M24 44c9 0 8-4 8-4v-5h-8v-2h12s8 1 8-9-6-10-6-10h-4v5s0 6-6 6h-9s-5 0-5 5v10s-1 4 10 4z" fill="#ffd43b"/><circle cx="18" cy="9" r="1.6" fill="#fff"/><circle cx="30" cy="39" r="1.6" fill="#fff"/></svg>
      </div>
      <div className="bg-float-icon icon-ts" style={{ top: '72%', left: '4%', width: '50px', height: '50px', animationDuration: '25s', animationDelay: '-7s' }}>
        <svg viewBox="0 0 48 48"><rect width="48" height="48" rx="6" fill="#3178c6"/><text x="44" y="42" textAnchor="end" fontSize="24" fontWeight="800" fill="#fff" fontFamily="sans-serif">TS</text></svg>
      </div>
      <div className="bg-float-icon icon-js" style={{ top: '14%', right: '5%', width: '48px', height: '48px', animationDuration: '20s', animationDelay: '-4s' }}>
        <svg viewBox="0 0 48 48"><rect width="48" height="48" rx="6" fill="#f7df1e"/><text x="44" y="42" textAnchor="end" fontSize="24" fontWeight="800" fill="#323330" fontFamily="sans-serif">JS</text></svg>
      </div>
      <div className="bg-float-icon icon-cpp" style={{ top: '48%', left: '2%', width: '60px', height: '60px', animationDuration: '26s', animationDelay: '-12s' }}>
        <svg viewBox="0 0 48 48"><path d="M24 3l18 10.5v21L24 45 6 34.5v-21z" fill="#00599c"/><text x="11" y="31" fontSize="21" fontWeight="700" fill="#fff" fontFamily="sans-serif">C</text><text x="26" y="29" fontSize="13" fontWeight="700" fill="#fff" fontFamily="sans-serif">++</text></svg>
      </div>
      <div className="bg-float-icon icon-go" style={{ top: '82%', right: '8%', width: '56px', height: '56px', animationDuration: '24s', animationDelay: '-9s' }}>
        <svg viewBox="0 0 48 48"><text x="28" y="32" textAnchor="middle" fontSize="26" fontWeight="800" fontStyle="italic" fill="#00add8" fontFamily="sans-serif">GO</text><path d="M2 20h9M0 26h10M3 32h8" stroke="#00add8" strokeWidth="2.5" strokeLinecap="round"/></svg>
      </div>
      <div className="bg-float-icon icon-rust" style={{ top: '40%', right: '3%', width: '54px', height: '54px', animationDuration: '28s', animationDelay: '-15s' }}>
        <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="none" stroke="#b7410e" strokeWidth="4" strokeDasharray="3.2 2.7"/><circle cx="24" cy="24" r="15" fill="none" stroke="#b7410e" strokeWidth="2.5"/><text x="24" y="31" textAnchor="middle" fontSize="20" fontWeight="800" fill="#b7410e" fontFamily="sans-serif">R</text></svg>
      </div>
      <div className="bg-float-icon icon-php" style={{ top: '22%', left: '44%', width: '52px', height: '52px', animationDuration: '23s', animationDelay: '-10s' }}>
        <svg viewBox="0 0 48 48"><ellipse cx="24" cy="24" rx="22" ry="13" fill="#777bb3"/><text x="24" y="29" textAnchor="middle" fontSize="15" fontWeight="800" fill="#232531" fontFamily="sans-serif">php</text></svg>
      </div>
      <div className="bg-float-icon icon-ruby" style={{ top: '65%', right: '4%', width: '52px', height: '52px', animationDuration: '21s', animationDelay: '-6s' }}>
        <svg viewBox="0 0 48 48"><path d="M10 8h28l8 10-22 26L2 18z" fill="#cc342d"/><path d="M2 18h44M14 18l10 26 10-26M18 8l-4 10 10-10 10 10-4-10" stroke="#fff" strokeWidth="1.5" fill="none" opacity=".8"/></svg>
      </div>
    </div>
  )
}

function LiveTypingDemo() {
  const [typedUser1, setTypedUser1] = useState('connect(room);')
  const [typedUser2, setTypedUser2] = useState('editor.merge(peers);')

  useEffect(() => {
    let step = 0
    const user1Steps = ['connect', 'connect(room)', 'connect(room);']
    const user2Steps = ['editor', 'editor.merge', 'editor.merge(peers);']
    const timer = setInterval(() => {
      step = (step + 1) % 6
      if (step < 3) {
        setTypedUser1(user1Steps[step])
      } else {
        setTypedUser2(user2Steps[step - 3])
      }
    }, 1100)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="join-live-demo" aria-hidden="true">
      <div className="demo-window-header">
        <div className="demo-mac-controls">
          <span className="demo-mac-dot dot-red" />
          <span className="demo-mac-dot dot-yellow" />
          <span className="demo-mac-dot dot-green" />
        </div>
        <span className="demo-filename">workspace.ts</span>
      </div>
      <div className="demo-code-body">
        <div className="demo-line">
          <span className="demo-num">1</span>
          <span className="demo-kw">export function</span> <span className="demo-fn">syncSession</span>(room: <span className="demo-type">string</span>) &#123;
        </div>
        <div className="demo-line">
          <span className="demo-num">2</span>
          <span className="demo-indent" />
          <span className="demo-kw">const</span> session = <span className="demo-val">{typedUser1}</span>
          <span className="demo-cursor demo-cursor-user1">
            <span className="demo-cursor-caret" />
            <span className="demo-cursor-tag">User 1</span>
          </span>
        </div>
        <div className="demo-line">
          <span className="demo-num">3</span>
          <span className="demo-indent" />
          <span className="demo-kw">return</span> <span className="demo-val">{typedUser2}</span>
          <span className="demo-cursor demo-cursor-user2">
            <span className="demo-cursor-caret" />
            <span className="demo-cursor-tag">User 2</span>
          </span>
        </div>
        <div className="demo-line">
          <span className="demo-num">4</span>
          &#125;
        </div>
      </div>
    </div>
  )
}

export default function JoinScreen({ onJoin, theme = 'dark', onToggleTheme }) {
  const cardRef = useRef(null)
  const [tab, setTab] = useState('join') // 'create' | 'join'
  const [userName, setUserName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [error, setError] = useState('')
  const [missingRoomWarning, setMissingRoomWarning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [roomStatus, setRoomStatus] = useState(null)

  const generateRandomRoom = () => {
    return `room-${Math.floor(1000 + Math.random() * 9000)}`
  }

  useEffect(() => {
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
  }, [])

  // Real-time polling room existence check
  useEffect(() => {
    const clean = (roomId || '').trim().toLowerCase()
    if (!clean) {
      setRoomStatus(null)
      setMissingRoomWarning(false)
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
            if (data.exists) {
              setMissingRoomWarning(false)
            }
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
    setMissingRoomWarning(false)
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
    setMissingRoomWarning(false)

    try {
      if (tab === 'join') {
        const checkRes = await fetch(`${httpBase}/api/room-check/${encodeURIComponent(cleanRoom)}`)
        const checkData = checkRes.ok ? await checkRes.json() : null

        if (!checkData || !checkData.exists) {
          setMissingRoomWarning(true)
          setIsSubmitting(false)
          return
        }

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
      <FloatingBackground />

      {onToggleTheme && (
        <div className="join-theme-corner">
          <button
            type="button"
            className="btn-icon-bar btn-theme-toggle"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      )}

      <div className="join-layout-grid">
        {/* Left Column: Brand Hero & Editorial Demo */}
        <section className="join-hero-left">
          <div className="join-brand-wrapper">
            <AnimatedLogo size={280} animated={true} />
          </div>

          <h1 className="join-editorial-headline">
            Write code together. Even{' '}
            <span className="headline-offline">
              offline<span className="headline-caret" aria-hidden="true">|</span>
            </span>
          </h1>

          <p className="join-editorial-sub">
            Edit the same files with your team in real time. Keep typing when the Wi-Fi drops. Your edits merge when you reconnect.
          </p>

          <ul className="join-features-list">
            <li className="join-feature-item">
              <span className="join-feature-bullet" aria-hidden="true">{'{ }'}</span>
              <span>Live editing with per-user undo</span>
            </li>
            <li className="join-feature-item">
              <span className="join-feature-bullet" aria-hidden="true">{'{ }'}</span>
              <span>Offline edits merge automatically when you reconnect</span>
            </li>
            <li className="join-feature-item">
              <span className="join-feature-bullet" aria-hidden="true">{'{ }'}</span>
              <span>Review mode with drafts, diffs and Python in the browser</span>
            </li>
          </ul>

          <LiveTypingDemo />
        </section>

        {/* Right Column: Interactive Card */}
        <div ref={cardRef} className="join-card">
          <div className="join-card-header">
            <h2 className="join-card-title">{tab === 'create' ? 'Create a room' : 'Join a room'}</h2>
          </div>

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

          {error && <div className="alert-error" role="alert">{error}</div>}

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
                autoComplete="name"
                spellCheck={false}
                autoFocus
              />
            </div>

            <div className="form-group">
              <div className="room-label-row">
                <label htmlFor="room-id">Room Code</label>
                {tab === 'create' && (
                  <button
                    type="button"
                    className="btn-flat btn-secondary btn-xs"
                    onClick={() => setRoomId(generateRandomRoom())}
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
                  setMissingRoomWarning(false)
                }}
                placeholder={tab === 'create' ? 'e.g. room-7429' : 'Paste room code'}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
              />

              {missingRoomWarning && (
                <div className="inline-missing-room-note">
                  <span>Room has not been created yet. Create it first.</span>{' '}
                  <button
                    type="button"
                    className="inline-create-link"
                    onClick={() => handleTabChange('create')}
                  >
                    Create it instead
                  </button>
                </div>
              )}

              {roomId.trim() && roomStatus && !roomStatus.checking && !missingRoomWarning && (
                <div
                  className={`room-status-badge ${roomStatus.exists ? 'status-exists' : 'status-not-created'}`}
                >
                  {tab === 'join' ? (
                    roomStatus.exists ? (
                      <span>
                        Room found: active with {roomStatus.activeUsers} collaborator{roomStatus.activeUsers === 1 ? '' : 's'}.{roomStatus.hasPassword ? ' Password required.' : ''}
                      </span>
                    ) : (
                      <span>
                        Room code available.
                      </span>
                    )
                  ) : (
                    roomStatus.exists ? (
                      <span>
                        Room is already created — you can join it or pick another code.
                      </span>
                    ) : (
                      <span>
                        Room code available — ready to create.
                      </span>
                    )
                  )}
                </div>
              )}
            </div>

            {tab === 'create' && (
              <div className="form-group">
                <label htmlFor="create-room-password" className="label-with-icon">
                  <Lock size={12} />
                  <span>Room Password (Optional)</span>
                </label>
                <input
                  id="create-room-password"
                  type="password"
                  className="text-input"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  placeholder="Optional password to protect this room"
                  maxLength={32}
                  autoComplete="new-password"
                  spellCheck={false}
                />
              </div>
            )}

            {tab === 'join' && roomStatus?.hasPassword && (
              <div className="form-group">
                <label htmlFor="join-room-password" className="label-with-icon">
                  <Lock size={12} />
                  <span>Room Password (Required)</span>
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
                  placeholder="Enter room password"
                  maxLength={32}
                  autoComplete="current-password"
                  spellCheck={false}
                  autoFocus
                />
              </div>
            )}

            {tab === 'create' && shareUrl && (
              <div className="form-group">
                <label>Share Link</label>
                <div className="share-link-box">
                  <span className="share-link-text">{shareUrl}</span>
                  <button
                    type="button"
                    className="btn-flat btn-secondary btn-xs"
                    onClick={handleCopyLink}
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

            <button type="submit" className="btn-flat btn-primary btn-join" disabled={isSubmitting}>
              {isSubmitting ? 'Connecting…' : (tab === 'create' ? 'Create room' : 'Join room')}
            </button>
          </form>

          <footer className="join-footer">
            <span className="join-footer-hint">Synced through your room server. Keeps working offline.</span>
          </footer>
        </div>
      </div>

      {/* Pinned Bottom Supports Strip */}
      <footer className="join-bottom-supports-strip" role="region" aria-label="Supported languages">
        <div className="supports-strip-inner">
          <span className="supports-strip-label">Supports</span>
          <div className="supports-strip-marks" role="list">
            {SUPPORTED_LANG_MARKS.map((lang) => (
              <div
                key={lang.name}
                className="supports-strip-item"
                title={lang.name}
                style={{ '--brand-color': `#${lang.hex}` }}
                role="listitem"
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={lang.icon.path} />
                </svg>
                <span className="supports-strip-name">{lang.short}</span>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
