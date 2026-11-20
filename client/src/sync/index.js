/**
 * ============================================================================
 * TEAMMATE REPLACES THIS FILE. Do not edit.
 *
 * Temporary placeholder implementing the full contract using in-memory Y.Doc
 * and browser BroadcastChannel for zero-server multi-window testing.
 * ============================================================================
 */

import * as Y from 'yjs'
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates
} from 'y-protocols/awareness'

// Server URL for the teammate's real WebSocket sync engine
export const SYNC_SERVER_URL =
  import.meta.env.VITE_SYNC_SERVER_URL || 'ws://localhost:1234'

/**
 * Creates and initializes a workspace instance.
 *
 * @param {Object} options
 * @param {string} options.roomId - Unique room identifier
 * @param {string} options.userName - Display name of the user
 * @param {string} options.userColor - Hex color code for user's cursor/badge
 * @returns {Object} Workspace contract implementation
 */
export function createWorkspace({ roomId, userName, userColor }) {
  const ydoc = new Y.Doc()
  const files = ydoc.getMap('files')
  const awareness = new Awareness(ydoc)

  let status = 'online'
  const statusListeners = new Set()
  const fileListeners = new Set()

  // Set local awareness state
  awareness.setLocalStateField('user', {
    name: userName || 'Anonymous',
    color: userColor || '#6366f1'
  })

  // Set up BroadcastChannel for in-browser multi-tab sync without a server
  const channelName = `offcode-sync-${roomId || 'default'}`
  let channel = null
  let isChannelOpen = true

  // Track pending updates while offline
  const offlineUpdatesQueue = []

  const notifyStatus = (newStatus) => {
    if (status !== newStatus) {
      status = newStatus
      statusListeners.forEach((cb) => {
        try {
          cb(status)
        } catch (err) {
          console.error('Error in status callback:', err)
        }
      })
    }
  }

  // Handle local document updates
  const handleDocUpdate = (update, origin) => {
    if (origin === 'broadcast-sync' || origin === 'offline-sync') {
      return
    }

    if (status === 'offline') {
      offlineUpdatesQueue.push(update)
      return
    }

    if (channel && isChannelOpen) {
      try {
        channel.postMessage({
          type: 'doc-update',
          update: Array.from(update)
        })
      } catch (err) {
        console.warn('BroadcastChannel postMessage failed:', err)
      }
    }
  }

  ydoc.on('update', handleDocUpdate)

  // Handle local awareness updates
  const handleAwarenessUpdate = ({ added, updated, removed }, origin) => {
    if (origin === 'broadcast-awareness') return

    if (status === 'offline') return

    const changedClients = added.concat(updated).concat(removed)
    if (changedClients.length === 0) return

    const awarenessUpdate = encodeAwarenessUpdate(awareness, changedClients)
    if (channel && isChannelOpen) {
      try {
        channel.postMessage({
          type: 'awareness-update',
          update: Array.from(awarenessUpdate)
        })
      } catch (err) {
        console.warn('BroadcastChannel awareness send failed:', err)
      }
    }
  }

  awareness.on('update', handleAwarenessUpdate)

  // Initialize BroadcastChannel if in browser environment
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(channelName)

    channel.onmessage = (event) => {
      const data = event.data
      if (!data) return

      if (status === 'offline') {
        // While offline, ignore incoming broadcasts
        return
      }

      switch (data.type) {
        case 'doc-update': {
          if (data.update) {
            const updateArr = new Uint8Array(data.update)
            Y.applyUpdate(ydoc, updateArr, 'broadcast-sync')
          }
          break
        }
        case 'awareness-update': {
          if (data.update) {
            const updateArr = new Uint8Array(data.update)
            applyAwarenessUpdate(awareness, updateArr, 'broadcast-awareness')
          }
          break
        }
        case 'query-sync': {
          // A new peer joined; send our state and awareness
          if (channel && isChannelOpen) {
            const currentDocState = Y.encodeStateAsUpdate(ydoc)
            const allClients = Array.from(awareness.getStates().keys())
            const allAwareness = encodeAwarenessUpdate(awareness, allClients)
            channel.postMessage({
              type: 'sync-response',
              docUpdate: Array.from(currentDocState),
              awarenessUpdate: Array.from(allAwareness)
            })
          }
          break
        }
        case 'sync-response': {
          if (data.docUpdate) {
            const updateArr = new Uint8Array(data.docUpdate)
            Y.applyUpdate(ydoc, updateArr, 'broadcast-sync')
          }
          if (data.awarenessUpdate) {
            const updateArr = new Uint8Array(data.awarenessUpdate)
            applyAwarenessUpdate(awareness, updateArr, 'broadcast-awareness')
          }
          break
        }
        default:
          break
      }
    }

    // Ask peers for existing state upon joining
    try {
      channel.postMessage({ type: 'query-sync' })
    } catch {
      // ignore
    }
  }

  // Listen to files changes to notify listeners
  const handleFilesChange = () => {
    const list = Array.from(files.keys()).sort()
    fileListeners.forEach((cb) => {
      try {
        cb(list)
      } catch (err) {
        console.error('Error in filesChange callback:', err)
      }
    })
  }

  files.observe(handleFilesChange)

  // whenReady resolves when workspace is initialized
  const whenReady = new Promise((resolve) => {
    // Give BroadcastChannel a short window to receive initial sync from peers
    setTimeout(() => {
      // If room is completely empty, populate an initial file
      if (files.size === 0) {
        const defaultFile = new Y.Text()
        defaultFile.insert(
          0,
          `// Welcome to OffCode!\n// Collaborative editing that works offline.\n\nfunction helloWorld() {\n  console.log("Hello from ${userName || 'User'}!");\n}\n\nhelloWorld();\n`
        )
        files.set('main.js', defaultFile)
      }
      resolve()
    }, 120)
  })

  // Contract Methods

  const getText = (fileName) => {
    const text = files.get(fileName)
    if (text instanceof Y.Text) {
      return text
    }
    return null
  }

  const listFiles = () => {
    return Array.from(files.keys()).sort()
  }

  const createFile = (fileName, initialContent = '') => {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Valid fileName string is required')
    }
    const cleanName = fileName.trim()
    if (!cleanName) return null

    if (files.has(cleanName)) {
      return getText(cleanName)
    }

    const ytext = new Y.Text()
    if (initialContent) {
      ytext.insert(0, initialContent)
    }
    files.set(cleanName, ytext)
    return ytext
  }

  const deleteFile = (fileName) => {
    if (files.has(fileName)) {
      files.delete(fileName)
    }
  }

  const onFilesChange = (cb) => {
    fileListeners.add(cb)
    // Return unsubscribe function
    return () => {
      fileListeners.delete(cb)
    }
  }

  const getStatus = () => {
    return status
  }

  const onStatusChange = (cb) => {
    statusListeners.add(cb)
    // Return unsubscribe function
    return () => {
      statusListeners.delete(cb)
    }
  }

  const goOffline = () => {
    if (status === 'offline') return
    notifyStatus('offline')
  }

  const goOnline = () => {
    if (status === 'online') return
    notifyStatus('connecting')

    setTimeout(() => {
      notifyStatus('online')

      // Flush queued offline updates to peers
      if (channel && isChannelOpen) {
        // Send full state to guarantee convergence after reconnect
        const fullState = Y.encodeStateAsUpdate(ydoc)
        channel.postMessage({
          type: 'doc-update',
          update: Array.from(fullState)
        })

        // Re-broadcast local awareness
        const localUpdate = encodeAwarenessUpdate(awareness, [ydoc.clientID])
        channel.postMessage({
          type: 'awareness-update',
          update: Array.from(localUpdate)
        })
      }
      offlineUpdatesQueue.length = 0
    }, 300)
  }

  const destroy = () => {
    isChannelOpen = false
    files.unobserve(handleFilesChange)
    ydoc.off('update', handleDocUpdate)
    awareness.off('update', handleAwarenessUpdate)
    removeAwarenessStates(awareness, [ydoc.clientID], 'destroy')

    if (channel) {
      try {
        channel.close()
      } catch {
        // ignore
      }
    }
    awareness.destroy()
    ydoc.destroy()
    fileListeners.clear()
    statusListeners.clear()
  }

  return {
    ydoc,
    files,
    awareness,
    getText,
    listFiles,
    createFile,
    deleteFile,
    onFilesChange,
    getStatus,
    onStatusChange,
    goOffline,
    goOnline,
    whenReady,
    destroy
  }
}
