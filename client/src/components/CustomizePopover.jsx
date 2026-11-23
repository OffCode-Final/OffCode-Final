import { useState, useEffect, useRef } from 'react'
import { Sliders, RotateCcw, X, Plus, Minus, Check } from 'lucide-react'

export const DEFAULT_PREFS = {
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  lineHeight: 'normal',
  ligatures: false,
  wordWrap: false,
  lineNumbers: true,
  tabSize: 4,
  syntaxTheme: 'OffCode'
}

export function loadEditorPrefs() {
  try {
    const raw = localStorage.getItem('offcode-editor-prefs')
    if (raw) {
      return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
    }
  } catch (_) {}
  return { ...DEFAULT_PREFS }
}

export function saveEditorPrefs(prefs) {
  try {
    localStorage.setItem('offcode-editor-prefs', JSON.stringify(prefs))
  } catch (_) {}
}

const FONT_FAMILIES = [
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Fira Code', value: 'Fira Code' },
  { label: 'Source Code Pro', value: 'Source Code Pro' },
  { label: 'IBM Plex Mono', value: 'IBM Plex Mono' },
  { label: 'System monospace', value: 'System monospace' }
]

const SYNTAX_THEMES = [
  'OffCode',
  'GitHub',
  'One',
  'Solarized',
  'Monokai',
  'High contrast'
]

export default function CustomizePopover({
  prefs,
  onChangePrefs,
  isOpen,
  onClose,
  triggerRef
}) {
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        (!triggerRef?.current || !triggerRef.current.contains(e.target))
      ) {
        onClose()
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
        triggerRef?.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, triggerRef])

  if (!isOpen) return null

  const update = (patch) => {
    const updated = { ...prefs, ...patch }
    onChangePrefs(updated)
    saveEditorPrefs(updated)
  }

  const handleReset = () => {
    onChangePrefs({ ...DEFAULT_PREFS })
    saveEditorPrefs({ ...DEFAULT_PREFS })
  }

  return (
    <div
      ref={popoverRef}
      className="customize-popover"
      role="dialog"
      aria-label="Customize Editor Settings"
      tabIndex={-1}
    >
      <div className="customize-header">
        <div className="customize-title-row">
          <Sliders size={14} className="customize-title-icon" />
          <span className="customize-title">Customize Editor</span>
        </div>
        <button
          type="button"
          className="btn-icon-subtle btn-close-popover"
          onClick={onClose}
          aria-label="Close customize settings"
        >
          <X size={14} />
        </button>
      </div>

      <div className="customize-body">
        {/* Font Family */}
        <div className="customize-row">
          <label className="customize-label" htmlFor="pref-font-family">Font family</label>
          <select
            id="pref-font-family"
            className="customize-select"
            value={prefs.fontFamily}
            onChange={(e) => update({ fontFamily: e.target.value })}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Font Size with Zoom buttons */}
        <div className="customize-row">
          <span className="customize-label">Font size</span>
          <div className="customize-stepper">
            <button
              type="button"
              className="btn-stepper"
              onClick={() => update({ fontSize: Math.max(11, prefs.fontSize - 1) })}
              disabled={prefs.fontSize <= 11}
              aria-label="Decrease font size"
              title="Ctrl+Minus"
            >
              <Minus size={12} />
            </button>
            <span className="stepper-value">{prefs.fontSize}px</span>
            <button
              type="button"
              className="btn-stepper"
              onClick={() => update({ fontSize: Math.min(24, prefs.fontSize + 1) })}
              disabled={prefs.fontSize >= 24}
              aria-label="Increase font size"
              title="Ctrl+Plus"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>

        {/* Line Height */}
        <div className="customize-row">
          <span className="customize-label">Line height</span>
          <div className="customize-segmented">
            {['compact', 'normal', 'relaxed'].map((lh) => (
              <button
                key={lh}
                type="button"
                className={`customize-seg-btn ${prefs.lineHeight === lh ? 'active' : ''}`}
                onClick={() => update({ lineHeight: lh })}
              >
                {lh.charAt(0).toUpperCase() + lh.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Syntax Theme Preset */}
        <div className="customize-row">
          <label className="customize-label" htmlFor="pref-syntax-theme">Syntax theme</label>
          <select
            id="pref-syntax-theme"
            className="customize-select"
            value={prefs.syntaxTheme}
            onChange={(e) => update({ syntaxTheme: e.target.value })}
          >
            {SYNTAX_THEMES.map((themeName) => (
              <option key={themeName} value={themeName}>
                {themeName}
              </option>
            ))}
          </select>
        </div>

        {/* Tab Size */}
        <div className="customize-row">
          <span className="customize-label">Tab size</span>
          <div className="customize-segmented">
            {[2, 4, 8].map((size) => (
              <button
                key={size}
                type="button"
                className={`customize-seg-btn ${prefs.tabSize === size ? 'active' : ''}`}
                onClick={() => update({ tabSize: size })}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle Switches: Ligatures, Word wrap, Line numbers */}
        <div className="customize-toggle-group">
          <label className="customize-toggle-row">
            <span className="toggle-label">Font ligatures</span>
            <input
              type="checkbox"
              className="customize-checkbox"
              checked={prefs.ligatures}
              onChange={(e) => update({ ligatures: e.target.checked })}
            />
          </label>

          <label className="customize-toggle-row">
            <span className="toggle-label">Word wrap</span>
            <input
              type="checkbox"
              className="customize-checkbox"
              checked={prefs.wordWrap}
              onChange={(e) => update({ wordWrap: e.target.checked })}
            />
          </label>

          <label className="customize-toggle-row">
            <span className="toggle-label">Line numbers</span>
            <input
              type="checkbox"
              className="customize-checkbox"
              checked={prefs.lineNumbers}
              onChange={(e) => update({ lineNumbers: e.target.checked })}
            />
          </label>
        </div>
      </div>

      <div className="customize-footer">
        <button
          type="button"
          className="btn-flat btn-secondary btn-reset-defaults"
          onClick={handleReset}
        >
          <RotateCcw size={12} />
          <span>Reset to defaults</span>
        </button>
      </div>
    </div>
  )
}
