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
  showTooltip,
  highlightWhitespace
} from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
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
import { autocompletion, acceptCompletion, closeBrackets } from '@codemirror/autocomplete'
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
import CustomizePopover, { DEFAULT_PREFS, saveEditorPrefs } from './CustomizePopover'

// 11 Syntax Theme Presets defined for both dark & light
function createHighlightStyle(preset, isDark) {
  switch (preset) {
    case 'Dracula':
      return HighlightStyle.define([
        { tag: t.keyword, color: '#ff79c6' },
        { tag: [t.name, t.deleted, t.character, t.macroName], color: '#f8f8f2' },
        { tag: [t.function(t.variableName), t.labelName], color: '#50fa7b' },
        { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#bd93f9' },
        { tag: [t.typeName, t.className, t.number], color: '#bd93f9' },
        { tag: [t.operator, t.operatorKeyword], color: '#ff79c6' },
        { tag: [t.meta, t.comment], color: '#6272a4', fontStyle: 'italic' },
        { tag: [t.string, t.inserted], color: '#f1fa8c' },
        { tag: t.invalid, color: '#ff5555' }
      ])

    case 'One Dark':
      return HighlightStyle.define([
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

    case 'Nord':
      return HighlightStyle.define([
        { tag: t.keyword, color: '#81a1c1' },
        { tag: [t.name, t.deleted, t.character, t.macroName], color: '#d8dee9' },
        { tag: [t.function(t.variableName), t.labelName], color: '#88c0d0' },
        { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#ebcb8b' },
        { tag: [t.typeName, t.className, t.number], color: '#b48ead' },
        { tag: [t.operator, t.operatorKeyword], color: '#81a1c1' },
        { tag: [t.meta, t.comment], color: '#4c566a', fontStyle: 'italic' },
        { tag: [t.string, t.inserted], color: '#a3be8c' },
        { tag: t.invalid, color: '#bf616a' }
      ])

    case 'Tokyo Night':
      return HighlightStyle.define([
        { tag: t.keyword, color: '#bb9af7' },
        { tag: [t.name, t.deleted, t.character, t.macroName], color: '#c0caf5' },
        { tag: [t.function(t.variableName), t.labelName], color: '#7aa2f7' },
        { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#ff9e64' },
        { tag: [t.typeName, t.className, t.number], color: '#2ac3de' },
        { tag: [t.operator, t.operatorKeyword], color: '#89ddff' },
        { tag: [t.meta, t.comment], color: '#565f89', fontStyle: 'italic' },
        { tag: [t.string, t.inserted], color: '#9ece6a' },
        { tag: t.invalid, color: '#f7768e' }
      ])

    case 'Solarized Light':
      return HighlightStyle.define([
        { tag: t.keyword, color: '#859900' },
        { tag: [t.name, t.deleted, t.character, t.macroName], color: '#657b83' },
        { tag: [t.function(t.variableName), t.labelName], color: '#268bd2' },
        { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#b58900' },
        { tag: [t.typeName, t.className, t.number], color: '#d33682' },
        { tag: [t.operator, t.operatorKeyword], color: '#b58900' },
        { tag: [t.meta, t.comment], color: '#93a1a1', fontStyle: 'italic' },
        { tag: [t.string, t.inserted], color: '#2aa198' },
        { tag: t.invalid, color: '#dc322f' }
      ])

    case 'Solarized Dark':
      return HighlightStyle.define([
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

    case 'GitHub Light':
      return HighlightStyle.define([
        { tag: t.keyword, color: '#cf222e' },
        { tag: [t.name, t.deleted, t.character, t.macroName], color: '#24292f' },
        { tag: [t.function(t.variableName), t.labelName], color: '#8250df' },
        { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#0550ae' },
        { tag: [t.typeName, t.className, t.number], color: '#953800' },
        { tag: [t.operator, t.operatorKeyword], color: '#0a3069' },
        { tag: [t.meta, t.comment], color: '#6e7781', fontStyle: 'italic' },
        { tag: [t.string, t.inserted], color: '#116329' },
        { tag: t.invalid, color: '#cf222e' }
      ])

    case 'GitHub Dark':
      return HighlightStyle.define([
        { tag: t.keyword, color: '#ff7b72' },
        { tag: [t.name, t.deleted, t.character, t.macroName], color: '#c9d1d9' },
        { tag: [t.function(t.variableName), t.labelName], color: '#d2a8ff' },
        { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#79c0ff' },
        { tag: [t.typeName, t.className, t.number], color: '#ffa657' },
        { tag: [t.operator, t.operatorKeyword], color: '#ff7b72' },
        { tag: [t.meta, t.comment], color: '#8b949e', fontStyle: 'italic' },
        { tag: [t.string, t.inserted], color: '#7ee787' },
        { tag: t.invalid, color: '#f85149' }
      ])

    case 'Gruvbox Dark':
      return HighlightStyle.define([
        { tag: t.keyword, color: '#fb4934' },
        { tag: [t.name, t.deleted, t.character, t.macroName], color: '#ebdbb2' },
        { tag: [t.function(t.variableName), t.labelName], color: '#b8bb26' },
        { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#fabd2f' },
        { tag: [t.typeName, t.className, t.number], color: '#d3869b' },
        { tag: [t.operator, t.operatorKeyword], color: '#fe8019' },
        { tag: [t.meta, t.comment], color: '#928374', fontStyle: 'italic' },
        { tag: [t.string, t.inserted], color: '#b8bb26' },
        { tag: t.invalid, color: '#cc241d' }
      ])

    case 'Monokai':
      return HighlightStyle.define([
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

function getThemeColors(preset, isDark) {
  switch (preset) {
    case 'Dracula':
      return { bg: '#282a36', fg: '#f8f8f2', gutterBg: '#21222c', activeLine: 'rgba(255, 255, 255, 0.05)', selection: 'rgba(68, 71, 90, 0.6)' }
    case 'One Dark':
      return { bg: '#282c34', fg: '#abb2bf', gutterBg: '#21252b', activeLine: '#2c313a', selection: '#3e4451' }
    case 'Nord':
      return { bg: '#2e3440', fg: '#d8dee9', gutterBg: '#242933', activeLine: '#3b4252', selection: '#434c5e' }
    case 'Tokyo Night':
      return { bg: '#1a1b26', fg: '#c0caf5', gutterBg: '#16161e', activeLine: '#292e42', selection: '#33467c' }
    case 'Solarized Light':
      return { bg: '#fdf6e3', fg: '#657b83', gutterBg: '#eee8d5', activeLine: '#eee8d5', selection: '#d3368222' }
    case 'Solarized Dark':
      return { bg: '#002b36', fg: '#839496', gutterBg: '#073642', activeLine: '#073642', selection: '#2aa19822' }
    case 'GitHub Light':
      return { bg: '#ffffff', fg: '#24292f', gutterBg: '#f6f8fa', activeLine: '#f6f8fa', selection: '#b3d7ff' }
    case 'GitHub Dark':
      return { bg: '#0d1117', fg: '#c9d1d9', gutterBg: '#010409', activeLine: '#161b22', selection: '#1f6feb44' }
    case 'Gruvbox Dark':
      return { bg: '#282828', fg: '#ebdbb2', gutterBg: '#1d2021', activeLine: '#3c3836', selection: '#504945' }
    case 'Monokai':
      return { bg: '#272822', fg: '#f8f8f2', gutterBg: '#1e1f1c', activeLine: '#3e3d32', selection: '#49483e' }
    case 'OffCode':
    default:
      return null
  }
}

function getFontFamilyString(family) {
  return `"${family || 'JetBrains Mono'}", Consolas, "Liberation Mono", Menlo, Courier, monospace`
}

function getLineHeightValue(lh) {
  switch (lh) {
    case 'compact': return '1.35'
    case 'relaxed': return '1.75'
    case 'normal':
    default: return '1.55'
  }
}

const themeCompartment = new Compartment()
const syntaxCompartment = new Compartment()
const lineNumbersCompartment = new Compartment()
const foldGutterCompartment = new Compartment()
const wordWrapCompartment = new Compartment()
const tabSizeCompartment = new Compartment()
const indentUnitCompartment = new Compartment()
const bracketMatchingCompartment = new Compartment()
const closeBracketsCompartment = new Compartment()
const activeLineCompartment = new Compartment()
const whitespaceCompartment = new Compartment()
const aiTooltipCompartment = new Compartment()

function getEditorTheme(theme, prefs = DEFAULT_PREFS, currentUserColor = '#2563eb') {
  const isDark = theme !== 'light'
  const customColors = getThemeColors(prefs.syntaxTheme, isDark)
  const fontFamily = getFontFamilyString(prefs.fontFamily)
  const fontSize = `${prefs.fontSize || 13}px`
  const lineHeight = getLineHeightValue(prefs.lineHeight)
  const ligatures = prefs.ligatures ? 'normal' : 'none'
  const fontFeatureSettings = prefs.ligatures ? '"liga" 1, "calt" 1' : '"liga" 0, "calt" 0'

  const caretCol = prefs.caretColor === 'user' ? (currentUserColor || '#2563eb') : (prefs.caretColor || '#2563eb')

  let cursorBlinkAnim = 'cm-smooth-blink 1s ease-in-out infinite'
  if (prefs.cursorBlink === 'blink') cursorBlinkAnim = 'cm-blink 1s steps(1) infinite'
  if (prefs.cursorBlink === 'solid') cursorBlinkAnim = 'none !important'

  const cursorStyleObj = {
    borderLeft: '2px solid ' + caretCol
  }
  if (prefs.cursorStyle === 'thick') {
    cursorStyleObj.borderLeft = '3.5px solid ' + caretCol
  } else if (prefs.cursorStyle === 'block') {
    cursorStyleObj.borderLeft = 'none'
    cursorStyleObj.backgroundColor = caretCol
    cursorStyleObj.opacity = '0.45'
  } else if (prefs.cursorStyle === 'underline') {
    cursorStyleObj.borderLeft = 'none'
    cursorStyleObj.borderBottom = '2.5px solid ' + caretCol
  }

  if (prefs.smoothCaret) {
    cursorStyleObj.transition = 'left 80ms cubic-bezier(0.2, 0, 0, 1), top 80ms cubic-bezier(0.2, 0, 0, 1)'
  }

  if (prefs.cursorGlow) {
    cursorStyleObj.boxShadow = `0 0 8px ${caretCol}`
  }

  let rulerBg = 'none'
  if (prefs.ruler === '80' || prefs.ruler === '100') {
    const col = prefs.ruler === '80' ? 80 : 100
    rulerBg = `linear-gradient(to right, transparent calc(${col}ch - 1px), var(--border-color) calc(${col}ch - 1px), var(--border-color) ${col}ch, transparent ${col}ch)`
  }

  const baseTheme = {
    '&': {
      backgroundColor: customColors ? customColors.bg : 'var(--bg-editor)',
      color: customColors ? customColors.fg : 'var(--text-main)',
      fontFamily,
      fontSize,
      lineHeight,
      fontVariantLigatures: ligatures,
      fontFeatureSettings
    },
    '.cm-scroller': {
      backgroundImage: rulerBg,
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'local',
      paddingTop: '24px' // Bug 6: prevent line 1 remote tags from clipping
    },
    '.cm-content': {
      caretColor: caretCol,
      fontFamily,
      fontVariantLigatures: ligatures,
      fontFeatureSettings
    },
    '.cm-cursor, .cm-dropCursor': {
      ...cursorStyleObj,
      animation: cursorBlinkAnim
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: (customColors ? customColors.selection : 'var(--editor-selection)') + ' !important'
    },
    '.cm-activeLine': {
      backgroundColor: customColors ? customColors.activeLine : 'var(--editor-active-line)'
    },
    '.cm-gutters': {
      backgroundColor: customColors ? customColors.gutterBg : 'var(--editor-gutter-bg)',
      color: 'var(--editor-gutter-color)',
      borderRight: '1px solid var(--border-color)',
      fontVariantNumeric: 'tabular-nums'
    },
    '.cm-activeLineGutter': {
      backgroundColor: customColors ? customColors.activeLine : 'var(--editor-active-line)',
      color: 'var(--text-main)'
    },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: isDark ? 'rgba(91, 147, 247, 0.2)' : 'rgba(37, 99, 235, 0.15)',
      outline: '1px solid var(--accent-primary)'
    },
    '.cm-line': {
      paddingLeft: '6px'
    }
  }

  if (prefs.indentGuides) {
    baseTheme['.cm-line'] = {
      paddingLeft: '6px',
      backgroundImage: `repeating-linear-gradient(to right, ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'} 0 1px, transparent 1px ${prefs.tabSize || 4}ch)`,
      backgroundRepeat: 'repeat-y'
    }
  }

  return EditorView.theme(baseTheme, { dark: customColors ? true : isDark })
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

  const [zoomToast, setZoomToast] = useState(null)
  const zoomToastTimerRef = useRef(null)

  const showZoomToast = useCallback((text) => {
    if (zoomToastTimerRef.current) clearTimeout(zoomToastTimerRef.current)
    setZoomToast(text)
    zoomToastTimerRef.current = setTimeout(() => {
      setZoomToast(null)
    }, 1200)
  }, [])

  // Zoom handlers for shortcuts (Ctrl+=, Ctrl+-, Ctrl+0, Ctrl+wheel)
  const handleZoom = useCallback(
    (delta) => {
      if (!onChangeEditorPrefs) return
      const cur = editorPrefs.fontSize || 13
      const next = Math.max(10, Math.min(32, cur + delta))
      if (next !== cur) {
        const updated = { ...editorPrefs, fontSize: next }
        onChangeEditorPrefs(updated)
        saveEditorPrefs(updated)
        showZoomToast(`${Math.round((next / 13) * 100)}%`)
      }
    },
    [editorPrefs, onChangeEditorPrefs, showZoomToast]
  )

  const handleResetZoom = useCallback(() => {
    if (!onChangeEditorPrefs) return
    const updated = { ...editorPrefs, fontSize: 13 }
    onChangeEditorPrefs(updated)
    saveEditorPrefs(updated)
    showZoomToast('100%')
  }, [editorPrefs, onChangeEditorPrefs, showZoomToast])

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
      lineNumbersCompartment.of(
        editorPrefs.lineNumbers
          ? lineNumbers({
              formatNumber: editorPrefs.relativeLineNumbers
                ? (lineNo, state) => {
                    const currentLine = state.doc.lineAt(state.selection.main.head).number
                    const diff = Math.abs(lineNo - currentLine)
                    return diff === 0 ? String(lineNo) : String(diff)
                  }
                : (n) => String(n)
            })
          : []
      ),
      highlightActiveLineGutter(),
      foldGutterCompartment.of(editorPrefs.foldGutter ? foldGutter() : []),
      bracketMatchingCompartment.of(editorPrefs.bracketMatching ? bracketMatching() : []),
      activeLineCompartment.of(editorPrefs.highlightActiveLine ? highlightActiveLine() : []),
      indentOnInput(),
      tabSizeCompartment.of(EditorState.tabSize.of(editorPrefs.tabSize || 4)),
      indentUnitCompartment.of(indentUnit.of(' '.repeat(editorPrefs.tabSize || 4))),
      closeBracketsCompartment.of(editorPrefs.autoCloseBrackets ? closeBrackets() : []),
      whitespaceCompartment.of(editorPrefs.showWhitespace ? highlightWhitespace() : []),
      wordWrapCompartment.of(editorPrefs.wordWrap ? EditorView.lineWrapping : []),
      themeCompartment.of(getEditorTheme(theme, editorPrefs, currentUserColor)),
      syntaxCompartment.of(getSyntaxTheme(theme, editorPrefs.syntaxTheme)),
      getLanguageSupport(activeFile),
      placeholder('Start typing, or press Ctrl+Enter to run'),
      EditorState.readOnly.of(Boolean(readOnly || isStopped)),
      EditorView.editable.of(!readOnly && !isStopped),
      autocompletion({ activateOnTyping: true }),
      keymap.of((readOnly || isStopped) ? defaultKeymap : [{ key: 'Tab', run: acceptCompletion }, indentWithTab, ...yUndoManagerKeymap, ...defaultKeymap]),
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
          themeCompartment.reconfigure(getEditorTheme(theme, editorPrefs, currentUserColor)),
          syntaxCompartment.reconfigure(getSyntaxTheme(theme, editorPrefs.syntaxTheme)),
          lineNumbersCompartment.reconfigure(
            editorPrefs.lineNumbers
              ? lineNumbers({
                  formatNumber: editorPrefs.relativeLineNumbers
                    ? (lineNo, state) => {
                        const currentLine = state.doc.lineAt(state.selection.main.head).number
                        const diff = Math.abs(lineNo - currentLine)
                        return diff === 0 ? String(lineNo) : String(diff)
                      }
                    : (n) => String(n)
                })
              : []
          ),
          foldGutterCompartment.reconfigure(editorPrefs.foldGutter ? foldGutter() : []),
          wordWrapCompartment.reconfigure(editorPrefs.wordWrap ? EditorView.lineWrapping : []),
          tabSizeCompartment.reconfigure(EditorState.tabSize.of(editorPrefs.tabSize || 4)),
          indentUnitCompartment.reconfigure(indentUnit.of(' '.repeat(editorPrefs.tabSize || 4))),
          bracketMatchingCompartment.reconfigure(editorPrefs.bracketMatching ? bracketMatching() : []),
          closeBracketsCompartment.reconfigure(editorPrefs.autoCloseBrackets ? closeBrackets() : []),
          activeLineCompartment.reconfigure(editorPrefs.highlightActiveLine ? highlightActiveLine() : []),
          whitespaceCompartment.reconfigure(editorPrefs.showWhitespace ? highlightWhitespace() : [])
        ]
      })
    } catch (err) {
      console.warn('[Editor] Failed reconfiguring editor compartments:', err)
    }
  }, [theme, editorPrefs, currentUserColor])

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
      {zoomToast && (
        <div className="editor-zoom-toast" role="status" aria-live="polite">
          {zoomToast}
        </div>
      )}
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
