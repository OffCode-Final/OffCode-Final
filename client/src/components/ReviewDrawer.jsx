import { useState, useMemo } from 'react'
import * as Diff from 'diff'
import { X, Check, RotateCcw, AlertTriangle } from 'lucide-react'

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
        return <span className="status-tag tag-pending">Pending</span>
      case 'accepted':
        return <span className="status-tag tag-accepted">Accepted</span>
      case 'rejected':
        return <span className="status-tag tag-rejected">Rejected</span>
      case 'reverted':
        return <span className="status-tag tag-reverted">Reverted</span>
      default:
        return <span className="status-tag">{status}</span>
    }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className="drawer-title">Review & Proposals</span>
            <span className="drawer-count">({proposals.length})</span>
          </div>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            title="Close review panel"
          >
            <X size={15} />
          </button>
        </div>

        {/* Drawer Body: 2 Columns */}
        <div className="drawer-body">
          {/* Column 1: Proposals List */}
          <div className="drawer-list-col">
            <div className="drawer-subhead">
              <span>Proposals ({proposals.filter((p) => p.status === 'pending').length} pending)</span>
            </div>

            <div className="proposals-scroll">
              {sortedProposals.length === 0 ? (
                <div className="drawer-empty">No proposals submitted.</div>
              ) : (
                sortedProposals.map((p) => {
                  const isSelected = activeProposal && activeProposal.id === p.id
                  const timeStr = p.createdAt
                    ? new Date(p.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : ''

                  return (
                    <div
                      key={p.id}
                      className={`proposal-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedProposalId(p.id)}
                    >
                      <div className="proposal-row-top">
                        <span className="proposal-author">{p.authorId || 'Anonymous'}</span>
                        <span className="proposal-time">{timeStr}</span>
                      </div>
                      <div className="proposal-file">{p.file}</div>
                      {p.message && <div className="proposal-msg">"{p.message}"</div>}
                      <div className="proposal-row-bottom">{getStatusBadge(p.status)}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Column 2: Diff Viewer & Controls */}
          <div className="drawer-diff-col">
            {activeProposal ? (
              <div className="diff-wrapper">
                <div className="diff-header-bar">
                  <div className="diff-meta">
                    <span className="diff-file-title">{activeProposal.file}</span>
                    <span className="diff-author-info">
                      By {activeProposal.authorId}
                      {activeProposal.message ? ` — "${activeProposal.message}"` : ''}
                    </span>
                  </div>

                  {isHost && (
                    <div className="diff-actions">
                      {activeProposal.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            className="btn-flat btn-primary btn-sm"
                            onClick={() => onAccept(activeProposal.id)}
                            title="Accept proposal and apply changes"
                          >
                            <Check size={13} />
                            <span>Accept</span>
                          </button>
                          <button
                            type="button"
                            className="btn-flat btn-danger btn-sm"
                            onClick={() => onReject(activeProposal.id)}
                            title="Reject proposal"
                          >
                            <X size={13} />
                            <span>Reject</span>
                          </button>
                        </>
                      )}
                      {activeProposal.status === 'accepted' && (
                        <button
                          type="button"
                          className="btn-flat btn-secondary btn-sm"
                          onClick={() => onRevert(activeProposal.id)}
                          title="Revert proposal changes"
                        >
                          <RotateCcw size={13} />
                          <span>Revert</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Diff Viewer Area */}
                <div className="diff-viewer">
                  <div className="diff-legend">
                    <span className="legend-item legend-add">+ Added</span>
                    <span className="legend-item legend-rem">- Removed</span>
                    <span className="legend-item legend-unc">Unchanged</span>
                  </div>

                  <pre className="diff-code">
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
              <div className="diff-empty">Select a proposal to view diff.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
