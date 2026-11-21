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
  getFileExtension,
  getLanguageName,
  getDefaultServerUrl,
  resolveHtmlAssets
} from './utils/helpers'

import JoinScreen from './components/JoinScreen'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import PeoplePanel from './components/PeoplePanel'
import DebugPanel from './components/DebugPanel'
import OutputPanel from './components/OutputPanel'
import ReviewDrawer from './components/ReviewDrawer'
import PushDraftModal from './components/PushDraftModal'
import StatusBar from './components/StatusBar'
import ChatPanel, { getChatJoinedAt, getMessageTime } from './components/ChatPanel'

export default function App() {
  const [session, setSession] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [status, setStatus] = useState('online')
  const [files, setFiles] = useState([])
  const [activeFile, setActiveFile] = useState(null)
  const [openFiles, setOpenFiles] = useState([])
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [users, setUsers] = useState([])
  const [showDebug, setShowDebug] = useState(false)
  const [undoDepths, setUndoDepths] = useState({})
  const [eventsLog, setEventsLog] = useState([])
  const [pointersReceivedCount, setPointersReceivedCount] = useState(0)

  // Code Execution & Output State
  const [outputs, setOutputs] = useState([])
  const [isOutputOpen, setIsOutputOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [htmlContent, setHtmlContent] = useState('')

  // Live Cursors & Follow State
  const [followingUserId, setFollowingUserId] = useState(null)
  const [targetScrollLine, setTargetScrollLine] = useState(null)
  const [hostId, setHostId] = useState(null)

  // Host & Review Mode State
  const [mode, setMode] = useState('free') // 'free' | 'review'
  const [proposals, setProposals] = useState([])
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false)
  const [isPushDraftOpen, setIsPushDraftOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState('draft') // 'draft' | 'main'
  const [toasts, setToasts] = useState([])
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [frozenUserIds, setFrozenUserIds] = useState(new Set())

  const workspaceRef = useRef(null)
  const prevHostRef = useRef(null)
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

  // Display user-facing toast notification
  const showToast = useCallback((text, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
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
    setOpenFiles([])
    setUsers([])
    updateUrlRoom('')
  }

  // Auto-track opened tabs
  useEffect(() => {
    if (activeFile) {
      setOpenFiles((prev) => {
        if (!prev.includes(activeFile)) {
          return [...prev, activeFile]
        }
        return prev
      })
    }
  }, [activeFile])

  // Initialize workspace when session changes
  useEffect(() => {
    if (!session) return

    const { roomId, userName, userColor } = session
    const ws = createWorkspace({
      roomId,
      userName,
      userColor,
      serverUrl: getDefaultServerUrl()
    })
    workspaceRef.current = ws
    setWorkspace(ws)

    // Put userId in awareness without overwriting other fields
    const myId = ws.getUserId ? ws.getUserId() : null
    if (ws.awareness && myId) {
      ws.awareness.setLocalStateField('userId', myId)
    }

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
      setOpenFiles((prev) => prev.filter((f) => updatedFiles.includes(f)))
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
      const myClientId = ws.ydoc.clientID
      const currentHost = ws.getHost ? ws.getHost() : null
      if (currentHost) {
        setHostId(currentHost)
      }

      states.forEach((state, clientId) => {
        if (state.user) {
          const resolvedUserId = state.userId || state.user.userId || state.user.id || `client_${clientId}`
          list.push({
            clientId,
            userId: resolvedUserId,
            name: state.user.name || 'Anonymous',
            color: state.user.color || '#cccccc',
            currentFile: state.currentFile || null,
            currentLine: state.currentLine || 1,
            isYou: clientId === myClientId
          })
        }
      })
      setUsers(list)
    }
    ws.awareness.on('change', onAwarenessChange)

    // Host & Mode listener
    const unsubMeta = ws.onMetaChange
      ? ws.onMetaChange((metaArg) => {
          const newHost =
            metaArg && typeof metaArg.get === 'function'
              ? metaArg.get('hostId')
              : metaArg?.hostId ?? (ws.getHost ? ws.getHost() : null)
          const newMode =
            metaArg && typeof metaArg.get === 'function'
              ? metaArg.get('mode')
              : metaArg?.mode ?? (ws.getMode ? ws.getMode() : 'free')

          if (newHost !== undefined && newHost !== null) {
            // When host role is transferred, clear the frozen state of the new host
            const frozenMap = ws.ydoc.getMap('frozen')
            if (frozenMap.has(newHost)) {
              frozenMap.delete(newHost)
            }

            if (prevHostRef.current !== null && newHost !== prevHostRef.current) {
              const myUid = ws.getUserId ? ws.getUserId() : null
              if (newHost === myUid) {
                showToast('You are now the room host.', 'success')
                logEvent('host', 'You are now the room host')
              } else {
                const states = ws.awareness.getStates()
                let hostName = 'A collaborator'
                for (const st of states.values()) {
                  const uId = st?.userId || st?.user?.userId || st?.user?.id
                  if (uId === newHost) {
                    hostName = st?.user?.name || hostName
                    break
                  }
                }
                showToast(`${hostName} is now the room host.`, 'info')
                logEvent('host', `${hostName} is now the room host`)
              }
            }
            prevHostRef.current = newHost
            setHostId(newHost)
          }
          if (newMode !== undefined && newMode !== null) {
            setMode(newMode)
            logEvent('mode', `Room mode switched to ${newMode.toUpperCase()}`)
          }
        })
      : () => {}

    const myUserId = ws.getUserId ? ws.getUserId() : null
    let prevProposals = ws.listProposals ? ws.listProposals() : []

    const unsubProposals = ws.onProposalsChange
      ? ws.onProposalsChange(() => {
          const latest = ws.listProposals()
          setProposals(latest)

          // Notify non-host when host acts on their proposals
          latest.forEach((p) => {
            if (p.authorId === myUserId) {
              const old = prevProposals.find((o) => o.id === p.id)
              if (old && old.status === 'pending') {
                if (p.status === 'accepted') {
                  showToast(`Host accepted your proposal for "${p.file}".`, 'success')
                  logEvent('review', `Your proposal for "${p.file}" was accepted by host`)
                } else if (p.status === 'rejected') {
                  showToast(`Host rejected your proposal for "${p.file}".`, 'danger')
                  logEvent('review', `Your proposal for "${p.file}" was rejected by host`)
                }
              }
            }
          })
          prevProposals = latest
        })
      : () => {}

    // Wait until workspace is ready, then set initial files and awareness
    ws.whenReady.then(() => {
      const initialFiles = ws.listFiles()
      setFiles(initialFiles)
      if (initialFiles.length > 0) {
        setActiveFile((prev) => prev || initialFiles[0])
      }
      // Claim host if no host is set or current host is inactive
      if (ws.claimHost) {
        ws.claimHost()
      }
      const initialHost = ws.getHost ? ws.getHost() : null
      if (initialHost) {
        prevHostRef.current = initialHost
        setHostId(initialHost)
      }
      if (ws.getMode) setMode(ws.getMode())
      if (ws.listProposals) setProposals(ws.listProposals())
      onAwarenessChange()
      logEvent('sync', 'Workspace ready and synchronized with server')
    })

    // Listen to frozen users map
    const frozenMap = ws.ydoc.getMap('frozen')
    const updateFrozen = () => {
      const set = new Set()
      frozenMap.forEach((val, uid) => {
        if (val) set.add(uid)
      })
      setFrozenUserIds(set)
    }
    updateFrozen()
    frozenMap.observe(updateFrozen)

    // Subscribe to Undo/Redo stack changes
    const unsubUndoStack = onUndoStackChange((depths) => {
      setUndoDepths({ ...depths })
    })

    const handleBeforeUnload = () => {
      try {
        ws.awareness.setLocalState(null)
      } catch (_) {}
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      frozenMap.unobserve(updateFrozen)
      unsubStatus()
      unsubFiles()
      unsubUndoStack()
      unsubMeta()
      unsubProposals()
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

  // Host & Review Mode Computation
  const myUserId = workspace?.getUserId ? workspace.getUserId() : null
  const isHost = Boolean(workspace && (hostId && myUserId ? hostId === myUserId : (workspace.isHost && workspace.isHost())))
  const isCurrentUserStopped = Boolean(!isHost && myUserId && frozenUserIds.has(myUserId))
  const isReviewMode = mode === 'review'
  const isNonHostReview = isReviewMode && !isHost

  // Host Stop & Resume User Handlers
  const handleStopUser = useCallback((targetUserId) => {
    if (!workspace || !isHost) return
    const myUid = workspace.getUserId ? workspace.getUserId() : null
    if (targetUserId === myUid) return
    const frozenMap = workspace.ydoc.getMap('frozen')
    frozenMap.set(targetUserId, true)
    logEvent('host', `Stopped editing for user ${targetUserId}`)
    showToast('Stopped editing for collaborator', 'info')
  }, [workspace, isHost, logEvent, showToast])

  const handleResumeUser = useCallback((targetUserId) => {
    if (!workspace || !isHost) return
    const frozenMap = workspace.ydoc.getMap('frozen')
    frozenMap.delete(targetUserId)
    logEvent('host', `Resumed editing for user ${targetUserId}`)
    showToast('Resumed editing for collaborator', 'success')
  }, [workspace, isHost, logEvent, showToast])

  // Chat Sidebar Toggle & Unread Count Tracking
  const handleToggleChat = useCallback(() => {
    setIsChatOpen((prev) => {
      const next = !prev
      if (next) setUnreadChatCount(0)
      return next
    })
  }, [])

  useEffect(() => {
    if (!workspace?.ydoc) return
    const chatArray = workspace.ydoc.getArray('chat')
    let prevLength = chatArray.length

    const handleChatChange = () => {
      const currentLength = chatArray.length
      // If chat is emptied (e.g. host cleared chat), reset unread count immediately
      if (currentLength === 0) {
        setUnreadChatCount(0)
        prevLength = 0
        return
      }

      if (!isChatOpen) {
        const addedDelta = currentLength - prevLength
        if (addedDelta > 0) {
          const myUserId = workspace.getUserId ? workspace.getUserId() : null
          const joinedAt = getChatJoinedAt(session?.roomId, myUserId)
          const cutoff = joinedAt - 2000

          const latestItems = chatArray.toArray().slice(-addedDelta)
          const fromOthers = latestItems.filter((m) => {
            if (!m || m.userId === myUserId) return false
            const mTime = getMessageTime(m)
            return mTime >= cutoff
          }).length

          if (fromOthers > 0) {
            setUnreadChatCount((prev) => prev + fromOthers)
          }
        }
      }
      prevLength = currentLength
    }

    chatArray.observe(handleChatChange)
    return () => {
      chatArray.unobserve(handleChatChange)
    }
  }, [workspace, isChatOpen])

  // Active Y.Text based on mode and review tab
  const isDraftEditing = isNonHostReview && reviewTab === 'draft'
  const isMainReadOnly = isNonHostReview && reviewTab === 'main'

  let activeYText = null
  if (workspace && activeFile) {
    if (isDraftEditing) {
      activeYText = workspace.getDraft(activeFile)
    } else {
      activeYText = workspace.getText(activeFile)
    }
  }

  // Review Mode Actions
  const handleSetMode = useCallback(
    (newMode) => {
      if (!workspace || !workspace.setMode) return
      workspace.setMode(newMode)
      setMode(newMode)
      logEvent('mode', `Host changed room mode to ${newMode.toUpperCase()}`)
    },
    [workspace, logEvent]
  )

  const handlePushDraft = useCallback(
    (message) => {
      if (!workspace || !workspace.pushDraft || !activeFile || isCurrentUserStopped) return
      workspace.pushDraft(activeFile, message)
      showToast('Draft proposal submitted for host review.', 'success')
      logEvent('review', `Pushed draft proposal for "${activeFile}"`)
      setIsPushDraftOpen(false)
    },
    [workspace, activeFile, isCurrentUserStopped, showToast, logEvent]
  )

  const handleAcceptProposal = useCallback(
    (id) => {
      if (!workspace || !workspace.acceptProposal) return
      workspace.acceptProposal(id)
      showToast('Proposal accepted and applied to main file.', 'success')
      logEvent('review', `Accepted proposal ${id}`)
    },
    [workspace, showToast, logEvent]
  )

  const handleRejectProposal = useCallback(
    (id) => {
      if (!workspace || !workspace.rejectProposal) return
      workspace.rejectProposal(id)
      showToast('Proposal rejected.', 'danger')
      logEvent('review', `Rejected proposal ${id}`)
    },
    [workspace, showToast, logEvent]
  )

  const handleRevertProposal = useCallback(
    (id) => {
      if (!workspace || !workspace.revertProposal) return
      workspace.revertProposal(id)
      showToast('Proposal reverted from main file.', 'info')
      logEvent('review', `Reverted proposal ${id}`)
    },
    [workspace, showToast, logEvent]
  )

  const handleTransferHost = useCallback(
    (targetUserId, targetName) => {
      if (!workspace || !workspace.transferHost) {
        showToast('Host transfer is not supported by sync engine.', 'danger')
        return
      }
      if (!targetUserId) {
        showToast('Could not identify target user ID.', 'danger')
        return
      }
      const ok = workspace.transferHost(targetUserId)
      if (ok) {
        // Clear frozen state of the new host
        const frozenMap = workspace.ydoc.getMap('frozen')
        if (frozenMap.has(targetUserId)) {
          frozenMap.delete(targetUserId)
        }
        setHostId(targetUserId)
        logEvent('host', `Transferred host to ${targetName || targetUserId}`)
      } else {
        showToast('Failed to transfer host. You must be the active host.', 'danger')
      }
    },
    [workspace, showToast, logEvent]
  )

  // File operations
  const handleSelectFile = (fileName) => {
    setActiveFile(fileName)
    setOpenFiles((prev) => (prev.includes(fileName) ? prev : [...prev, fileName]))
    if (followingUserId) {
      setFollowingUserId(null)
    }
    logEvent('editor', `Opened file "${fileName}"`)
  }

  const handleSelectTab = (fileName) => {
    setActiveFile(fileName)
  }

  const handleCloseTab = (fileName) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== fileName)
      if (activeFile === fileName) {
        setActiveFile(next.length > 0 ? next[next.length - 1] : null)
      }
      return next
    })
  }

  // Jump to Person's File & Line
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

  // Toggle Follow Mode
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

  // User interaction in editor unhooks follow mode
  const handleUserInteraction = useCallback(() => {
    if (followingUserId) {
      setFollowingUserId(null)
      logEvent('editor', 'Follow mode stopped due to local interaction')
    }
  }, [followingUserId, logEvent])

  // Follow synchronization effect
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
    if (!workspace || isCurrentUserStopped) return
    const initialContent = getInitialTemplate(fileName)
    const text = workspace.createFile(fileName, initialContent)
    if (text) {
      setFiles(workspace.listFiles())
      setActiveFile(fileName)
      setOpenFiles((prev) => (prev.includes(fileName) ? prev : [...prev, fileName]))
      logEvent('file', `Created new file "${fileName}"`)
    }
  }

  const handleDeleteFile = (fileName) => {
    if (!workspace || isCurrentUserStopped) return
    workspace.deleteFile(fileName)
    removeUndoManager(fileName)
    setFiles(workspace.listFiles())
    setOpenFiles((prev) => prev.filter((f) => f !== fileName))
    logEvent('file', `Deleted file "${fileName}"`)
  }

  // Import folder of files into workspace (one-time copy)
  const handleImportFolder = useCallback(
    async (fileList) => {
      if (!workspace || !isHost || isCurrentUserStopped) return
      if (!fileList || fileList.length === 0) return

      const allowedExts = ['html', 'css', 'js', 'json', 'md', 'py', 'c', 'cpp', 'java', 'txt']
      const candidates = []

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]
        const relPath = file.webkitRelativePath
          ? file.webkitRelativePath.split('/').slice(1).join('/')
          : file.name

        if (!relPath) continue

        // Check ignored folders (node_modules, .git)
        const parts = relPath.split('/')
        if (parts.some((p) => p === 'node_modules' || p.startsWith('.git'))) {
          continue
        }

        // Check extension
        const ext = getFileExtension(relPath)
        if (!ext || !allowedExts.includes(ext)) {
          continue
        }

        // Check size (skip files over 1 MB)
        if (file.size > 1024 * 1024) {
          continue
        }

        candidates.push({ file, relPath })
      }

      if (candidates.length === 0) {
        showToast('No supported text files found in selected folder.', 'danger')
        return
      }

      let toImport = candidates
      if (toImport.length > 200) {
        toImport = toImport.slice(0, 200)
        showToast('Folder exceeds 200 files. Importing first 200 files.', 'info')
      }

      let importedCount = 0
      for (const item of toImport) {
        const { file, relPath } = item
        try {
          const content = await file.text()
          const currentFiles = workspace.listFiles()
          if (currentFiles.includes(relPath)) {
            const confirmed = window.confirm(`File "${relPath}" already exists. Overwrite with imported file?`)
            if (!confirmed) continue
            const ytext = workspace.getText(relPath)
            if (ytext) {
              workspace.ydoc.transact(() => {
                ytext.delete(0, ytext.length)
                ytext.insert(0, content)
              })
              importedCount++
            }
          } else {
            workspace.createFile(relPath, content)
            importedCount++
          }
        } catch (err) {
          console.warn(`Failed reading file "${relPath}":`, err)
        }
      }

      if (importedCount > 0) {
        const allFiles = workspace.listFiles()
        setFiles(allFiles)
        if (allFiles.includes('index.html')) {
          setActiveFile('index.html')
        } else if (toImport.length > 0 && allFiles.includes(toImport[0].relPath)) {
          setActiveFile(toImport[0].relPath)
        }
        logEvent('file', `Imported ${importedCount} files from folder`)
        showToast(`Imported ${importedCount} files into room.`, 'success')
      }
    },
    [workspace, isHost, isCurrentUserStopped, showToast, logEvent]
  )

  // Save current file to disk
  const handleSaveCurrentFile = useCallback(() => {
    if (!activeFile || !activeYText) return
    downloadFile(activeFile, activeYText.toString())
    logEvent('save', `Downloaded "${activeFile}" to computer`)
  }, [activeFile, activeYText, logEvent])

  // Download all files as a .zip
  const handleDownloadAllZip = useCallback(() => {
    if (!workspace) return
    downloadAllAsZip(workspace, session?.roomId)
    logEvent('save', 'Exported full project as .zip archive')
  }, [workspace, session, logEvent])

  // Stop Code Execution
  const handleStopCode = useCallback(() => {
    if (jsTimeoutRef.current) {
      clearTimeout(jsTimeoutRef.current)
      jsTimeoutRef.current = null
    }

    if (pythonWorkerRef.current) {
      pythonWorkerRef.current.terminate()
      pythonWorkerRef.current = null
      setIsRunning(false)
      addOutput('stderr', 'Execution terminated by user.')
      logEvent('run', 'Python execution terminated by user')
    }

    if (jsWorkerRef.current) {
      jsWorkerRef.current.terminate()
      jsWorkerRef.current = null
      setIsRunning(false)
      addOutput('stderr', 'Execution terminated by user.')
      logEvent('run', 'JavaScript execution terminated by user')
    }
  }, [addOutput, logEvent])

  // Run Code
  const handleRunCode = useCallback(() => {
    if (!activeFile || !activeYText) return

    const ext = getFileExtension(activeFile)
    const code = activeYText.toString()

    setIsOutputOpen(true)
    setIsRunning(true)
    addOutput('status', `--- Running ${activeFile} ---`)
    logEvent('run', `Executed "${activeFile}"`)

    // 1. Python Execution via Pyodide Web Worker
    if (ext === 'py') {
      if (pythonWorkerRef.current) {
        pythonWorkerRef.current.terminate()
      }
      const worker = new Worker('/python-worker.js', { type: 'module' })
      pythonWorkerRef.current = worker

      worker.onmessage = (e) => {
        const { type, data, message, duration } = e.data
        if (type === 'stdout') {
          addOutput('stdout', data)
        } else if (type === 'stderr') {
          addOutput('stderr', data)
        } else if (type === 'status') {
          addOutput('status', data || message)
        } else if (type === 'done') {
          setIsRunning(false)
          addOutput('status', `Finished in ${duration}s`)
        } else if (type === 'error') {
          setIsRunning(false)
          addOutput('stderr', `Error: ${data || message}`)
        }
      }

      worker.onerror = (err) => {
        setIsRunning(false)
        addOutput('stderr', `Worker Error: ${err.message}`)
      }

      worker.postMessage({ type: 'run', code })
      return
    }

    // 2. JavaScript Execution via Sandboxed Web Worker
    if (['js', 'jsx', 'mjs'].includes(ext)) {
      if (jsWorkerRef.current) {
        jsWorkerRef.current.terminate()
      }
      const worker = new Worker('/js-worker.js')
      jsWorkerRef.current = worker

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
          addOutput('status', `Finished in ${duration}s`)
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
      const getFileContent = (path) => {
        if (!workspace) return null
        const text = workspace.getText(path)
        return text ? text.toString() : null
      }

      const { html: resolvedHtml, missingFiles } = resolveHtmlAssets(code, activeFile, getFileContent)
      setHtmlContent(resolvedHtml)
      setIsRunning(false)

      if (missingFiles.length > 0) {
        missingFiles.forEach((f) => {
          addOutput('stderr', `${f.raw} not found in this room`)
        })
      }
      addOutput('status', `Live HTML preview loaded for ${activeFile}`)
      logEvent('run', `Opened HTML live preview for "${activeFile}"`)
      return
    }

    // 4. Other languages
    setIsRunning(false)
    addOutput('stderr', `Running ${ext.toUpperCase()} is not supported offline.`)
  }, [activeFile, activeYText, addOutput, logEvent, workspace])

  // Global Keyboard Shortcuts (Ctrl+S for Save, Ctrl+Enter for Run)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveCurrentFile()
      }
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

  // Undo / Redo for active file or personal draft
  const activeCacheKey = isDraftEditing ? `draft:${activeFile}` : activeFile
  const activeUndoManager =
    workspace && activeFile && activeYText
      ? getUndoManager(activeCacheKey, activeYText)
      : null

  const activeDepths = activeFile && undoDepths[activeCacheKey]
    ? undoDepths[activeCacheKey]
    : {
        undo: activeUndoManager?.undoStack?.length || 0,
        redo: activeUndoManager?.redoStack?.length || 0
      }

  const handleUndo = () => {
    if (isCurrentUserStopped) return
    if (activeUndoManager) {
      activeUndoManager.undo()
      logEvent('undo', `Performed Undo on "${activeCacheKey}"`)
    }
  }

  const handleRedo = () => {
    if (isCurrentUserStopped) return
    if (activeUndoManager) {
      activeUndoManager.redo()
      logEvent('redo', `Performed Redo on "${activeCacheKey}"`)
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
  const pendingCount = proposals.filter((p) => p.status === 'pending').length

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
        isHost={isHost}
        mode={mode}
        onSetMode={handleSetMode}
        pendingProposalsCount={pendingCount}
        onOpenReviewDrawer={() => setIsReviewDrawerOpen(true)}
        onOpenPushDraft={() => setIsPushDraftOpen(true)}
        isChatOpen={isChatOpen}
        onToggleChat={handleToggleChat}
        unreadChatCount={unreadChatCount}
        isStopped={isCurrentUserStopped}
      />

      {/* Stopped by Host Banner */}
      {isCurrentUserStopped && (
        <div
          className="stopped-banner"
          style={{
            background: '#7f1d1d',
            color: '#fef2f2',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #991b1b',
            letterSpacing: '0.2px'
          }}
        >
          The host has stopped your editing.
        </div>
      )}

      {/* Offline Connection Error Banner */}
      {status === 'offline' && (
        <div className="offline-alert-banner">
          <span>Cannot reach the server. Check the link and Wi-Fi. (Offline editing is enabled &mdash; your changes will automatically sync when reconnected)</span>
          <button
            type="button"
            className="btn-flat btn-secondary btn-retry"
            onClick={() => workspaceRef.current?.goOnline()}
          >
            Retry Connection
          </button>
        </div>
      )}

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
          isStopped={isCurrentUserStopped}
          isHost={isHost}
          onImportFolder={handleImportFolder}
        />

        {/* Center: CodeMirror 6 Editor with Bottom Output Panel */}
        <div className="editor-and-output-column">
          <Editor
            activeFile={activeFile}
            openFiles={openFiles.length > 0 ? openFiles : (activeFile ? [activeFile] : [])}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            ytext={activeYText}
            awareness={workspace.awareness}
            remoteUsersViewingThisFile={remoteUsersInSameFile}
            targetScrollLine={targetScrollLine}
            onUserInteraction={handleUserInteraction}
            onCursorChange={setCursorPos}
            readOnly={isMainReadOnly || isCurrentUserStopped}
            isReviewMode={isNonHostReview}
            isDraft={isDraftEditing}
            onSwitchReviewTab={(tab) => setReviewTab(tab)}
            onPushDraft={() => setIsPushDraftOpen(true)}
            onPointersChange={setPointersReceivedCount}
            isStopped={isCurrentUserStopped}
            frozenUserIds={frozenUserIds}
          />

          {/* Bottom Output & Preview Panel */}
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
          isHost={isHost}
          onTransferHost={handleTransferHost}
          onStopUser={handleStopUser}
          onResumeUser={handleResumeUser}
          frozenUserIds={frozenUserIds}
        />

        {/* Collapsible Chat Sidebar */}
        <ChatPanel
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          workspace={workspace}
          session={session}
          isHost={isHost}
        />
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        status={status}
        onToggleOnline={handleToggleOnline}
        usersCount={users.length}
        activeLanguage={getLanguageName(activeFile)}
        cursorPos={cursorPos}
        isHost={isHost}
        mode={mode}
      />

      {/* Host Review Proposals Drawer */}
      <ReviewDrawer
        isOpen={isReviewDrawerOpen}
        onClose={() => setIsReviewDrawerOpen(false)}
        proposals={proposals}
        onAccept={handleAcceptProposal}
        onReject={handleRejectProposal}
        onRevert={handleRevertProposal}
        isHost={isHost}
      />

      {/* Push Draft Proposal Modal */}
      <PushDraftModal
        isOpen={isPushDraftOpen}
        onClose={() => setIsPushDraftOpen(false)}
        onSubmit={handlePushDraft}
        fileName={activeFile}
      />

      {/* Live Toast Notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast-message toast-${t.type}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}

      {/* Demo & Debug Panel Drawer */}
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
        mode={mode}
        hostId={hostId}
        pendingProposalsCount={pendingCount}
        pointersReceivedCount={pointersReceivedCount}
      />
    </div>
  )
}
