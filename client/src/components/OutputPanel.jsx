import { useState, useEffect, useRef } from 'react'
import { X, Square, Trash2, Maximize2, Minimize2, AlertCircle } from 'lucide-react'

export default function OutputPanel({
  isOpen,
  onClose,
  outputs = [],
  onClear,
  isRunning = false,
  onStop,
  htmlContent = '',
  isHtmlMode = false,
  showOnlineNotice = false,
  onDismissOnlineNotice,
  footerNote = ''
}) {
  const [activeTab, setActiveTab] = useState('console') // 'console' | 'preview'
  const [panelHeight, setPanelHeight] = useState(240)
  const [isMaximized, setIsMaximized] = useState(false)
  const prevHeightRef = useRef(240)
  const isResizingRef = useRef(false)

  useEffect(() => {
    if (isHtmlMode && htmlContent) {
      setActiveTab('preview')
    } else if (!isHtmlMode) {
      setActiveTab('console')
    }
  }, [isHtmlMode, htmlContent])

  const handleResizeStart = (e) => {
    e.preventDefault()
    isResizingRef.current = true
    const startY = e.clientY
    const startH = panelHeight

    const onMouseMove = (moveEvent) => {
      if (!isResizingRef.current) return
      const delta = startY - moveEvent.clientY
      const maxH = Math.min(Math.floor(window.innerHeight * 0.7), window.innerHeight - 160)
      const newHeight = Math.max(120, Math.min(maxH, startH + delta))
      setPanelHeight(newHeight)
      setIsMaximized(false)
    }

    const onMouseUp = () => {
      isResizingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const toggleMaximize = () => {
    if (!isMaximized) {
      prevHeightRef.current = panelHeight
      const maxH = Math.min(Math.floor(window.innerHeight * 0.7), window.innerHeight - 160)
      setPanelHeight(maxH)
      setIsMaximized(true)
    } else {
      setPanelHeight(prevHeightRef.current || 240)
      setIsMaximized(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="output-panel" style={{ height: `${panelHeight}px` }}>
      {/* Draggable top resizer handle */}
      <div
        className="output-resizer-handle"
        onMouseDown={handleResizeStart}
        title="Drag to resize Output panel"
      />

      {/* Online service notice banner */}
      {showOnlineNotice && (
        <div className="output-online-notice" role="alert">
          <div className="output-notice-text">
            <AlertCircle size={13} strokeWidth={1.75} />
            <span>This language runs on an online service. Your code is sent to it.</span>
          </div>
          {onDismissOnlineNotice && (
            <button
              type="button"
              className="btn-dismiss-notice"
              onClick={onDismissOnlineNotice}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

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
              <Square size={12} strokeWidth={1.75} />
              <span>Stop</span>
            </button>
          )}

          <button
            type="button"
            className="btn-flat btn-secondary btn-xs"
            onClick={onClear}
            title="Clear console"
          >
            <Trash2 size={12} strokeWidth={1.75} />
            <span>Clear</span>
          </button>

          <button
            type="button"
            className="btn-icon-subtle"
            onClick={toggleMaximize}
            title={isMaximized ? 'Restore height' : 'Maximize output'}
            aria-label={isMaximized ? 'Restore height' : 'Maximize output'}
          >
            {isMaximized ? <Minimize2 size={13} strokeWidth={1.75} /> : <Maximize2 size={13} strokeWidth={1.75} />}
          </button>

          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            title="Close output"
            aria-label="Close output"
          >
            <X size={14} strokeWidth={1.75} />
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
              <div className="console-empty">
                No output to display.<span className="signature-caret" aria-hidden="true" />
              </div>
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
          {footerNote ? ` • ${footerNote}` : ''}
        </span>
      </div>
    </div>
  )
}
