import { useState, useEffect, useRef } from 'react'
import { Key, X, ExternalLink } from 'lucide-react'

export default function AiKeyModal({ isOpen, onClose, onSaveKey, initialKey = '' }) {
  const [key, setKey] = useState(initialKey)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setKey(initialKey || '')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, initialKey])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!key.trim()) return
    onSaveKey(key.trim())
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '420px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={16} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="modal-title">AI API Key (Gemini / Groq)</h3>
          </div>
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onClose}
            title="Cancel"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Your API key stays in this browser and is sent only to the AI provider. Selected code and file context are sent directly to the model.
            </p>

            <div>
              <input
                ref={inputRef}
                type="password"
                className="modal-input"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Paste Gemini key (AIza... / AQ...) or Groq key (gsk_...)"
                required
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--accent-link)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none'
                }}
              >
                <span>Get a free Gemini key at Google AI Studio</span>
                <ExternalLink size={11} />
              </a>

              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--accent-link)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none'
                }}
              >
                <span>Get a free Groq key at Groq Console</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              className="btn-flat btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-flat btn-primary"
              disabled={!key.trim()}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
