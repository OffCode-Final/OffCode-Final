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
  getInitialTemplate,
  getFileExtension
} from './utils/helpers'

import JoinScreen from './components/JoinScreen'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import PeoplePanel from './components/PeoplePanel'
import DebugPanel from './components/DebugPanel'
import OutputPanel from './components/OutputPanel'

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

  // Phase B: Code Execution & Output State
  const [outputs, setOutputs] = useState([])
  const [isOutputOpen, setIsOutputOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [htmlContent, setHtmlContent] = useState('')

  // Phase C: Live Cursors & Follow State
  const [followingUserId, setFollowingUserId] = useState(null)
  const [targetScrollLine, setTargetScrollLine] = useState(null)
  const [hostId, setHostId] = useState(null)

  const workspaceRef = useRef(null)
  const pythonWorkerRef = useRef(null)
  const jsWorkerRef = useRef(null)
  const jsTimeoutRef = useRef(null)

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

  // Append line to Output Panel
  const addOutput = useCallback((type, text) => {
    setOutputs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        type,
        text,
        timestamp: new Date().toLocaleTimeString()
      }
    ])
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
    if (pythonWorkerRef.current) {
      pythonWorkerRef.current.terminate()
      pythonWorkerRef.current = null
    }
    if (jsWorkerRef.current) {
      jsWorkerRef.current.terminate()
      jsWorkerRef.current = null
    }
    if (jsTimeoutRef.current) {
      clearTimeout(jsTimeoutRef.current)
    }

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
            userId: (state.user && state.user.id) || null,
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

    // Listen to meta changes (host election & review mode)
    if (ws.getHost) {
      setHostId(ws.getHost())
    }
    const unsubMeta = ws.onMetaChange ? ws.onMetaChange(() => {
      if (ws.getHost) setHostId(ws.getHost())
    }) : () => {}

    // Wait until workspace is ready, then set initial files and awareness
    ws.whenReady.then(() => {
      const initialFiles = ws.listFiles()
      setFiles(initialFiles)
      if (initialFiles.length > 0) {
        setActiveFile((prev) => prev || initialFiles[0])
      }
      if (ws.getHost) setHostId(ws.getHost())
      onAwarenessChange()
      logEvent('sync', 'Workspace ready and synchronized with server')
    })

    // Subscribe to Undo/Redo stack changes
    const unsubUndoStack = onUndoStackChange((depths) => {
      setUndoDepths({ ...depths })
    })

    return () => {
      unsubStatus()
      unsubFiles()
      unsubUndoStack()
      unsubMeta()
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
    if (followingUserId) {
      setFollowingUserId(null)
    }
    logEvent('editor', `Opened file "${fileName}"`)
  }

  // Phase C: Jump to Person's File & Line
  const handleJumpToUser = useCallback(
    (targetUser) => {
      if (!targetUser.currentFile) return
      if (targetUser.currentFile !== activeFile) {
        setActiveFile(targetUser.currentFile)
      }
      setTargetScrollLine(targetUser.currentLine || 1)
      logEvent(
        'editor',
        `Jumped to ${targetUser.name}'s view in "${targetUser.currentFile}" (Ln ${targetUser.currentLine || 1})`
      )
    },
    [activeFile, logEvent]
  )

  // Phase C: Toggle Follow Mode
  const handleToggleFollow = useCallback(
    (clientId) => {
      setFollowingUserId((prev) => {
        if (prev === clientId) {
          logEvent('editor', 'Stopped following collaborator')
          return null
        }
        const target = users.find((u) => u.clientId === clientId)
        if (target) {
          if (target.currentFile && target.currentFile !== activeFile) {
            setActiveFile(target.currentFile)
          }
          setTargetScrollLine(target.currentLine || 1)
          logEvent('editor', `Now following ${target.name}'s cursor & file`)
        }
        return clientId
      })
    },
    [users, activeFile, logEvent]
  )

  // Phase C: User interaction in editor unhooks follow mode
  const handleUserInteraction = useCallback(() => {
    if (followingUserId) {
      setFollowingUserId(null)
      logEvent('editor', 'Follow mode stopped due to local interaction')
    }
  }, [followingUserId, logEvent])

  // Phase C: Follow synchronization effect
  useEffect(() => {
    if (!followingUserId) return
    const peer = users.find((u) => u.clientId === followingUserId)
    if (!peer) {
      setFollowingUserId(null)
      return
    }
    if (peer.currentFile && peer.currentFile !== activeFile) {
      setActiveFile(peer.currentFile)
    }
    if (peer.currentLine) {
      setTargetScrollLine(peer.currentLine)
    }
  }, [followingUserId, users, activeFile])

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

  // Phase B: Stop Code Execution
  const handleStopCode = useCallback(() => {
    if (jsTimeoutRef.current) {
      clearTimeout(jsTimeoutRef.current)
      jsTimeoutRef.current = null
    }

    if (pythonWorkerRef.current) {
      pythonWorkerRef.current.terminate()
      pythonWorkerRef.current = null
    }

    if (jsWorkerRef.current) {
      jsWorkerRef.current.terminate()
      jsWorkerRef.current = null
    }

    setIsRunning(false)
    addOutput('stderr', '[STOPPED] Execution killed by user.')
    logEvent('run', 'Execution stopped by user')
  }, [addOutput, logEvent])

  // Phase B: Run Code Execution
  const handleRunCode = useCallback(() => {
    if (!activeFile || !activeYText) return
    const ext = getFileExtension(activeFile)
    const code = activeYText.toString()

    setIsOutputOpen(true)

    // 1. Python Execution via Web Worker + Pyodide
    if (ext === 'py') {
      setIsRunning(true)
      addOutput('status', `=== Running Python: ${activeFile} ===`)
      logEvent('run', `Executing Python file "${activeFile}"`)

      // Create new or reuse module worker for Pyodide
      if (!pythonWorkerRef.current) {
        pythonWorkerRef.current = new Worker('/python-worker.js', { type: 'module' })
      }

      const worker = pythonWorkerRef.current

      worker.onmessage = (e) => {
        const { type, data, message, duration } = e.data
        if (type === 'stdout') {
          addOutput('stdout', data)
        } else if (type === 'stderr') {
          addOutput('stderr', data)
        } else if (type === 'status') {
          addOutput('status', message)
        } else if (type === 'done') {
          setIsRunning(false)
          addOutput('status', `=== Finished in ${duration}s ===`)
        } else if (type === 'error') {
          setIsRunning(false)
          addOutput('stderr', `Error: ${data}`)
        }
      }

      worker.onerror = (err) => {
        setIsRunning(false)
        addOutput('stderr', `Worker Error: ${err.message}`)
      }

      worker.postMessage({ type: 'run', code })
      return
    }

    // 2. JavaScript Execution via Web Worker with 10s Timeout
    if (['js', 'jsx', 'mjs'].includes(ext)) {
      setIsRunning(true)
      addOutput('status', `=== Running JavaScript: ${activeFile} ===`)
      logEvent('run', `Executing JavaScript file "${activeFile}"`)

      if (jsWorkerRef.current) {
        jsWorkerRef.current.terminate()
      }
      const worker = new Worker('/js-worker.js')
      jsWorkerRef.current = worker

      // 10-second safety timeout
      jsTimeoutRef.current = setTimeout(() => {
        worker.terminate()
        setIsRunning(false)
        addOutput('stderr', 'Error: Execution timed out (exceeded 10 seconds).')
      }, 10000)

      worker.onmessage = (e) => {
        const { type, data, duration } = e.data
        if (type === 'stdout') {
          addOutput('stdout', data)
        } else if (type === 'stderr') {
          addOutput('stderr', data)
        } else if (type === 'done') {
          clearTimeout(jsTimeoutRef.current)
          setIsRunning(false)
          addOutput('status', `=== Finished in ${duration}s ===`)
        } else if (type === 'error') {
          clearTimeout(jsTimeoutRef.current)
          setIsRunning(false)
          addOutput('stderr', `Error: ${data}`)
        }
      }

      worker.onerror = (err) => {
        clearTimeout(jsTimeoutRef.current)
        setIsRunning(false)
        addOutput('stderr', `Worker Error: ${err.message}`)
      }

      worker.postMessage({ code })
      return
    }

    // 3. HTML Live Preview in Sandboxed Iframe
    if (['html', 'htm'].includes(ext)) {
      setHtmlContent(code)
      addOutput('status', `=== Live HTML Preview loaded for ${activeFile} ===`)
      logEvent('run', `Opened HTML live preview for "${activeFile}"`)
      return
    }

    // 4. Other languages
    addOutput('stderr', `Running ${ext.toUpperCase()} is not supported offline.`)
  }, [activeFile, activeYText, addOutput, logEvent])

  // Global Keyboard Shortcuts (Ctrl+S for Save, Ctrl+Enter for Run)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveCurrentFile()
      }
      // Ctrl+Enter / Cmd+Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleRunCode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveCurrentFile, handleRunCode])

  // Offline / Online toggle
  const handleToggleOnline = () => {
    if (!workspace) return
    if (status === 'offline') {
      workspace.goOnline()
      logEvent('network', 'Reconnecting to sync server...')
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

  const activeExt = getFileExtension(activeFile)
  const isHtml = ['html', 'htm'].includes(activeExt)

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
        onRunCode={handleRunCode}
        isRunning={isRunning}
        onStopCode={handleStopCode}
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
          users={users}
        />

        {/* Center: CodeMirror 6 Editor with Bottom Output Panel */}
        <div className="editor-and-output-column">
          <Editor
            activeFile={activeFile}
            ytext={activeYText}
            awareness={workspace.awareness}
            remoteUsersViewingThisFile={remoteUsersInSameFile}
            targetScrollLine={targetScrollLine}
            onUserInteraction={handleUserInteraction}
          />

          {/* Phase B: Bottom Output & Preview Panel */}
          <OutputPanel
            isOpen={isOutputOpen}
            onClose={() => setIsOutputOpen(false)}
            outputs={outputs}
            onClear={() => setOutputs([])}
            isRunning={isRunning}
            onStop={handleStopCode}
            htmlContent={htmlContent}
            isHtmlMode={isHtml}
          />
        </div>

        {/* Right: People Panel */}
        <PeoplePanel
          users={users}
          activeFile={activeFile}
          onJumpToUser={handleJumpToUser}
          followingUserId={followingUserId}
          onToggleFollow={handleToggleFollow}
          hostId={hostId}
        />
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
