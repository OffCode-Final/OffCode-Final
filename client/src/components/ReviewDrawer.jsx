import { useState, useMemo } from 'react'
import * as Diff from 'diff'

export default function ReviewDrawer({
  isOpen,
  onClose,
  proposals = [],
  onAccept,
  onReject,
  onRevert,
  isHost
}) {
  const [selectedProposalId, setSelectedProposalId] = useState(null)

  // Sort proposals: pending first, then by createdAt desc
  const sortedProposals = useMemo(() => {
    return [...proposals].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (a.status !== 'pending' && b.status === 'pending') return 1
      return (b.createdAt || 0) - (a.createdAt || 0)
    })
  }, [proposals])

  // Current selected proposal
  const activeProposal = useMemo(() => {
    if (!sortedProposals.length) return null
    if (selectedProposalId) {
      const found = sortedProposals.find((p) => p.id === selectedProposalId)
      if (found) return found
    }
    return sortedProposals[0]
  }, [sortedProposals, selectedProposalId])

  // Compute diff parts using the diff library
  const diffParts = useMemo(() => {
    if (!activeProposal) return []
    const base = activeProposal.base || ''
    const proposed = activeProposal.proposed || ''
    return Diff.diffLines(base, proposed)
  }, [activeProposal])

  if (!isOpen) return null

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="proposal-status status-pending">⏳ Pending</span>
      case 'accepted':
        return <span className="proposal-status status-accepted">✅ Accepted</span>
      case 'rejected':
        return <span className="proposal-status status-rejected">❌ Rejected</span>
      case 'reverted':
        return <span className="proposal-status status-reverted">↩ Reverted</span>
      default:
        return <span className="proposal-status">{status}</span>
    }
  }

  return (
    <div className="review-drawer-backdrop" onClick={onClose}>
      <div className="review-drawer-content" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="review-drawer-header">
          <div className="review-header-title">
            <span className="drawer-icon">📋</span>
            <h3>Host Review & Diff Inspector</h3>
            <span className="drawer-badge">{proposals.length} Proposals</span>
          </div>
          <button
            type="button"
            className="btn-icon-close"
            onClick={onClose}
            title="Close Review Drawer"
          >
            ✕
          </button>
        </div>

        {/* Drawer Body: 2 Columns (List on Left, Diff & Actions on Right) */}
        <div className="review-drawer-body">
          {/* Column 1: Proposals List */}
          <div className="proposals-list-column">
            <div className="proposals-list-header">
              <span>Proposals ({proposals.filter((p) => p.status === 'pending').length} pending)</span>
            </div>
            <div className="proposals-list-scroll">
              {sortedProposals.length === 0 ? (
                <div className="proposals-empty">
                  No proposals submitted yet. In Review mode, collaborators push drafts here.
                </div>
              ) : (
                sortedProposals.map((p) => {
                  const isSelected = activeProposal && activeProposal.id === p.id
                  const timeStr = p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

                  return (
                    <div
                      key={p.id}
                      className={`proposal-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedProposalId(p.id)}
                    >
                      <div className="proposal-item-top">
                        <span className="proposal-author">{p.authorId || 'Anonymous'}</span>
                        <span className="proposal-time">{timeStr}</span>
                      </div>
                      <div className="proposal-item-file">
                        📄 <strong>{p.file}</strong>
                      </div>
                      {p.message && (
                        <div className="proposal-item-msg">"{p.message}"</div>
                      )}
                      <div className="proposal-item-bottom">
                        {getStatusBadge(p.status)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Column 2: Diff Viewer & Decision Controls */}
          <div className="proposal-diff-column">
            {activeProposal ? (
              <div className="diff-view-wrapper">
                {/* Proposal Meta Header */}
                <div className="diff-meta-bar">
                  <div className="diff-meta-info">
                    <h4>Proposal: {activeProposal.file}</h4>
                    <p>
                      By <strong>{activeProposal.authorId}</strong> •{' '}
                      {activeProposal.message ? `"${activeProposal.message}"` : 'No message'}
                    </p>
                  </div>

                  {/* Decision Buttons (Host Only) */}
                  {isHost && (
                    <div className="diff-action-buttons">
                      {activeProposal.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            className="btn-small btn-success"
                            onClick={() => onAccept(activeProposal.id)}
                            title="Accept proposal and cleanly apply 3-way minimal diff into main file"
                          >
                            ✓ Accept Proposal
                          </button>
                          <button
                            type="button"
                            className="btn-small btn-danger"
                            onClick={() => onReject(activeProposal.id)}
                            title="Reject proposal"
                          >
                            ✕ Reject
                          </button>
                        </>
                      )}
                      {activeProposal.status === 'accepted' && (
                        <button
                          type="button"
                          className="btn-small btn-warning"
                          onClick={() => onRevert(activeProposal.id)}
                          title="Revert this proposal from the main file"
                        >
                          ↩ Revert Proposal
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Diff Viewer Area */}
                <div className="diff-code-container">
                  <div className="diff-legend">
                    <span className="legend-added">+ Added</span>
                    <span className="legend-removed">- Removed</span>
                    <span className="legend-unchanged">Unchanged</span>
                  </div>
                  <pre className="diff-code-body">
                    {diffParts.map((part, idx) => {
                      const prefix = part.added ? '+ ' : part.removed ? '- ' : '  '
                      const lineClass = part.added
                        ? 'diff-line diff-added'
                        : part.removed
                        ? 'diff-line diff-removed'
                        : 'diff-line diff-unchanged'

                      return (
                        <span key={idx} className={lineClass}>
                          {part.value.split('\n').map((line, lIdx, arr) => {
                            if (lIdx === arr.length - 1 && line === '') return null
                            return (
                              <div key={lIdx} className="diff-line-row">
                                <span className="diff-prefix">{prefix}</span>
                                <span className="diff-text">{line}</span>
                              </div>
                            )
                          })}
                        </span>
                      )
                    })}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="no-proposal-selected">
                <span className="empty-icon">🔍</span>
                <p>Select a proposal on the left to inspect its diff.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
