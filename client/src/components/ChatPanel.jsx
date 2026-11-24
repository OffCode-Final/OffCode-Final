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
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false)

  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const cleanRoom = (session?.roomId || 'default').trim().toLowerCase()
  const storageKey = `offcode-chat-hidden:${cleanRoom}`

  // Load persisted hidden data: { hiddenIds: string[], clearedBefore: number }
  const initialData = useMemo(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          hiddenIds: Array.isArray(parsed.hiddenIds) ? new Set(parsed.hiddenIds) : new Set(),
          clearedBefore: typeof parsed.clearedBefore === 'number' ? parsed.clearedBefore : 0
        }
      }
      // Legacy fallbacks
      const legacyCleared = window.localStorage.getItem(`chatClearedAt:${cleanRoom}`)
      const legacyHidden = window.localStorage.getItem(`chatHidden:${cleanRoom}`)
      return {
        hiddenIds: legacyHidden ? new Set(JSON.parse(legacyHidden)) : new Set(),
        clearedBefore: legacyCleared ? parseInt(legacyCleared, 10) || 0 : 0
      }
    } catch (_) {
      return { hiddenIds: new Set(), clearedBefore: 0 }
    }
  }, [storageKey, cleanRoom])

  // Local chatClearedAt (hides messages prior to this on user's screen only)
  const [chatClearedAt, setChatClearedAt] = useState(initialData.clearedBefore)

  // Local chatHidden (capped at 500 ids, hides only those messages on user's screen)
  const [hiddenIds, setHiddenIds] = useState(initialData.hiddenIds)
  const [undoItem, setUndoItem] = useState(null)
  const undoTimerRef = useRef(null)

  // Helper to persist hidden state
  const persistHiddenState = useCallback((newHiddenSet, newClearedBefore) => {
    try {
      const arr = Array.from(newHiddenSet).slice(-500)
      window.localStorage.setItem(storageKey, JSON.stringify({
        hiddenIds: arr,
        clearedBefore: newClearedBefore
      }))
    } catch (_) {}
  }, [storageKey])

  // Retrieve or initialize the joinedAt timestamp for this room
  const myUserId = workspace?.getUserId ? workspace.getUserId() : session?.userName
  const joinedAt = useMemo(() => getChatJoinedAt(session?.roomId, myUserId), [session?.roomId, myUserId])

  // Listen to shared Y.Array('chat')
  useEffect(() => {
    if (!workspace?.ydoc) return

    const chatArray = workspace.ydoc.getArray('chat')
    const updateMessages = () => {
      const arr = chatArray.toArray()
      const seen = new Set()
      const deduped = []
      for (const m of arr) {
        if (!m) continue
        const key = m.id || `${m.userId}-${m.time}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(m)
      }
      setMessages(deduped.slice(-200))
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
    setIsConfirmClearOpen(false)
    const now = Date.now()
    setChatClearedAt(now)
    persistHiddenState(hiddenIds, now)
  }

  // Hide single message for current user only with 5-second Undo toast
  const handleHideMessage = (msgId) => {
    if (!msgId) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const nextHidden = new Set(hiddenIds)
    nextHidden.add(msgId)
    setHiddenIds(nextHidden)
    persistHiddenState(nextHidden, chatClearedAt)

    setUndoItem({ msgId })
    undoTimerRef.current = setTimeout(() => {
      setUndoItem(null)
    }, 5000)
  }

  const handleUndoHide = () => {
    if (!undoItem) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const nextHidden = new Set(hiddenIds)
    nextHidden.delete(undoItem.msgId)
    setHiddenIds(nextHidden)
    persistHiddenState(nextHidden, chatClearedAt)
    setUndoItem(null)
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
            onClick={() => setIsConfirmClearOpen(true)}
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
              No messages yet.<span className="signature-caret" aria-hidden="true" />
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
                      onClick={() => handleHideMessage(msg.id)}
                      title="Hide message on your screen"
                      aria-label="Hide message on your screen"
                    >
                      <Trash2 size={12} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                <div
                  className={`chat-message-text ${msg.isDeleted ? 'chat-message-deleted' : ''}`}
                  style={msg.isDeleted ? { fontStyle: 'italic', opacity: 0.6 } : {}}
                >
                  {msg.text}
                </div>
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

      {/* 5-second Undo Toast for hidden message */}
      {undoItem && (
        <div className="chat-undo-toast" role="status" aria-live="polite">
          <span>Message hidden</span>
          <button
            type="button"
            className="btn-undo-action"
            onClick={handleUndoHide}
            aria-label="Undo hide message"
          >
            Undo
          </button>
        </div>
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
      {/* Clear Chat Confirmation Modal */}
      {isConfirmClearOpen && (
        <div className="modal-backdrop" onClick={() => setIsConfirmClearOpen(false)}>
          <div className="modal-card modal-delete" onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-title">Clear Chat</h4>
            <p className="modal-desc">
              Clear chat on your screen? Other people keep their messages.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-flat btn-secondary"
                onClick={() => setIsConfirmClearOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-flat btn-danger btn-confirm-clear-chat"
                onClick={handleClearChatForMe}
              >
                Clear chat
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
