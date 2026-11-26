import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Sliders,
  RotateCcw,
  X,
  Plus,
  Minus,
  Check,
  Search,
  Type,
  Layout,
  MousePointer,
  Palette,
  Settings
} from 'lucide-react'

export const DEFAULT_PREFS = {
  // Font
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  lineHeight: 'normal', // 'compact' | 'normal' | 'relaxed'
  ligatures: true,

  // Display
  lineNumbers: true,
  relativeLineNumbers: false,
  wordWrap: false,
  foldGutter: true,
  indentGuides: true,
  showWhitespace: false,
  ruler: 'off', // 'off' | '80' | '100'

  // Cursor
  cursorStyle: 'line', // 'line' | 'thick' | 'block' | 'underline'
  cursorBlink: 'smooth', // 'smooth' | 'blink' | 'solid'
  smoothCaret: true,
  caretColor: 'user', // 'user' | '#hex'
  cursorGlow: false,
  customPointer: false,
  pointerShape: 'arrow', // 'arrow' | 'crosshair' | 'dot' | 'ring'
  pointerSize: 'md', // 'sm' | 'md' | 'lg'
  remoteCursorLabels: 'always', // 'always' | 'idle' | 'hide'

  // Theme
  syntaxTheme: 'OffCode',

  // Behavior
  tabSize: 4,
  suggestions: true,
  autoCloseBrackets: true,
  inlinePreview: true,
  aiInlineSuggestions: false,
  autoSaveToDisk: false,
  bracketMatching: true,
  highlightActiveLine: true,
  focusMode: false,
  typingSparks: false
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

export const FONT_GROUPS = [
  {
    category: 'Popular',
    fonts: [
      'JetBrains Mono',
      'Fira Code',
      'Source Code Pro',
      'IBM Plex Mono',
      'Roboto Mono',
      'Geist Mono',
      'Cascadia Code',
      'Ubuntu Mono',
      'Inconsolata',
      'Space Mono',
      'DM Mono'
    ]
  },
  {
    category: 'Modern',
    fonts: [
      'Red Hat Mono',
      'Azeret Mono',
      'Martian Mono',
      'Sometype Mono',
      'Chivo Mono',
      'Fragment Mono',
      'Spline Sans Mono',
      'Noto Sans Mono',
      'Reddit Mono',
      'Atkinson Hyperlegible Mono',
      'Victor Mono'
    ]
  },
  {
    category: 'Classic',
    fonts: [
      'Courier Prime',
      'PT Mono',
      'Anonymous Pro',
      'Share Tech Mono',
      'Overpass Mono',
      'Cousine',
      'Fira Mono',
      'Oxygen Mono',
      'Lekton'
    ]
  },
  {
    category: 'Fun and retro',
    fonts: [
      'VT323',
      'Silkscreen',
      'Monofett',
      'Major Mono Display',
      'Syne Mono',
      'Cutive Mono',
      'Nova Mono',
      'Share Tech'
    ]
  },
  {
    category: 'System monospace',
    fonts: [
      'Consolas',
      'Menlo',
      'Monaco',
      'SF Mono',
      'DejaVu Sans Mono',
      'Lucida Console'
    ]
  }
]

export const SYNTAX_THEMES = [
  { id: 'OffCode', name: 'OffCode', colors: ['#c678dd', '#61afef', '#98c379'] },
  { id: 'Dracula', name: 'Dracula', colors: ['#ff79c6', '#8be9fd', '#50fa7b'] },
  { id: 'One Dark', name: 'One Dark', colors: ['#c678dd', '#61afef', '#e5c07b'] },
  { id: 'Nord', name: 'Nord', colors: ['#81a1c1', '#88c0d0', '#a3be8c'] },
  { id: 'Tokyo Night', name: 'Tokyo Night', colors: ['#bb9af7', '#7aa2f7', '#9ece6a'] },
  { id: 'Solarized Light', name: 'Solarized Light', colors: ['#859900', '#268bd2', '#b58900'] },
  { id: 'Solarized Dark', name: 'Solarized Dark', colors: ['#2aa198', '#268bd2', '#cb4b16'] },
  { id: 'GitHub Light', name: 'GitHub Light', colors: ['#cf222e', '#0550ae', '#116329'] },
  { id: 'GitHub Dark', name: 'GitHub Dark', colors: ['#ff7b72', '#79c0ff', '#7ee787'] },
  { id: 'Gruvbox Dark', name: 'Gruvbox Dark', colors: ['#fb4934', '#83a598', '#b8bb26'] },
  { id: 'Monokai', name: 'Monokai', colors: ['#f92672', '#66d9ef', '#a6e22e'] }
]

const BUNDLED_FONTS = new Set([
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'IBM Plex Mono'
])

const SYSTEM_MONO_FONTS = new Set([
  'Consolas',
  'Menlo',
  'Monaco',
  'SF Mono',
  'DejaVu Sans Mono',
  'Lucida Console'
])

const loadedGoogleFonts = new Set()

export function ensureAllGoogleFontsLoaded() {
  if (typeof document === 'undefined') return
  const allGoogleFonts = FONT_GROUPS.flatMap((g) => g.fonts).filter(
    (f) => !BUNDLED_FONTS.has(f) && !SYSTEM_MONO_FONTS.has(f) && !loadedGoogleFonts.has(f)
  )
  if (allGoogleFonts.length === 0) return
  allGoogleFonts.forEach((f) => loadedGoogleFonts.add(f))
  const chunkSize = 15
  for (let i = 0; i < allGoogleFonts.length; i += chunkSize) {
    const chunk = allGoogleFonts.slice(i, i + chunkSize)
    const id = `gf-batch-${i}`
    if (!document.getElementById(id)) {
      const families = chunk
        .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`)
        .join('&')
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
      document.head.appendChild(link)
    }
  }
}

export function ensureGoogleFontLoaded(fontName) {
  if (!fontName || BUNDLED_FONTS.has(fontName) || SYSTEM_MONO_FONTS.has(fontName)) {
    return Promise.resolve()
  }
  if (typeof document === 'undefined') return Promise.resolve()
  if (!loadedGoogleFonts.has(fontName)) {
    loadedGoogleFonts.add(fontName)
    const id = `gf-${fontName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName).replace(/%20/g, '+')}:wght@400;500;700&display=swap`
      document.head.appendChild(link)
    }
  }
  if (document.fonts && document.fonts.load) {
    return document.fonts.load(`400 14px "${fontName}"`).catch(() => {})
  }
  return Promise.resolve()
}

function detectFontAvailable(fontName) {
  if (typeof document === 'undefined') return true
  if (BUNDLED_FONTS.has(fontName) || !SYSTEM_MONO_FONTS.has(fontName)) {
    return true
  }
  if (document.fonts) {
    for (const face of document.fonts) {
      const fam = face.family.replace(/^["']|["']$/g, '')
      if (fam === fontName) return true
    }
  }
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return true
    const sample = 'mmmmmmmmmmwwwwwwwwww1234567890'
    for (const fallback of ['monospace', 'sans-serif', 'serif']) {
      ctx.font = `16px ${fallback}`
      const baseWidth = ctx.measureText(sample).width
      ctx.font = `16px "${fontName}", ${fallback}`
      if (Math.abs(ctx.measureText(sample).width - baseWidth) > 0.1) {
        return true
      }
    }
    return false
  } catch (_) {
    return true
  }
}

export default function CustomizePopover({
  prefs = DEFAULT_PREFS,
  onChangePrefs,
  isOpen,
  onClose,
  triggerRef,
  currentUserColor = '#6366f1'
}) {
  const popoverRef = useRef(null)
  const [activeTab, setActiveTab] = useState('font') // 'font' | 'display' | 'cursor' | 'theme' | 'behavior'
  const [fontSearch, setFontSearch] = useState('')
  const [pos, setPos] = useState({ top: 50, right: 16 })

  useEffect(() => {
    if (!isOpen) return

    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const rightDist = Math.max(16, window.innerWidth - rect.right)
      setPos({
        top: Math.min(window.innerHeight - 560, Math.max(10, rect.bottom + 6)),
        right: rightDist
      })
    }

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

  useEffect(() => {
    if (isOpen && activeTab === 'font') {
      ensureAllGoogleFontsLoaded()
    }
  }, [isOpen, activeTab])

  const fontAvailability = useMemo(() => {
    const map = {}
    for (const g of FONT_GROUPS) {
      for (const f of g.fonts) {
        map[f] = detectFontAvailable(f)
      }
    }
    return map
  }, [isOpen])

  const filteredFontGroups = useMemo(() => {
    const q = fontSearch.trim().toLowerCase()
    return FONT_GROUPS.map((g) => ({
      ...g,
      fonts: g.fonts.filter((f) => fontAvailability[f] !== false && (!q || f.toLowerCase().includes(q)))
    })).filter((g) => g.fonts.length > 0)
  }, [fontSearch, fontAvailability])

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

  const zoomPercent = Math.round(((prefs.fontSize || 13) / 13) * 100)

  const content = (
    <div
      ref={popoverRef}
      className="customize-popover"
      style={{
        position: 'fixed',
        top: `${pos.top}px`,
        right: `${pos.right}px`,
        zIndex: 10000
      }}
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

      {/* Tabs Header */}
      <div className="customize-tabs" role="tablist" onMouseDown={(e) => e.preventDefault()}>
        <button
          type="button"
          className={`customize-tab-btn ${activeTab === 'font' ? 'active' : ''}`}
          onClick={() => setActiveTab('font')}
          role="tab"
          aria-selected={activeTab === 'font'}
        >
          <Type size={12} />
          <span>Font</span>
        </button>
        <button
          type="button"
          className={`customize-tab-btn ${activeTab === 'display' ? 'active' : ''}`}
          onClick={() => setActiveTab('display')}
          role="tab"
          aria-selected={activeTab === 'display'}
        >
          <Layout size={12} />
          <span>Display</span>
        </button>
        <button
          type="button"
          className={`customize-tab-btn ${activeTab === 'cursor' ? 'active' : ''}`}
          onClick={() => setActiveTab('cursor')}
          role="tab"
          aria-selected={activeTab === 'cursor'}
        >
          <MousePointer size={12} />
          <span>Cursor</span>
        </button>
        <button
          type="button"
          className={`customize-tab-btn ${activeTab === 'theme' ? 'active' : ''}`}
          onClick={() => setActiveTab('theme')}
          role="tab"
          aria-selected={activeTab === 'theme'}
        >
          <Palette size={12} />
          <span>Theme</span>
        </button>
        <button
          type="button"
          className={`customize-tab-btn ${activeTab === 'behavior' ? 'active' : ''}`}
          onClick={() => setActiveTab('behavior')}
          role="tab"
          aria-selected={activeTab === 'behavior'}
        >
          <Settings size={12} />
          <span>Behavior</span>
        </button>
      </div>

      <div className="customize-body">
        {/* TAB 1: FONT */}
        {activeTab === 'font' && (
          <div className="customize-tab-panel">
            {/* Searchable Font Picker */}
            <div className="customize-section">
              <label className="customize-label">Font family</label>
              <div className="font-search-wrap">
                <Search size={12} className="font-search-icon" />
                <input
                  type="text"
                  className="font-search-input"
                  placeholder="Search fonts..."
                  value={fontSearch}
                  onChange={(e) => setFontSearch(e.target.value)}
                />
              </div>

              <div className="font-picker-scroll">
                {filteredFontGroups.map((g) => (
                  <div key={g.category} className="font-group">
                    <div className="font-group-title">{g.category}</div>
                    <div className="font-group-list">
                      {g.fonts.map((f) => {
                        const isSelected = prefs.fontFamily === f
                        const isAvailable = fontAvailability[f] !== false
                        return (
                          <div
                            key={f}
                            className={`font-picker-item ${isSelected ? 'active' : ''} ${!isAvailable ? 'disabled' : ''}`}
                            aria-disabled={!isAvailable}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={async () => {
                              if (!isAvailable) return
                              await ensureGoogleFontLoaded(f)
                              update({ fontFamily: f })
                            }}
                          >
                            <div className="font-picker-name" style={{ fontFamily: `"${f}", ui-monospace, monospace` }}>
                              {f}
                              {!isAvailable && <span className="font-picker-not-installed">(not installed)</span>}
                            </div>
                            <div className="font-picker-preview" style={{ fontFamily: `"${f}", ui-monospace, monospace` }}>
                              const x = 42;
                            </div>
                            {isSelected && <Check size={12} className="font-picker-check" />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Font Size Slider & Stepper */}
            <div className="customize-row">
              <div className="customize-label-col">
                <span className="customize-label">Font size</span>
                <span className="customize-subhint">Zoom: Ctrl+Plus/Minus/0/Wheel</span>
              </div>
              <div className="customize-stepper">
                <button
                  type="button"
                  className="btn-stepper"
                  onClick={() => update({ fontSize: Math.max(10, (prefs.fontSize || 13) - 1) })}
                  disabled={(prefs.fontSize || 13) <= 10}
                  aria-label="Decrease font size"
                >
                  <Minus size={12} />
                </button>
                <input
                  type="range"
                  min="10"
                  max="32"
                  value={prefs.fontSize || 13}
                  onChange={(e) => update({ fontSize: parseInt(e.target.value, 10) })}
                  className="customize-range"
                />
                <button
                  type="button"
                  className="btn-stepper"
                  onClick={() => update({ fontSize: Math.min(32, (prefs.fontSize || 13) + 1) })}
                  disabled={(prefs.fontSize || 13) >= 32}
                  aria-label="Increase font size"
                >
                  <Plus size={12} />
                </button>
                <span className="stepper-value">{prefs.fontSize || 13}px ({zoomPercent}%)</span>
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

            {/* Ligatures */}
            <div className="customize-toggle-group">
              <label className="customize-toggle-row">
                <div className="toggle-text-wrap">
                  <span className="toggle-label">Font ligatures</span>
                  <span className="toggle-hint">Works with Fira Code, JetBrains Mono, Cascadia Code and similar</span>
                </div>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.ligatures)}
                  onChange={(e) => update({ ligatures: e.target.checked })}
                />
              </label>
            </div>
          </div>
        )}

        {/* TAB 2: DISPLAY */}
        {activeTab === 'display' && (
          <div className="customize-tab-panel">
            <div className="customize-toggle-group">
              <label className="customize-toggle-row">
                <span className="toggle-label">Line numbers</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.lineNumbers)}
                  onChange={(e) => update({ lineNumbers: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Relative line numbers</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.relativeLineNumbers)}
                  onChange={(e) => update({ relativeLineNumbers: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Word wrap</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.wordWrap)}
                  onChange={(e) => update({ wordWrap: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Fold gutter</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.foldGutter)}
                  onChange={(e) => update({ foldGutter: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Indent guides</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.indentGuides)}
                  onChange={(e) => update({ indentGuides: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Show whitespace</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.showWhitespace)}
                  onChange={(e) => update({ showWhitespace: e.target.checked })}
                />
              </label>
            </div>

            {/* Column Ruler */}
            <div className="customize-row" style={{ marginTop: '12px' }}>
              <span className="customize-label">Column ruler</span>
              <div className="customize-segmented">
                {[
                  { id: 'off', label: 'Off' },
                  { id: '80', label: 'Col 80' },
                  { id: '100', label: 'Col 100' }
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`customize-seg-btn ${prefs.ruler === r.id ? 'active' : ''}`}
                    onClick={() => update({ ruler: r.id })}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CURSOR */}
        {activeTab === 'cursor' && (
          <div className="customize-tab-panel" onMouseDown={(e) => {
            if (e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') {
              e.preventDefault()
            }
          }}>
            {/* Cursor Style */}
            <div className="customize-row">
              <span className="customize-label">Cursor style</span>
              <div className="customize-segmented">
                {[
                  { id: 'line', label: 'Line' },
                  { id: 'thick', label: 'Thick' },
                  { id: 'block', label: 'Block' },
                  { id: 'underline', label: 'Underline' }
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`customize-seg-btn ${prefs.cursorStyle === s.id ? 'active' : ''}`}
                    onClick={() => update({ cursorStyle: s.id })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cursor Blink */}
            <div className="customize-row">
              <span className="customize-label">Cursor blink</span>
              <div className="customize-segmented">
                {[
                  { id: 'smooth', label: 'Smooth' },
                  { id: 'blink', label: 'Blink' },
                  { id: 'solid', label: 'Solid' }
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`customize-seg-btn ${prefs.cursorBlink === b.id ? 'active' : ''}`}
                    onClick={() => update({ cursorBlink: b.id })}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Caret Color */}
            <div className="customize-row">
              <span className="customize-label">My caret color</span>
              <div className="caret-color-choice">
                <button
                  type="button"
                  className={`customize-seg-btn ${prefs.caretColor === 'user' ? 'active' : ''}`}
                  onClick={() => update({ caretColor: 'user' })}
                  title="Follow user color"
                >
                  User color
                </button>
                <input
                  type="color"
                  className="caret-color-picker"
                  value={
                    prefs.caretColor === 'user'
                      ? (currentUserColor && /^#[0-9a-fA-F]{6}$/.test(currentUserColor) ? currentUserColor : '#6366f1')
                      : (prefs.caretColor && /^#[0-9a-fA-F]{6}$/.test(prefs.caretColor) ? prefs.caretColor : '#6366f1')
                  }
                  onChange={(e) => update({ caretColor: e.target.value })}
                  title="Pick custom caret color"
                />
              </div>
            </div>

            {/* Remote Cursor Labels */}
            <div className="customize-row">
              <span className="customize-label">Remote labels</span>
              <div className="customize-segmented">
                {[
                  { id: 'always', label: 'Always' },
                  { id: 'idle', label: 'Fade idle' },
                  { id: 'hide', label: 'Hide' }
                ].map((rl) => (
                  <button
                    key={rl.id}
                    type="button"
                    className={`customize-seg-btn ${prefs.remoteCursorLabels === rl.id ? 'active' : ''}`}
                    onClick={() => update({ remoteCursorLabels: rl.id })}
                  >
                    {rl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="customize-toggle-group">
              <label className="customize-toggle-row">
                <span className="toggle-label">Smooth caret movement (~80ms)</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.smoothCaret)}
                  onChange={(e) => update({ smoothCaret: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Cursor glow</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.cursorGlow)}
                  onChange={(e) => update({ cursorGlow: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <div className="customize-label-col">
                  <span className="toggle-label">Custom editor pointer</span>
                  <span className="customize-subhint">Show your colored pointer instead of OS cursor</span>
                </div>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.customPointer)}
                  onChange={(e) => update({ customPointer: e.target.checked })}
                />
              </label>
            </div>

            {/* Pointer Shape (shared with collaborators) */}
            <div className="customize-row">
              <span className="customize-label">Pointer shape</span>
              <div className="customize-segmented">
                {[
                  { id: 'arrow', label: 'Arrow' },
                  { id: 'crosshair', label: 'Cross' },
                  { id: 'dot', label: 'Dot' },
                  { id: 'ring', label: 'Ring' }
                ].map((ps) => (
                  <button
                    key={ps.id}
                    type="button"
                    className={`customize-seg-btn ${(prefs.pointerShape || 'arrow') === ps.id ? 'active' : ''}`}
                    onClick={() => update({ pointerShape: ps.id })}
                  >
                    {ps.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pointer Size (shared with collaborators) */}
            <div className="customize-row">
              <span className="customize-label">Pointer size</span>
              <div className="customize-segmented">
                {[
                  { id: 'sm', label: 'Small' },
                  { id: 'md', label: 'Medium' },
                  { id: 'lg', label: 'Large' }
                ].map((sz) => (
                  <button
                    key={sz.id}
                    type="button"
                    className={`customize-seg-btn ${(prefs.pointerSize || 'md') === sz.id ? 'active' : ''}`}
                    onClick={() => update({ pointerSize: sz.id })}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: THEME */}
        {activeTab === 'theme' && (
          <div className="customize-tab-panel">
            <div className="theme-grid">
              {SYNTAX_THEMES.map((th) => {
                const isSelected = prefs.syntaxTheme === th.id
                return (
                  <div
                    key={th.id}
                    className={`theme-card ${isSelected ? 'active' : ''}`}
                    onClick={() => update({ syntaxTheme: th.id })}
                  >
                    <div className="theme-card-header">
                      <span className="theme-card-name">{th.name}</span>
                      {isSelected && <Check size={12} className="theme-card-check" />}
                    </div>
                    <div className="theme-card-dots">
                      {th.colors.map((c, i) => (
                        <span key={i} className="theme-dot" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 5: BEHAVIOR */}
        {activeTab === 'behavior' && (
          <div className="customize-tab-panel">
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

            <div className="customize-toggle-group">
              <label className="customize-toggle-row">
                <span className="toggle-label">Suggestions</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={prefs.suggestions !== false}
                  onChange={(e) => update({ suggestions: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Auto-close brackets</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.autoCloseBrackets)}
                  onChange={(e) => update({ autoCloseBrackets: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <div className="toggle-text-wrap">
                  <span className="toggle-label">Inline preview</span>
                  <span className="toggle-hint">Show ghost text for the selected suggestion</span>
                </div>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={prefs.inlinePreview !== false}
                  onChange={(e) => update({ inlinePreview: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Bracket matching</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.bracketMatching)}
                  onChange={(e) => update({ bracketMatching: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <span className="toggle-label">Highlight active line</span>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.highlightActiveLine)}
                  onChange={(e) => update({ highlightActiveLine: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <div className="toggle-text-wrap">
                  <span className="toggle-label">Focus mode</span>
                  <span className="toggle-hint">Hides sidebars and status bar for distraction-free coding</span>
                </div>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.focusMode)}
                  onChange={(e) => update({ focusMode: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <div className="toggle-text-wrap">
                  <span className="toggle-label">Typing sparks</span>
                  <span className="toggle-hint">Tiny fading sparks near caret (capped at 8 particles)</span>
                </div>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.typingSparks)}
                  onChange={(e) => update({ typingSparks: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <div className="toggle-text-wrap">
                  <span className="toggle-label">AI inline suggestions (uses your Gemini key)</span>
                  <span className="toggle-hint">Sends nearby code to Google while you type.</span>
                </div>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.aiInlineSuggestions)}
                  onChange={(e) => update({ aiInlineSuggestions: e.target.checked })}
                />
              </label>

              <label className="customize-toggle-row">
                <div className="toggle-text-wrap">
                  <span className="toggle-label">Save to disk automatically</span>
                  <span className="toggle-hint">Writes linked files 1.5s after edits stop</span>
                </div>
                <input
                  type="checkbox"
                  className="customize-checkbox"
                  checked={Boolean(prefs.autoSaveToDisk)}
                  onChange={(e) => update({ autoSaveToDisk: e.target.checked })}
                />
              </label>
            </div>
          </div>
        )}
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

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }
  return content
}
