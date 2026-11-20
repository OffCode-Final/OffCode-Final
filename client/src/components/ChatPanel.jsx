import { useState, useEffect, useRef } from 'react'
import { Send, X } from 'lucide-react'

export default function ChatPanel({
  isOpen,
  onClose,
  workspace,
  session
}) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  // Listen to shared Y.Array('chat')
  useEffect(() => {
    if (!workspace?.ydoc) return

    const chatArray = workspace.ydoc.getArray('chat')
    const updateMessages = () => {
      const arr = chatArray.toArray()
      // Keep only last 200 messages visible
      setMessages(arr.slice(-200))
    }

    updateMessages()
    chatArray.observe(updateMessages)

    return () => {
      chatArray.unobserve(updateMessages)
    }
  }, [workspace])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

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

    const safeId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${Math.random().toString(36).slice(2, 6)}`
    const myUserId = workspace.getUserId ? workspace.getUserId() : 'user_local'

    const newMsg = {
      id: safeId,
      userId: myUserId,
      name: session?.userName || 'Anonymous',
      color: session?.userColor || '#6366f1',
      text: cleanText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

  if (!isOpen) return null

  return (
    <aside className="chat-panel" aria-label="Room Chat">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-title-group">
          <span className="chat-title">CHAT</span>
          <span className="chat-count">({messages.length})</span>
        </div>
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

      {/* Messages list */}
      <div className="chat-messages-container">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <span>No messages yet. Send a message to chat with your team.</span>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id || `${msg.userId}-${msg.time}`} className="chat-message-item">
              <div className="chat-message-meta">
                <span
                  className="chat-message-author"
                  style={{ color: msg.color || 'var(--text-color)' }}
                >
                  {msg.name}
                </span>
                <span className="chat-message-time">{msg.time}</span>
              </div>
              <div className="chat-message-text">{msg.text}</div>
            </div>
          ))
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
