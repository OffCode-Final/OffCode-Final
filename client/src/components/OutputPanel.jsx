import { useState, useEffect } from 'react'
import { X, Square, Trash2 } from 'lucide-react'

export default function OutputPanel({
  isOpen,
  onClose,
  outputs,
  onClear,
  isRunning,
  onStop,
  htmlContent,
  isHtmlMode
}) {
  const [activeTab, setActiveTab] = useState('console') // 'console' | 'preview'

  useEffect(() => {
    if (isHtmlMode && htmlContent) {
      setActiveTab('preview')
    } else if (!isHtmlMode) {
      setActiveTab('console')
    }
  }, [isHtmlMode, htmlContent])

  if (!isOpen) return null

  return (
    <div className="output-panel">
      {/* Panel Header */}
      <div className="output-header">
        <div className="output-header-left">
          <span className="output-label">OUTPUT</span>

          <div className="output-tabs">
            <button
              type="button"
              className={`output-tab-btn ${activeTab === 'console' ? 'active' : ''}`}
              onClick={() => setActiveTab('console')}
            >
              Console ({outputs.length})
            </button>
            {isHtmlMode && (
              <button
                type="button"
                className={`output-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')}
              >
                HTML Preview
              </button>
            )}
          </div>

          {isRunning && <span className="running-text">Executing…</span>}
        </div>

        <div className="output-header-right">
          {isRunning && (
            <button
              type="button"
              className="btn-flat btn-danger btn-xs"
              onClick={onStop}
              title="Stop execution"
            >
              <Square size={12} />
              <span>Stop</span>
            </button>
          )}

          <button
            type="button"
            className="btn-flat btn-secondary btn-xs"
            onClick={onClear}
            title="Clear console"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>

          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            title="Close output"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="output-body">
        {activeTab === 'preview' && isHtmlMode ? (
          <div className="preview-container">
            <iframe
              title="HTML Preview"
              srcDoc={htmlContent}
              sandbox="allow-scripts"
              className="preview-iframe"
            />
          </div>
        ) : (
          <div className="console-stream">
            {outputs.length === 0 ? (
              <div className="console-empty">No output to display.</div>
            ) : (
              outputs.map((line) => {
                let lineClass = 'console-line stdout'
                if (line.type === 'stderr') lineClass = 'console-line stderr'
                if (line.type === 'status') lineClass = 'console-line status'

                return (
                  <div key={line.id} className={lineClass}>
                    <span className="console-time">{line.timestamp}</span>
                    <pre className="console-text">{line.text}</pre>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Exit-time / status footer */}
      <div className="output-footer">
        <span className="output-footer-status">
          {isRunning
            ? 'Executing…'
            : outputs.length > 0
            ? `Process finished at ${outputs[outputs.length - 1]?.timestamp || ''}`
            : 'Console ready'}
        </span>
      </div>
    </div>
  )
}
