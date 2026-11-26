import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { EditorState, Compartment, StateField, StateEffect, RangeSet, Prec } from '@codemirror/state'
import {
  EditorView,
  Decoration,
  WidgetType,
  ViewPlugin,
  GutterMarker,
  gutter,
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
import {
  autocompletion,
  acceptCompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionStatus,
  selectedCompletion
} from '@codemirror/autocomplete'
import { yCollab, yUndoManagerKeymap, ySyncAnnotation, ySyncFacet } from 'y-codemirror.next'
import { X, Send, FileCode, Plus, Sliders, Link2 } from 'lucide-react'

import { python } from '@codemirror/lang-python'
import { javascript, autoCloseTags as jsAutoCloseTags } from '@codemirror/lang-javascript'
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
import { getFileExtension, getLanguageName, normalizeLineEndings } from '../utils/helpers'
import { collectRoomIdentifiers, createLanguageCompletionSources } from '../utils/completions'
import { createUserChangesExtension, userChangesCompartment } from '../utils/userChanges'
import { fetchInlineCompletionWithGemini } from '../ai/gemini'
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

function renderPointerSvg({ shape = 'arrow', size = 'md', color = '#6366f1', glow = false }) {
  const px = size === 'sm' ? 14 : size === 'lg' ? 24 : 18
  const filter = glow
    ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.35))`
    : 'drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.35))'

  if (shape === 'crosshair') {
    return (
      <svg width={px} height={px} viewBox="0 0 18 18" fill="none" className="remote-pointer-arrow" style={{ filter }}>
        <path d="M9 1.5 V16.5 M1.5 9 H16.5" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        <path d="M9 1.5 V16.5 M1.5 9 H16.5" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="9" cy="9" r="2" fill={color} stroke="#FFFFFF" strokeWidth="1" />
      </svg>
    )
  }
  if (shape === 'dot') {
    return (
      <svg width={px} height={px} viewBox="0 0 18 18" fill="none" className="remote-pointer-arrow" style={{ filter }}>
        <circle cx="9" cy="9" r="5.5" fill={color} stroke="#FFFFFF" strokeWidth="2" />
      </svg>
    )
  }
  if (shape === 'ring') {
    return (
      <svg width={px} height={px} viewBox="0 0 18 18" fill="none" className="remote-pointer-arrow" style={{ filter }}>
        <circle cx="9" cy="9" r="6.5" stroke="#FFFFFF" strokeWidth="3" />
        <circle cx="9" cy="9" r="6.5" stroke={color} strokeWidth="1.75" />
        <circle cx="9" cy="9" r="2" fill={color} />
      </svg>
    )
  }
  return (
    <svg width={px} height={px} viewBox="0 0 18 18" fill="none" className="remote-pointer-arrow" style={{ filter }}>
      <path
        d="M1.5 1.5 L7.5 16.5 L10.5 10.5 L16.5 7.5 Z"
        fill={color}
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
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

        const rawColor = state?.pointerStyle?.color || state?.user?.color || '#3b82f6'
        const calibratedColor = state?.pointerStyle?.color ? rawColor : getCalibratedColor(rawColor, theme)
        const autoContrastText = getAutoContrastTextColor(calibratedColor)

        targetsRef.current.set(clientId, { x: clampedX, y: clampedY })
        if (!positionsRef.current.has(clientId)) {
          positionsRef.current.set(clientId, { x: clampedX, y: clampedY })
        }
        pointersDataRef.current.set(clientId, {
          name: state?.user?.name || 'Anonymous',
          color: calibratedColor,
          textColor: autoContrastText,
          shape: state?.pointerStyle?.shape || 'arrow',
          size: state?.pointerStyle?.size || 'md',
          glow: Boolean(state?.pointerStyle?.glow),
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
            {renderPointerSvg({
              shape: data.shape,
              size: data.size,
              color: data.color,
              glow: data.glow
            })}
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
const autoCloseTagsCompartment = new Compartment()
const suggestionsCompartment = new Compartment()
const inlinePreviewCompartment = new Compartment()
const activeLineCompartment = new Compartment()
const whitespaceCompartment = new Compartment()
const aiTooltipCompartment = new Compartment()

const setErrorHighlightEffect = StateEffect.define()
const setAiGhostEffect = StateEffect.define()

class AiInlineGhostWidget extends WidgetType {
  constructor(text) {
    super()
    this.text = text
  }
  eq(other) {
    return other.text === this.text
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-inline-ghost cm-ai-inline-ghost'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = this.text
    return span
  }
  ignoreEvent() {
    return true
  }
}

const aiGhostField = StateField.define({
  create() {
    return null
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setAiGhostEffect)) {
        const next = effect.value
        if (!next || !next.text || next.pos < 0 || next.pos > tr.state.doc.length) {
          return null
        }
        return { pos: next.pos, text: next.text }
      }
    }

    if (!value) return null

    if (tr.docChanged) {
      if (tr.annotation(ySyncAnnotation)) {
        return null
      }
      let canShrink = false
      let insertedText = ''
      let changeCount = 0
      tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        changeCount++
        if (changeCount === 1 && fromA === value.pos && toA === value.pos) {
          insertedText = inserted.sliceString(0, inserted.length, '\n')
          canShrink = true
        } else {
          canShrink = false
        }
      })
      if (canShrink && insertedText && value.text.startsWith(insertedText)) {
        const remaining = value.text.slice(insertedText.length)
        return remaining ? { pos: value.pos + insertedText.length, text: remaining } : null
      }
      return null
    }

    if (tr.selection) {
      const sel = tr.selection.main
      if (!sel.empty || sel.head !== value.pos) {
        return null
      }
    }

    return value
  },
  provide: (f) =>
    EditorView.decorations.from(f, (v) => {
      if (!v || !v.text) return Decoration.none
      return Decoration.set([
        Decoration.widget({
          widget: new AiInlineGhostWidget(v.text),
          side: 1
        }).range(v.pos)
      ])
    })
})

function acceptAiInlineGhost(view) {
  if (completionStatus(view.state) === 'active') return false
  if (view.state.readOnly) return false
  const ghost = view.state.field(aiGhostField, false)
  if (!ghost || !ghost.text) return false
  view.dispatch({
    changes: { from: ghost.pos, to: ghost.pos, insert: ghost.text },
    selection: { anchor: ghost.pos + ghost.text.length },
    effects: setAiGhostEffect.of(null)
  })
  return true
}

function dismissAiInlineGhost(view) {
  const ghost = view.state.field(aiGhostField, false)
  if (!ghost) return false
  view.dispatch({ effects: setAiGhostEffect.of(null) })
  return completionStatus(view.state) !== 'active'
}

class ErrorLineGutterMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-error-gutter-dot'
    el.setAttribute('aria-hidden', 'true')
    return el
  }
}
const errorGutterMarker = new ErrorLineGutterMarker()

const errorHighlightField = StateField.define({
  create() {
    return { line: null, decos: Decoration.none, gutterMarkers: RangeSet.empty }
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setErrorHighlightEffect)) {
        const target = effect.value
        if (!target || !target.line || target.line < 1 || target.line > tr.state.doc.lines) {
          return { line: null, decos: Decoration.none, gutterMarkers: RangeSet.empty }
        }
        const lineInfo = tr.state.doc.line(target.line)
        return {
          line: target.line,
          decos: Decoration.set([Decoration.line({ class: 'cm-error-highlight-line' }).range(lineInfo.from)]),
          gutterMarkers: RangeSet.of([errorGutterMarker.range(lineInfo.from)])
        }
      }
    }

    if (value.line !== null && tr.docChanged) {
      const prevLines = tr.startState.doc.lines
      if (value.line > prevLines) {
        return { line: null, decos: Decoration.none, gutterMarkers: RangeSet.empty }
      }
      const prevLineInfo = tr.startState.doc.line(value.line)
      let editedHighlightedLine = false
      tr.changes.iterChangedRanges((fromA, toA) => {
        if (fromA <= prevLineInfo.to && toA >= prevLineInfo.from) {
          editedHighlightedLine = true
        }
      })
      if (editedHighlightedLine) {
        return { line: null, decos: Decoration.none, gutterMarkers: RangeSet.empty }
      }
      const mappedPos = tr.changes.mapPos(prevLineInfo.from, 1)
      const newLineInfo = tr.newDoc.lineAt(mappedPos)
      return {
        line: newLineInfo.number,
        decos: Decoration.set([Decoration.line({ class: 'cm-error-highlight-line' }).range(newLineInfo.from)]),
        gutterMarkers: RangeSet.of([errorGutterMarker.range(newLineInfo.from)])
      }
    }

    return value
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.decos),
    gutter({
      class: 'cm-error-gutter',
      markers: (view) => view.state.field(f).gutterMarkers
    })
  ]
})

class InlineGhostWidget extends WidgetType {
  constructor(text) {
    super()
    this.text = text
  }
  eq(other) {
    return other.text === this.text
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-inline-ghost'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = this.text
    return span
  }
  ignoreEvent() {
    return true
  }
}

function computeInlineGhostDecorations(view) {
  const { state } = view
  if (view.composing) return Decoration.none
  if (!state.selection.main.empty) return Decoration.none
  if (completionStatus(state) !== 'active') return Decoration.none

  const sel = selectedCompletion(state)
  if (!sel || !sel.label) return Decoration.none

  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  const before = line.text.slice(0, head - line.from)

  const m = before.match(/([<#]\??[A-Za-z_$][\w$!.:-]*|[A-Za-z_$][\w$!.:-]*)$/)
  if (!m) return Decoration.none

  let typed = m[1]
  if (typed.startsWith('<') && !typed.startsWith('<?') && !sel.label.startsWith('<')) {
    typed = typed.slice(1)
  }
  if (!typed) return Decoration.none

  const label = sel.label
  if (!label.toLowerCase().startsWith(typed.toLowerCase())) return Decoration.none
  const remainder = label.slice(typed.length)
  if (!remainder) return Decoration.none

  return Decoration.set([
    Decoration.widget({
      widget: new InlineGhostWidget(remainder),
      side: 1
    }).range(head)
  ])
}

function createInlinePreviewExtension() {
  return ViewPlugin.fromClass(
    class {
      constructor() {
        this.decorations = Decoration.none
      }
      update(update) {
        try {
          if (Array.isArray(update?.transactions) && update.transactions.some((tr) => tr.annotation(ySyncAnnotation))) {
            this.decorations = Decoration.none
            return
          }
          this.decorations = computeInlineGhostDecorations(update.view)
        } catch (_) {
          this.decorations = Decoration.none
        }
      }
    },
    {
      decorations: (v) => v.decorations
    }
  )
}

function createAiTooltipExtension({
  onImproveWithAi,
  onAskAiRef,
  activeFileRef,
  lastQuotedRangeRef,
  isStopped = false,
  readOnly = false,
  isOffline = false
}) {
  return showTooltip.compute(['selection'], (state) => {
    const { from, to } = state.selection.main
    if (to - from < 3) return null

    let improveDisabledReason = null
    if (isStopped) improveDisabledReason = 'Editing stopped by host'
    else if (readOnly) improveDisabledReason = 'File is read-only'
    else if (isOffline) improveDisabledReason = 'AI needs internet'

    const askDisabledReason = isOffline ? 'AI needs internet' : null

    return {
      pos: Math.max(from, to),
      above: true,
      create(view) {
        const dom = document.createElement('div')
        dom.className = 'cm-ai-tooltip-content'

        const improveBtn = document.createElement('button')
        improveBtn.type = 'button'
        improveBtn.className = 'cm-ai-sparkle-btn cm-ai-pill-btn'
        improveBtn.title = improveDisabledReason || 'Improve with AI'
        improveBtn.setAttribute('aria-label', improveDisabledReason || 'Improve')
        if (improveDisabledReason) {
          improveBtn.disabled = true
        }
        improveBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
          <span>Improve</span>
        `
        improveBtn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        improveBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (improveDisabledReason) return
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

        const askBtn = document.createElement('button')
        askBtn.type = 'button'
        askBtn.className = 'cm-ai-ask-btn cm-ai-pill-btn'
        askBtn.title = askDisabledReason || 'Quote selection in AI assistant'
        askBtn.setAttribute('aria-label', askDisabledReason || 'Ask AI')
        if (askDisabledReason) {
          askBtn.disabled = true
        }
        askBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Ask AI</span>
        `
        askBtn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        askBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (askDisabledReason) return
          const sel = view.state.selection.main
          if (sel.to - sel.from < 3) return
          const selectedText = view.state.sliceDoc(sel.from, sel.to)
          const startLine = view.state.doc.lineAt(sel.from).number
          const endLine = view.state.doc.lineAt(sel.to).number
          const curFile = activeFileRef?.current || 'file'
          if (lastQuotedRangeRef) {
            lastQuotedRangeRef.current = {
              file: curFile,
              from: sel.from,
              to: sel.to,
              text: selectedText
            }
          }
          if (onAskAiRef?.current) {
            onAskAiRef.current({
              fileName: curFile,
              startLine,
              endLine,
              text: selectedText,
              from: sel.from,
              to: sel.to
            })
          }
        })

        dom.appendChild(improveBtn)
        dom.appendChild(askBtn)
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

function normalizeYTextLineEndings(ytext) {
  if (!ytext || !ytext.doc) return false
  const raw = ytext.toString()
  if (!raw.includes('\r')) return false
  ytext.doc.transact(() => {
    for (let i = raw.length - 1; i >= 0; i--) {
      if (raw.charCodeAt(i) === 13) {
        if (raw.charCodeAt(i + 1) === 10) {
          ytext.delete(i, 1)
        } else {
          ytext.delete(i, 1)
          ytext.insert(i, '\n')
        }
      }
    }
  }, 'crlf-normalize')
  return true
}

function getSyntaxTheme(theme, syntaxPreset = 'OffCode') {
  return syntaxHighlighting(createHighlightStyle(syntaxPreset, theme !== 'light'))
}

export default function Editor({
  activeFile,
  openFiles = [],
  linkedFiles = {},
  onSelectTab,
  onCloseTab,
  ytext,
  workspace = null,
  awareness,
  remoteUsersViewingThisFile,
  targetScrollLine,
  errorHighlight = null,
  clearErrorHighlightSeq = 0,
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
  onAskAiWithQuote = null,
  editorActionsRef = null,
  aiKey = '',
  onRecordAiInlineUsage = null,
  onAiInlineStatusChange = null,
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
  const errorHighlightTimerRef = useRef(null)
  const roomWordsCacheRef = useRef({ key: '', time: 0, words: [] })
  const onAskAiRef = useRef(onAskAiWithQuote)
  const activeFileRef = useRef(activeFile)
  const lastQuotedRangeRef = useRef(null)
  const aiInlineEnabledRef = useRef(false)
  const aiKeyRef = useRef(aiKey)
  const isOfflineRef = useRef(isOffline)
  const onAiInlineUsageRef = useRef(onRecordAiInlineUsage)
  const onAiInlineStatusRef = useRef(onAiInlineStatusChange)
  const aiInlineTimerRef = useRef(null)
  const aiInlineAbortRef = useRef(null)
  const aiRateWindowRef = useRef([])
  const aiPausedUntilRef = useRef(0)
  const aiPauseClearTimerRef = useRef(null)
  const aiInlineCacheRef = useRef(new Map())

  useEffect(() => {
    aiInlineEnabledRef.current = Boolean(editorPrefs.aiInlineSuggestions && !readOnly && !isStopped)
    aiKeyRef.current = aiKey
    isOfflineRef.current = Boolean(isOffline)
    onAiInlineUsageRef.current = onRecordAiInlineUsage
    onAiInlineStatusRef.current = onAiInlineStatusChange
    if (!aiInlineEnabledRef.current || isOffline) {
      if (aiInlineTimerRef.current) {
        clearTimeout(aiInlineTimerRef.current)
        aiInlineTimerRef.current = null
      }
      if (aiInlineAbortRef.current) {
        aiInlineAbortRef.current.abort()
        aiInlineAbortRef.current = null
      }
      if (viewRef.current && !viewRef.current.isDestroyed && viewRef.current.state.field(aiGhostField, false)) {
        viewRef.current.dispatch({ effects: setAiGhostEffect.of(null) })
      }
    }
  }, [editorPrefs.aiInlineSuggestions, readOnly, isStopped, aiKey, isOffline, onRecordAiInlineUsage, onAiInlineStatusChange])

  useEffect(() => {
    return () => {
      if (aiInlineTimerRef.current) clearTimeout(aiInlineTimerRef.current)
      if (aiInlineAbortRef.current) aiInlineAbortRef.current.abort()
      if (aiPauseClearTimerRef.current) clearTimeout(aiPauseClearTimerRef.current)
    }
  }, [])

  useEffect(() => {
    onAskAiRef.current = onAskAiWithQuote
  }, [onAskAiWithQuote])

  useEffect(() => {
    activeFileRef.current = activeFile
  }, [activeFile])

  useEffect(() => {
    if (!editorActionsRef) return
    editorActionsRef.current = {
      getCursorLine: () => {
        const view = viewRef.current
        if (!view || view.isDestroyed) return 1
        return view.state.doc.lineAt(view.state.selection.main.head).number
      },
      insertAtCursor: (text) => {
        const view = viewRef.current
        if (!view || view.isDestroyed || readOnly || isStopped) return false
        const clean = normalizeLineEndings(text)
        const head = view.state.selection.main.head
        view.dispatch({
          changes: { from: head, to: head, insert: clean },
          selection: { anchor: head + clean.length },
          scrollIntoView: true
        })
        view.focus()
        return true
      },
      replaceSelection: (text) => {
        const view = viewRef.current
        if (!view || view.isDestroyed || readOnly || isStopped) return false
        const clean = normalizeLineEndings(text)
        const sel = view.state.selection.main
        if (sel.to > sel.from) {
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: clean },
            selection: { anchor: sel.from + clean.length },
            scrollIntoView: true
          })
          lastQuotedRangeRef.current = null
          view.focus()
          return true
        }
        const q = lastQuotedRangeRef.current
        if (q && q.file === activeFile && q.to <= view.state.doc.length) {
          const slice = view.state.sliceDoc(q.from, q.to)
          if (slice === q.text) {
            view.dispatch({
              changes: { from: q.from, to: q.to, insert: clean },
              selection: { anchor: q.from + clean.length },
              scrollIntoView: true
            })
            lastQuotedRangeRef.current = null
            view.focus()
            return true
          }
        }
        return false
      }
    }
  }, [editorActionsRef, activeFile, readOnly, isStopped])

  const getRoomCompletions = useCallback(() => {
    if (!workspace) return []
    const now = Date.now()
    const key = `${activeFile || ''}:${openFiles.join(',')}`
    if (roomWordsCacheRef.current.key === key && now - roomWordsCacheRef.current.time < 2500) {
      return roomWordsCacheRef.current.words
    }
    const words = collectRoomIdentifiers(openFiles, activeFile, (name) => {
      try {
        const t = workspace.getText(name)
        return t ? t.toString() : ''
      } catch (_) {
        return ''
      }
    })
    roomWordsCacheRef.current = { key, time: now, words }
    return words
  }, [workspace, openFiles, activeFile])

  // Language extension selector supporting all requested languages
  const getLanguageSupport = (fileName, autoClose = true) => {
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
        return html({ autoCloseTags: Boolean(autoClose) })
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

  const getAutoCloseTagsExtension = (fileName, enabled) => {
    if (!enabled) return []
    const ext = getFileExtension(fileName)
    if (['js', 'jsx', 'mjs', 'ts', 'tsx'].includes(ext)) {
      return jsAutoCloseTags
    }
    return []
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

    const activeExt = getFileExtension(activeFile)
    const isEditable = !readOnly && !isStopped
    if (isEditable) {
      normalizeYTextLineEndings(ytext)
    }
    const completionSources = createLanguageCompletionSources(activeExt, getRoomCompletions)

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
      errorHighlightField,
      highlightActiveLineGutter(),
      foldGutterCompartment.of(editorPrefs.foldGutter ? foldGutter() : []),
      bracketMatchingCompartment.of(editorPrefs.bracketMatching ? bracketMatching() : []),
      activeLineCompartment.of(editorPrefs.highlightActiveLine ? highlightActiveLine() : []),
      indentOnInput(),
      tabSizeCompartment.of(EditorState.tabSize.of(editorPrefs.tabSize || 4)),
      indentUnitCompartment.of(indentUnit.of(' '.repeat(editorPrefs.tabSize || 4))),
      closeBracketsCompartment.of(editorPrefs.autoCloseBrackets ? closeBrackets() : []),
      autoCloseTagsCompartment.of(getAutoCloseTagsExtension(activeFile, editorPrefs.autoCloseBrackets)),
      whitespaceCompartment.of(editorPrefs.showWhitespace ? highlightWhitespace() : []),
      wordWrapCompartment.of(editorPrefs.wordWrap ? EditorView.lineWrapping : []),
      themeCompartment.of(getEditorTheme(theme, editorPrefs, currentUserColor)),
      syntaxCompartment.of(getSyntaxTheme(theme, editorPrefs.syntaxTheme)),
      drawSelectionCompartment.of(drawSelection({ cursorBlinkRate: 0 })),
      getLanguageSupport(activeFile, editorPrefs.autoCloseBrackets),
      EditorState.languageData.of(() =>
        completionSources.map((source) => ({ autocomplete: source }))
      ),
      placeholder('Start typing, or press Ctrl+Enter to run'),
      EditorState.readOnly.of(!isEditable),
      EditorView.editable.of(isEditable),
      EditorView.contentAttributes.of({ tabindex: '0' }),
      aiGhostField,
      Prec.highest(keymap.of([{ key: 'Escape', run: dismissAiInlineGhost }])),
      suggestionsCompartment.of(
        isEditable && editorPrefs.suggestions !== false
          ? autocompletion({ activateOnTyping: true })
          : []
      ),
      inlinePreviewCompartment.of(
        isEditable && editorPrefs.suggestions !== false && editorPrefs.inlinePreview !== false
          ? createInlinePreviewExtension()
          : []
      ),
      keymap.of(
        !isEditable
          ? defaultKeymap
          : [
              { key: 'Tab', run: acceptCompletion },
              { key: 'Tab', run: acceptAiInlineGhost },
              indentWithTab,
              ...closeBracketsKeymap,
              ...yUndoManagerKeymap,
              ...defaultKeymap
            ]
      ),
      yCollab(ytext, awareness, { undoManager: !isEditable ? false : fileUndoManager }),
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
          onAskAiRef,
          activeFileRef,
          lastQuotedRangeRef,
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
        keydown(e, view) {
          if (onUserInteraction) onUserInteraction()
          if (e.key === 'Escape' && view?.state?.field(aiGhostField, false)) {
            view.dispatch({ effects: setAiGhostEffect.of(null) })
          }
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

        // Batch 4: Opt-in AI inline ghost suggestions after 600ms idle typing
        const isOnlyAiGhostUpdate =
          !update.docChanged &&
          !update.selectionSet &&
          update.transactions.some((tr) => tr.effects.some((ef) => ef.is(setAiGhostEffect)))
        if (isOnlyAiGhostUpdate) return

        const isRemoteTx = update.transactions.some((tr) => tr.annotation(ySyncAnnotation))
        if (update.docChanged || update.selectionSet) {
          if (aiInlineTimerRef.current) {
            clearTimeout(aiInlineTimerRef.current)
            aiInlineTimerRef.current = null
          }
          if (aiInlineAbortRef.current) {
            aiInlineAbortRef.current.abort()
            aiInlineAbortRef.current = null
            if (onAiInlineStatusRef.current && Date.now() >= aiPausedUntilRef.current) {
              onAiInlineStatusRef.current(null)
            }
          }

          if (
            update.docChanged &&
            !isRemoteTx &&
            aiInlineEnabledRef.current &&
            !isOfflineRef.current &&
            !update.view.composing &&
            !update.state.field(aiGhostField, false)
          ) {
            const scheduleView = update.view
            aiInlineTimerRef.current = setTimeout(async () => {
              aiInlineTimerRef.current = null
              if (scheduleView.isDestroyed || !aiInlineEnabledRef.current || isOfflineRef.current) return
              if (typeof navigator !== 'undefined' && !navigator.onLine) return
              if (scheduleView.composing) return

              const state = scheduleView.state
              const sel = state.selection.main
              if (!sel.empty) return
              if (completionStatus(state) === 'active') return

              const lineInfo = state.doc.lineAt(sel.head)
              const atEndOfLine = sel.head === lineInfo.to
              const onBlankLine = lineInfo.text.trim() === ''
              if (!atEndOfLine && !onBlankLine) return
              if (state.field(aiGhostField, false)) return

              let resolvedKey = (aiKeyRef.current || '').trim()
              if (!resolvedKey) {
                try {
                  resolvedKey = (window.localStorage.getItem('offcode-gemini-key') || '').trim()
                } catch (_) {}
              }
              if (!resolvedKey) return

              const now = Date.now()
              if (now < aiPausedUntilRef.current) {
                if (onAiInlineStatusRef.current) onAiInlineStatusRef.current('paused')
                return
              }

              const beforeText = state.sliceDoc(0, sel.head)
              const afterText = state.sliceDoc(sel.head, Math.min(state.doc.length, sel.head + 2000))
              if (!beforeText.trim()) return

              const fileName = activeFileRef.current || 'untitled'
              const cacheKey = `${fileName}\n${beforeText.slice(-1500)}`
              const cache = aiInlineCacheRef.current
              let cachedCompletion = cache.get(cacheKey)
              if (cachedCompletion === undefined) {
                for (const [k, v] of cache.entries()) {
                  if (!v) continue
                  const sep = k.indexOf('\n')
                  if (sep < 0) continue
                  const cFile = k.slice(0, sep)
                  const cBefore = k.slice(sep + 1)
                  const curTail = beforeText.slice(-1500)
                  if (cFile === fileName && curTail.startsWith(cBefore)) {
                    const typed = curTail.slice(cBefore.length)
                    if (typed && v.startsWith(typed) && v.slice(typed.length)) {
                      cachedCompletion = v.slice(typed.length)
                      break
                    }
                  }
                }
              }

              if (cachedCompletion !== undefined) {
                if (cachedCompletion) {
                  scheduleView.dispatch({
                    effects: setAiGhostEffect.of({ pos: sel.head, text: cachedCompletion })
                  })
                }
                return
              }

              // Enforce 20 requests/minute client cap
              aiRateWindowRef.current = aiRateWindowRef.current.filter((t) => t > now - 60000)
              if (aiRateWindowRef.current.length >= 20) return
              aiRateWindowRef.current.push(now)

              const controller = new AbortController()
              aiInlineAbortRef.current = controller
              const requestPos = sel.head
              if (onAiInlineStatusRef.current) onAiInlineStatusRef.current('suggesting')

              try {
                const res = await fetchInlineCompletionWithGemini({
                  apiKey: resolvedKey,
                  fileName,
                  language: getLanguageName(fileName),
                  beforeText,
                  afterText,
                  signal: controller.signal
                })

                if (res?.usage && onAiInlineUsageRef.current) {
                  onAiInlineUsageRef.current(res.usage)
                }

                if (aiInlineAbortRef.current === controller) {
                  aiInlineAbortRef.current = null
                }
                if (onAiInlineStatusRef.current && Date.now() >= aiPausedUntilRef.current) {
                  onAiInlineStatusRef.current(null)
                }

                if (controller.signal.aborted || scheduleView.isDestroyed) return
                const curSel = scheduleView.state.selection.main
                if (!curSel.empty || curSel.head !== requestPos) return
                if (completionStatus(scheduleView.state) === 'active') return
                if (!aiInlineEnabledRef.current || isOfflineRef.current) return

                const completion = res?.completion || ''
                if (cache.size >= 60) {
                  const firstKey = cache.keys().next().value
                  cache.delete(firstKey)
                }
                cache.set(cacheKey, completion)

                if (completion) {
                  scheduleView.dispatch({
                    effects: setAiGhostEffect.of({ pos: requestPos, text: completion })
                  })
                }
              } catch (err) {
                if (aiInlineAbortRef.current === controller) {
                  aiInlineAbortRef.current = null
                }
                if (err?.isRateLimit) {
                  aiPausedUntilRef.current = Date.now() + 30000
                  if (onAiInlineStatusRef.current) onAiInlineStatusRef.current('paused')
                  if (aiPauseClearTimerRef.current) clearTimeout(aiPauseClearTimerRef.current)
                  aiPauseClearTimerRef.current = setTimeout(() => {
                    aiPauseClearTimerRef.current = null
                    if (onAiInlineStatusRef.current && Date.now() >= aiPausedUntilRef.current) {
                      onAiInlineStatusRef.current(null)
                    }
                  }, 30100)
                } else if (onAiInlineStatusRef.current && Date.now() >= aiPausedUntilRef.current) {
                  onAiInlineStatusRef.current(null)
                }
              }
            }, 600)
          }
        }
      })
    ]

    const state = EditorState.create({
      doc: normalizeLineEndings(ytext.toString()),
      extensions
    })

    const view = new EditorView({
      state,
      parent: editorRef.current
    })

    viewRef.current = view
    view.focus()

    const handleCrlfGuard = (event) => {
      if (!isEditable || view.isDestroyed || !ytext.doc) return
      const hasCr = event?.delta?.some((d) => typeof d.insert === 'string' && d.insert.includes('\r'))
      if (!hasCr) return
      queueMicrotask(() => {
        if (view.isDestroyed || !ytext.doc) return
        if (!normalizeYTextLineEndings(ytext)) return
        const targetText = ytext.toString()
        const curDoc = view.state.doc.toString()
        if (curDoc !== targetText) {
          let conf = null
          try {
            conf = view.state.facet(ySyncFacet)
          } catch (_) {}
          const sel = view.state.selection.main
          view.dispatch({
            changes: { from: 0, to: curDoc.length, insert: targetText },
            selection: {
              anchor: Math.min(sel.anchor, targetText.length),
              head: Math.min(sel.head, targetText.length)
            },
            annotations: conf ? [ySyncAnnotation.of(conf)] : []
          })
        }
      })
    }
    ytext.observe(handleCrlfGuard)

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
      try {
        ytext.unobserve(handleCrlfGuard)
      } catch (_) {}
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
          autoCloseTagsCompartment.reconfigure(getAutoCloseTagsExtension(activeFile, editorPrefs.autoCloseBrackets)),
          suggestionsCompartment.reconfigure(
            !readOnly && !isStopped && editorPrefs.suggestions !== false
              ? autocompletion({ activateOnTyping: true })
              : []
          ),
          inlinePreviewCompartment.reconfigure(
            !readOnly && !isStopped && editorPrefs.suggestions !== false && editorPrefs.inlinePreview !== false
              ? createInlinePreviewExtension()
              : []
          ),
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
  }, [theme, editorPrefs, currentUserColor, activeFile, readOnly, isStopped])

  // Broadcast local caret and pointer style/color over awareness
  useEffect(() => {
    if (!awareness) return
    const resolvedColor = getCaretColorValue(editorPrefs, currentUserColor)
    awareness.setLocalStateField('caret', {
      style: editorPrefs.cursorStyle || 'line',
      color: resolvedColor
    })
    awareness.setLocalStateField('pointerStyle', {
      shape: editorPrefs.pointerShape || 'arrow',
      size: editorPrefs.pointerSize || 'md',
      color: resolvedColor,
      glow: Boolean(editorPrefs.cursorGlow)
    })
  }, [
    awareness,
    editorPrefs.cursorStyle,
    editorPrefs.caretColor,
    editorPrefs.pointerShape,
    editorPrefs.pointerSize,
    editorPrefs.cursorGlow,
    currentUserColor
  ])

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

  // Jump to error line and apply temporary local highlight (clears on edit, next run, or timeout)
  useEffect(() => {
    if (!errorHighlight || !errorHighlight.line || errorHighlight.file !== activeFile) return
    const view = viewRef.current
    if (!view) return

    try {
      const lineCount = view.state.doc.lines
      const lineNum = Math.min(Math.max(1, errorHighlight.line), lineCount)
      const line = view.state.doc.line(lineNum)
      const colOffset = Math.max(0, (errorHighlight.col || 1) - 1)
      const anchor = Math.min(line.to, line.from + colOffset)
      view.dispatch({
        selection: { anchor },
        scrollIntoView: true,
        effects: setErrorHighlightEffect.of({ line: lineNum })
      })
      view.focus()

      if (errorHighlightTimerRef.current) clearTimeout(errorHighlightTimerRef.current)
      errorHighlightTimerRef.current = setTimeout(() => {
        if (viewRef.current && !viewRef.current.isDestroyed) {
          viewRef.current.dispatch({ effects: setErrorHighlightEffect.of(null) })
        }
      }, 4500)
    } catch (_) {}
  }, [errorHighlight, activeFile, ytext])

  // Clear error highlight on next run
  useEffect(() => {
    if (errorHighlightTimerRef.current) {
      clearTimeout(errorHighlightTimerRef.current)
      errorHighlightTimerRef.current = null
    }
    if (viewRef.current && !viewRef.current.isDestroyed) {
      try {
        viewRef.current.dispatch({ effects: setErrorHighlightEffect.of(null) })
      } catch (_) {}
    }
  }, [clearErrorHighlightSeq])

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
            const linkedInfo = linkedFiles[fileName] || null
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
                title={linkedInfo ? `${fileName} — Linked to ${linkedInfo.diskName}` : fileName}
              >
                {getTabLanguageDot(fileName)}
                <span className="editor-tab-name">{fileName}</span>
                {linkedInfo && (
                  <span
                    className="editor-tab-link-icon"
                    title={`Linked to ${linkedInfo.diskName}`}
                    aria-label={`Linked to ${linkedInfo.diskName}`}
                  >
                    <Link2 size={11} strokeWidth={1.75} />
                  </span>
                )}
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
                    {renderPointerSvg({
                      shape: editorPrefs.pointerShape || 'arrow',
                      size: editorPrefs.pointerSize || 'md',
                      color: getCaretColorValue(editorPrefs, currentUserColor),
                      glow: Boolean(editorPrefs.cursorGlow)
                    })}
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
