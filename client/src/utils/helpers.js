/**
 * Helper utilities for OffCode
 */

// Curated palette of pleasant, accessible collaborator colors
export const USER_COLORS = [
  { name: 'Sky Blue', hex: '#0284c7', light: '#0284c733' },
  { name: 'Emerald', hex: '#059669', light: '#05966933' },
  { name: 'Purple', hex: '#7c3aed', light: '#7c3aed33' },
  { name: 'Rose', hex: '#e11d48', light: '#e11d4833' },
  { name: 'Amber', hex: '#d97706', light: '#d9770633' },
  { name: 'Indigo', hex: '#4f46e5', light: '#4f46e533' },
  { name: 'Teal', hex: '#0d9488', light: '#0d948833' },
  { name: 'Fuchsia', hex: '#c026d3', light: '#c026d333' }
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
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'JavaScript'
    case 'ts':
    case 'tsx':
      return 'TypeScript'
    case 'py':
      return 'Python'
    case 'html':
    case 'htm':
      return 'HTML'
    case 'css':
      return 'CSS'
    case 'json':
      return 'JSON'
    case 'md':
      return 'Markdown'
    default:
      return 'Plain Text'
  }
}

export function getFileBadgeInfo(filename) {
  const ext = getFileExtension(filename)
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
      return { label: 'JS', color: '#f59e0b' }
    case 'ts':
    case 'tsx':
      return { label: 'TS', color: '#3b82f6' }
    case 'py':
      return { label: 'PY', color: '#10b981' }
    case 'html':
    case 'htm':
      return { label: 'HTML', color: '#ef4444' }
    case 'css':
      return { label: 'CSS', color: '#06b6d4' }
    case 'json':
      return { label: 'JSON', color: '#a855f7' }
    case 'md':
      return { label: 'MD', color: '#64748b' }
    default:
      return { label: 'TXT', color: '#94a3b8' }
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
