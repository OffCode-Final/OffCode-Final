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
  'java'
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
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
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
