/**
 * Helper utilities for OffCode
 */
import JSZip from 'jszip'

// Curated palette of pleasant, accessible collaborator colors
// (Used ONLY for remote cursors, selections, and presence indicator dot)
export const USER_COLORS = [
  { name: 'Sky Blue', hex: '#0284c7' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Fuchsia', hex: '#c026d3' }
]

export const SUPPORTED_EXTENSIONS = [
  'py',
  'js',
  'html',
  'css',
  'json',
  'md',
  'c',
  'cpp',
  'java',
  'txt'
]

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
    default:
      return 'Plain Text'
  }
}

export function getInitialTemplate(filename) {
  const ext = getFileExtension(filename)
  switch (ext) {
    case 'py':
      return `# Python Script\ndef main():\n    print("Hello from Python in OffCode!")\n\nif __name__ == "__main__":\n    main()\n`
    case 'js':
      return `// JavaScript\nfunction hello() {\n  console.log("Hello from JavaScript in OffCode!");\n}\n\nhello();\n`
    case 'html':
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Live Preview</title>\n  <style>\n    body { font-family: sans-serif; background: #1e1e1e; color: #cccccc; padding: 24px; }\n    h1 { color: #4fc1ff; font-size: 20px; }\n  </style>\n</head>\n<body>\n  <h1>Live HTML Preview</h1>\n  <p>Edit this file to see live preview updates instantly.</p>\n</body>\n</html>\n`
    case 'css':
      return `/* Stylesheet */\nbody {\n  margin: 0;\n  padding: 0;\n  background-color: #1e1e1e;\n  color: #cccccc;\n  font-family: system-ui, sans-serif;\n}\n`
    case 'json':
      return `{\n  "name": "offcode-project",\n  "version": "1.0.0",\n  "description": "Collaborative offline code workspace",\n  "features": ["crdt", "offline", "per-user-undo"]\n}\n`
    case 'md':
      return `# Project Notes\n\nWelcome to OffCode.\n- Real-time CRDT sync\n- Offline merge\n- Per-user undo (Ctrl+Z)\n`
    case 'cpp':
      return `#include <iostream>\n\nint main() {\n    std::cout << "Hello from C++ in OffCode!" << std::endl;\n    return 0;\n}\n`
    case 'c':
      return `#include <stdio.h>\n\nint main() {\n    printf("Hello from C in OffCode!\\n");\n    return 0;\n}\n`
    case 'java':
      return `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java in OffCode!");\n    }\n}\n`
    default:
      return `// ${filename}\n`
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
  URL.revokeObjectURL(url)
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

/**
 * Resolves relative <link rel="stylesheet" href="..."> and <script src="..."></script>
 * tags in HTML content by replacing them with inline <style> and <script> tags
 * containing the current text of the referenced files.
 * Leaves http(s), protocol-relative, and data URLs untouched.
 */
export function resolveHtmlAssets(rawHtml, htmlFileName, getFileContent) {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return { html: rawHtml || '', missingFiles: [] }
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
          inlineScript.textContent = content
          script.replaceWith(inlineScript)
        } else {
          missingFiles.push({ path: resolved, raw: src })
        }
      }

      const hasDocType = /<!DOCTYPE\s+html/i.test(rawHtml)
      const htmlResult = (hasDocType ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML
      return { html: htmlResult, missingFiles }
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
        return `<script${attrStr}>\n${content}\n</script>`
      }
      missingFiles.push({ path: resolved, raw: src })
      return match
    }
  )

  return { html: processedHtml, missingFiles }
}



