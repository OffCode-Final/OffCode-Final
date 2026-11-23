import { useState, useEffect, useRef, useCallback } from 'react'
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
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  indentUnit,
  HighlightStyle,
  syntaxHighlighting,
  StreamLanguage
} from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { autocompletion, acceptCompletion } from '@codemirror/autocomplete'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { X, Send, FileCode, Plus, Sliders } from 'lucide-react'

import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { php } from '@codemirror/lang-php'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'

import { getUndoManager } from '../utils/undoCache'
import { getFileExtension } from '../utils/helpers'
import { createUserChangesExtension, userChangesCompartment } from '../utils/userChanges'
import CustomizePopover, { DEFAULT_PREFS } from './CustomizePopover'

// 6 Syntax Theme Presets defined for both dark & light
function createHighlightStyle(preset, isDark) {
  switch (preset) {
    case 'GitHub':
      return isDark
        ? HighlightStyle.define([
            { tag: t.keyword, color: '#ff7b72' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#c9d1d9' },
            { tag: [t.function(t.variableName), t.labelName], color: '#d2a8ff' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#79c0ff' },
            { tag: [t.typeName, t.className, t.number], color: '#ffa657' },
            { tag: [t.operator, t.operatorKeyword], color: '#ff7b72' },
            { tag: [t.meta, t.comment], color: '#8b949e', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#a5d6ff' },
            { tag: t.invalid, color: '#f85149' }
          ])
        : HighlightStyle.define([
            { tag: t.keyword, color: '#cf222e' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#24292f' },
            { tag: [t.function(t.variableName), t.labelName], color: '#8250df' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#0550ae' },
            { tag: [t.typeName, t.className, t.number], color: '#953800' },
            { tag: [t.operator, t.operatorKeyword], color: '#0a3069' },
            { tag: [t.meta, t.comment], color: '#6e7781', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#0a3069' },
            { tag: t.invalid, color: '#cf222e' }
          ])

    case 'One':
      return isDark
        ? HighlightStyle.define([
            { tag: t.keyword, color: '#c678dd' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#abb2bf' },
            { tag: [t.function(t.variableName), t.labelName], color: '#61afef' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#d19a66' },
            { tag: [t.typeName, t.className, t.number], color: '#e5c07b' },
            { tag: [t.operator, t.operatorKeyword], color: '#56b6c2' },
            { tag: [t.meta, t.comment], color: '#5c6370', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#98c379' },
            { tag: t.invalid, color: '#e06c75' }
          ])
        : HighlightStyle.define([
            { tag: t.keyword, color: '#a626a4' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#383a42' },
            { tag: [t.function(t.variableName), t.labelName], color: '#4078f2' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#986801' },
            { tag: [t.typeName, t.className, t.number], color: '#c18401' },
            { tag: [t.operator, t.operatorKeyword], color: '#0184bc' },
            { tag: [t.meta, t.comment], color: '#a0a1a7', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#50a14f' },
            { tag: t.invalid, color: '#e45649' }
          ])

    case 'Solarized':
      return isDark
        ? HighlightStyle.define([
            { tag: t.keyword, color: '#859900' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#839496' },
            { tag: [t.function(t.variableName), t.labelName], color: '#268bd2' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#cb4b16' },
            { tag: [t.typeName, t.className, t.number], color: '#b58900' },
            { tag: [t.operator, t.operatorKeyword], color: '#2aa198' },
            { tag: [t.meta, t.comment], color: '#586e75', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#2aa198' },
            { tag: t.invalid, color: '#dc322f' }
          ])
        : HighlightStyle.define([
            { tag: t.keyword, color: '#859900' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#657b83' },
            { tag: [t.function(t.variableName), t.labelName], color: '#268bd2' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#cb4b16' },
            { tag: [t.typeName, t.className, t.number], color: '#b58900' },
            { tag: [t.operator, t.operatorKeyword], color: '#2aa198' },
            { tag: [t.meta, t.comment], color: '#93a1a1', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#2aa198' },
            { tag: t.invalid, color: '#dc322f' }
          ])

    case 'Monokai':
      return isDark
        ? HighlightStyle.define([
            { tag: t.keyword, color: '#f92672' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#f8f8f2' },
            { tag: [t.function(t.variableName), t.labelName], color: '#a6e22e' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#ae81ff' },
            { tag: [t.typeName, t.className, t.number], color: '#66d9ef' },
            { tag: [t.operator, t.operatorKeyword], color: '#fd971f' },
            { tag: [t.meta, t.comment], color: '#75715e', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#e6db74' },
            { tag: t.invalid, color: '#f92672' }
          ])
        : HighlightStyle.define([
            { tag: t.keyword, color: '#d7005f' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#272822' },
            { tag: [t.function(t.variableName), t.labelName], color: '#718c00' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#8959a8' },
            { tag: [t.typeName, t.className, t.number], color: '#3e999f' },
            { tag: [t.operator, t.operatorKeyword], color: '#e78c45' },
            { tag: [t.meta, t.comment], color: '#8e908c', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#e78c45' },
            { tag: t.invalid, color: '#c82829' }
          ])

    case 'High contrast':
      return isDark
        ? HighlightStyle.define([
            { tag: t.keyword, color: '#58a6ff' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#ffffff' },
            { tag: [t.function(t.variableName), t.labelName], color: '#ffff00' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#ff7b72' },
            { tag: [t.typeName, t.className, t.number], color: '#7ee787' },
            { tag: [t.operator, t.operatorKeyword], color: '#ffffff' },
            { tag: [t.meta, t.comment], color: '#8b949e', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#3fb950' },
            { tag: t.invalid, color: '#ff0000' }
          ])
        : HighlightStyle.define([
            { tag: t.keyword, color: '#0000ff' },
            { tag: [t.name, t.deleted, t.character, t.macroName], color: '#000000' },
            { tag: [t.function(t.variableName), t.labelName], color: '#7900b5' },
            { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#a00000' },
            { tag: [t.typeName, t.className, t.number], color: '#006400' },
            { tag: [t.operator, t.operatorKeyword], color: '#000000' },
            { tag: [t.meta, t.comment], color: '#555555', fontStyle: 'italic' },
            { tag: [t.string, t.inserted], color: '#006400' },
            { tag: t.invalid, color: '#cc0000' }
          ])

    case 'OffCode':
    default:
      return isDark
        ? HighlightStyle.define([
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
        : HighlightStyle.define([
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
  }
}

function getFontFamilyString(family) {
  switch (family) {
    case 'Fira Code':
      return '"Fira Code", Consolas, monospace'
    case 'Source Code Pro':
      return '"Source Code Pro", Consolas, monospace'
    case 'IBM Plex Mono':
      return '"IBM Plex Mono", Consolas, monospace'
    case 'System monospace':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    case 'JetBrains Mono':
    default:
      return '"JetBrains Mono", Consolas, monospace'
  }
}

function getLineHeightValue(lh) {
  switch (lh) {
    case 'compact': return '1.4'
    case 'relaxed': return '1.8'
    case 'normal':
    default: return '1.6'
  }
}

const themeCompartment = new Compartment()
const syntaxCompartment = new Compartment()
const lineNumbersCompartment = new Compartment()
const wordWrapCompartment = new Compartment()
const tabSizeCompartment = new Compartment()
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

function getEditorTheme(theme, prefs = DEFAULT_PREFS) {
  const isDark = theme !== 'light'
  const fontFamily = getFontFamilyString(prefs.fontFamily)
  const fontSize = `${prefs.fontSize || 13}px`
  const lineHeight = getLineHeightValue(prefs.lineHeight)
  const ligatures = prefs.ligatures ? 'normal' : 'none'

  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--bg-editor)',
        color: 'var(--text-main)',
        fontFamily,
        fontSize,
        lineHeight,
        fontVariantLigatures: ligatures
      },
      '.cm-content': {
        caretColor: 'var(--editor-cursor)',
        fontFamily,
        fontVariantLigatures: ligatures
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
        borderRight: '1px solid var(--border-color)',
        fontVariantNumeric: 'tabular-nums'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--editor-active-line)',
        color: 'var(--text-main)'
      },
      '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
        backgroundColor: isDark ? 'rgba(91, 147, 247, 0.2)' : 'rgba(37, 99, 235, 0.15)',
        outline: '1px solid var(--accent-primary)'
      },
      '.cm-line': {
        paddingLeft: '6px'
      }
    },
    { dark: isDark }
  )
}

function getSyntaxTheme(theme, syntaxPreset = 'OffCode') {
  return syntaxHighlighting(createHighlightStyle(syntaxPreset, theme !== 'light'))
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
  isOffline = false,
  editorPrefs = DEFAULT_PREFS,
  onChangeEditorPrefs,
  isCustomizeOpen = false,
  onToggleCustomize
}) {
  const editorRef = useRef(null)
  const viewRef = useRef(null)
  const customizeBtnRef = useRef(null)
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
      case 'php':
        return php()
      case 'rs':
        return rust()
      case 'go':
        return go()
      case 'rb':
        return StreamLanguage.define(ruby)
      default:
        return []
    }
  }

  // Zoom handlers for shortcuts
  const handleZoom = useCallback(
    (delta) => {
      if (!onChangeEditorPrefs) return
      const cur = editorPrefs.fontSize || 13
      const next = Math.max(11, Math.min(24, cur + delta))
      if (next !== cur) {
        onChangeEditorPrefs({ ...editorPrefs, fontSize: next })
      }
    },
    [editorPrefs, onChangeEditorPrefs]
  )

  const handleResetZoom = useCallback(() => {
    if (!onChangeEditorPrefs) return
    if (editorPrefs.fontSize !== 13) {
      onChangeEditorPrefs({ ...editorPrefs, fontSize: 13 })
    }
  }, [editorPrefs, onChangeEditorPrefs])

  useEffect(() => {
    if (!editorRef.current || !activeFile || !ytext) {
      return
    }

    // Clean up previous view
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    const cacheKey = isDraft ? `draft:${activeFile}` : activeFile
    const fileUndoManager = getUndoManager(cacheKey, ytext)

    if (awareness) {
      awareness.setLocalStateField('currentFile', activeFile)
    }

    // Extensions list
    const extensions = [
      lineNumbersCompartment.of(editorPrefs.lineNumbers ? lineNumbers() : []),
      highlightActiveLineGutter(),
      foldGutter(),
      bracketMatching(),
      highlightActiveLine(),
      indentOnInput(),
      tabSizeCompartment.of(EditorState.tabSize.of(editorPrefs.tabSize || 4)),
      indentUnit.of(' '.repeat(editorPrefs.tabSize || 4)),
      wordWrapCompartment.of(editorPrefs.wordWrap ? EditorView.lineWrapping : []),
      themeCompartment.of(getEditorTheme(theme, editorPrefs)),
      syntaxCompartment.of(getSyntaxTheme(theme, editorPrefs.syntaxTheme)),
      getLanguageSupport(activeFile),
      placeholder('Start typing, or press Ctrl+Enter to run'),
      EditorState.readOnly.of(Boolean(readOnly || isStopped)),
      EditorView.editable.of(!readOnly && !isStopped),
      autocompletion({ activateOnTyping: true }),
      keymap.of((readOnly || isStopped) ? defaultKeymap : [{ key: 'Tab', run: acceptCompletion }, ...yUndoManagerKeymap, ...defaultKeymap]),
      yCollab(ytext, awareness, { undoManager: (readOnly || isStopped) ? false : fileUndoManager }),
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
      aiTooltipCompartment.of(
        createAiTooltipExtension({
          onImproveWithAi,
          isStopped,
          readOnly,
          isOffline
        })
      ),
      EditorView.domEventHandlers({
        mousedown() {
          if (onUserInteraction) onUserInteraction()
          return false
        },
        keydown(e) {
          if (onUserInteraction) onUserInteraction()
          // Zoom shortcuts: Ctrl+Plus, Ctrl+Minus, Ctrl+0
          if (e.ctrlKey || e.metaKey) {
            if (e.key === '=' || e.key === '+') {
              e.preventDefault()
              handleZoom(1)
              return true
            } else if (e.key === '-' || e.key === '_') {
              e.preventDefault()
              handleZoom(-1)
              return true
            } else if (e.key === '0') {
              e.preventDefault()
              handleResetZoom()
              return true
            }
          }
          return false
        },
        wheel(e) {
          // Ctrl + wheel zoom prevention of page zoom while editor focused
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (e.deltaY < 0) {
              handleZoom(1)
            } else if (e.deltaY > 0) {
              handleZoom(-1)
            }
            return true
          }
          return false
        }
      }),
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

    try {
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
    } catch (_) {}

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
      // Only broadcast if cursor is within the editor content boundaries
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return
      }

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
    scroller.addEventListener('mouseleave', clearPointer, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearPointer()
      scroller.removeEventListener('mousemove', handleMouseMove)
      scroller.removeEventListener('mouseleave', clearPointer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      setScrollerNode(null)
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
  }, [activeFile, ytext, awareness, readOnly, isStopped])

  // Dynamic Editor Preferences Reconfiguration via CodeMirror Compartments
  useEffect(() => {
    if (!viewRef.current) return

    try {
      viewRef.current.dispatch({
        effects: [
          themeCompartment.reconfigure(getEditorTheme(theme, editorPrefs)),
          syntaxCompartment.reconfigure(getSyntaxTheme(theme, editorPrefs.syntaxTheme)),
          lineNumbersCompartment.reconfigure(editorPrefs.lineNumbers ? lineNumbers() : []),
          wordWrapCompartment.reconfigure(editorPrefs.wordWrap ? EditorView.lineWrapping : []),
          tabSizeCompartment.reconfigure(EditorState.tabSize.of(editorPrefs.tabSize || 4))
        ]
      })
    } catch (err) {
      console.warn('[Editor] Failed reconfiguring editor compartments:', err)
    }
  }, [theme, editorPrefs])

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

  const getTabLanguageDot = (filename) => {
    const ext = getFileExtension(filename)
    return <span className={`tab-lang-dot file-icon-${ext || 'txt'}`} aria-hidden="true" />
  }

  return (
    <main className="editor-container" role="region" aria-label="Code Editor">
      {/* Tab bar (36px high, scrollable, with Customize button) */}
      <div className="editor-tab-bar" role="tablist">
        <div className="tab-scroll-container">
          {openFiles.map((fileName) => {
            const isActive = fileName === activeFile
            return (
              <div
                key={fileName}
                role="tab"
                aria-selected={isActive}
                className={`editor-tab ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab(fileName)}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    if (onCloseTab) onCloseTab(fileName)
                  }
                }}
                title={fileName}
              >
                {getTabLanguageDot(fileName)}
                <span className="editor-tab-name">{fileName}</span>
                <button
                  type="button"
                  className="btn-tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onCloseTab) onCloseTab(fileName)
                  }}
                  title={`Close ${fileName}`}
                  aria-label={`Close tab ${fileName}`}
                >
                  <X size={12} strokeWidth={1.75} />
                </button>
              </div>
            )
          })}
        </div>

        <div className="editor-tab-actions">
          <button
            ref={customizeBtnRef}
            type="button"
            className={`btn-icon-subtle btn-customize-editor ${isCustomizeOpen ? 'active' : ''}`}
            onClick={onToggleCustomize}
            title="Customize editor"
            aria-label="Customize editor"
          >
            <Sliders size={14} strokeWidth={1.75} />
          </button>
        </div>

        <CustomizePopover
          prefs={editorPrefs}
          onChangePrefs={onChangeEditorPrefs}
          isOpen={isCustomizeOpen}
          onClose={() => onToggleCustomize && onToggleCustomize()}
          triggerRef={customizeBtnRef}
        />
      </div>

      {/* Review Mode Banner / Controls */}
      {isReviewMode && activeFile && ytext && (
        <div className="review-mode-banner">
          <div className="review-banner-left">
            <span className="review-badge">Draft Mode</span>
            <div className="review-tab-segmented">
              <button
                type="button"
                className={`review-seg-btn ${isDraft ? 'active' : ''}`}
                onClick={() => onSwitchReviewTab && onSwitchReviewTab('draft')}
              >
                My draft
              </button>
              <button
                type="button"
                className={`review-seg-btn ${!isDraft ? 'active' : ''}`}
                onClick={() => onSwitchReviewTab && onSwitchReviewTab('main')}
              >
                Main (read-only)
              </button>
            </div>
          </div>

          <button
            type="button"
            className="btn-flat btn-primary btn-xs btn-push-draft"
            onClick={onPushDraft}
            disabled={!isDraft || isStopped}
          >
            <Send size={12} strokeWidth={1.75} />
            <span>Push draft</span>
          </button>
        </div>
      )}

      {/* Editor Content Canvas */}
      {!activeFile || !ytext ? (
        <div className="editor-empty-state">
          <div className="editor-empty-card">
            <FileCode size={36} strokeWidth={1.75} className="editor-empty-icon" />
            <h3 className="editor-empty-title">
              No file open<span className="signature-caret" aria-hidden="true" />
            </h3>
            <p className="editor-empty-desc">Select a file from the explorer or create a new file to get started.</p>
            {onCreateFile && (
              <button
                type="button"
                className="btn-flat btn-primary btn-sm btn-empty-new"
                onClick={onCreateFile}
                disabled={isStopped}
              >
                <Plus size={14} strokeWidth={1.75} />
                <span>New file</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="editor-canvas"
          ref={editorRef}
          style={{
            fontSize: `${editorPrefs.fontSize || 13}px`,
            fontFamily: getFontFamilyString(editorPrefs.fontFamily),
            lineHeight: getLineHeightValue(editorPrefs.lineHeight)
          }}
        >
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
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="remote-pointer-arrow"
                    >
                      <path
                        d="M0 0 L5.5 15.5 L8.5 9.5 L14.5 8.5 Z"
                        fill={p.color}
                        stroke={theme === 'dark' ? '#0B0C0F' : '#FFFFFF'}
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div
                      className="remote-pointer-badge"
                      style={{
                        backgroundColor: p.color,
                        color: '#FFFFFF'
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
