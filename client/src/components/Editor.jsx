import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  keymap
} from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput, indentUnit } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { X, Send } from 'lucide-react'

import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'

import { getUndoManager } from '../utils/undoCache'
import { getFileExtension } from '../utils/helpers'
import { createUserChangesExtension, userChangesCompartment } from '../utils/userChanges'

// VS Code Dark+ Editor Theme
const vsCodeDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#1e1e1e',
      color: '#cccccc',
      fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
      fontSize: '13px',
      lineHeight: '1.5'
    },
    '.cm-content': {
      caretColor: '#aeafad'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeft: '2px solid #aeafad'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#264f78 !important'
    },
    '.cm-activeLine': {
      backgroundColor: '#282828'
    },
    '.cm-gutters': {
      backgroundColor: '#1e1e1e',
      color: '#858585',
      borderRight: '1px solid #3c3c3c'
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#282828',
      color: '#cccccc'
    },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(14, 99, 156, 0.3)',
      outline: '1px solid #0e639c'
    },
    '.cm-line': {
      paddingLeft: '4px'
    }
  },
  { dark: true }
)

export default function Editor({
  activeFile,
  openFiles = [],
  onSelectTab,
  onCloseTab,
  ytext,
  awareness,
  remoteUsersViewingThisFile,
  targetScrollLine,
  onUserInteraction,
  onCursorChange,
  readOnly = false,
  isReviewMode = false,
  isDraft = false,
  onSwitchReviewTab,
  onPushDraft,
  onPointersChange,
  isStopped = false,
  frozenUserIds = null,
  showUserChanges = false,
  currentUserId = null,
  currentUserName = 'Anonymous',
  currentUserColor = '#6366f1',
  users = []
}) {
  const editorRef = useRef(null)
  const viewRef = useRef(null)
  const [scrollerNode, setScrollerNode] = useState(null)
  const [remotePointers, setRemotePointers] = useState([])
  const pointerTimestampsRef = useRef(new Map())
  const lastKnownPosRef = useRef(new Map())

  // Language extension selector supporting all requested languages
  const getLanguageSupport = (fileName) => {
    const ext = getFileExtension(fileName)
    switch (ext) {
      case 'py':
        return python()
      case 'js':
      case 'jsx':
      case 'mjs':
        return javascript({ jsx: true })
      case 'ts':
      case 'tsx':
        return javascript({ jsx: true, typescript: true })
      case 'html':
      case 'htm':
        return html()
      case 'css':
        return css()
      case 'json':
        return json()
      case 'md':
      case 'markdown':
        return markdown()
      case 'cpp':
      case 'cxx':
      case 'cc':
      case 'hpp':
      case 'c':
      case 'h':
        return cpp()
      case 'java':
        return java()
      default:
        return []
    }
  }

  useEffect(() => {
    if (!editorRef.current || !activeFile || !ytext) {
      return
    }

    // Clean up previous view
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    // Retrieve or create the persistent cached UndoManager for this file or personal draft
    const cacheKey = isDraft ? `draft:${activeFile}` : activeFile
    const fileUndoManager = getUndoManager(cacheKey, ytext)

    // Notify awareness that we are currently viewing this file
    if (awareness) {
      awareness.setLocalStateField('currentFile', activeFile)
    }

    // CodeMirror extensions with proper indentation & syntax highlighting
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      bracketMatching(),
      highlightActiveLine(),
      indentOnInput(),
      indentUnit.of('    '),
      oneDark,
      vsCodeDarkTheme,
      getLanguageSupport(activeFile),
      EditorState.readOnly.of(Boolean(readOnly || isStopped)),
      EditorView.editable.of(!readOnly && !isStopped),
      // Keymap for local undo/redo with Mod-z and Mod-Shift-z / Mod-y
      keymap.of((readOnly || isStopped) ? defaultKeymap : [...yUndoManagerKeymap, ...defaultKeymap]),
      // Yjs collaboration plugin (Sync + Remote Cursors + Local UndoManager)
      yCollab(ytext, awareness, { undoManager: (readOnly || isStopped) ? false : fileUndoManager }),
      // User Changes Underlines and Attribution
      userChangesCompartment.of(
        createUserChangesExtension({
          ytext,
          currentUserId,
          currentUserName,
          currentUserColor,
          users,
          showUserChanges
        })
      ),
      // Dom event handlers to unhook follow mode on user interaction
      EditorView.domEventHandlers({
        mousedown() {
          if (onUserInteraction) onUserInteraction()
          return false
        },
        keydown() {
          if (onUserInteraction) onUserInteraction()
          return false
        }
      }),
      // Update listener for cursor position and document stats
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          const pos = {
            line: line.number,
            col: head - line.from + 1,
            charCount: update.state.doc.length,
            lineCount: update.state.doc.lines
          }
          if (onCursorChange) onCursorChange(pos)

          // Update awareness with current line number
          if (awareness) {
            awareness.setLocalStateField('currentLine', line.number)
          }
        }
      })
    ]

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions
    })

    const view = new EditorView({
      state,
      parent: editorRef.current
    })

    viewRef.current = view
    view.focus()

    // Initialize cursor stats
    try {
      const line = state.doc.lineAt(0)
      if (onCursorChange) {
        onCursorChange({
          line: 1,
          col: 1,
          charCount: state.doc.length,
          lineCount: state.doc.lines
        })
      }
      if (awareness) {
        awareness.setLocalStateField('currentLine', 1)
      }
    } catch {
      // ignore
    }

    const scroller = view.scrollDOM
    setScrollerNode(scroller)

    // Throttled mouse position broadcasting (~20 times/sec = 50ms)
    let lastSendTime = 0
    let pendingPointer = null
    let throttleTimer = null

    const flushPointer = () => {
      if (!awareness || !pendingPointer) return
      lastSendTime = Date.now()
      awareness.setLocalStateField('pointer', pendingPointer)
      pendingPointer = null
    }

    const handleMouseMove = (e) => {
      if (!awareness || !activeFile) return
      const rect = scroller.getBoundingClientRect()
      const x = Math.round(e.clientX - rect.left + scroller.scrollLeft)
      const y = Math.round(e.clientY - rect.top + scroller.scrollTop)
      const pointerData = { file: activeFile, x, y }

      const now = Date.now()
      if (now - lastSendTime >= 50) {
        lastSendTime = now
        if (throttleTimer) {
          clearTimeout(throttleTimer)
          throttleTimer = null
        }
        pendingPointer = null
        awareness.setLocalStateField('pointer', pointerData)
      } else {
        pendingPointer = pointerData
        if (!throttleTimer) {
          throttleTimer = setTimeout(() => {
            throttleTimer = null
            flushPointer()
          }, 50 - (now - lastSendTime))
        }
      }
    }

    const clearPointer = () => {
      if (throttleTimer) {
        clearTimeout(throttleTimer)
        throttleTimer = null
      }
      pendingPointer = null
      if (awareness) {
        awareness.setLocalStateField('pointer', null)
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearPointer()
      }
    }

    scroller.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearPointer()
      scroller.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      setScrollerNode(null)
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
  }, [activeFile, ytext, awareness, readOnly, isStopped])

  // Reconfigure user change highlighting dynamically without destroying the view
  useEffect(() => {
    if (!viewRef.current || !ytext) return

    try {
      viewRef.current.dispatch({
        effects: userChangesCompartment.reconfigure(
          createUserChangesExtension({
            ytext,
            currentUserId,
            currentUserName,
            currentUserColor,
            users,
            showUserChanges
          })
        )
      })
    } catch (err) {
      console.warn('[Editor] Failed reconfiguring user changes extension:', err)
    }
  }, [showUserChanges, users, currentUserId, currentUserName, currentUserColor, ytext])

  // Track and filter remote mouse pointers in the same file
  useEffect(() => {
    if (!awareness || !activeFile) {
      setRemotePointers([])
      if (onPointersChange) {
        onPointersChange(0)
      }
      return
    }

    const updatePointers = () => {
      const states = awareness.getStates()
      const myClientId = awareness.clientID
      const now = Date.now()
      const list = []

      states.forEach((state, clientId) => {
        if (clientId === myClientId) return
        const ptr = state?.pointer
        if (
          ptr &&
          ptr.file === activeFile &&
          typeof ptr.x === 'number' &&
          typeof ptr.y === 'number'
        ) {
          const prevPos = lastKnownPosRef.current.get(clientId)
          if (!prevPos || prevPos.x !== ptr.x || prevPos.y !== ptr.y) {
            lastKnownPosRef.current.set(clientId, { x: ptr.x, y: ptr.y })
            pointerTimestampsRef.current.set(clientId, now)
          }

          const lastMoved = pointerTimestampsRef.current.get(clientId) || now
          const isFaded = now - lastMoved >= 5000
          const resolvedUserId = state?.userId || state?.user?.userId || state?.user?.id || `client_${clientId}`
          const isUserStopped = Boolean(
            frozenUserIds && (
              frozenUserIds.has(resolvedUserId) ||
              (state?.userId && frozenUserIds.has(state.userId)) ||
              (state?.user?.id && frozenUserIds.has(state.user.id))
            )
          )

          list.push({
            clientId,
            x: ptr.x,
            y: ptr.y,
            name: state?.user?.name || 'Anonymous',
            color: state?.user?.color || '#3b82f6',
            isFaded,
            isStopped: isUserStopped
          })
        } else {
          lastKnownPosRef.current.delete(clientId)
          pointerTimestampsRef.current.delete(clientId)
        }
      })

      setRemotePointers(list)
      if (onPointersChange) {
        onPointersChange(list.length)
      }
    }

    awareness.on('change', updatePointers)
    const interval = setInterval(updatePointers, 1000)
    updatePointers()

    return () => {
      awareness.off('change', updatePointers)
      clearInterval(interval)
      if (onPointersChange) {
        onPointersChange(0)
      }
    }
  }, [awareness, activeFile, onPointersChange, frozenUserIds])

  // Scroll to line when jumped or following a peer
  useEffect(() => {
    if (viewRef.current && targetScrollLine != null && targetScrollLine > 0) {
      const view = viewRef.current
      try {
        const lineCount = view.state.doc.lines
        const lineNum = Math.min(Math.max(1, targetScrollLine), lineCount)
        const line = view.state.doc.line(lineNum)
        view.dispatch({
          selection: { anchor: line.from },
          scrollIntoView: true
        })
      } catch (_) {}
    }
  }, [targetScrollLine])

  return (
    <main className="editor-area">
      {/* VS Code Style Editor Tabs Bar */}
      <div className="editor-tabs-bar">
        <div className="editor-tabs-scroll">
          {openFiles.map((fileName) => {
            const isActive = fileName === activeFile
            return (
              <div
                key={fileName}
                className={`editor-tab ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab && onSelectTab(fileName)}
                title={fileName}
              >
                <span className="editor-tab-name">{fileName}</span>
                {openFiles.length > 1 && (
                  <button
                    type="button"
                    className="btn-tab-close"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onCloseTab) onCloseTab(fileName)
                    }}
                    title={`Close ${fileName}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Review Mode Draft vs Main File Switcher */}
        {isReviewMode && onSwitchReviewTab && (
          <div className="review-tabs-switcher">
            <button
              type="button"
              className={`btn-review-tab ${isDraft ? 'active' : ''}`}
              onClick={() => onSwitchReviewTab('draft')}
              title="Edit private draft"
            >
              Draft (editing)
            </button>
            <button
              type="button"
              className={`btn-review-tab ${!isDraft ? 'active' : ''}`}
              onClick={() => onSwitchReviewTab('main')}
              title="View authoritative main file"
            >
              Main file (read-only)
            </button>
          </div>
        )}
      </div>

      {/* Review Mode Banner for Non-Host Drafts */}
      {isReviewMode && (
        <div className="review-draft-banner">
          <span className="banner-msg">You're editing your draft. Push it for host review.</span>
          <button
            type="button"
            className="btn-flat btn-primary btn-xs btn-banner-push"
            onClick={onPushDraft}
            disabled={isStopped}
            title={isStopped ? 'Editing stopped by host' : 'Submit draft for host review'}
          >
            <Send size={12} />
            <span>Push draft</span>
          </button>
        </div>
      )}

      {/* Editor Content Canvas */}
      {!activeFile || !ytext ? (
        <div className="editor-empty-state">
          <p>No file open. Select a file from the sidebar to begin editing.</p>
        </div>
      ) : (
        <div className="editor-canvas" ref={editorRef}>
          {scrollerNode &&
            createPortal(
              <div className="remote-pointers-container" aria-hidden="true">
                {remotePointers.map((p) => (
                  <div
                    key={p.clientId}
                    className={`remote-pointer ${p.isFaded ? 'faded' : ''}`}
                    style={{
                      transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
                      color: p.color
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="remote-pointer-arrow"
                    >
                      <path
                        d="M0 0 L5 15 L8 9 L14 8 Z"
                        fill={p.color}
                        stroke="#1e1e1e"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div
                      className="remote-pointer-badge"
                      style={{
                        backgroundColor: p.color,
                        color: '#ffffff'
                      }}
                    >
                      {p.name}{p.isStopped ? ' (Stopped)' : ''}
                    </div>
                  </div>
                ))}
              </div>,
              scrollerNode
            )}
        </div>
      )}
    </main>
  )
}
