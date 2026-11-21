import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  keymap,
  placeholder,
  showTooltip
} from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput, indentUnit, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { X, Send, FileText, FileCode, Plus } from 'lucide-react'

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

// Highlight styles tuned for Dark (soft pastel) and Light (GitHub-light)
const darkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#c678dd' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#e06c75' },
  { tag: [t.function(t.variableName), t.labelName], color: '#61afef' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#d19a66' },
  { tag: [t.definition(t.name), t.separator], color: '#abb2bf' },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#e5c07b' },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: '#56b6c2' },
  { tag: [t.meta, t.comment], color: 'var(--text-faint, #5c6572)', fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: '#e06c75' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#d19a66' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: '#98c379' },
  { tag: t.invalid, color: '#ef4444' }
])

const lightHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#cf222e' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#24292f' },
  { tag: [t.function(t.variableName), t.labelName], color: '#8250df' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#0550ae' },
  { tag: [t.definition(t.name), t.separator], color: '#24292f' },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#953800' },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: '#0a3069' },
  { tag: [t.meta, t.comment], color: 'var(--text-muted, #6e7781)', fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: '#0550ae' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#0550ae' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: '#0a3069' },
  { tag: t.invalid, color: '#cf222e' }
])

const themeCompartment = new Compartment()
const syntaxCompartment = new Compartment()
const aiTooltipCompartment = new Compartment()

function createAiTooltipExtension({
  onImproveWithAi,
  isStopped = false,
  readOnly = false,
  isOffline = false
}) {
  return showTooltip.compute(['selection'], (state) => {
    const { from, to } = state.selection.main
    if (to - from < 3) return null

    let disabledReason = null
    if (isStopped) disabledReason = 'Editing stopped by host'
    else if (readOnly) disabledReason = 'File is read-only'
    else if (isOffline) disabledReason = 'AI needs internet'

    return {
      pos: Math.max(from, to),
      above: true,
      create(view) {
        const dom = document.createElement('div')
        dom.className = 'cm-ai-tooltip-content'

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'cm-ai-sparkle-btn'
        button.title = disabledReason || 'Improve with AI'
        button.setAttribute('aria-label', disabledReason || 'Improve with AI')

        if (disabledReason) {
          button.disabled = true
        }

        button.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            <path d="M5 3v4"/>
            <path d="M19 17v4"/>
            <path d="M3 5h4"/>
            <path d="M17 19h4"/>
          </svg>
        `

        // Prevent focus stealing or clearing selection
        button.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })

        button.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (disabledReason) return

          const sel = view.state.selection.main
          if (sel.to - sel.from < 3) return
          const selectedText = view.state.sliceDoc(sel.from, sel.to)
          const fullText = view.state.doc.toString()

          if (onImproveWithAi) {
            onImproveWithAi({
              selectedText,
              from: sel.from,
              to: sel.to,
              fullText,
              view
            })
          }
        })

        dom.appendChild(button)
        return { dom }
      }
    }
  })
}

function getEditorTheme(theme) {
  const isDark = theme !== 'light'
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--bg-editor)',
        color: 'var(--text-main)',
        fontFamily: 'var(--font-code)',
        fontSize: '13.5px',
        lineHeight: '1.6'
      },
      '.cm-content': {
        caretColor: 'var(--editor-cursor)',
        fontFamily: 'var(--font-code)'
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeft: '2px solid var(--editor-cursor)'
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--editor-selection) !important'
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--editor-active-line)'
      },
      '.cm-gutters': {
        backgroundColor: 'var(--editor-gutter-bg)',
        color: 'var(--editor-gutter-color)',
        borderRight: '1px solid var(--border-color)'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--editor-active-line)',
        color: 'var(--text-main)'
      },
      '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.25)' : 'rgba(37, 99, 235, 0.2)',
        outline: isDark ? '1px solid #3b82f6' : '1px solid #2563eb'
      },
      '.cm-line': {
        paddingLeft: '4px'
      }
    },
    { dark: isDark }
  )
}

function getSyntaxTheme(theme) {
  return theme === 'light'
    ? syntaxHighlighting(lightHighlightStyle)
    : syntaxHighlighting(darkHighlightStyle)
}

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
  users = [],
  theme = 'dark',
  onCreateFile,
  onImproveWithAi = null,
  isOffline = false
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
      themeCompartment.of(getEditorTheme(theme)),
      syntaxCompartment.of(getSyntaxTheme(theme)),
      getLanguageSupport(activeFile),
      placeholder('Start typing, or press Ctrl+Enter to run'),
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
      // AI Sparkle Tooltip on Selection
      aiTooltipCompartment.of(
        createAiTooltipExtension({
          onImproveWithAi,
          isStopped,
          readOnly,
          isOffline
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

  // Dynamic Theme Reconfiguration via CodeMirror Compartment
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: [
          themeCompartment.reconfigure(getEditorTheme(theme)),
          syntaxCompartment.reconfigure(getSyntaxTheme(theme))
        ]
      })
    }
  }, [theme])

  // Dynamic AI Sparkle Tooltip Reconfiguration
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: aiTooltipCompartment.reconfigure(
          createAiTooltipExtension({
            onImproveWithAi,
            isStopped,
            readOnly,
            isOffline
          })
        )
      })
    }
  }, [isStopped, readOnly, isOffline, onImproveWithAi])

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

  const getTabFileIcon = (filename) => {
    const ext = getFileExtension(filename)
    if (['md', 'txt'].includes(ext)) {
      return <FileText size={13} className="tab-icon file-icon-md" />
    }
    if (ext === 'py') {
      return <FileCode size={13} className="tab-icon file-icon-py" />
    }
    if (['js', 'jsx', 'mjs', 'ts', 'tsx'].includes(ext)) {
      return <FileCode size={13} className="tab-icon file-icon-js" />
    }
    if (['html', 'htm'].includes(ext)) {
      return <FileCode size={13} className="tab-icon file-icon-html" />
    }
    if (['css'].includes(ext)) {
      return <FileCode size={13} className="tab-icon file-icon-css" />
    }
    return <FileCode size={13} className="tab-icon" />
  }

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
                {getTabFileIcon(fileName)}
                <span className="editor-tab-name">{fileName}</span>
                <span className="editor-tab-badge">
                  {getFileExtension(fileName).toUpperCase() || 'FILE'}
                </span>
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
          <div className="editor-empty-card">
            <FileCode size={40} className="editor-empty-icon" />
            <h3 className="editor-empty-title">No file open</h3>
            <p className="editor-empty-desc">Select a file from the explorer or create a new file to get started.</p>
            {onCreateFile && (
              <button
                type="button"
                className="btn-flat btn-primary btn-sm btn-empty-new"
                onClick={onCreateFile}
                disabled={isStopped}
              >
                <Plus size={14} />
                <span>New file</span>
              </button>
            )}
          </div>
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
                      width="15"
                      height="15"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="remote-pointer-arrow"
                    >
                      <path
                        d="M0 0 L5 15 L8 9 L14 8 Z"
                        fill={p.color}
                        stroke="rgba(255, 255, 255, 0.9)"
                        strokeWidth="1.2"
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
                      <span>{p.name}</span>
                      {p.isStopped && <span className="pointer-tag-stopped">Stopped</span>}
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
