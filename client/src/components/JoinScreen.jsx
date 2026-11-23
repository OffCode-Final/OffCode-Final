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
import { getRandomColor, getInitialRoomFromUrl, copyToClipboard, USER_COLORS } from '../utils/helpers'
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

function LiveTypingDemo() {
  const [typedAsha, setTypedAsha] = useState('connect(room);')
  const [typedDev, setTypedDev] = useState('editor.merge(peers);')

  useEffect(() => {
    let step = 0
    const ashaSteps = ['connect', 'connect(room)', 'connect(room);']
    const devSteps = ['editor', 'editor.merge', 'editor.merge(peers);']
    const timer = setInterval(() => {
      step = (step + 1) % 6
      if (step < 3) {
        setTypedAsha(ashaSteps[step])
      } else {
        setTypedDev(devSteps[step - 3])
      }
    }, 1100)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="join-live-demo" aria-hidden="true">
      <div className="demo-window-header">
        <span className="demo-dot" />
        <span className="demo-dot" />
        <span className="demo-dot" />
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
          <span className="demo-kw">const</span> session = <span className="demo-val">{typedAsha}</span>
          <span className="demo-cursor demo-cursor-asha">
            <span className="demo-cursor-caret" />
            <span className="demo-cursor-tag">Asha</span>
          </span>
        </div>
        <div className="demo-line">
          <span className="demo-num">3</span>
          <span className="demo-indent" />
          <span className="demo-kw">return</span> <span className="demo-val">{typedDev}</span>
          <span className="demo-cursor demo-cursor-dev">
            <span className="demo-cursor-caret" />
            <span className="demo-cursor-tag">Dev</span>
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
  const [userColor, setUserColor] = useState(() => getRandomColor().hex)
  const [error, setError] = useState('')
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
        const checkRes = await fetch(`${httpBase}/api/room-check/${encodeURIComponent(cleanRoom)}`)
        const checkData = checkRes.ok ? await checkRes.json() : null

        if (!checkData || !checkData.exists) {
          setError('Room has not been created yet. Please switch to Create Room to create it.')
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
            <AnimatedLogo size={180} animated={true} />
          </div>

          <h1 className="join-editorial-headline">
            Write code together. <em>Even offline.</em>
          </h1>

          <p className="join-editorial-sub">
            Edit the same files with your team in real time. Keep typing when the Wi-Fi drops. Your edits merge when you reconnect.
          </p>

          <ul className="join-features-list">
            <li className="join-feature-item">
              <span className="join-feature-bullet" aria-hidden="true">{'{ }'}</span>
              <span>Live multiplayer editing with per-user undo and cursor awareness</span>
            </li>
            <li className="join-feature-item">
              <span className="join-feature-bullet" aria-hidden="true">{'{ }'}</span>
              <span>Conflict-free offline merge that safely synchronizes on reconnect</span>
            </li>
            <li className="join-feature-item">
              <span className="join-feature-bullet" aria-hidden="true">{'{ }'}</span>
              <span>Host review mode with isolated drafts, side-by-side diffs, and Python runtime</span>
            </li>
          </ul>

          <LiveTypingDemo />

          <div className="join-supports-row">
            <span className="join-supports-label">Supports</span>
            <div className="join-supports-icons" role="list" aria-label="Supported programming languages">
              {SUPPORTED_LANG_MARKS.map((lang) => (
                <div
                  key={lang.name}
                  className="join-lang-badge"
                  title={lang.name}
                  style={{ '--brand-color': `#${lang.hex}` }}
                >
                  <svg
                    role="img"
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d={lang.icon.path} />
                  </svg>
                  <span className="join-lang-text">{lang.short}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Interactive Card */}
        <div ref={cardRef} className="join-card">
          <div className="join-card-header">
            <span className="join-card-kicker">Workspace Access</span>
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
              <label>Cursor Color</label>
              <div className="join-color-swatches" role="radiogroup" aria-label="Collaborator cursor color">
                {USER_COLORS.map((c) => {
                  const isSelected = userColor.toLowerCase() === c.hex.toLowerCase()
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`join-color-swatch ${isSelected ? 'selected' : ''}`}
                      style={{ backgroundColor: c.hex }}
                      onClick={() => setUserColor(c.hex)}
                      title={c.name}
                      aria-label={`Select cursor color ${c.name}`}
                    />
                  )
                })}
              </div>
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
                }}
                placeholder={tab === 'create' ? 'e.g. room-7429' : 'Paste room code'}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
              />

              {roomId.trim() && roomStatus && !roomStatus.checking && (
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
                        Room has not been created yet. Please create it first.
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

            {shareUrl && (
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

            {tab === 'join' && roomStatus && !roomStatus.exists ? (
              <button
                type="button"
                className="btn-flat btn-primary btn-join btn-warning"
                onClick={() => handleTabChange('create')}
              >
                Room Not Created — Switch to Create
              </button>
            ) : (
              <button type="submit" className="btn-flat btn-primary btn-join" disabled={isSubmitting}>
                {isSubmitting ? 'Connecting…' : (tab === 'create' ? 'Create & Enter Room' : 'Join Room')}
              </button>
            )}
          </form>

          <footer className="join-footer">
            <span className="join-footer-hint">Synced through your room server. Keeps working offline.</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
