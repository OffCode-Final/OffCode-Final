import { useState } from 'react'
import { Send } from 'lucide-react'

export default function PushDraftModal({
  isOpen,
  onClose,
  onSubmit,
  fileName
}) {
  const [message, setMessage] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(message)
    setMessage('')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-push" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4>Push Draft for Review</h4>
        </div>
        <p className="modal-desc">
          Submit your draft changes for <strong>{fileName}</strong> to the room host.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="proposal-message">Description / message:</label>
            <textarea
              id="proposal-message"
              className="text-input textarea-proposal"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Added user input validation"
              autoFocus
            />
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-flat btn-primary btn-sm">
              <Send size={13} />
              <span>Submit proposal</span>
            </button>
            <button
              type="button"
              className="btn-flat btn-secondary btn-sm"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
