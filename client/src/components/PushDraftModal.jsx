import { useState } from 'react'

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
      <div className="modal-card modal-push-draft" onClick={(e) => e.stopPropagation()}>
        <h3>Push Draft for Review</h3>
        <p>
          Submit your private draft changes for <strong>{fileName}</strong> to the room host.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="proposal-message">Commit Message / Description:</label>
            <textarea
              id="proposal-message"
              className="text-input textarea-proposal"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Added user input validation and fixed corner cases"
              autoFocus
            />
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-small btn-primary">
              🚀 Submit Proposal
            </button>
            <button
              type="button"
              className="btn-small btn-secondary"
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
