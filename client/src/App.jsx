import { useState, useEffect, useRef, useCallback } from 'react'
import { createWorkspace } from './sync/index.js'
import {
  getUndoManager,
  removeUndoManager,
  clearAllUndoManagers,
  onUndoStackChange
} from './utils/undoCache'
import {
  updateUrlRoom,
  downloadFile,
  downloadAllAsZip,
  getInitialTemplate
} from './utils/helpers'

import JoinScreen from './components/JoinScreen'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import PeoplePanel from './components/PeoplePanel'
import DebugPanel from './components/DebugPanel'

export default function App() {
  const [session, setSession] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [status, setStatus] = useState('online')
  const [files, setFiles] = useState([])
  const [activeFile, setActiveFile] = useState(null)
  const [users, setUsers] = useState([])
  const [showDebug, setShowDebug] = useState(false)
  const [undoDepths, setUndoDepths] = useState({})
  const [eventsLog, setEventsLog] = useState([])

  const workspaceRef = useRef(null)

  // Append entry to live activity event log
  const logEvent = useCallback((type, message) => {
    const entry = {
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString(),
      type,
      message
    }
    setEventsLog((prev) => [entry, ...prev].slice(0, 50))
  }, [])

  // Join workspace
  const handleJoin = ({ userName, roomId, userColor }) => {
    updateUrlRoom(roomId)
    setSession({ userName, roomId, userColor })
    logEvent('session', `Joined room "${roomId}" as ${userName}`)
  }

  // Leave workspace
  const handleLeaveRoom = () => {
    if (workspaceRef.current) {
      workspaceRef.current.destroy()
      workspaceRef.current = null
    }
    clearAllUndoManagers()
    setWorkspace(null)
    setSession(null)
    setFiles([])
    setActiveFile(null)
    setUsers([])
    updateUrlRoom('')
  }

  // Initialize workspace when session changes
  useEffect(() => {
    if (!session) return

    const { roomId, userName, userColor } = session
    const ws = createWorkspace({ roomId, userName, userColor })
    workspaceRef.current = ws
    setWorkspace(ws)

    // Sync initial status
    setStatus(ws.getStatus())

    // Subscribe to status changes
    const unsubStatus = ws.onStatusChange((newStatus) => {
      setStatus(newStatus)
      logEvent('network', `Connection state changed to ${newStatus.toUpperCase()}`)
    })

    // Subscribe to file list changes
    const unsubFiles = ws.onFilesChange((updatedFiles) => {
      setFiles(updatedFiles)
      // If current active file was deleted, switch to first available
      setActiveFile((current) => {
        if (!current || !updatedFiles.includes(current)) {
          return updatedFiles.length > 0 ? updatedFiles[0] : null
        }
        return current
      })
    })

    // Listen to Yjs document updates to log remote activity
    const onDocUpdate = (update, origin) => {
      if (origin === 'broadcast-sync' || origin === 'remote-teammate-simulation') {
        logEvent('crdt', 'Received remote CRDT sync update from peer')
      }
    }
    ws.ydoc.on('update', onDocUpdate)

    // Listen to awareness changes (collaborator presence & current file viewing)
    const onAwarenessChange = () => {
      const states = ws.awareness.getStates()
      const list = []
      states.forEach((state, clientId) => {
        if (state && state.user) {
          list.push({
            clientId,
            name: state.user.name || 'Anonymous',
            color: state.user.color || '#6366f1',
            currentFile: state.currentFile || null,
            currentLine: state.currentLine || 1,
            isYou: clientId === ws.ydoc.clientID
          })
        }
      })
      // Put local user first
      list.sort((a, b) => (a.isYou ? -1 : b.isYou ? 1 : 0))
      setUsers(list)
    }

    ws.awareness.on('change', onAwarenessChange)

    // Wait until workspace is ready, then set initial files and awareness
    ws.whenReady.then(() => {
      const initialFiles = ws.listFiles()
      setFiles(initialFiles)
      if (initialFiles.length > 0) {
        setActiveFile((prev) => prev || initialFiles[0])
      }
      onAwarenessChange()
      logEvent('sync', 'Workspace ready and synchronized')
    })

    // Subscribe to Undo/Redo stack changes
    const unsubUndoStack = onUndoStackChange((depths) => {
      setUndoDepths({ ...depths })
    })

    return () => {
      unsubStatus()
      unsubFiles()
      unsubUndoStack()
      ws.ydoc.off('update', onDocUpdate)
      ws.awareness.off('change', onAwarenessChange)
      ws.destroy()
      clearAllUndoManagers()
    }
  }, [session, logEvent])

  // Broadcast current active file in awareness
  useEffect(() => {
    if (workspace && activeFile) {
      workspace.awareness.setLocalStateField('currentFile', activeFile)
    }
  }, [workspace, activeFile])

  // Active file's Y.Text instance
  const activeYText = workspace && activeFile ? workspace.getText(activeFile) : null

  // File operations
  const handleSelectFile = (fileName) => {
    setActiveFile(fileName)
    logEvent('editor', `Opened file "${fileName}"`)
  }

  const handleCreateFile = (fileName) => {
    if (!workspace) return
    const initialContent = getInitialTemplate(fileName)
    const text = workspace.createFile(fileName, initialContent)
    if (text) {
      setFiles(workspace.listFiles())
      setActiveFile(fileName)
      logEvent('file', `Created new file "${fileName}"`)
    }
  }

  const handleDeleteFile = (fileName) => {
    if (!workspace) return
    workspace.deleteFile(fileName)
    removeUndoManager(fileName)
    setFiles(workspace.listFiles())
    logEvent('file', `Deleted file "${fileName}"`)
  }

  // Phase A: Save current file to disk
  const handleSaveCurrentFile = useCallback(() => {
    if (!activeFile || !activeYText) return
    downloadFile(activeFile, activeYText.toString())
    logEvent('save', `Downloaded "${activeFile}" to computer`)
  }, [activeFile, activeYText, logEvent])

  // Phase A: Download all files as a .zip
  const handleDownloadAllZip = useCallback(() => {
    if (!workspace) return
    downloadAllAsZip(workspace, session?.roomId)
    logEvent('save', 'Exported full project as .zip archive')
  }, [workspace, session, logEvent])

  // Phase A: Global Ctrl+S shortcut preventing browser default
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveCurrentFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveCurrentFile])

  // Offline / Online toggle
  const handleToggleOnline = () => {
    if (!workspace) return
    if (status === 'offline') {
      workspace.goOnline()
      logEvent('network', 'Reconnecting... will auto-merge local edits')
    } else {
      workspace.goOffline()
      logEvent('network', 'Switched to offline mode: local edits isolated')
    }
  }

  // Undo / Redo for active file
  const activeUndoManager =
    workspace && activeFile && activeYText
      ? getUndoManager(activeFile, activeYText)
      : null

  const activeDepths = activeFile && undoDepths[activeFile]
    ? undoDepths[activeFile]
    : {
        undo: activeUndoManager?.undoStack?.length || 0,
        redo: activeUndoManager?.redoStack?.length || 0
      }

  const handleUndo = () => {
    if (activeUndoManager) {
      activeUndoManager.undo()
      logEvent('undo', `Performed Undo on "${activeFile}"`)
    }
  }

  const handleRedo = () => {
    if (activeUndoManager) {
      activeUndoManager.redo()
      logEvent('redo', `Performed Redo on "${activeFile}"`)
    }
  }

  // Demo shortcut: Simulate remote edit
  const handleSimulateRemoteEdit = () => {
    if (!workspace || !activeFile || !activeYText) return
    const now = new Date().toLocaleTimeString()
    workspace.ydoc.transact(() => {
      activeYText.insert(
        activeYText.length,
        `\n// [Remote Teammate Edit at ${now}]: Live concurrent CRDT sync verification.\n`
      )
    }, 'remote-teammate-simulation')
    logEvent('demo', `Injected simulated remote teammate edit into "${activeFile}"`)
  }

  // Other users viewing the current active file
  const remoteUsersInSameFile = users.filter(
    (u) => !u.isYou && u.currentFile === activeFile
  )

  // Show Join screen if not connected
  if (!session || !workspace) {
    return <JoinScreen onJoin={handleJoin} />
  }

  return (
    <div className="app-layout">
      {/* Top Header Bar */}
      <TopBar
        roomId={session.roomId}
        userName={session.userName}
        userColor={session.userColor}
        status={status}
        onToggleOnline={handleToggleOnline}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={activeDepths.undo > 0}
        canRedo={activeDepths.redo > 0}
        undoDepth={activeDepths.undo}
        redoDepth={activeDepths.redo}
        showDebug={showDebug}
        onToggleDebug={() => setShowDebug(!showDebug)}
        onLeaveRoom={handleLeaveRoom}
        onSaveCurrentFile={handleSaveCurrentFile}
        onDownloadAllZip={handleDownloadAllZip}
        activeFile={activeFile}
      />

      {/* Main Workspace Body */}
      <div className="workspace-body">
        {/* Left Sidebar: File explorer */}
        <Sidebar
          files={files}
          activeFile={activeFile}
          onSelectFile={handleSelectFile}
          onCreateFile={handleCreateFile}
          onDeleteFile={handleDeleteFile}
        />

        {/* Center: CodeMirror 6 Editor */}
        <Editor
          activeFile={activeFile}
          ytext={activeYText}
          awareness={workspace.awareness}
          remoteUsersViewingThisFile={remoteUsersInSameFile}
        />

        {/* Right: People Panel */}
        <PeoplePanel users={users} activeFile={activeFile} />
      </div>

      {/* Hackathon Demo & Debug Panel Drawer */}
      <DebugPanel
        isOpen={showDebug}
        onClose={() => setShowDebug(false)}
        clientId={workspace.ydoc.clientID}
        status={status}
        usersCount={users.length}
        undoDepths={undoDepths}
        eventsLog={eventsLog}
        onClearLogs={() => setEventsLog([])}
        onSimulateRemoteEdit={handleSimulateRemoteEdit}
        activeFile={activeFile}
      />
    </div>
  )
}
