/**
 * Local-only File System Access API helpers and IndexedDB handle storage.
 * Handles are stored per (roomId, fileName) and are never written to Yjs or the server.
 */

const DB_NAME = 'offcode-disk-links'
const STORE_NAME = 'handles'
const DB_VERSION = 1

export function isSaveFilePickerSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.isSecureContext && typeof window.showSaveFilePicker === 'function')
}

export function isOpenFilePickerSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.isSecureContext && typeof window.showOpenFilePicker === 'function')
}

export function isFileSystemAccessSupported() {
  return isSaveFilePickerSupported() && isOpenFilePickerSupported()
}

export const UNSUPPORTED_FS_TOOLTIP =
  'Downloads a copy in this browser. Live overwriting of the same file on disk is supported in Chrome or Edge on HTTPS/localhost.'

function makeKey(roomId, fileName) {
  const cleanRoom = String(roomId || 'default').trim().toLowerCase()
  return `${cleanRoom}::${fileName}`
}

function openHandlesDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'))
    } catch (err) {
      reject(err)
    }
  })
}

export async function saveLinkedHandle(roomId, fileName, handle) {
  if (!roomId || !fileName || !handle) return
  try {
    const db = await openHandlesDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put({
        key: makeKey(roomId, fileName),
        roomId: String(roomId).trim().toLowerCase(),
        fileName,
        diskName: handle.name || fileName,
        handle
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (_) {}
}

export async function removeLinkedHandle(roomId, fileName) {
  if (!roomId || !fileName) return
  try {
    const db = await openHandlesDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(makeKey(roomId, fileName))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (_) {}
}

export async function clearRoomLinkedHandles(roomId) {
  if (!roomId) return
  const cleanRoom = String(roomId).trim().toLowerCase()
  try {
    const db = await openHandlesDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const cursorReq = store.openCursor()
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          if (cursor.value?.roomId === cleanRoom) {
            cursor.delete()
          }
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (_) {}
}

export async function loadRoomLinkedHandles(roomId) {
  if (!roomId) return {}
  const cleanRoom = String(roomId).trim().toLowerCase()
  const result = {}
  try {
    const db = await openHandlesDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const cursorReq = store.openCursor()
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          const val = cursor.value
          if (val && val.roomId === cleanRoom && val.fileName && val.handle) {
            result[val.fileName] = {
              handle: val.handle,
              diskName: val.diskName || val.handle.name || val.fileName
            }
          }
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (_) {}
  return result
}

export async function queryReadWritePermission(handle) {
  if (!handle) return 'denied'
  try {
    if (typeof handle.queryPermission === 'function') {
      return await handle.queryPermission({ mode: 'readwrite' })
    }
    return 'granted'
  } catch (_) {
    return 'denied'
  }
}

export async function ensureReadWritePermission(handle) {
  if (!handle) return false
  try {
    const current = await queryReadWritePermission(handle)
    if (current === 'granted') return true
    if (typeof handle.requestPermission === 'function') {
      const requested = await handle.requestPermission({ mode: 'readwrite' })
      return requested === 'granted'
    }
    return false
  } catch (_) {
    return false
  }
}

export async function isDiskFileNonEmpty(handle) {
  if (!handle || typeof handle.getFile !== 'function') return false
  try {
    const file = await handle.getFile()
    return file.size > 0
  } catch (_) {
    return false
  }
}

export async function writeTextToHandle(handle, text) {
  const writable = await handle.createWritable()
  try {
    await writable.write(text)
    await writable.close()
  } catch (err) {
    try {
      await writable.abort()
    } catch (_) {}
    throw err
  }
}
