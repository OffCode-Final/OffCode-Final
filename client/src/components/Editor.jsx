import { useEffect, useRef, useState } from 'react'
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

import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'

import { getUndoManager } from '../utils/undoCache'
import { getFileExtension, getLanguageName, getFileBadgeInfo } from '../utils/helpers'

export default function Editor({
  activeFile,
  ytext,
  awareness,
  remoteUsersViewingThisFile
}) {
  const editorRef = useRef(null)
  const viewRef = useRef(null)

  const [cursorPos, setCursorPos] = useState({
    line: 1,
    col: 1,
    charCount: 0,
    lineCount: 1
  })

  // Language extension selector supporting all Phase A languages
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

    // Retrieve or create the persistent cached UndoManager for this file
    const fileUndoManager = getUndoManager(activeFile, ytext)

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
      getLanguageSupport(activeFile),
      // Keymap for local undo/redo with Mod-z and Mod-Shift-z / Mod-y
      keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
      // Yjs collaboration plugin (Sync + Remote Cursors + Local UndoManager)
      yCollab(ytext, awareness, { undoManager: fileUndoManager }),
      // Update listener for cursor position and document stats
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          setCursorPos({
            line: line.number,
            col: head - line.from + 1,
            charCount: update.state.doc.length,
            lineCount: update.state.doc.lines
          })

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

    // Focus editor
    view.focus()

    // Initialize cursor stats
    try {
      const line = state.doc.lineAt(0)
      setCursorPos({
        line: 1,
        col: 1,
        charCount: state.doc.length,
        lineCount: state.doc.lines
      })
      if (awareness) {
        awareness.setLocalStateField('currentLine', 1)
      }
    } catch {
      // ignore
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
  }, [activeFile, ytext, awareness])

  if (!activeFile || !ytext) {
    return (
      <main className="editor-area editor-empty-state">
        <div className="empty-message-box">
          <span className="empty-icon">📁</span>
          <h3>No File Open</h3>
          <p>Select a file from the sidebar or click <strong>+ New File</strong> to begin editing.</p>
        </div>
      </main>
    )
  }

  const badge = getFileBadgeInfo(activeFile)
  const language = getLanguageName(activeFile)

  return (
    <main className="editor-area">
      {/* File Header Tab Bar */}
      <div className="editor-tabs-bar">
        <div className="editor-active-tab">
          <span
            className="tab-badge"
            style={{ backgroundColor: badge.color }}
          >
            {badge.label}
          </span>
          <span className="tab-title">{activeFile}</span>
          <span className="tab-live-indicator" title="Synced in real-time via CRDT">
            ● live
          </span>
        </div>

        {remoteUsersViewingThisFile && remoteUsersViewingThisFile.length > 0 && (
          <div className="file-collaborators-preview">
            <span className="viewing-label">Also viewing:</span>
            {remoteUsersViewingThisFile.map((u) => (
              <span
                key={u.clientId}
                className="collaborator-avatar-chip"
                style={{ backgroundColor: u.color }}
                title={`${u.name} is in this file`}
              >
                {u.name.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* CodeMirror 6 Editor Container */}
      <div className="codemirror-wrapper" ref={editorRef} />

      {/* Editor Status Bar */}
      <footer className="editor-status-bar">
        <div className="status-bar-left">
          <span className="status-item">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span className="status-separator">|</span>
          <span className="status-item">
            {cursorPos.lineCount} {cursorPos.lineCount === 1 ? 'line' : 'lines'}
          </span>
          <span className="status-separator">|</span>
          <span className="status-item">{cursorPos.charCount} chars</span>
        </div>

        <div className="status-bar-right">
          <span className="status-item language-pill">{language}</span>
          <span className="status-separator">|</span>
          <span className="status-item utf8-pill">UTF-8</span>
          <span className="status-separator">|</span>
          <span className="status-item">CRDT: Yjs</span>
        </div>
      </footer>
    </main>
  )
}
