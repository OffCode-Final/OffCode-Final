import { useState, useEffect } from 'react'
import { USER_COLORS, getRandomColor, getInitialRoomFromUrl } from '../utils/helpers'

export default function JoinScreen({ onJoin }) {
  const [userName, setUserName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [userColor, setUserColor] = useState(USER_COLORS[0].hex)
  const [error, setError] = useState('')

  useEffect(() => {
    // If ?as=<name> is provided in URL, prioritize it
    const params = new URLSearchParams(window.location.search)
    const asParam = params.get('as')

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

    // Set initial room from URL or default
    setRoomId(getInitialRoomFromUrl())

    // Randomize avatar color
    setUserColor(getRandomColor().hex)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const cleanName = userName.trim()
    const cleanRoom = roomId.trim()

    if (!cleanName) {
      setError('Please enter your name.')
      return
    }
    if (!cleanRoom) {
      setError('Please enter a room name.')
      return
    }

    localStorage.setItem('offcode_user_name', cleanName)
    onJoin({
      userName: cleanName,
      roomId: cleanRoom,
      userColor
    })
  }

  return (
    <div className="join-container">
      <div className="join-card">
        <div className="join-header">
          <h2>OffCode</h2>
          <p className="join-subtitle">
            Collaborative real-time code editor with offline sync.
          </p>
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
            <label htmlFor="room-id">Room Code</label>
            <input
              id="room-id"
              type="text"
              className="text-input"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value)
                setError('')
              }}
              placeholder="e.g. hackathon-room"
              maxLength={32}
            />
          </div>

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

          <button type="submit" className="btn-flat btn-primary btn-join">
            Join Room
          </button>
        </form>
      </div>
    </div>
  )
}
