import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
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
import CustomizePopover, { DEFAULT_PREFS, saveEditorPrefs, ensureGoogleFontLoaded } from './CustomizePopover'

// Calibrate user colors for light vs dark theme (lighten in dark, deepen in light)
export function getCalibratedColor(hexOrRgb, theme) {
  if (!hexOrRgb) return theme === 'dark' ? '#60a5fa' : '#2563eb'
  let hex = String(hexOrRgb).replace('#', '')
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  if (hex.length !== 6) return theme === 'dark' ? '#60a5fa' : '#2563eb'

  const r = parseInt(hex.substring(0, 2), 16) || 0
  const g = parseInt(hex.substring(2, 4), 16) || 0
  const b = parseInt(hex.substring(4, 6), 16) || 0

  const rN = r / 255, gN = g / 255, bN = b / 255
  const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN)
  let h = 0, s = 0, l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break
      case gN: h = (bN - rN) / d + 2; break
      case bN: h = (rN - gN) / d + 4; break
    }
    h /= 6
  }

  // Calibration: lighten in dark, deepen in light
  if (theme === 'dark') {
    if (l < 0.62) l = 0.65
    if (s < 0.45) s = 0.75
  } else {
    if (l > 0.42) l = 0.38
    if (s < 0.45) s = 0.85
  }

  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}

export function getAutoContrastTextColor(calibratedHsl) {
  if (!calibratedHsl) return '#FFFFFF'
  const match = String(calibratedHsl).match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/)
  if (match) {
    const l = parseInt(match[1], 10)
    return l > 55 ? '#111827' : '#FFFFFF'
  }
  return '#FFFFFF'
}

// Remote collaborative mouse pointers with lerp interpolation
function RemotePointersLayer({
  awareness,
  activeFile,
  scrollerNode,
  theme,
  frozenUserIds,
  onPointersChange
}) {
  const [activeClients, setActiveClients] = useState([])
  const targetsRef = useRef(new Map())
  const positionsRef = useRef(new Map())
  const pointersDataRef = useRef(new Map())
  const elementRefs = useRef(new Map())

  useEffect(() => {
    if (!awareness || !activeFile) {
      setActiveClients([])
      targetsRef.current.clear()
      positionsRef.current.clear()
      pointersDataRef.current.clear()
      if (onPointersChange) onPointersChange(0)
      return
    }

    const updateFromAwareness = () => {
      const states = awareness.getStates()
      const myClientId = awareness.clientID
      const now = Date.now()
      const activeIds = []

      states.forEach((state, clientId) => {
        if (clientId === myClientId) return
        const ptr = state?.pointer

        // Ignore if not in current file or invalid coordinates (ignore null, NaN)
        if (
          !ptr ||
          ptr.file !== activeFile ||
          !Number.isFinite(ptr.x) ||
          !Number.isFinite(ptr.y)
        ) {
          targetsRef.current.delete(clientId)
          positionsRef.current.delete(clientId)
          pointersDataRef.current.delete(clientId)
          return
        }

        // Hide when idle for 5 seconds
        const lastMoved = ptr.timestamp || now
        if (now - lastMoved >= 5000) {
          targetsRef.current.delete(clientId)
          positionsRef.current.delete(clientId)
          pointersDataRef.current.delete(clientId)
          return
        }

        // Clamp positions to the editor content box
        const maxW = scrollerNode ? scrollerNode.scrollWidth : 2000
        const maxH = scrollerNode ? scrollerNode.scrollHeight : 5000
        const clampedX = Math.max(0, Math.min(ptr.x, maxW))
        const clampedY = Math.max(0, Math.min(ptr.y, maxH))

        const resolvedUserId = state?.userId || state?.user?.userId || state?.user?.id || `client_${clientId}`
        const isUserStopped = Boolean(
          frozenUserIds && (
            frozenUserIds.has(resolvedUserId) ||
            (state?.userId && frozenUserIds.has(state.userId)) ||
            (state?.user?.id && frozenUserIds.has(state.user.id))
          )
        )

        const rawColor = state?.user?.color || '#3b82f6'
        const calibratedColor = getCalibratedColor(rawColor, theme)
        const autoContrastText = getAutoContrastTextColor(calibratedColor)

        targetsRef.current.set(clientId, { x: clampedX, y: clampedY })
        if (!positionsRef.current.has(clientId)) {
          positionsRef.current.set(clientId, { x: clampedX, y: clampedY })
        }
        pointersDataRef.current.set(clientId, {
          name: state?.user?.name || 'Anonymous',
          color: calibratedColor,
          textColor: autoContrastText,
          isStopped: isUserStopped,
          isTyping: Boolean(state?.isTyping)
        })

        activeIds.push(clientId)
      })

      setActiveClients(activeIds)
      if (onPointersChange) {
        onPointersChange(activeIds.length)
      }
    }

    awareness.on('change', updateFromAwareness)
    const interval = setInterval(updateFromAwareness, 1000)
    updateFromAwareness()

    return () => {
      awareness.off('change', updateFromAwareness)
      clearInterval(interval)
      if (onPointersChange) {
        onPointersChange(0)
      }
    }
  }, [awareness, activeFile, scrollerNode, theme, frozenUserIds, onPointersChange])

  // requestAnimationFrame lerp loop for smooth 60fps interpolation
  useEffect(() => {
    let animId = null
    const loop = () => {
      positionsRef.current.forEach((pos, clientId) => {
        const target = targetsRef.current.get(clientId)
        if (!target) return
        pos.x += (target.x - pos.x) * 0.28
        pos.y += (target.y - pos.y) * 0.28

        const el = elementRefs.current.get(clientId)
        if (el) {
          el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
        }
      })
      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)
    return () => {
      if (animId) cancelAnimationFrame(animId)
    }
  }, [])

  if (activeClients.length === 0) return null

  return (
    <div className="remote-pointers-container" aria-hidden="true">
      {activeClients.map((clientId) => {
        const data = pointersDataRef.current.get(clientId)
        const pos = positionsRef.current.get(clientId) || { x: 0, y: 0 }
        if (!data) return null

        return (
          <div
            key={clientId}
            ref={(node) => {
              if (node) elementRefs.current.set(clientId, node)
              else elementRefs.current.delete(clientId)
            }}
            className="remote-pointer"
            style={{
              transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`
            }}
          >
            {/* Crisp 18px SVG pointer with 1.5px white outline and subtle shadow */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              className="remote-pointer-arrow"
              style={{ filter: 'drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.35))' }}
            >
              <path
                d="M1.5 1.5 L7.5 16.5 L10.5 10.5 L16.5 7.5 Z"
                fill={data.color}
                stroke="#FFFFFF"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <div
              className="remote-pointer-badge"
              style={{
                backgroundColor: data.color,
                color: data.textColor
              }}
            >
              <span>{data.name}</span>
              {data.isTyping && (
                <span className="typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              )}
              {data.isStopped && <span className="pointer-tag-stopped">Stopped</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

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
  return `"${family || 'JetBrains Mono'}", ui-monospace, monospace`
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
const drawSelectionCompartment = new Compartment()
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

function getCaretColorValue(prefs = DEFAULT_PREFS, currentUserColor = '#6366f1') {
  return prefs.caretColor === 'user' ? (currentUserColor || '#6366f1') : (prefs.caretColor || '#6366f1')
}

function getCursorCssVars(prefs = DEFAULT_PREFS, currentUserColor = '#6366f1', charWidth = 8) {
  const caretCol = getCaretColorValue(prefs, currentUserColor)
  const cw = `${Number.isFinite(charWidth) && charWidth > 0 ? charWidth : 8}px`

  let width = '2px'
  let borderLeft = `2px solid ${caretCol}`
  let borderBottom = 'none'
  let background = 'transparent'

  if (prefs.cursorStyle === 'thick') {
    width = '4px'
    borderLeft = `4px solid ${caretCol}`
  } else if (prefs.cursorStyle === 'block') {
    width = cw
    borderLeft = 'none'
    background = `color-mix(in srgb, ${caretCol} 70%, transparent)`
  } else if (prefs.cursorStyle === 'underline') {
    width = cw
    borderLeft = 'none'
    borderBottom = `2px solid ${caretCol}`
  }

  let animation = 'cm-smooth-blink 1.1s ease-in-out infinite'
  if (prefs.cursorBlink === 'blink') animation = 'cm-blink 1.06s steps(1) infinite'
  else if (prefs.cursorBlink === 'solid') animation = 'none'

  return {
    '--cursor-color': caretCol,
    '--cursor-char-width': cw,
    '--cursor-width': width,
    '--cursor-border-left': borderLeft,
    '--cursor-border-bottom': borderBottom,
    '--cursor-background': background,
    '--cursor-shadow': prefs.cursorGlow ? `0 0 8px ${caretCol}` : 'none',
    '--cursor-transition': prefs.smoothCaret
      ? 'left 80ms cubic-bezier(0.2, 0, 0, 1), top 80ms cubic-bezier(0.2, 0, 0, 1)'
      : 'none',
    '--cursor-animation': animation
  }
}

function getEditorTheme(theme, prefs = DEFAULT_PREFS, currentUserColor = '#2563eb') {
  const isDark = theme !== 'light'
  const customColors = getThemeColors(prefs.syntaxTheme, isDark)
  const fontSize = `${prefs.fontSize || 13}px`
  const lineHeight = getLineHeightValue(prefs.lineHeight)
  const ligatures = prefs.ligatures ? 'normal' : 'none'
  const fontFeatureSettings = prefs.ligatures ? '"liga" 1, "calt" 1' : '"liga" 0, "calt" 0'

  let rulerBg = 'none'
  if (prefs.ruler === '80' || prefs.ruler === '100') {
    const col = prefs.ruler === '80' ? 80 : 100
    rulerBg = `linear-gradient(to right, transparent calc(${col}ch - 1px), var(--border-color) calc(${col}ch - 1px), var(--border-color) ${col}ch, transparent ${col}ch)`
  }

  const baseTheme = {
    '&': {
      backgroundColor: customColors ? customColors.bg : 'var(--bg-editor)',
      color: customColors ? customColors.fg : 'var(--text-main)',
      fontSize,
      lineHeight,
      fontVariantLigatures: ligatures,
      fontFeatureSettings
    },
    '.cm-scroller': {
      fontFamily: 'var(--editor-font)',
      backgroundImage: rulerBg,
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'local',
      paddingTop: '24px' // Bug 6: prevent line 1 remote tags from clipping
    },
    '.cm-content': {
      caretColor: 'transparent !important',
      fontFamily: 'var(--editor-font)',
      fontVariantLigatures: ligatures,
      fontFeatureSettings
    },
    '.cm-tooltip': {
      fontFamily: 'var(--editor-font)'
    },
    '.cm-cursorLayer': {
      animation: 'var(--cursor-animation) !important',
      zIndex: 100,
      pointerEvents: 'none'
    },
    '.cm-cursor, .cm-dropCursor': {
      width: 'var(--cursor-width, 2px)',
      borderLeft: 'var(--cursor-border-left)',
      borderBottom: 'var(--cursor-border-bottom)',
      backgroundColor: 'var(--cursor-background)',
      boxShadow: 'var(--cursor-shadow)',
      transition: 'var(--cursor-transition)',
      boxSizing: 'border-box'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: (customColors ? customColors.selection : 'var(--editor-selection)') + ' !important'
    },
    '.cm-activeLine': {
      backgroundColor: customColors ? customColors.activeLine : 'var(--editor-active-line)'
    },
    '.cm-gutters': {
      fontFamily: 'var(--editor-font)',
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
  const localPointerRef = useRef(null)
  const [scrollerNode, setScrollerNode] = useState(null)
  const typingTimerRef = useRef(null)

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
      drawSelectionCompartment.of(drawSelection({ cursorBlinkRate: 0 })),
      getLanguageSupport(activeFile),
      placeholder('Start typing, or press Ctrl+Enter to run'),
      EditorState.readOnly.of(Boolean(readOnly || isStopped)),
      EditorView.editable.of(!readOnly && !isStopped),
      EditorView.contentAttributes.of({ tabindex: '0' }),
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
        if (update.docChanged && awareness) {
          awareness.setLocalStateField('isTyping', true)
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => {
            if (awareness) awareness.setLocalStateField('isTyping', false)
          }, 1200)
        }

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

    if (editorRef.current) {
      const vars = getCursorCssVars(editorPrefs, currentUserColor, view.defaultCharacterWidth)
      for (const [k, v] of Object.entries(vars)) {
        editorRef.current.style.setProperty(k, v)
      }
    }

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
      // Only broadcast if cursor is strictly within the editor content boundaries
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        clearPointer()
        return
      }

      const x = Math.round(e.clientX - rect.left + scroller.scrollLeft)
      const y = Math.round(e.clientY - rect.top + scroller.scrollTop)
      if (localPointerRef.current) {
        localPointerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
        localPointerRef.current.style.opacity = '1'
      }
      const pointerData = { file: activeFile, x, y, timestamp: Date.now() }

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
      if (localPointerRef.current) {
        localPointerRef.current.style.opacity = '0'
      }
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

    let cancelled = false
    const view = viewRef.current

    const applyCursorVars = (cw) => {
      if (!editorRef.current) return
      const vars = getCursorCssVars(editorPrefs, currentUserColor, cw)
      for (const [k, v] of Object.entries(vars)) {
        editorRef.current.style.setProperty(k, v)
      }
    }

    if (editorRef.current) {
      editorRef.current.style.setProperty('--editor-font', getFontFamilyString(editorPrefs.fontFamily))
      applyCursorVars(view.defaultCharacterWidth)
    }

    try {
      view.dispatch({
        effects: [
          themeCompartment.reconfigure(getEditorTheme(theme, editorPrefs, currentUserColor)),
          syntaxCompartment.reconfigure(getSyntaxTheme(theme, editorPrefs.syntaxTheme)),
          drawSelectionCompartment.reconfigure(drawSelection({ cursorBlinkRate: 0 })),
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

    const fontName = editorPrefs.fontFamily || 'JetBrains Mono'
    ensureGoogleFontLoaded(fontName).finally(() => {
      if (!cancelled && viewRef.current) {
        viewRef.current.requestMeasure()
        requestAnimationFrame(() => {
          if (!cancelled && viewRef.current) {
            applyCursorVars(viewRef.current.defaultCharacterWidth)
          }
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [theme, editorPrefs, currentUserColor])

  // Broadcast local caret style and color over awareness
  useEffect(() => {
    if (!awareness) return
    awareness.setLocalStateField('caret', {
      style: editorPrefs.cursorStyle || 'line',
      color: getCaretColorValue(editorPrefs, currentUserColor)
    })
  }, [awareness, editorPrefs.cursorStyle, editorPrefs.caretColor, currentUserColor])

  // Bug 6: Detect remote carets near right edge and flip tag left + apply remote caret style
  useEffect(() => {
    if (!scrollerNode) return
    const checkCaretFlips = () => {
      const scrollerRect = scrollerNode.getBoundingClientRect()
      const carets = scrollerNode.querySelectorAll('.cm-ySelectionCaret')
      const remoteCaretByName = new Map()
      if (awareness) {
        const myId = awareness.clientID
        awareness.getStates().forEach((state, cid) => {
          if (cid === myId) return
          const name = state?.user?.name
          if (name && state?.caret) {
            remoteCaretByName.set(name, state.caret)
          }
        })
      }
      carets.forEach((caret) => {
        const rect = caret.getBoundingClientRect()
        // If within 28px of visible right edge, align tag to the left
        if (rect.right > scrollerRect.right - 28) {
          caret.classList.add('tag-flip-left')
        } else {
          caret.classList.remove('tag-flip-left')
        }
        const info = caret.querySelector('.cm-ySelectionInfo')
        const remoteCaret = info ? remoteCaretByName.get(info.textContent) : null
        if (remoteCaret) {
          if (remoteCaret.style) caret.setAttribute('data-caret-style', remoteCaret.style)
          if (remoteCaret.color) caret.style.setProperty('--remote-caret-color', remoteCaret.color)
        }
      })
    }

    const interval = setInterval(checkCaretFlips, 120)
    return () => clearInterval(interval)
  }, [scrollerNode, activeFile, awareness])

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
            onMouseDown={(e) => e.preventDefault()}
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
          currentUserColor={currentUserColor}
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
          className={`editor-canvas remote-labels-${editorPrefs.remoteCursorLabels || 'always'} ${editorPrefs.customPointer ? 'custom-pointer-active' : ''}`}
          ref={editorRef}
          style={{
            fontSize: `${editorPrefs.fontSize || 13}px`,
            '--editor-font': getFontFamilyString(editorPrefs.fontFamily),
            lineHeight: getLineHeightValue(editorPrefs.lineHeight),
            ...getCursorCssVars(editorPrefs, currentUserColor, viewRef.current?.defaultCharacterWidth)
          }}
        >
          {scrollerNode &&
            createPortal(
              <>
                <RemotePointersLayer
                  awareness={awareness}
                  activeFile={activeFile}
                  scrollerNode={scrollerNode}
                  theme={theme}
                  frozenUserIds={frozenUserIds}
                  onPointersChange={onPointersChange}
                />
                {editorPrefs.customPointer && (
                  <div
                    ref={localPointerRef}
                    className="local-custom-pointer"
                    aria-hidden="true"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      className="remote-pointer-arrow"
                      style={{
                        filter: editorPrefs.cursorGlow
                          ? `drop-shadow(0 0 6px ${getCaretColorValue(editorPrefs, currentUserColor)}) drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.35))`
                          : 'drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.35))'
                      }}
                    >
                      <path
                        d="M1.5 1.5 L7.5 16.5 L10.5 10.5 L16.5 7.5 Z"
                        fill={getCaretColorValue(editorPrefs, currentUserColor)}
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                )}
              </>,
              scrollerNode
            )}
        </div>
      )}
    </main>
  )
}
