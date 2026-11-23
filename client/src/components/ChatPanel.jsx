import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Send, X, Trash2, ArrowDown } from 'lucide-react'

/**
 * Returns the timestamp (in ms) when the user first entered this room.
 * Saved in localStorage under `chatJoinedAt:<room>`.
 * On page refresh, preserves the existing timestamp so own history is not hidden.
 */
export function getChatJoinedAt(roomId, userId = null) {
  if (typeof window === 'undefined') return Date.now()
  const cleanRoom = (roomId || 'default').trim().toLowerCase()
  const baseKey = `chatJoinedAt:${cleanRoom}`

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
  session
}) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewUnseen, setHasNewUnseen] = useState(false)

  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const cleanRoom = (session?.roomId || 'default').trim().toLowerCase()
  const clearedKey = `chatClearedAt:${cleanRoom}`
  const hiddenKey = `chatHidden:${cleanRoom}`

  // Local chatClearedAt (hides messages prior to this on user's screen only)
  const [chatClearedAt, setChatClearedAt] = useState(() => {
    try {
      const saved = window.localStorage.getItem(clearedKey)
      return saved ? parseInt(saved, 10) || 0 : 0
    } catch (_) {
      return 0
    }
  })

  // Local chatHidden (capped at 500 ids, hides only those messages on user's screen)
  const [hiddenIds, setHiddenIds] = useState(() => {
    try {
      const saved = window.localStorage.getItem(hiddenKey)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch (_) {
      return new Set()
    }
  })

  // Retrieve or initialize the joinedAt timestamp for this room
  const myUserId = workspace?.getUserId ? workspace.getUserId() : session?.userName
  const joinedAt = useMemo(() => getChatJoinedAt(session?.roomId, myUserId), [session?.roomId, myUserId])

  // Listen to shared Y.Array('chat')
  useEffect(() => {
    if (!workspace?.ydoc) return

    const chatArray = workspace.ydoc.getArray('chat')
    const updateMessages = () => {
      const arr = chatArray.toArray()
      setMessages(arr.slice(-200))
    }

    updateMessages()
    chatArray.observe(updateMessages)

    return () => {
      chatArray.unobserve(updateMessages)
    }
  }, [workspace])

  // Filter messages: Only display messages with time >= joinedAt - 2000 AND > chatClearedAt AND not hidden
  const cutoff = Math.max(joinedAt - 2000, chatClearedAt)
  const visibleMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (!msg) return false
      if (msg.id && hiddenIds.has(msg.id)) return false
      return getMessageTime(msg) >= cutoff
    })
  }, [messages, cutoff, hiddenIds])

  // Check scroll position
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 30
    setIsAtBottom(atBottom)
    if (atBottom) {
      setHasNewUnseen(false)
    }
  }, [])

  // Auto-scroll to bottom on new messages if user was already at bottom
  useEffect(() => {
    if (!isOpen) return
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setHasNewUnseen(true)
    }
  }, [visibleMessages, isAtBottom, isOpen])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
    setHasNewUnseen(false)
  }

  // Focus and auto-grow input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [isOpen])

  const handleInputChange = (e) => {
    setInputText(e.target.value.slice(0, 500))
    // Auto-grow textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  const handleSend = () => {
    const text = inputText.trim()
    if (!text || !workspace?.ydoc) return

    const cleanText = text.slice(0, 500)
    const chatArray = workspace.ydoc.getArray('chat')

    const now = Date.now()
    const safeId = `msg_${now}_${Math.random().toString(36).slice(2, 9)}_${Math.random().toString(36).slice(2, 6)}`
    const resolvedUserId = workspace.getUserId ? workspace.getUserId() : 'user_local'

    const newMsg = {
      id: safeId,
      userId: resolvedUserId,
      name: session?.userName || 'Anonymous',
      color: session?.userColor || '#6366f1',
      text: cleanText,
      time: now,
      displayTime: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    chatArray.push([newMsg])
    setInputText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setTimeout(scrollToBottom, 50)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Clear chat for current user only
  const handleClearChatForMe = () => {
    const ok = window.confirm('Clear chat on your screen only? Other people keep their messages.')
    if (!ok) return

    const now = Date.now()
    setChatClearedAt(now)
    try {
      window.localStorage.setItem(clearedKey, String(now))
    } catch (_) {}
  }

  // Delete single message for current user only
  const handleDeleteMessageForMe = (msgId) => {
    if (!msgId) return
    setHiddenIds((prev) => {
      const next = new Set(prev)
      next.add(msgId)
      // Cap at 500 ids, dropping oldest
      let arr = Array.from(next)
      if (arr.length > 500) {
        arr = arr.slice(arr.length - 500)
      }
      try {
        window.localStorage.setItem(hiddenKey, JSON.stringify(arr))
      } catch (_) {}
      return new Set(arr)
    })
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
          <button
            type="button"
            className="btn-clear-chat"
            onClick={handleClearChatForMe}
            title="Clear chat on your screen only"
          >
            Clear chat
          </button>
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
      <div
        className="chat-messages-container"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {visibleMessages.length === 0 ? (
          <div className="chat-empty-state">
            <span>
              No messages yet.<span className="signature-caret" aria-hidden="true">|</span>
            </span>
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
                  <div className="chat-message-meta-right">
                    <span className="chat-message-time">{formatChatTime(msg)}</span>
                    <button
                      type="button"
                      className="btn-delete-msg-hover"
                      onClick={() => handleDeleteMessageForMe(msg.id)}
                      title="Delete for me"
                      aria-label="Delete message for me"
                    >
                      <Trash2 size={12} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                <div className="chat-message-text">{msg.text}</div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* "New messages" scroll-to-bottom floating pill */}
      {hasNewUnseen && (
        <button
          type="button"
          className="chat-new-messages-pill"
          onClick={scrollToBottom}
        >
          <ArrowDown size={12} strokeWidth={2} />
          <span>New messages</span>
        </button>
      )}

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-box">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Type a message (Enter to send, Shift+Enter for newline)..."
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            maxLength={500}
            rows={2}
          />
          <div className="chat-input-footer">
            <span className="chat-char-count">
              {inputText.length > 400 ? `${inputText.length}/500` : ''}
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
