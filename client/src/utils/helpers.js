/**
 * Helper utilities for OffCode
 */
import JSZip from 'jszip'

// Curated 12-color palette of clearly different collaborator colors (Phase 4)
// Looks distinct and legible on both light (#F5F2EB) and dark (#0B0C0F) backgrounds
export const COLLABORATOR_PALETTE = [
  '#2563EB', // Blue
  '#EA580C', // Orange
  '#16A34A', // Green
  '#DB2777', // Pink
  '#9333EA', // Purple
  '#0D9488', // Teal
  '#DC2626', // Red
  '#D97706', // Yellow-Gold
  '#4F46E5', // Indigo
  '#65A30D', // Lime
  '#0891B2', // Cyan
  '#C026D3'  // Magenta
]

export const USER_COLORS = COLLABORATOR_PALETTE.map((hex) => ({ name: hex, hex }))

export function getHueShiftedColor(index) {
  const hue = Math.round((index * 137.508) % 360)
  return `hsl(${hue}, 75%, 48%)`
}

export function pickUniqueColor(takenColors = [], preferredColor = null) {
  const takenSet = new Set(
    takenColors
      .filter(Boolean)
      .map((c) => (typeof c === 'string' ? c.toLowerCase().trim() : ''))
  )

  // Keep same color on refresh if still free
  if (preferredColor && !takenSet.has(preferredColor.toLowerCase().trim())) {
    return preferredColor
  }

  // Pick first available from the 12-color palette
  for (const c of COLLABORATOR_PALETTE) {
    if (!takenSet.has(c.toLowerCase())) {
      return c
    }
  }

  // With > 12 people, reuse colors by generating a hue-shifted variant
  let idx = takenColors.length
  while (idx < 100) {
    const candidate = getHueShiftedColor(idx)
    if (!takenSet.has(candidate.toLowerCase())) {
      return candidate
    }
    idx++
  }

  return COLLABORATOR_PALETTE[0]
}

export const ALLOWED_EXTENSIONS = [
  'py',
  'js',
  'jsx',
  'ts',
  'tsx',
  'html',
  'css',
  'json',
  'md',
  'txt',
  'c',
  'h',
  'cpp',
  'hpp',
  'java',
  'php',
  'rs',
  'go',
  'rb'
]

export const SUPPORTED_EXTENSIONS = ALLOWED_EXTENSIONS

/**
 * Validates a file name against system rules and the extension allow-list.
 * @param {string} rawName - The file name to validate
 * @param {string[]} existingFiles - Array of already existing file names
 * @param {boolean} allowSlashes - Whether forward slashes are allowed (for folder paths)
 * @returns {{ valid: boolean, error: string }}
 */
export function validateFileName(rawName, existingFiles = [], allowSlashes = false) {
  if (rawName === undefined || rawName === null || rawName === '') {
    return { valid: false, error: 'File name cannot be empty' }
  }

  // Reject spaces at ends
  if (rawName.startsWith(' ') || rawName.endsWith(' ')) {
    return { valid: false, error: 'File name cannot start or end with spaces' }
  }

  const name = rawName.trim()
  if (!name) {
    return { valid: false, error: 'File name cannot be empty' }
  }

  // Reject names longer than 64 characters
  if (name.length > 64) {
    return { valid: false, error: 'File name must be 64 characters or fewer' }
  }

  // Reject traversal ".."
  if (name.includes('..')) {
    return { valid: false, error: 'File name cannot contain ".."' }
  }

  // Reject invalid characters in file names: < > : " | ? *
  if (/[<>:"|?*]/.test(name)) {
    return { valid: false, error: 'File name cannot contain < > : " | ? *' }
  }

  // Reject slashes outside folder imports
  if (!allowSlashes && (name.includes('/') || name.includes('\\'))) {
    return { valid: false, error: 'File name cannot contain slashes' }
  }

  // Reject trailing dot
  if (name.endsWith('.')) {
    return { valid: false, error: 'File name cannot end with a dot' }
  }

  // Check extension
  const lastDot = name.lastIndexOf('.')
  if (lastDot === -1 || lastDot === 0) {
    return {
      valid: false,
      error: 'Use a supported extension: .py .js .ts .html .css ...'
    }
  }

  const ext = name.slice(lastDot + 1).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: 'Use a supported extension: .py .js .ts .html .css ...'
    }
  }

  // Reject duplicates (case-insensitive)
  if (existingFiles && Array.isArray(existingFiles)) {
    const isDup = existingFiles.some((f) => f.toLowerCase() === name.toLowerCase())
    if (isDup) {
      return { valid: false, error: 'A file with this name already exists' }
    }
  }

  return { valid: true, error: '' }
}

export function getRandomColor() {
  const index = Math.floor(Math.random() * USER_COLORS.length)
  return USER_COLORS[index]
}

export function getFileExtension(filename) {
  if (!filename || typeof filename !== 'string') return ''
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

export function getLanguageName(filename) {
  const ext = getFileExtension(filename)
  switch (ext) {
    case 'py':
      return 'Python'
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'JavaScript'
    case 'ts':
    case 'tsx':
      return 'TypeScript'
    case 'html':
    case 'htm':
      return 'HTML'
    case 'css':
      return 'CSS'
    case 'json':
      return 'JSON'
    case 'md':
    case 'markdown':
      return 'Markdown'
    case 'cpp':
    case 'cxx':
    case 'cc':
    case 'hpp':
      return 'C++'
    case 'c':
    case 'h':
      return 'C'
    case 'java':
      return 'Java'
    case 'php':
      return 'PHP'
    case 'rs':
      return 'Rust'
    case 'go':
      return 'Go'
    case 'rb':
      return 'Ruby'
    default:
      return 'Plain Text'
  }
}

export function getInitialTemplate(filename) {
  const ext = getFileExtension(filename)
  switch (ext) {
    case 'ts':
      return `// TypeScript Hello World\nconst greeting: string = "Hello, World!";\nconsole.log(greeting);\n`
    case 'tsx':
      return `// React TypeScript Component\nexport default function App(): JSX.Element {\n  return <h1>Hello, World!</h1>;\n}\n`
    case 'php':
      return `<?php\n// PHP Hello World\necho "Hello, World!\\n";\n`
    case 'rs':
      return `// Rust Hello World\nfn main() {\n    println!("Hello, World!");\n}\n`
    case 'go':
      return `// Go Hello World\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}\n`
    case 'rb':
      return `# Ruby Hello World\nputs "Hello, World!"\n`
    default:
      return ''
  }
}

export function getInitialRoomFromUrl() {
  if (typeof window === 'undefined') return 'hackathon-room'
  const params = new URLSearchParams(window.location.search)
  const room = params.get('room')
  return room ? room.trim() : 'hackathon-room'
}

export function updateUrlRoom(room) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (room) {
    url.searchParams.set('room', room)
  } else {
    url.searchParams.delete('room')
  }
  window.history.replaceState({}, '', url.toString())
}

export function normalizeLineEndings(text) {
  if (text === null || text === undefined) return ''
  return String(text).replace(/\r\n?/g, '\n')
}

/**
 * Downloads a single file with exact filename and text content
 */
export function downloadFile(filename, content) {
  const safeName = (filename || 'file.txt').replace(/\//g, '_')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}


/**
 * Bundles all workspace files into a zip file and triggers download
 */
export async function downloadAllAsZip(workspace, roomId) {
  if (!workspace) return
  const zip = new JSZip()
  const fileNames = workspace.listFiles()

  for (const name of fileNames) {
    const text = workspace.getText(name)
    if (text) {
      zip.file(name, text.toString())
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${roomId || 'offcode'}-workspace.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Universal clipboard copy helper with fallback for non-secure contexts (LAN http://)
 */
export function copyToClipboard(text) {
  if (typeof window === 'undefined') return Promise.resolve(false)

  // Try modern navigator.clipboard if available
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text))
  }

  return Promise.resolve(fallbackCopy(text))
}

function fallbackCopy(text) {
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    textArea.style.top = '0'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)
    return successful
  } catch (err) {
    console.warn('Fallback copy failed:', err)
    return false
  }
}

/**
 * Determines the WebSocket sync server URL.
 * Supports LAN IP resolution so devices on the same Wi-Fi connect to the host's server.
 */
export function getDefaultServerUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SYNC_SERVER_URL) {
    return import.meta.env.VITE_SYNC_SERVER_URL
  }
  if (typeof window !== 'undefined' && window.location) {
    const loc = window.location
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
    if (loc.port === '5173') {
      return `${wsProto}//${loc.hostname || 'localhost'}:1234`
    }
    return `${wsProto}//${loc.host}`
  }
  return 'ws://localhost:1234'
}

/**
 * Resolves relative file path against a base directory.
 * Properly ignores '.' and resolves '..' relative to the base directory.
 */
export function resolveRelativePath(baseDir, relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return ''
  const cleanRel = relativePath.trim().replace(/\\/g, '/')
  const baseParts = baseDir ? baseDir.replace(/\\/g, '/').split('/').filter(Boolean) : []
  const relParts = cleanRel.split('/')
  const resolved = [...baseParts]

  for (const part of relParts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (resolved.length > 0) {
        resolved.pop()
      }
    } else {
      resolved.push(part)
    }
  }
  return resolved.join('/')
}

/**
 * Gets the directory portion of a file path.
 */
export function getDirname(filePath) {
  if (!filePath || typeof filePath !== 'string') return ''
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash === -1) return ''
  return normalized.slice(0, lastSlash)
}

const HTML_ERROR_HANDLER_TAG =
  '<script>window.onerror=function(m,s,l,c,e){try{window.parent.postMessage({type:"offcode-html-error",message:String(m),line:l||null,col:c||null,stack:e&&e.stack?String(e.stack):""},"*")}catch(_){}}</script>'

function injectHtmlErrorHandler(htmlStr) {
  if (!htmlStr) return HTML_ERROR_HANDLER_TAG
  if (/<head[^>]*>/i.test(htmlStr)) {
    return htmlStr.replace(/<head[^>]*>/i, (m) => m + HTML_ERROR_HANDLER_TAG)
  }
  if (/<html[^>]*>/i.test(htmlStr)) {
    return htmlStr.replace(/<html[^>]*>/i, (m) => m + '<head>' + HTML_ERROR_HANDLER_TAG + '</head>')
  }
  return HTML_ERROR_HANDLER_TAG + htmlStr
}

/**
 * Resolves relative <link rel="stylesheet" href="..."> and <script src="..."></script>
 * tags in HTML content by replacing them with inline <style> and <script> tags
 * containing the current text of the referenced files.
 * Leaves http(s), protocol-relative, and data URLs untouched.
 */
export function resolveHtmlAssets(rawHtml, htmlFileName, getFileContent) {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return { html: injectHtmlErrorHandler(rawHtml || ''), missingFiles: [] }
  }

  const baseDir = getDirname(htmlFileName)
  const missingFiles = []

  const isExternalUrl = (url) => {
    return /^(https?:|\/\/|data:|blob:|#)/i.test(url.trim())
  }

  // Use DOMParser when available in browser environments
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(rawHtml, 'text/html')

      // 1. Process <link rel="stylesheet" href="...">
      const links = Array.from(doc.querySelectorAll('link[href]'))
      for (const link of links) {
        const rel = (link.getAttribute('rel') || '').toLowerCase().trim()
        if (rel !== 'stylesheet') continue

        const href = link.getAttribute('href')
        if (!href || isExternalUrl(href)) continue

        const resolved = resolveRelativePath(baseDir, href)
        const content = getFileContent(resolved)

        if (content !== null && content !== undefined) {
          const style = doc.createElement('style')
          style.textContent = content
          link.replaceWith(style)
        } else {
          missingFiles.push({ path: resolved, raw: href })
        }
      }

      // 2. Process <script src="...">
      const scripts = Array.from(doc.querySelectorAll('script[src]'))
      for (const script of scripts) {
        const src = script.getAttribute('src')
        if (!src || isExternalUrl(src)) continue

        const resolved = resolveRelativePath(baseDir, src)
        const content = getFileContent(resolved)

        if (content !== null && content !== undefined) {
          const inlineScript = doc.createElement('script')
          for (const attr of script.attributes) {
            if (attr.name !== 'src') {
              inlineScript.setAttribute(attr.name, attr.value)
            }
          }
          inlineScript.setAttribute('data-offcode-inlined', resolved)
          inlineScript.textContent = content
          script.replaceWith(inlineScript)
        } else {
          missingFiles.push({ path: resolved, raw: src })
        }
      }

      const hasDocType = /<!DOCTYPE\s+html/i.test(rawHtml)
      const htmlResult = (hasDocType ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML
      return { html: injectHtmlErrorHandler(htmlResult), missingFiles }
    } catch (err) {
      console.warn('DOMParser failed in resolveHtmlAssets, falling back to regex:', err)
    }
  }

  // Fallback regex replacement (e.g. in headless environments)
  let processedHtml = rawHtml

  // Replace <link rel="stylesheet" href="...">
  processedHtml = processedHtml.replace(
    /<link\s+([^>]*?)>/gi,
    (match, attrs) => {
      const isStylesheet = /\brel=["']stylesheet["']/i.test(attrs)
      if (!isStylesheet) return match

      const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i)
      if (!hrefMatch) return match

      const href = hrefMatch[1]
      if (isExternalUrl(href)) return match

      const resolved = resolveRelativePath(baseDir, href)
      const content = getFileContent(resolved)

      if (content !== null && content !== undefined) {
        return `<style>\n${content}\n</style>`
      }
      missingFiles.push({ path: resolved, raw: href })
      return match
    }
  )

  // Replace <script src="...">...</script>
  processedHtml = processedHtml.replace(
    /<script\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/script>/gi,
    (match, beforeSrc, src, afterSrc) => {
      if (isExternalUrl(src)) return match

      const resolved = resolveRelativePath(baseDir, src)
      const content = getFileContent(resolved)

      if (content !== null && content !== undefined) {
        const remainingAttrs = `${beforeSrc} ${afterSrc}`.trim()
        const attrStr = remainingAttrs ? ` ${remainingAttrs}` : ''
        return `<script${attrStr} data-offcode-inlined="${resolved}">\n${content}\n</script>`
      }
      missingFiles.push({ path: resolved, raw: src })
      return match
    }
  )

  return { html: injectHtmlErrorHandler(processedHtml), missingFiles }
}



