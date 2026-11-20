/**
 * Per-file UndoManager cache for OffCode.
 *
 * Guarantees:
 * 1. Each file has its own persistent Y.UndoManager.
 * 2. Switching files retains the undo/redo stack.
 * 3. Only local edits are tracked (remote edits never enter the undo stack).
 * 4. Undo/redo works before, during, and after offline reconnection.
 */

import * as Y from 'yjs'

// Map of fileName -> Y.UndoManager
const undoManagers = new Map()

// Callbacks listening for undo/redo stack changes
const stackListeners = new Set()

function notifyListeners() {
  const depths = getAllUndoDepths()
  stackListeners.forEach((cb) => {
    try {
      cb(depths)
    } catch (err) {
      console.error('Error in undoStack listener:', err)
    }
  })
}

/**
 * Retrieves or creates a cached Y.UndoManager for the given file.
 *
 * @param {string} fileName - Name of the file
 * @param {Y.Text} ytext - The Y.Text instance of the file
 * @returns {Y.UndoManager}
 */
export function getUndoManager(fileName, ytext) {
  if (!fileName || !ytext) return null

  if (!undoManagers.has(fileName)) {
    const um = new Y.UndoManager(ytext, {
      captureTimeout: 400 // pause threshold to group discrete typing bursts
    })

    const onStackChange = () => {
      notifyListeners()
    }

    um.on('stack-item-added', onStackChange)
    um.on('stack-item-popped', onStackChange)

    undoManagers.set(fileName, um)
  }

  return undoManagers.get(fileName)
}

/**
 * Removes and destroys an UndoManager when a file is deleted.
 */
export function removeUndoManager(fileName) {
  if (undoManagers.has(fileName)) {
    const um = undoManagers.get(fileName)
    um.destroy()
    undoManagers.delete(fileName)
    notifyListeners()
  }
}

/**
 * Clears all cached UndoManagers (e.g., when leaving workspace).
 */
export function clearAllUndoManagers() {
  undoManagers.forEach((um) => um.destroy())
  undoManagers.clear()
  notifyListeners()
}

/**
 * Gets the current undo and redo depths for all cached files.
 */
export function getAllUndoDepths() {
  const result = {}
  undoManagers.forEach((um, fileName) => {
    result[fileName] = {
      undo: um.undoStack ? um.undoStack.length : 0,
      redo: um.redoStack ? um.redoStack.length : 0
    }
  })
  return result
}

/**
 * Gets the undo/redo depth for a specific file.
 */
export function getFileUndoDepth(fileName) {
  const um = undoManagers.get(fileName)
  if (!um) return { undo: 0, redo: 0 }
  return {
    undo: um.undoStack ? um.undoStack.length : 0,
    redo: um.redoStack ? um.redoStack.length : 0
  }
}

/**
 * Subscribes to undo/redo stack depth changes across all files.
 */
export function onUndoStackChange(cb) {
  stackListeners.add(cb)
  return () => {
    stackListeners.delete(cb)
  }
}
