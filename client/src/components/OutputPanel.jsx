import { useState, useEffect } from 'react'

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
    <div className="output-panel-container">
      {/* Panel Header */}
      <div className="output-panel-header">
        <div className="output-header-left">
          <span className="output-title-icon">▶</span>
          <span className="output-title">OUTPUT</span>

          {/* Mode Tabs */}
          <div className="output-tabs">
            <button
              type="button"
              className={`btn-output-tab ${activeTab === 'console' ? 'active' : ''}`}
              onClick={() => setActiveTab('console')}
            >
              Console ({outputs.length})
            </button>
            {isHtmlMode && (
              <button
                type="button"
                className={`btn-output-tab ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')}
              >
                🌐 HTML Preview
              </button>
            )}
          </div>

          {/* Running Indicator */}
          {isRunning && (
            <span className="running-indicator">
              <span className="spinner-dot"></span> Executing...
            </span>
          )}
        </div>

        <div className="output-header-right">
          {isRunning && (
            <button
              type="button"
              className="btn-output-action btn-stop"
              onClick={onStop}
              title="Terminate current execution"
            >
              ⏹ Stop
            </button>
          )}

          <button
            type="button"
            className="btn-output-action"
            onClick={onClear}
            title="Clear output console"
          >
            Clear
          </button>

          <button
            type="button"
            className="btn-output-action btn-close"
            onClick={onClose}
            title="Hide Output Panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="output-panel-body">
        {activeTab === 'preview' && isHtmlMode ? (
          <div className="html-preview-container">
            <iframe
              title="HTML Live Preview"
              srcDoc={htmlContent}
              sandbox="allow-scripts"
              className="sandboxed-preview-frame"
            />
          </div>
        ) : (
          <div className="console-stream">
            {outputs.length === 0 ? (
              <div className="console-empty">
                No output yet. Click <strong>Run (Ctrl+Enter)</strong> to execute the current file.
              </div>
            ) : (
              outputs.map((item) => (
                <div
                  key={item.id}
                  className={`console-line console-${item.type}`}
                >
                  {item.timestamp && (
                    <span className="console-time">{item.timestamp}</span>
                  )}
                  <span className="console-text">{item.text}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
