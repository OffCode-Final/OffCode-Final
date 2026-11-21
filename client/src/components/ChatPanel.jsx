import { useState, useEffect, useRef, useMemo } from 'react'
import { Send, X } from 'lucide-react'

/**
 * Returns the timestamp (in ms) when the user first entered this room.
 * Saved in localStorage under `chatJoinedAt:<room>`.
 * On page refresh, preserves the existing timestamp so own history is not hidden.
 */
export function getChatJoinedAt(roomId, userId = null) {
  if (typeof window === 'undefined') return Date.now()
  const cleanRoom = (roomId || 'default').trim().toLowerCase()
  const baseKey = `chatJoinedAt:${cleanRoom}`

  // Support URL ?as=<name> or explicit userId so multi-tab testing on a single machine isolates profiles
  let asParam = userId
  try {
    const params = new URLSearchParams(window.location.search)
    asParam = params.get('as') || userId
  } catch (_) {}

  const key = asParam ? `${baseKey}:${asParam.trim().toLowerCase()}` : baseKey

  try {
    const existing = window.localStorage.getItem(key)
    if (existing) {
      const parsed = parseInt(existing, 10)
      if (!isNaN(parsed) && parsed > 0) {
        return parsed
      }
    }
    const now = Date.now()
    window.localStorage.setItem(key, String(now))
    if (!window.localStorage.getItem(baseKey)) {
      window.localStorage.setItem(baseKey, String(now))
    }
    return now
  } catch (_) {
    return Date.now()
  }
}

/**
 * Extracts a numeric millisecond timestamp from a chat message item.
 * Supports numeric time, timestamp, createdAt, or timestamp encoded in safeId (msg_<timestamp>_...).
 */
export function getMessageTime(msg) {
  if (!msg) return 0
  if (typeof msg.time === 'number') return msg.time
  if (typeof msg.timestamp === 'number') return msg.timestamp
  if (typeof msg.createdAt === 'number') return msg.createdAt
  if (typeof msg.id === 'string' && msg.id.startsWith('msg_')) {
    const parts = msg.id.split('_')
    const t = parseInt(parts[1], 10)
    if (!isNaN(t) && t > 0) return t
  }
  return 0
}

/**
 * Formats a chat message timestamp for UI display.
 */
export function formatChatTime(msg) {
  if (msg?.displayTime) return msg.displayTime
  if (typeof msg?.time === 'string') return msg.time
  if (typeof msg?.time === 'number') {
    return new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return ''
}

export default function ChatPanel({
  isOpen,
  onClose,
  workspace,
  session,
  isHost = false
}) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  // Retrieve or initialize the joinedAt timestamp for this room
  const myUserId = workspace?.getUserId ? workspace.getUserId() : session?.userName
  const joinedAt = useMemo(() => getChatJoinedAt(session?.roomId, myUserId), [session?.roomId, myUserId])

  // Listen to shared Y.Array('chat')
  useEffect(() => {
    if (!workspace?.ydoc) return

    const chatArray = workspace.ydoc.getArray('chat')
    const updateMessages = () => {
      const arr = chatArray.toArray()
      // Keep only last 200 messages in memory
      setMessages(arr.slice(-200))
    }

    updateMessages()
    chatArray.observe(updateMessages)

    return () => {
      chatArray.unobserve(updateMessages)
    }
  }, [workspace])

  // Filter messages: Only display messages with time >= joinedAt minus 2 seconds
  const cutoff = joinedAt - 2000
  const visibleMessages = messages.filter((msg) => getMessageTime(msg) >= cutoff)

  // Auto-scroll to bottom on new visible messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [visibleMessages, isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [isOpen])

  const handleSend = () => {
    const text = inputText.trim()
    if (!text || !workspace?.ydoc) return

    const cleanText = text.slice(0, 500)
    const chatArray = workspace.ydoc.getArray('chat')

    const now = Date.now()
    const safeId = `msg_${now}_${Math.random().toString(36).slice(2, 9)}_${Math.random().toString(36).slice(2, 6)}`
    const myUserId = workspace.getUserId ? workspace.getUserId() : 'user_local'

    const newMsg = {
      id: safeId,
      userId: myUserId,
      name: session?.userName || 'Anonymous',
      color: session?.userColor || '#6366f1',
      text: cleanText,
      time: now,
      displayTime: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    chatArray.push([newMsg])
    setInputText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClearChat = () => {
    if (!workspace?.ydoc) return
    const ok = window.confirm('Delete all chat messages for everyone?')
    if (!ok) return

    const chatArray = workspace.ydoc.getArray('chat')
    workspace.ydoc.transact(() => {
      if (chatArray.length > 0) {
        chatArray.delete(0, chatArray.length)
      }
    }, 'chat-clear')
  }

  if (!isOpen) return null

  return (
    <aside className="chat-panel" aria-label="Room Chat">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-title-group">
          <span className="chat-title">CHAT</span>
          <span className="chat-count">({visibleMessages.length})</span>
        </div>
        <div className="chat-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isHost && (
            <button
              type="button"
              className="btn-clear-chat"
              onClick={handleClearChat}
              title="Delete all chat messages for everyone"
            >
              Clear chat
            </button>
          )}
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onClose}
            title="Close chat"
            aria-label="Close chat"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages list */}
      <div className="chat-messages-container">
        {visibleMessages.length === 0 ? (
          <div className="chat-empty-state">
            <span>No messages yet.</span>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isOwn = Boolean(myUserId && msg.userId === myUserId)
            return (
              <div
                key={msg.id || `${msg.userId}-${msg.time}`}
                className={`chat-message-item ${isOwn ? 'own-message' : ''}`}
              >
                <div className="chat-message-meta">
                  <span
                    className="chat-message-author"
                    style={{ color: msg.color || 'var(--text-color)' }}
                  >
                    {msg.name}{isOwn ? ' (you)' : ''}
                  </span>
                  <span className="chat-message-time">{formatChatTime(msg)}</span>
                </div>
                <div className="chat-message-text">{msg.text}</div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-box">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Type a message (Enter to send, Shift+Enter for newline)..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value.slice(0, 500))}
            onKeyDown={handleKeyDown}
            maxLength={500}
            rows={2}
          />
          <div className="chat-input-footer">
            <span className="chat-char-count">
              {inputText.length}/500
            </span>
            <button
              type="button"
              className="btn-flat btn-primary btn-chat-send"
              onClick={handleSend}
              disabled={!inputText.trim()}
              title="Send message (Enter)"
            >
              <Send size={12} />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
