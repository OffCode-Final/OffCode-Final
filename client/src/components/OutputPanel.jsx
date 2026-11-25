import { useState, useEffect, useRef } from 'react'
import { X, Square, Trash2, Maximize2, Minimize2, AlertCircle, Copy, Check, ChevronRight, ChevronDown } from 'lucide-react'
import { copyToClipboard } from '../utils/helpers'

const STATUS_LABELS = {
  running: 'Running',
  success: 'Success',
  error: 'Error',
  stopped: 'Stopped',
  timed_out: 'Timed out'
}

function ErrorBlock({ error, onJumpToLocation }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const textToCopy = error.rawText || `${error.title}\n${error.errorType}: ${error.message}`
    const ok = await copyToClipboard(textToCopy)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div className="error-card" role="alert">
      <div className="error-card-top">
        <div className="error-card-heading">
          <span className="error-card-title">{error.title}</span>
          {error.locationLabel && (
            error.clickable && onJumpToLocation ? (
              <button
                type="button"
                className="error-location-chip clickable"
                onClick={() => onJumpToLocation({ fileName: error.fileName, line: error.line, col: error.col })}
                title={`Go to ${error.locationLabel}`}
              >
                {error.locationLabel}
              </button>
            ) : (
              <span className="error-location-chip">{error.locationLabel}</span>
            )
          )}
        </div>
        <button
          type="button"
          className="error-copy-btn"
          onClick={handleCopy}
          title="Copy error"
        >
          {copied ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.75} />}
          <span>{copied ? 'Copied' : 'Copy error'}</span>
        </button>
      </div>

      {Array.isArray(error.stack) && error.stack.length > 1 && (
        <div className="error-stack">
          {error.stack.map((frame, idx) => {
            const isLast = idx === error.stack.length - 1
            return (
              <button
                key={`${frame.file}:${frame.line}:${idx}`}
                type="button"
                className={`error-stack-item ${isLast ? 'is-last' : ''}`}
                onClick={() => onJumpToLocation && onJumpToLocation({ fileName: frame.file, line: frame.line, col: null })}
                title={`Go to ${frame.file}:${frame.line}`}
              >
                <span className="error-stack-loc">{frame.file}:{frame.line}</span>
                <span className="error-stack-fn">{frame.fn}</span>
              </button>
            )
          })}
        </div>
      )}

      {error.sourceLine !== null && error.sourceLine !== undefined && (
        <pre className="error-code-block">
          <code>
            {error.sourceLine}
            {error.caretLine ? `\n${error.caretLine}` : ''}
          </code>
        </pre>
      )}

      <div className="error-final-line">
        <strong>{error.errorType}:</strong> {error.message}
      </div>

      {error.hint && (
        <div className="error-hint">{error.hint}</div>
      )}

      {error.rawText && (
        <details className="error-tech-details">
          <summary>Technical details</summary>
          <pre className="error-tech-raw">{error.rawText}</pre>
        </details>
      )}
    </div>
  )
}

export default function OutputPanel({
  isOpen,
  onClose,
  runs = [],
  onClear,
  isRunning = false,
  onStop,
  htmlContent = '',
  isHtmlMode = false,
  showOnlineNotice = false,
  onDismissOnlineNotice,
  footerNote = '',
  onJumpToLocation,
  onHtmlError,
  stdinText = '',
  onChangeStdinText
}) {
  const [activeTab, setActiveTab] = useState('console') // 'console' | 'preview'
  const [panelHeight, setPanelHeight] = useState(280)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isInputOpen, setIsInputOpen] = useState(false)
  const prevHeightRef = useRef(280)
  const isResizingRef = useRef(false)
  const iframeRef = useRef(null)
  const lastRunRef = useRef(null)
  const streamEndRef = useRef(null)

  useEffect(() => {
    if (isHtmlMode && htmlContent) {
      setActiveTab('preview')
    } else if (!isHtmlMode) {
      setActiveTab('console')
    }
  }, [isHtmlMode, htmlContent])

  // Listen for window.onerror messages posted from sandboxed HTML preview iframe
  useEffect(() => {
    const handleMessage = (e) => {
      if (!e.data || e.data.type !== 'offcode-html-error') return
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return
      if (onHtmlError) {
        onHtmlError(e.data)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onHtmlError])

  // Scroll console to show error card top or latest output cleanly
  useEffect(() => {
    if (activeTab !== 'console') return
    const latest = runs.length > 0 ? runs[runs.length - 1] : null
    if (latest && latest.status === 'error' && lastRunRef.current) {
      lastRunRef.current.scrollIntoView({ block: 'start' })
    } else if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ block: 'end' })
    }
  }, [runs, activeTab])

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
      setPanelHeight(prevHeightRef.current || 260)
      setIsMaximized(false)
    }
  }

  if (!isOpen) return null

  const lastRun = runs.length > 0 ? runs[runs.length - 1] : null
  const latestHtmlErrorCount = lastRun?.items?.filter((it) => it.kind === 'error').length || 0
  const inputLineCount = stdinText === '' ? 0 : (stdinText.endsWith('\n') ? stdinText.slice(0, -1) : stdinText).split(/\r?\n/).length

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
              Console ({runs.length})
              {latestHtmlErrorCount > 0 && lastRun?.status === 'error' && (
                <span className="output-tab-error-dot" aria-label="Has errors" />
              )}
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
            {latestHtmlErrorCount > 0 && (
              <div className="preview-error-banner">
                <span>Script error detected in preview.</span>
                <button
                  type="button"
                  className="preview-error-link"
                  onClick={() => setActiveTab('console')}
                >
                  View in Console
                </button>
              </div>
            )}
            <iframe
              ref={iframeRef}
              title="HTML Preview"
              srcDoc={htmlContent}
              sandbox="allow-scripts"
              className="preview-iframe"
            />
          </div>
        ) : (
          <div className="console-stream">
            {runs.length === 0 ? (
              <div className="console-empty">
                No output to display.<span className="signature-caret" aria-hidden="true" />
              </div>
            ) : (
              runs.map((run, runIdx) => (
                <div
                  key={run.id}
                  ref={runIdx === runs.length - 1 ? lastRunRef : null}
                  className="run-block"
                >
                  <div className="run-header">
                    <span className="run-file">{run.fileName}</span>
                    <span className="run-time">{run.startTime}</span>
                    <span className={`run-status-chip status-${run.status}`}>
                      {STATUS_LABELS[run.status] || run.status}
                    </span>
                    {run.duration !== null && run.duration !== undefined && (
                      <span className="run-duration">{run.duration}s</span>
                    )}
                  </div>

                  <div className="run-items">
                    {run.items.map((item) => {
                      if (item.kind === 'error' && item.parsedError) {
                        return (
                          <ErrorBlock
                            key={item.id}
                            error={item.parsedError}
                            onJumpToLocation={onJumpToLocation}
                          />
                        )
                      }

                      if (item.kind === 'stdout') {
                        return (
                          <div key={item.id} className="console-line stdout">
                            <pre className="console-text">
                              {item.text}
                              {item.echo !== undefined && item.echo !== null && (
                                <span className="console-stdin-echo">{item.echo}</span>
                              )}
                            </pre>
                          </div>
                        )
                      }

                      if (item.kind === 'stderr') {
                        return (
                          <div key={item.id} className="console-line stderr">
                            <pre className="console-text">{item.text}</pre>
                          </div>
                        )
                      }

                      return (
                        <div key={item.id} className="console-line status">
                          <pre className="console-text">{item.text}</pre>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={streamEndRef} />
          </div>
        )}
      </div>

      {/* Collapsible Input section for Python input() */}
      <div className="output-input-section">
        <button
          type="button"
          className="output-input-toggle"
          onClick={() => setIsInputOpen((prev) => !prev)}
          aria-expanded={isInputOpen}
        >
          {isInputOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>Input</span>
          {inputLineCount > 0 && (
            <span className="output-input-count">{inputLineCount} {inputLineCount === 1 ? 'line' : 'lines'}</span>
          )}
        </button>
        {isInputOpen && (
          <div className="output-input-body">
            <label className="output-input-label" htmlFor="offcode-stdin-input">
              Input, one value per line
            </label>
            <textarea
              id="offcode-stdin-input"
              className="output-input-textarea"
              rows={3}
              value={stdinText}
              onChange={(e) => onChangeStdinText && onChangeStdinText(e.target.value)}
              placeholder="Enter values for Python input(), one per line..."
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Exit-time / status footer */}
      <div className="output-footer">
        <span className="output-footer-status">
          {isRunning
            ? 'Executing…'
            : lastRun
            ? `${lastRun.fileName} — ${STATUS_LABELS[lastRun.status] || lastRun.status}${lastRun.duration ? ` (${lastRun.duration}s)` : ''}`
            : 'Console ready'}
          {footerNote ? ` • ${footerNote}` : ''}
        </span>
      </div>
    </div>
  )
}
