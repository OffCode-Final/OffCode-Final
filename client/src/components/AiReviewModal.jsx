import { useMemo, useEffect } from 'react'
import * as Diff from 'diff'
import { Sparkles, Loader2, X, AlertCircle } from 'lucide-react'

export default function AiReviewModal({
  isOpen,
  isLoading,
  error,
  result,
  originalText = '',
  onAccept,
  onReject,
  onOpenKeyModal
}) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onReject()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onReject])

  const diffParts = useMemo(() => {
    if (!result?.improved || originalText === undefined) return []
    return Diff.diffLines(originalText, result.improved)
  }, [originalText, result?.improved])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onReject}>
      <div
        className="modal-card"
        style={{
          maxWidth: isLoading ? '380px' : '560px',
          width: '92%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="modal-title">
              {isLoading
                ? 'Improving with AI...'
                : error
                ? 'AI Improvement Failed'
                : 'Review AI Improvement'}
            </h3>
          </div>
          <button
            type="button"
            className="btn-icon-bar"
            onClick={onReject}
            title="Close (Escape)"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div
          className="modal-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {isLoading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '28px 16px',
                gap: '12px',
                textAlign: 'center'
              }}
            >
              <Loader2 size={24} className="spin-icon" style={{ color: 'var(--accent-primary)' }} />
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-main)' }}>
                Analyzing file context and improving selection...
              </p>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Gemini 3.5 Flash-Lite / Groq Llama 3.3
              </span>
            </div>
          )}

          {!isLoading && error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-danger-bg)',
                  border: '1px solid var(--color-danger)',
                  color: 'var(--color-danger)',
                  fontSize: '12.5px'
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error.message || String(error)}</span>
              </div>

              {error.isKeyError && onOpenKeyModal && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn-flat btn-primary btn-sm"
                    onClick={() => {
                      onReject()
                      onOpenKeyModal()
                    }}
                  >
                    Change key
                  </button>
                </div>
              )}
            </div>
          )}

          {!isLoading && !error && result && (
            <>
              {/* Summary */}
              {result.summary && (
                <div
                  style={{
                    fontSize: '12.5px',
                    lineHeight: '1.5',
                    color: 'var(--text-main)',
                    backgroundColor: 'var(--bg-hover-row)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--accent-primary)'
                  }}
                >
                  {result.summary}
                </div>
              )}

              {/* Changes list */}
              {Array.isArray(result.changes) && result.changes.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-bright)', marginBottom: '4px' }}>
                    Changes:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {result.changes.map((change, idx) => (
                      <li key={idx}>{change}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Inline Diff Viewer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Diff Preview (Selected Code)
                </div>
                <div
                  className="diff-viewer"
                  style={{
                    maxHeight: '260px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-editor)'
                  }}
                >
                  <pre className="diff-code" style={{ margin: 0, padding: '6px', fontSize: '12px' }}>
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
            </>
          )}
        </div>

        {/* Footer actions */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-subtle)'
          }}
        >
          {isLoading ? (
            <button
              type="button"
              className="btn-flat btn-secondary"
              onClick={onReject}
            >
              Cancel
            </button>
          ) : error ? (
            <button
              type="button"
              className="btn-flat btn-secondary"
              onClick={onReject}
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-flat btn-secondary"
                onClick={onReject}
              >
                Reject (Esc)
              </button>
              <button
                type="button"
                className="btn-flat btn-primary"
                onClick={onAccept}
              >
                Accept
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
