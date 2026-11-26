import { useState, useEffect, useRef, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
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
  resolveHtmlAssets,
  normalizeLineEndings,
  SUPPORTED_EXTENSIONS,
  validateFileName,
  pickUniqueColor,
  copyToClipboard,
  COLLABORATOR_PALETTE
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
import { improveCodeWithGemini } from './ai/gemini'
import AiKeyModal from './components/AiKeyModal'
import AiReviewModal from './components/AiReviewModal'
import AiChatPanel from './components/AiChatPanel'
import { loadAiUsage, addUsageSample, resetAiUsage } from './utils/aiStorage'
import { DEFAULT_PREFS } from './components/CustomizePopover'
import { runRemoteCode, isOnlineLanguage } from './run/remote.js'
import { parsePythonTraceback, parseJsError, parseHtmlError } from './utils/errorParser'
import {
  isFileSystemAccessSupported,
  isSaveFilePickerSupported,
  isOpenFilePickerSupported,
  isBraveBrowser,
  getSavePickerOptions,
  UNSUPPORTED_FS_TOOLTIP,
  saveLinkedHandle,
  removeLinkedHandle,
  clearRoomLinkedHandles,
  loadRoomLinkedHandles,
  queryReadWritePermission,
  ensureReadWritePermission,
  isDiskFileNonEmpty,
  writeTextToHandle
} from './utils/diskLink'

function getServerHttpBase() {
  if (typeof window !== 'undefined' && window.location && window.location.port === '5173') {
    return `http://${window.location.hostname || 'localhost'}:1234`
  }
  return ''
}

function cleanupLocalRoomPersistence(roomId) {
  if (typeof window === 'undefined' || !roomId) return
  const cleanRoom = roomId.trim().toLowerCase()
  if (!cleanRoom) return

  if (window.indexedDB) {
    try {
      window.indexedDB.deleteDatabase(`offcode-${cleanRoom}`)
    } catch (_) {}
    clearRoomLinkedHandles(cleanRoom)
  }

  if (window.localStorage) {
    try {
      const keysToRemove = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && (k.includes(cleanRoom) || k.startsWith(`chatJoinedAt:${cleanRoom}`))) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k))
    } catch (_) {}
  }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [currentUserColor, setCurrentUserColor] = useState(null)
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
  const [runs, setRuns] = useState([])
  const [isOutputOpen, setIsOutputOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [htmlContent, setHtmlContent] = useState('')
  const [pendingInputPrompt, setPendingInputPrompt] = useState(null)
  const [errorHighlight, setErrorHighlight] = useState(null)
  const [clearErrorHighlightSeq, setClearErrorHighlightSeq] = useState(0)
  const activeRunIdRef = useRef(null)
  const interactivePyRef = useRef(null)
  const htmlRunContextRef = useRef({ rawHtml: '', resolvedHtml: '', fileName: '' })

  // Local-only Disk File Links & Auto-Save State
  const [linkedFiles, setLinkedFiles] = useState({})
  const [pendingLinkConflict, setPendingLinkConflict] = useState(null)
  const [pendingEmptyOverwrite, setPendingEmptyOverwrite] = useState(null)
  const [relinkPrompt, setRelinkPrompt] = useState(null)
  const [showLiveSaveGuideToast, setShowLiveSaveGuideToast] = useState(false)
  const [isLiveSaveGuideOpen, setIsLiveSaveGuideOpen] = useState(false)
  const [isAiChatOpen, setIsAiChatOpen] = useState(false)
  const [pendingAiQuote, setPendingAiQuote] = useState(null)
  const [aiUsageState, setAiUsageState] = useState(() => loadAiUsage())
  const [aiInlineStatus, setAiInlineStatus] = useState(null)
  const editorActionsRef = useRef(null)
  const lastWrittenRef = useRef({})
  const autoSaveTimersRef = useRef({})
  const failedAutoSaveRef = useRef(new Set())
  const fallbackFileInputRef = useRef(null)

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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isMobilePeopleOpen, setIsMobilePeopleOpen] = useState(false)
  const [showUserChanges, setShowUserChanges] = useState(() => {
    try {
      return window.localStorage.getItem('offcode_show_user_changes') === 'true'
    } catch (_) {
      return false
    }
  })

  // AI Assist State
  const [aiKey, setAiKey] = useState(() => {
    try {
      return window.localStorage.getItem('offcode-gemini-key') || ''
    } catch (_) {
      return ''
    }
  })
  const [isAiKeyModalOpen, setIsAiKeyModalOpen] = useState(false)
  const [pendingAiImprove, setPendingAiImprove] = useState(null)
  const [isAiReviewOpen, setIsAiReviewOpen] = useState(false)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [aiResult, setAiResult] = useState(null)
  const [aiTarget, setAiTarget] = useState(null)
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const aiAbortControllerRef = useRef(null)

  // OffCode Dual Theme State (dark/light)
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem('offcode-theme')
      if (saved === 'dark' || saved === 'light') return saved
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light'
      }
    } catch (_) {}
    return 'dark'
  })

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      window.localStorage.setItem('offcode-theme', theme)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', theme === 'dark' ? '#0B0C0F' : '#F5F2EB')
    } catch (_) {}
  }, [theme])

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const handleToggleShowUserChanges = useCallback(() => {
    setShowUserChanges((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem('offcode_show_user_changes', String(next))
      } catch (_) {}
      return next
    })
  }, [])

  // OffCode Layout State (resizable & collapsible Explorer & People)
  const [layout, setLayout] = useState(() => {
    const defaults = {
      sidebarWidth: 240,
      sidebarCollapsed: typeof window !== 'undefined' && window.innerWidth < 900,
      peopleWidth: 260,
      peopleCollapsed: typeof window !== 'undefined' && window.innerWidth < 900
    }
    try {
      const explicitCollapsed = window.localStorage.getItem('offcode-sidebar-collapsed')
      if (explicitCollapsed !== null) {
        defaults.sidebarCollapsed = explicitCollapsed === 'true'
      }
      const saved = window.localStorage.getItem('offcode-layout')
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          ...defaults,
          ...parsed,
          sidebarCollapsed: explicitCollapsed !== null ? explicitCollapsed === 'true' : (parsed.sidebarCollapsed ?? defaults.sidebarCollapsed),
          peopleCollapsed: typeof window !== 'undefined' && window.innerWidth < 900 ? true : (parsed.peopleCollapsed ?? defaults.peopleCollapsed)
        }
      }
    } catch (_) {}
    return defaults
  })

  const updateLayout = useCallback((updater) => {
    setLayout((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      try {
        window.localStorage.setItem('offcode-layout', JSON.stringify(next))
        window.localStorage.setItem('offcode-sidebar-collapsed', String(Boolean(next.sidebarCollapsed)))
      } catch (_) {}
      return next
    })
  }, [])

  // Ctrl+B (or Cmd+B) shortcut to toggle Explorer sidebar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        updateLayout((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [updateLayout])

  // Drag resizers for Sidebar & People
  const handleSidebarResizeStart = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = layout.sidebarWidth

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(180, Math.min(420, startWidth + delta))
      const peopleW = layout.peopleCollapsed ? 40 : layout.peopleWidth
      if (window.innerWidth - newWidth - peopleW >= 360) {
        updateLayout((prev) => ({ ...prev, sidebarWidth: newWidth }))
      }
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [layout, updateLayout])

  const handlePeopleResizeStart = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = layout.peopleWidth

    const onMouseMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX
      const newWidth = Math.max(220, Math.min(420, startWidth + delta))
      const sidebarW = layout.sidebarCollapsed ? 40 : layout.sidebarWidth
      if (window.innerWidth - sidebarW - newWidth >= 360) {
        updateLayout((prev) => ({ ...prev, peopleWidth: newWidth }))
      }
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [layout, updateLayout])

  // Editor preferences & Customize popover
  const [editorPrefs, setEditorPrefs] = useState(() => {
    try {
      const saved = window.localStorage.getItem('offcode-editor-prefs')
      if (saved) return { ...DEFAULT_PREFS, ...JSON.parse(saved) }
    } catch (_) {}
    return DEFAULT_PREFS
  })

  const handleUpdateEditorPrefs = useCallback((updater) => {
    setEditorPrefs((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      try {
        window.localStorage.setItem('offcode-editor-prefs', JSON.stringify(next))
      } catch (_) {}
      return next
    })
  }, [])

  // Exit focus mode with Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && editorPrefs.focusMode) {
        handleUpdateEditorPrefs((prev) => ({ ...prev, focusMode: false }))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editorPrefs.focusMode, handleUpdateEditorPrefs])

  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)

  const workspaceRef = useRef(null)
  const prevHostRef = useRef(null)
  const pythonWorkerRef = useRef(null)
  const jsWorkerRef = useRef(null)
  const jsTimeoutRef = useRef(null)
  const colorConflictTimerRef = useRef(null)
  const remoteAbortControllerRef = useRef(null)

  const [showOnlineNotice, setShowOnlineNotice] = useState(false)
  const [outputFooterNote, setOutputFooterNote] = useState('')
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false)
  const [modalFileName, setModalFileName] = useState('')

  const handleDismissOnlineNotice = useCallback(() => {
    setShowOnlineNotice(false)
    try {
      window.sessionStorage.setItem('offcode-dismissed-online-notice', 'true')
    } catch (_) {}
  }, [])

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

  // Run helpers for structured OutputPanel
  const startRun = useCallback((fileName) => {
    const id = `${Date.now()}-${Math.random()}`
    activeRunIdRef.current = id
    setClearErrorHighlightSeq((s) => s + 1)
    setErrorHighlight(null)
    setRuns((prev) => [
      ...prev,
      {
        id,
        fileName,
        startTime: new Date().toLocaleTimeString(),
        status: 'running',
        duration: null,
        items: []
      }
    ])
    return id
  }, [])

  const appendRunItem = useCallback((runId, item) => {
    const itemWithId = { id: `${Date.now()}-${Math.random()}`, ...item }
    setRuns((prev) =>
      prev.map((r) => (r.id === runId ? { ...r, items: [...r.items, itemWithId] } : r))
    )
  }, [])

  const finishRun = useCallback((runId, status, duration = null) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === runId ? { ...r, status, duration } : r))
    )
  }, [])

  const resetRunItems = useCallback((runId) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === runId ? { ...r, status: 'running', items: [] } : r))
    )
  }, [])

  const handleJumpToError = useCallback(({ fileName, line, col }) => {
    if (!fileName || !line) return
    if (files.includes(fileName)) {
      if (activeFile !== fileName) {
        setActiveFile(fileName)
      }
      setOpenFiles((prev) => (prev.includes(fileName) ? prev : [...prev, fileName]))
    }
    setErrorHighlight({ file: fileName, line, col: col || 1, seq: Date.now() })
  }, [files, activeFile])

  const handleHtmlError = useCallback((errPayload) => {
    const runId = activeRunIdRef.current
    if (!runId) return
    const { rawHtml, resolvedHtml, fileName } = htmlRunContextRef.current
    const parsedError = parseHtmlError(errPayload, rawHtml, resolvedHtml, fileName)
    appendRunItem(runId, { kind: 'error', parsedError })
    finishRun(runId, 'error', null)
  }, [appendRunItem, finishRun])

  // Display user-facing toast notification
  const showToast = useCallback((text, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  // Dynamic document title
  useEffect(() => {
    if (session?.roomId) {
      document.title = `OffCode - ${session.roomId}`
    } else {
      document.title = 'OffCode — Collaborative Code Editor'
    }
  }, [session?.roomId])

  // Join workspace
  const handleJoin = ({ userName, roomId, password = '' }) => {
    updateUrlRoom(roomId)
    let savedPref = null
    try {
      savedPref = window.localStorage.getItem('offcode-pref-color')
    } catch (_) {}
    const autoColor = pickUniqueColor([], savedPref)
    try {
      window.localStorage.setItem('offcode-pref-color', autoColor)
    } catch (_) {}
    setCurrentUserColor(autoColor)
    setSession({ userName, roomId, userColor: autoColor, password })
    logEvent('session', `Joined room "${roomId}" as ${userName}`)
  }

  // Leave workspace
  const handleLeaveRoom = () => {
    if (colorConflictTimerRef.current) {
      clearTimeout(colorConflictTimerRef.current)
      colorConflictTimerRef.current = null
    }
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
    Object.values(autoSaveTimersRef.current).forEach((t) => clearTimeout(t))
    autoSaveTimersRef.current = {}
    lastWrittenRef.current = {}
    failedAutoSaveRef.current.clear()
    setLinkedFiles({})
    setRelinkPrompt(null)

    setWorkspace(null)
    setSession(null)
    setCurrentUserColor(null)
    setFiles([])
    setActiveFile(null)
    setOpenFiles([])
    setUsers([])
    updateUrlRoom('')
  }

  // Triggered when user clicks Leave Room in TopBar: show warning first
  const handleRequestLeaveRoom = () => {
    setIsLeaveModalOpen(true)
  }

  // Confirmed leave: shuts down room completely if empty & deletes all room files
  const executeLeaveRoom = async () => {
    setIsLeaveModalOpen(false)
    const currentRoom = session?.roomId
    const isLastUser = users.length <= 1

    if (workspaceRef.current) {
      try {
        workspaceRef.current.destroy()
      } catch (_) {}
      workspaceRef.current = null
    }

    if (currentRoom && isLastUser) {
      try {
        await fetch(`${getServerHttpBase()}/api/rooms/shutdown/${encodeURIComponent(currentRoom)}`, {
          method: 'POST'
        })
      } catch (err) {
        console.warn('Error requesting room shutdown:', err)
      }
    }

    cleanupLocalRoomPersistence(currentRoom)
    handleLeaveRoom()
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

    const { roomId, userName, userColor, password } = session
    const ws = createWorkspace({
      roomId,
      userName,
      userColor,
      password,
      serverUrl: getDefaultServerUrl()
    })
    workspaceRef.current = ws
    setWorkspace(ws)

    // Put userId in awareness without overwriting other fields
    const myId = ws.getUserId ? ws.getUserId() : null
    if (ws.awareness && myId) {
      ws.awareness.setLocalStateField('userId', myId)
    }

    // Resolve initial automatic unique color from awareness
    const initialOtherColors = []
    ws.awareness.getStates().forEach((st, cid) => {
      if (cid !== ws.ydoc.clientID && st.user?.color) {
        initialOtherColors.push(st.user.color)
      }
    })
    let savedPrefColor = null
    try {
      savedPrefColor = window.localStorage.getItem('offcode-pref-color')
    } catch (_) {}
    const assignedColor = pickUniqueColor(initialOtherColors, savedPrefColor)
    try {
      window.localStorage.setItem('offcode-pref-color', assignedColor)
    } catch (_) {}

    const curLocalUser = ws.awareness.getLocalState()?.user || {}
    ws.awareness.setLocalStateField('user', {
      ...curLocalUser,
      name: userName,
      color: assignedColor
    })
    setCurrentUserColor(assignedColor)

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

      const otherUsers = []
      states.forEach((state, clientId) => {
        if (state.user) {
          const resolvedUserId = state.userId || state.user.userId || state.user.id || `client_${clientId}`
          const userItem = {
            clientId,
            userId: resolvedUserId,
            name: state.user.name || 'Anonymous',
            color: state.user.color || '#cccccc',
            currentFile: state.currentFile || null,
            currentLine: state.currentLine || 1,
            isYou: clientId === myClientId
          }
          list.push(userItem)
          if (clientId !== myClientId) {
            otherUsers.push(userItem)
          }
        }
      })
      const hasMe = list.some((u) => u.isYou)
      if (!hasMe && myId) {
        list.unshift({
          clientId: myClientId,
          userId: myId,
          name: userName,
          color: assignedColor,
          currentFile: activeFile,
          currentLine: 1,
          isYou: true
        })
      }
      setUsers(list)

      // Automatic conflict handling (Phase 4):
      // If two people end up with the same color, the person with the lexicographically
      // larger userId switches to the next free color within a second quietly (no toast).
      const myState = states.get(myClientId)
      const myLocalUser = myState?.user
      const myLocalColor = myLocalUser?.color
      if (myId && myLocalColor) {
        const collisions = otherUsers.filter(
          (u) => u.color && u.color.toLowerCase() === myLocalColor.toLowerCase()
        )
        if (collisions.length > 0) {
          const mustYield = collisions.some((other) => String(myId) > String(other.userId))
          if (mustYield && !colorConflictTimerRef.current) {
            colorConflictTimerRef.current = setTimeout(() => {
              colorConflictTimerRef.current = null
              const activeOtherColors = otherUsers.map((u) => u.color).filter(Boolean)
              const nextColor = pickUniqueColor(activeOtherColors, null)
              try {
                window.localStorage.setItem('offcode-pref-color', nextColor)
              } catch (_) {}
              const curUser = ws.awareness.getLocalState()?.user || {}
              ws.awareness.setLocalStateField('user', {
                ...curUser,
                color: nextColor
              })
              setCurrentUserColor(nextColor)
            }, 500)
          }
        }
      }
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

    let didUnloadCleanup = false
    const handlePageUnload = () => {
      if (didUnloadCleanup) return
      didUnloadCleanup = true

      let otherActivePeers = 0
      try {
        const states = ws.awareness.getStates()
        const myCid = ws.ydoc.clientID
        states.forEach((st, cid) => {
          if (cid !== myCid && st && st.user) {
            otherActivePeers++
          }
        })
      } catch (_) {}

      try {
        ws.awareness.setLocalState(null)
      } catch (_) {}

      const cleanRoom = roomId ? roomId.trim().toLowerCase() : ''
      if (cleanRoom && otherActivePeers === 0) {
        const shutdownUrl = `${getServerHttpBase()}/api/rooms/shutdown/${encodeURIComponent(cleanRoom)}`
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(shutdownUrl, '')
          } else if (typeof fetch === 'function') {
            fetch(shutdownUrl, { method: 'POST', keepalive: true }).catch(() => {})
          }
        } catch (_) {}
      }

      if (workspaceRef.current === ws) {
        workspaceRef.current = null
      }
      try {
        ws.destroy()
      } catch (_) {}
      cleanupLocalRoomPersistence(cleanRoom)
    }

    window.addEventListener('pagehide', handlePageUnload)
    window.addEventListener('beforeunload', handlePageUnload)

    return () => {
      if (colorConflictTimerRef.current) {
        clearTimeout(colorConflictTimerRef.current)
        colorConflictTimerRef.current = null
      }
      window.removeEventListener('pagehide', handlePageUnload)
      window.removeEventListener('beforeunload', handlePageUnload)
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
  }, [session?.roomId, session?.userName, session?.password, logEvent])

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
          const cleanRoom = (session?.roomId || 'default').trim().toLowerCase()
          let chatClearedAt = 0
          let hiddenIds = new Set()
          try {
            const rawHidden = window.localStorage.getItem(`offcode-chat-hidden:${cleanRoom}`)
            if (rawHidden) {
              const parsed = JSON.parse(rawHidden)
              if (parsed.clearedBefore) chatClearedAt = parsed.clearedBefore
              if (Array.isArray(parsed.hiddenIds)) hiddenIds = new Set(parsed.hiddenIds)
            } else {
              const savedCleared = window.localStorage.getItem(`chatClearedAt:${cleanRoom}`)
              if (savedCleared) chatClearedAt = parseInt(savedCleared, 10) || 0
              const savedHidden = window.localStorage.getItem(`chatHidden:${cleanRoom}`)
              if (savedHidden) hiddenIds = new Set(JSON.parse(savedHidden))
            }
          } catch (_) {}

          const cutoff = Math.max(joinedAt - 2000, chatClearedAt)
          const latestItems = chatArray.toArray().slice(-addedDelta)
          const fromOthers = latestItems.filter((m) => {
            if (!m || m.userId === myUserId) return false
            if (m.id && hiddenIds.has(m.id)) return false
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
  const isDraftEditing = isReviewMode && reviewTab === 'draft'
  const isMainReadOnly = isReviewMode && reviewTab === 'main'

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

  // AI Assist Logic
  const executeAiImprovement = useCallback(async (keyToUse, target) => {
    setIsAiReviewOpen(true)
    setIsAiLoading(true)
    setAiError(null)
    setAiResult(null)
    setAiTarget(target)

    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort()
    }
    const controller = new AbortController()
    aiAbortControllerRef.current = controller

    try {
      const res = await improveCodeWithGemini({
        apiKey: keyToUse,
        fullText: target.fullText,
        selectedText: target.selectedText,
        from: target.from,
        to: target.to,
        signal: controller.signal
      })
      setAiResult(res)
      if (res?.usage) {
        setAiUsageState((prev) => addUsageSample(prev, { category: 'improve', usage: res.usage }))
      }
      setIsAiLoading(false)
    } catch (err) {
      if (controller.signal.aborted) {
        setIsAiReviewOpen(false)
        setIsAiLoading(false)
        return
      }
      setAiError(err)
      setIsAiLoading(false)
    }
  }, [])

  const handleRecordAiUsage = useCallback((payload) => {
    setAiUsageState((prev) => addUsageSample(prev, payload))
  }, [])

  const handleRecordAiInlineUsage = useCallback((usage) => {
    setAiUsageState((prev) => addUsageSample(prev, { category: 'inline', usage }))
  }, [])

  const handleResetAiUsage = useCallback(() => {
    setAiUsageState(resetAiUsage())
    showToast('AI token usage reset', 'info')
  }, [showToast])

  const handleAskAiWithQuote = useCallback(({ fileName, startLine, endLine, text, from, to }) => {
    if (!text) return
    const previewLines = String(text).split('\n').slice(0, 3).join('\n')
    setPendingAiQuote({
      kind: 'code',
      label: `${fileName} ${startLine}-${endLine}`,
      fileName,
      startLine,
      endLine,
      text,
      preview: previewLines,
      from,
      to
    })
    setIsAiChatOpen(true)
  }, [])

  const handleAskAiExplainError = useCallback((errObj) => {
    if (!errObj) return
    const targetFile = errObj.fileName || activeFile || 'code'
    const locSuffix = errObj.line ? `:${errObj.line}` : ''
    const summaryLines = [
      errObj.title,
      errObj.sourceLine,
      errObj.caretLine,
      `${errObj.errorType || 'Error'}: ${errObj.message || ''}`
    ].filter((x) => x !== null && x !== undefined && x !== '')
    const text = summaryLines.join('\n')
    setPendingAiQuote({
      kind: 'error',
      label: `${targetFile}${locSuffix} · ${errObj.errorType || 'Error'}`,
      fileName: targetFile,
      startLine: errObj.line || null,
      endLine: errObj.line || null,
      text,
      preview: summaryLines.slice(0, 3).join('\n')
    })
    setIsAiChatOpen(true)
  }, [activeFile])

  const handleSaveAiKey = useCallback((newKey) => {
    try {
      window.localStorage.setItem('offcode-gemini-key', newKey)
    } catch (_) {}
    setAiKey(newKey)
    showToast('Gemini API key saved', 'success')

    if (pendingAiImprove) {
      const target = pendingAiImprove
      setPendingAiImprove(null)
      executeAiImprovement(newKey, target)
    }
  }, [pendingAiImprove, showToast, executeAiImprovement])

  const handleRemoveAiKey = useCallback(() => {
    try {
      window.localStorage.removeItem('offcode-gemini-key')
    } catch (_) {}
    setAiKey('')
    showToast('Removed Gemini API key', 'info')
  }, [showToast])

  const handleTriggerAi = useCallback((target) => {
    let currentKey = aiKey
    if (!currentKey) {
      try {
        currentKey = window.localStorage.getItem('offcode-gemini-key') || ''
      } catch (_) {}
    }

    if (!currentKey) {
      setPendingAiImprove(target)
      setIsAiKeyModalOpen(true)
      return
    }

    executeAiImprovement(currentKey, target)
  }, [aiKey, executeAiImprovement])

  const handleCancelOrRejectAi = useCallback(() => {
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort()
      aiAbortControllerRef.current = null
    }
    setIsAiReviewOpen(false)
    setIsAiLoading(false)
    setAiError(null)
    setAiResult(null)
    setAiTarget(null)
  }, [])

  const handleAcceptAi = useCallback(() => {
    if (!aiTarget || !aiResult?.improved) return
    const { view, from, to, selectedText } = aiTarget

    try {
      const currentRangeText = view.state.sliceDoc(from, to)
      if (currentRangeText !== selectedText) {
        showToast('The selected code changed while AI was working. Please try again.', 'error')
        handleCancelOrRejectAi()
        return
      }

      const cleanImproved = normalizeLineEndings(aiResult.improved)
      view.dispatch({
        changes: {
          from,
          to,
          insert: cleanImproved
        },
        selection: { anchor: from + cleanImproved.length }
      })
      showToast('AI improvements applied', 'success')
      logEvent('editor', 'Applied AI improvement to selected code')
    } catch (_) {
      showToast('Failed to apply changes', 'error')
    }

    handleCancelOrRejectAi()
  }, [aiTarget, aiResult, showToast, logEvent, handleCancelOrRejectAi])

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
    setIsMobileSidebarOpen(false)
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
      const closedIdx = prev.indexOf(fileName)
      const next = prev.filter((f) => f !== fileName)
      if (activeFile === fileName) {
        let newActive = null
        if (next.length > 0) {
          newActive = closedIdx < next.length ? next[closedIdx] : next[next.length - 1]
        }
        setActiveFile(newActive)
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
      setIsMobilePeopleOpen(false)
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
    const val = validateFileName(fileName, files, false, { allowNoExtension: true })
    if (!val.valid) {
      showToast(val.error, 'error')
      return
    }
    const cleanName = fileName.trim()
    const initialContent = normalizeLineEndings(getInitialTemplate(cleanName))
    const text = workspace.createFile(cleanName, initialContent)
    if (text) {
      setFiles(workspace.listFiles())
      setActiveFile(cleanName)
      setOpenFiles((prev) => (prev.includes(cleanName) ? prev : [...prev, cleanName]))
      logEvent('file', `Created new file "${cleanName}"`)
    }
  }

  const handleDeleteFile = (fileName) => {
    if (!workspace || isCurrentUserStopped) return
    workspace.deleteFile(fileName)
    removeUndoManager(fileName)
    if (linkedFiles[fileName]) {
      setLinkedFiles((prev) => {
        const next = { ...prev }
        delete next[fileName]
        return next
      })
      if (session?.roomId) removeLinkedHandle(session.roomId, fileName)
    }
    const remaining = workspace.listFiles()
    setFiles(remaining)
    setOpenFiles((prev) => prev.filter((f) => f !== fileName))
    if (activeFile === fileName) {
      setActiveFile(remaining.length > 0 ? remaining[0] : null)
    }
    logEvent('file', `Deleted file "${fileName}"`)
  }

  const handleRenameFile = useCallback(async (oldPath, newInputName) => {
    if (!workspace || isCurrentUserStopped || !oldPath || !newInputName) return
    const trimmed = newInputName.trim()
    if (!trimmed) return

    const hasSlash = trimmed.includes('/')
    const parentPrefix = !hasSlash && oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/') + 1) : ''
    const nextPath = `${parentPrefix}${trimmed}`
    if (nextPath.toLowerCase() === oldPath.toLowerCase() && nextPath === oldPath) return

    const segmentToCheck = nextPath.split('/').pop()
    const val = validateFileName(segmentToCheck, [], false, { allowNoExtension: true })
    if (!val.valid) {
      showToast(val.error, 'error')
      return
    }
    if (files.some((f) => f !== oldPath && f.toLowerCase() === nextPath.toLowerCase())) {
      showToast('A file with this name already exists', 'error')
      return
    }

    const oldTextObj = workspace.getText(oldPath)
    const content = normalizeLineEndings(oldTextObj ? oldTextObj.toString() : '')
    const created = workspace.createFile(nextPath, content)
    if (!created) return

    if (linkedFiles[oldPath]?.handle) {
      const oldLinked = linkedFiles[oldPath]
      setLinkedFiles((prev) => {
        const next = { ...prev }
        delete next[oldPath]
        next[nextPath] = oldLinked
        return next
      })
      if (lastWrittenRef.current[oldPath] !== undefined) {
        lastWrittenRef.current[nextPath] = lastWrittenRef.current[oldPath]
        delete lastWrittenRef.current[oldPath]
      }
      if (session?.roomId) {
        await removeLinkedHandle(session.roomId, oldPath)
        await saveLinkedHandle(session.roomId, nextPath, oldLinked.handle)
      }
    }

    workspace.deleteFile(oldPath)
    removeUndoManager(oldPath)

    const updatedFiles = workspace.listFiles()
    setFiles(updatedFiles)
    setOpenFiles((prev) => prev.map((f) => (f === oldPath ? nextPath : f)))
    if (activeFile === oldPath) {
      setActiveFile(nextPath)
    }
    logEvent('file', `Renamed "${oldPath}" to "${nextPath}"`)
    showToast(`Renamed to ${nextPath}`, 'success')
  }, [workspace, isCurrentUserStopped, files, linkedFiles, activeFile, session?.roomId, logEvent, showToast])

  const handleDuplicateFile = useCallback((filePath) => {
    if (!workspace || isCurrentUserStopped || !filePath) return
    const existing = workspace.listFiles()
    const lastSlash = filePath.lastIndexOf('/')
    const dirPrefix = lastSlash >= 0 ? filePath.slice(0, lastSlash + 1) : ''
    const baseName = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
    const dotIdx = baseName.lastIndexOf('.')
    const stem = dotIdx > 0 ? baseName.slice(0, dotIdx) : baseName
    const ext = dotIdx > 0 ? baseName.slice(dotIdx) : ''

    let candidate = `${dirPrefix}${stem}_copy${ext}`
    let counter = 2
    while (existing.some((f) => f.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${dirPrefix}${stem}_copy_${counter}${ext}`
      counter++
    }

    const src = workspace.getText(filePath)
    const content = normalizeLineEndings(src ? src.toString() : '')
    const created = workspace.createFile(candidate, content)
    if (created) {
      setFiles(workspace.listFiles())
      setActiveFile(candidate)
      setOpenFiles((prev) => (prev.includes(candidate) ? prev : [...prev, candidate]))
      logEvent('file', `Duplicated "${filePath}" as "${candidate}"`)
      showToast(`Created ${candidate}`, 'success')
    }
  }, [workspace, isCurrentUserStopped, logEvent, showToast])

  const handleDownloadSingleFile = useCallback((filePath) => {
    if (!workspace || !filePath) return
    const t = workspace.getText(filePath)
    const content = normalizeLineEndings(t ? t.toString() : '')
    downloadFile(filePath, content)
    showToast(`Downloaded ${filePath.split('/').pop()}`, 'success')
    logEvent('save', `Downloaded "${filePath}" to computer`)
  }, [workspace, logEvent, showToast])

  const handleCopyFileName = useCallback(async (filePath) => {
    if (!filePath) return
    const ok = await copyToClipboard(filePath)
    if (ok) {
      showToast(`Copied "${filePath}"`, 'info')
    }
  }, [showToast])

  // Remove all files / close folder from workspace
  const handleClearAllFiles = useCallback(() => {
    if (!workspace || isCurrentUserStopped) return
    const currentFiles = workspace.listFiles()
    if (currentFiles.length === 0) return

    for (const f of currentFiles) {
      workspace.deleteFile(f)
      removeUndoManager(f)
    }
    setLinkedFiles({})
    if (session?.roomId) clearRoomLinkedHandles(session.roomId)
    setFiles([])
    setOpenFiles([])
    setActiveFile(null)
    logEvent('file', 'Removed all files from workspace')
    showToast('Removed all files from workspace.', 'info')
  }, [workspace, session?.roomId, isCurrentUserStopped, removeUndoManager, logEvent, showToast])

  const linkFileToHandle = useCallback(async (fileName, handle, writtenText = undefined) => {
    if (!fileName || !handle) return
    const diskName = handle.name || fileName
    failedAutoSaveRef.current.delete(fileName)
    setLinkedFiles((prev) => ({
      ...prev,
      [fileName]: { handle, diskName }
    }))
    if (writtenText !== undefined) {
      lastWrittenRef.current[fileName] = writtenText
    }
    setRelinkPrompt((prev) => (prev && prev.fileName === fileName ? null : prev))
    if (session?.roomId) {
      await saveLinkedHandle(session.roomId, fileName, handle)
    }
  }, [session?.roomId])

  // Import folder of files into workspace (and auto-link writable handles if available)
  const handleImportFolder = useCallback(
    async (fileInput, initialSkipped = 0) => {
      if (!workspace || isCurrentUserStopped) return
      if (!fileInput) return

      let skippedCount = initialSkipped || 0
      const allowedExts = SUPPORTED_EXTENSIONS
      const candidates = []

      const items = Array.isArray(fileInput) ? fileInput : Array.from(fileInput)
      if (items.length === 0) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        let relPath = ''
        let fileObj = null
        let textContent = null
        let handle = null

        if (item.relPath) {
          relPath = item.relPath
          fileObj = item.file
          textContent = item.text
          handle = item.handle || null
        } else {
          fileObj = item
          relPath = item.webkitRelativePath
            ? item.webkitRelativePath.split('/').slice(1).join('/')
            : item.name
        }

        if (!relPath) {
          skippedCount++
          continue
        }

        // Check ignored folders (node_modules, .git)
        const parts = relPath.split('/')
        if (parts.some((p) => p === 'node_modules' || p.startsWith('.git') || p === '.DS_Store')) {
          skippedCount++
          continue
        }

        // Check extension and filename validation against allowlist
        const fileNameSegment = parts[parts.length - 1]
        const val = validateFileName(fileNameSegment, candidates.map((c) => c.relPath), false)
        if (!val.valid) {
          skippedCount++
          continue
        }

        // Check size (skip files over 1 MB)
        if (fileObj && fileObj.size > 1024 * 1024) {
          skippedCount++
          continue
        }

        candidates.push({ relPath, fileObj, textContent, handle })
      }

      if (candidates.length === 0) {
        showToast(`No supported files found (skipped ${skippedCount}).`, 'danger')
        return
      }

      let toImport = candidates
      if (toImport.length > 200) {
        skippedCount += (toImport.length - 200)
        toImport = toImport.slice(0, 200)
      }

      let importedCount = 0
      for (const item of toImport) {
        const { relPath, fileObj, textContent, handle } = item
        try {
          let content = textContent
          if (content === undefined || content === null) {
            content = await fileObj.text()
          }
          content = normalizeLineEndings(content)
          const created = workspace.createFile(relPath, content)
          if (created && handle) {
            await linkFileToHandle(relPath, handle, content)
          }
          importedCount++
        } catch (err) {
          console.warn(`Failed reading file "${relPath}":`, err)
          skippedCount++
        }
      }

      if (importedCount > 0) {
        const allFiles = workspace.listFiles()
        setFiles(allFiles)
        if (allFiles.includes('index.html')) {
          setActiveFile('index.html')
          setOpenFiles((prev) => Array.from(new Set([...prev, 'index.html'])))
        } else if (toImport.length > 0 && allFiles.includes(toImport[0].relPath)) {
          setActiveFile(toImport[0].relPath)
          setOpenFiles((prev) => Array.from(new Set([...prev, toImport[0].relPath])))
        } else {
          setActiveFile(allFiles.length > 0 ? allFiles[0] : null)
        }
        logEvent('file', `Imported ${importedCount} files from folder`)
        showToast(`Imported ${importedCount} file${importedCount === 1 ? '' : 's'}, skipped ${skippedCount}.`, 'success')
      }
    },
    [workspace, isCurrentUserStopped, linkFileToHandle, showToast, logEvent]
  )

  // Load persisted local disk file handles for this room
  useEffect(() => {
    if (!workspace || !session?.roomId) {
      setLinkedFiles({})
      lastWrittenRef.current = {}
      failedAutoSaveRef.current.clear()
      return
    }
    let cancelled = false
    loadRoomLinkedHandles(session.roomId).then((loaded) => {
      if (!cancelled) {
        setLinkedFiles(loaded || {})
      }
    })
    return () => {
      cancelled = true
    }
  }, [workspace, session?.roomId])

  const handleUnlinkFile = useCallback(async (fileName) => {
    if (!fileName) return
    if (autoSaveTimersRef.current[fileName]) {
      clearTimeout(autoSaveTimersRef.current[fileName])
      delete autoSaveTimersRef.current[fileName]
    }
    delete lastWrittenRef.current[fileName]
    failedAutoSaveRef.current.delete(fileName)
    setLinkedFiles((prev) => {
      const next = { ...prev }
      delete next[fileName]
      return next
    })
    setRelinkPrompt((prev) => (prev && prev.fileName === fileName ? null : prev))
    if (session?.roomId) {
      await removeLinkedHandle(session.roomId, fileName)
    }
    showToast(`Unlinked ${fileName}`, 'info')
  }, [session?.roomId, showToast])

  const writeLinkedFile = useCallback(async (fileName, handle, text) => {
    try {
      await writeTextToHandle(handle, text)
      lastWrittenRef.current[fileName] = text
      failedAutoSaveRef.current.delete(fileName)
      setRelinkPrompt((prev) => (prev && prev.fileName === fileName ? null : prev))
      return true
    } catch (err) {
      failedAutoSaveRef.current.add(fileName)
      setRelinkPrompt({ fileName, diskName: handle?.name || fileName })
      return false
    }
  }, [])

  const openPickedFallbackFile = useCallback(async (file) => {
    if (!workspace || !file || isCurrentUserStopped) return
    const val = validateFileName(file.name, [], false)
    if (!val.valid) {
      showToast(val.error, 'danger')
      return
    }
    const existingName = workspace
      .listFiles()
      .find((f) => f.toLowerCase() === file.name.toLowerCase())
    if (existingName) {
      setActiveFile(existingName)
      setOpenFiles((prev) => (prev.includes(existingName) ? prev : [...prev, existingName]))
      showToast(`"${existingName}" is already open in this room.`, 'info')
      return
    }
    try {
      const text = normalizeLineEndings(await file.text())
      const created = workspace.createFile(file.name, text)
      if (created) {
        setFiles(workspace.listFiles())
        setActiveFile(file.name)
        setOpenFiles((prev) => (prev.includes(file.name) ? prev : [...prev, file.name]))
        logEvent('file', `Opened "${file.name}" from computer`)
        showToast(`Opened "${file.name}" (Save downloads a copy in this browser)`, 'success')
      }
    } catch (_) {
      showToast('Could not read selected file.', 'danger')
    }
  }, [workspace, isCurrentUserStopped, logEvent, showToast])

  const handleFallbackFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      await openPickedFallbackFile(file)
    }
  }, [openPickedFallbackFile])

  // Open a single file from local computer and link its handle (with universal <input type="file"> fallback)
  const handleOpenFromComputer = useCallback(async () => {
    if (!workspace || isCurrentUserStopped) return
    if (!isOpenFilePickerSupported()) {
      fallbackFileInputRef.current?.click()
      return
    }
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false })
      if (!handle) return
      const file = await handle.getFile()
      const val = validateFileName(file.name, [], false)
      if (!val.valid) {
        showToast(val.error, 'danger')
        return
      }
      const existingName = workspace
        .listFiles()
        .find((f) => f.toLowerCase() === file.name.toLowerCase())
      if (existingName) {
        setPendingLinkConflict({
          fileName: existingName,
          handle,
          diskName: handle.name || file.name
        })
        return
      }
      const text = normalizeLineEndings(await file.text())
      const created = workspace.createFile(file.name, text)
      if (created) {
        setFiles(workspace.listFiles())
        setActiveFile(file.name)
        setOpenFiles((prev) => (prev.includes(file.name) ? prev : [...prev, file.name]))
        await ensureReadWritePermission(handle)
        await linkFileToHandle(file.name, handle, text)
        logEvent('file', `Opened "${file.name}" from computer`)
        showToast(`Linked to ${handle.name || file.name}`, 'success')
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      if (err?.name === 'SecurityError' || err?.name === 'NotAllowedError') {
        fallbackFileInputRef.current?.click()
        return
      }
      showToast('Could not open file from computer.', 'danger')
    }
  }, [workspace, isCurrentUserStopped, linkFileToHandle, logEvent, showToast])

  // Save current file to disk (reusing linked handle, or Save As picker on first Save, or download fallback)
  const handleSaveCurrentFile = useCallback(async () => {
    if (!activeFile || !activeYText) return
    const currentText = normalizeLineEndings(activeYText.toString())
    const pickerOpts = getSavePickerOptions(activeFile)
    const suggestedBase = pickerOpts.suggestedName

    if (!isSaveFilePickerSupported()) {
      downloadFile(activeFile, currentText)
      setShowLiveSaveGuideToast(true)
      logEvent('save', `Downloaded "${activeFile}" to computer`)
      return
    }

    const linked = linkedFiles[activeFile]
    if (linked?.handle) {
      const granted = await ensureReadWritePermission(linked.handle)
      if (!granted) {
        failedAutoSaveRef.current.add(activeFile)
        setRelinkPrompt({ fileName: activeFile, diskName: linked.diskName || activeFile })
        return
      }
      if (currentText.length === 0 && (await isDiskFileNonEmpty(linked.handle))) {
        setPendingEmptyOverwrite({
          fileName: activeFile,
          handle: linked.handle,
          diskName: linked.diskName || activeFile
        })
        return
      }
      const ok = await writeLinkedFile(activeFile, linked.handle, currentText)
      if (ok) {
        const diskName = linked.diskName || linked.handle.name || activeFile
        showToast(`Saved to ${diskName}`, 'success')
        logEvent('save', `Saved "${activeFile}" to ${diskName}`)
      }
      return
    }

    try {
      const handle = await window.showSaveFilePicker(pickerOpts)
      if (!handle) return
      await linkFileToHandle(activeFile, handle)
      const ok = await writeLinkedFile(activeFile, handle, currentText)
      if (ok) {
        const diskName = handle.name || activeFile
        showToast(`Saved to ${diskName}`, 'success')
        logEvent('save', `Saved "${activeFile}" to ${diskName}`)
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.warn('[Save] showSaveFilePicker fallback:', err)
      downloadFile(activeFile, currentText)
      setShowLiveSaveGuideToast(true)
      logEvent('save', `Downloaded "${activeFile}" to computer`)
    }
  }, [activeFile, activeYText, linkedFiles, linkFileToHandle, writeLinkedFile, logEvent, showToast])

  const handleRelinkFile = useCallback(async (fileName) => {
    if (!workspace || !fileName || !isSaveFilePickerSupported()) return
    try {
      const pickerOpts = getSavePickerOptions(fileName)
      const handle = await window.showSaveFilePicker(pickerOpts)
      if (!handle) return
      await linkFileToHandle(fileName, handle)
      const ytext = workspace.getText(fileName)
      const currentText = ytext ? ytext.toString() : ''
      if (currentText.length === 0 && (await isDiskFileNonEmpty(handle))) {
        setPendingEmptyOverwrite({ fileName, handle, diskName: handle.name || fileName })
        return
      }
      const ok = await writeLinkedFile(fileName, handle, currentText)
      if (ok) {
        showToast(`Saved to ${handle.name || fileName}`, 'success')
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      showToast('Could not relink file.', 'danger')
    }
  }, [workspace, linkFileToHandle, writeLinkedFile, showToast])

  // Auto-save linked files 1.5s after local or remote text stops changing
  useEffect(() => {
    Object.values(autoSaveTimersRef.current).forEach((t) => clearTimeout(t))
    autoSaveTimersRef.current = {}

    if (!workspace || !editorPrefs.autoSaveToDisk || !isSaveFilePickerSupported()) {
      return
    }

    const cleanups = []
    for (const [fileName, info] of Object.entries(linkedFiles)) {
      if (!info?.handle) continue
      const ytext = workspace.getText(fileName)
      if (!ytext) continue

      const scheduleAutoSave = () => {
        if (failedAutoSaveRef.current.has(fileName)) return
        if (autoSaveTimersRef.current[fileName]) {
          clearTimeout(autoSaveTimersRef.current[fileName])
        }
        autoSaveTimersRef.current[fileName] = setTimeout(async () => {
          delete autoSaveTimersRef.current[fileName]
          if (failedAutoSaveRef.current.has(fileName)) return
          const text = ytext.toString()
          if (text === lastWrittenRef.current[fileName]) return

          const perm = await queryReadWritePermission(info.handle)
          if (perm !== 'granted') {
            failedAutoSaveRef.current.add(fileName)
            setRelinkPrompt({ fileName, diskName: info.diskName || fileName })
            return
          }
          if (text.length === 0 && (await isDiskFileNonEmpty(info.handle))) {
            failedAutoSaveRef.current.add(fileName)
            setPendingEmptyOverwrite({
              fileName,
              handle: info.handle,
              diskName: info.diskName || fileName
            })
            return
          }
          await writeLinkedFile(fileName, info.handle, text)
        }, 1500)
      }

      ytext.observe(scheduleAutoSave)
      cleanups.push(() => {
        try {
          ytext.unobserve(scheduleAutoSave)
        } catch (_) {}
      })

      if (
        lastWrittenRef.current[fileName] !== undefined &&
        ytext.toString() !== lastWrittenRef.current[fileName]
      ) {
        scheduleAutoSave()
      }
    }

    return () => {
      cleanups.forEach((fn) => fn())
      Object.values(autoSaveTimersRef.current).forEach((t) => clearTimeout(t))
      autoSaveTimersRef.current = {}
    }
  }, [workspace, linkedFiles, files, editorPrefs.autoSaveToDisk, writeLinkedFile])

  // Download all files as a .zip
  const handleDownloadAllZip = useCallback(() => {
    if (!workspace) return
    downloadAllAsZip(workspace, session?.roomId)
    logEvent('save', 'Exported full project as .zip archive')
  }, [workspace, session, logEvent])

  // Stop Code Execution
  const handleStopCode = useCallback(() => {
    const runId = activeRunIdRef.current
    if (jsTimeoutRef.current) {
      clearTimeout(jsTimeoutRef.current)
      jsTimeoutRef.current = null
    }

    if (remoteAbortControllerRef.current) {
      remoteAbortControllerRef.current.abort()
      remoteAbortControllerRef.current = null
      setIsRunning(false)
      if (runId) {
        appendRunItem(runId, { kind: 'stderr', text: 'Stopped.' })
        finishRun(runId, 'stopped', null)
      }
      logEvent('run', 'Online execution was stopped by user')
    }

    if (pythonWorkerRef.current && (isRunning || pendingInputPrompt)) {
      pythonWorkerRef.current.terminate()
      pythonWorkerRef.current = null
      interactivePyRef.current = null
      setPendingInputPrompt(null)
      setIsRunning(false)
      if (runId) {
        appendRunItem(runId, { kind: 'stderr', text: 'Stopped.' })
        finishRun(runId, 'stopped', null)
      }
      logEvent('run', 'Python execution terminated by user')
    }

    if (jsWorkerRef.current) {
      jsWorkerRef.current.terminate()
      jsWorkerRef.current = null
      setIsRunning(false)
      if (runId) {
        appendRunItem(runId, { kind: 'stderr', text: 'Stopped.' })
        finishRun(runId, 'stopped', null)
      }
      logEvent('run', 'Code execution terminated by user')
    }
  }, [appendRunItem, finishRun, logEvent, isRunning, pendingInputPrompt])

  const submitInteractiveInput = useCallback((value) => {
    const sessionPy = interactivePyRef.current
    const worker = pythonWorkerRef.current
    if (!sessionPy || !worker) return

    sessionPy.collectedInputs.push(value)
    setPendingInputPrompt(null)
    resetRunItems(sessionPy.runId)
    setIsRunning(true)
    worker.postMessage({
      type: 'run',
      runId: sessionPy.runId,
      code: sessionPy.code,
      stdinLines: [...sessionPy.preFilledLines, ...sessionPy.collectedInputs],
      allowInteractive: true
    })
  }, [resetRunItems])

  const sendInteractiveEof = useCallback(() => {
    const sessionPy = interactivePyRef.current
    const worker = pythonWorkerRef.current
    if (!sessionPy || !worker) return

    setPendingInputPrompt(null)
    resetRunItems(sessionPy.runId)
    setIsRunning(true)
    worker.postMessage({
      type: 'run',
      runId: sessionPy.runId,
      code: sessionPy.code,
      stdinLines: [...sessionPy.preFilledLines, ...sessionPy.collectedInputs],
      allowInteractive: false
    })
  }, [resetRunItems])

  // Run Code
  const handleRunCode = useCallback(() => {
    if (!activeFile || !activeYText) return

    const runFile = activeFile
    const ext = getFileExtension(runFile)
    const code = activeYText.toString()

    setPendingInputPrompt(null)
    interactivePyRef.current = null
    setIsOutputOpen(true)
    setIsRunning(true)
    const runId = startRun(runFile)
    logEvent('run', `Executed "${runFile}"`)

    // 1. Python Execution via Pyodide Web Worker (Offline)
    if (ext === 'py') {
      setOutputFooterNote('')
      if (!pythonWorkerRef.current) {
        pythonWorkerRef.current = new Worker('/python-worker.js', { type: 'module' })
      }
      const worker = pythonWorkerRef.current

      const stdinLines = []

      interactivePyRef.current = {
        runId,
        code,
        preFilledLines: stdinLines,
        collectedInputs: []
      }

      worker.onmessage = (e) => {
        const msgRunId = e.data.runId || runId
        if (activeRunIdRef.current !== msgRunId) return
        const { type, data, message, duration, echo, lineOffset, prompt } = e.data
        if (type === 'stdout') {
          appendRunItem(runId, { kind: 'stdout', text: data, echo })
        } else if (type === 'stderr') {
          appendRunItem(runId, { kind: 'stderr', text: data })
        } else if (type === 'status') {
          appendRunItem(runId, { kind: 'status', text: data || message })
        } else if (type === 'need_input') {
          setIsRunning(false)
          setPendingInputPrompt({ runId, prompt: prompt || '' })
          finishRun(runId, 'waiting_input', null)
        } else if (type === 'done') {
          interactivePyRef.current = null
          setPendingInputPrompt(null)
          setIsRunning(false)
          finishRun(runId, 'success', duration)
        } else if (type === 'error') {
          interactivePyRef.current = null
          setPendingInputPrompt(null)
          setIsRunning(false)
          const parsedError = parsePythonTraceback(data || message, code, runFile, lineOffset || 0)
          appendRunItem(runId, { kind: 'error', parsedError })
          finishRun(runId, 'error', null)
        }
      }

      worker.onerror = (err) => {
        if (activeRunIdRef.current !== runId) return
        pythonWorkerRef.current = null
        interactivePyRef.current = null
        setPendingInputPrompt(null)
        setIsRunning(false)
        appendRunItem(runId, { kind: 'stderr', text: `Worker Error: ${err.message}` })
        finishRun(runId, 'error', null)
      }

      worker.postMessage({ type: 'run', runId, code, stdinLines, allowInteractive: true })
      return
    }

    // 2. JavaScript, TypeScript (.ts, .tsx) Execution via Sandboxed Web Worker (Offline)
    if (['js', 'jsx', 'mjs', 'ts', 'tsx'].includes(ext)) {
      const isTypeScript = ['ts', 'tsx'].includes(ext)
      setOutputFooterNote(isTypeScript ? 'Types are not checked.' : '')

      if (jsWorkerRef.current) {
        jsWorkerRef.current.terminate()
      }
      const worker = new Worker(new URL('./workers/js-worker.js', import.meta.url), { type: 'module' })
      jsWorkerRef.current = worker

      jsTimeoutRef.current = setTimeout(() => {
        if (activeRunIdRef.current !== runId) return
        worker.terminate()
        jsWorkerRef.current = null
        setIsRunning(false)
        appendRunItem(runId, { kind: 'stderr', text: 'Stopped after 10 seconds. Check for an infinite loop.' })
        finishRun(runId, 'timed_out', '10.000')
      }, 10000)

      worker.onmessage = (e) => {
        if (activeRunIdRef.current !== runId) return
        const { type, data, duration } = e.data
        if (type === 'stdout') {
          appendRunItem(runId, { kind: 'stdout', text: data })
        } else if (type === 'stderr') {
          appendRunItem(runId, { kind: 'stderr', text: data })
        } else if (type === 'done') {
          clearTimeout(jsTimeoutRef.current)
          jsWorkerRef.current = null
          setIsRunning(false)
          finishRun(runId, 'success', duration)
        } else if (type === 'error') {
          clearTimeout(jsTimeoutRef.current)
          jsWorkerRef.current = null
          setIsRunning(false)
          const parsedError = parseJsError(e.data, code, runFile)
          appendRunItem(runId, { kind: 'error', parsedError })
          finishRun(runId, 'error', null)
        }
      }

      worker.onerror = (err) => {
        if (activeRunIdRef.current !== runId) return
        clearTimeout(jsTimeoutRef.current)
        jsWorkerRef.current = null
        setIsRunning(false)
        const parsedError = parseJsError({
          errorName: 'Error',
          errorMessage: err.message,
          line: err.lineno || null,
          col: err.colno || null
        }, code, runFile)
        appendRunItem(runId, { kind: 'error', parsedError })
        finishRun(runId, 'error', null)
      }

      worker.postMessage({
        code,
        isTs: ext === 'ts',
        isTsx: ext === 'tsx'
      })
      return
    }

    // 3. Online Languages (C, C++, Java, Go, Rust, PHP, Ruby) via Wandbox Runner
    if (isOnlineLanguage(ext)) {
      setOutputFooterNote('Ran online')

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsRunning(false)
        appendRunItem(runId, { kind: 'stderr', text: 'Running this language needs internet.' })
        finishRun(runId, 'error', null)
        return
      }

      // Show notice once per session
      let isNoticeDismissed = false
      try {
        isNoticeDismissed = Boolean(window.sessionStorage.getItem('offcode-dismissed-online-notice'))
      } catch (_) {}
      if (!isNoticeDismissed) {
        setShowOnlineNotice(true)
      }

      const controller = new AbortController()
      remoteAbortControllerRef.current = controller

      const timeoutId = setTimeout(() => {
        controller.abort()
      }, 15000)

      runRemoteCode({
        ext,
        code,
        signal: controller.signal
      })
        .then((result) => {
          clearTimeout(timeoutId)
          remoteAbortControllerRef.current = null
          setIsRunning(false)
          if (result.stdout) appendRunItem(runId, { kind: 'stdout', text: result.stdout })
          if (result.stderr) appendRunItem(runId, { kind: 'stderr', text: result.stderr })
          const failed = Boolean(result.stderr) || (result.status !== undefined && Number(result.status) !== 0)
          finishRun(runId, failed ? 'error' : 'success', result.duration)
        })
        .catch((err) => {
          clearTimeout(timeoutId)
          remoteAbortControllerRef.current = null
          setIsRunning(false)
          appendRunItem(runId, { kind: 'stderr', text: `Error: ${err.message}` })
          finishRun(runId, err.message === 'Execution was stopped.' ? 'stopped' : 'error', null)
        })
      return
    }

    // 4. HTML Live Preview in Sandboxed Iframe
    if (['html', 'htm'].includes(ext)) {
      const getFileContent = (path) => {
        if (!workspace) return null
        const text = workspace.getText(path)
        return text ? text.toString() : null
      }

      const { html: resolvedHtml, missingFiles } = resolveHtmlAssets(code, runFile, getFileContent)
      htmlRunContextRef.current = { rawHtml: code, resolvedHtml, fileName: runFile }
      setHtmlContent(resolvedHtml)
      setIsRunning(false)

      if (missingFiles.length > 0) {
        missingFiles.forEach((f) => {
          appendRunItem(runId, { kind: 'stderr', text: `${f.raw} not found in this room` })
        })
      }
      appendRunItem(runId, { kind: 'status', text: `Live HTML preview loaded for ${runFile}` })
      finishRun(runId, missingFiles.length > 0 ? 'error' : 'success', null)
      logEvent('run', `Opened HTML live preview for "${runFile}"`)
      return
    }

    // 5. Other languages
    setIsRunning(false)
    appendRunItem(runId, {
      kind: 'stderr',
      text: `Running ${ext ? ext.toUpperCase() : 'plain text'} is not supported offline.`
    })
    finishRun(runId, 'error', null)
  }, [activeFile, activeYText, startRun, appendRunItem, finishRun, logEvent, workspace])

  // Global Keyboard Shortcuts (Ctrl+S for Save, Ctrl+Enter for Run, Ctrl+` for Output toggle)
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
      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault()
        setIsOutputOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
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

  const isOnlineExt = ['c', 'cpp', 'cxx', 'cc', 'java', 'php', 'rs', 'rust', 'go', 'rb', 'ruby'].includes(activeExt)
  const isRunnableExt = ['py', 'js', 'jsx', 'mjs', 'html', 'htm', 'ts', 'tsx'].includes(activeExt) || isOnlineExt
  const isOnline = typeof navigator === 'undefined' || navigator.onLine
  const canRunActive = Boolean(activeFile && isRunnableExt && (isOnline || !isOnlineExt))
  let runTooltipText = 'Run code (Ctrl+Enter)'
  if (isOnlineExt) {
    runTooltipText = isOnline ? 'Run code (Ctrl+Enter) (online)' : 'Needs internet'
  }

  const fsAccessSupported = isFileSystemAccessSupported()
  const activeLinkedInfo = activeFile ? linkedFiles[activeFile] || null : null

  // Show Join screen if not connected
  if (!session || !workspace) {
    return <JoinScreen onJoin={handleJoin} theme={theme} onToggleTheme={handleToggleTheme} />
  }

  return (
    <div className="app-layout">
      {/* Top Header Bar */}
      <TopBar
        roomId={session.roomId}
        userName={session.userName}
        userColor={currentUserColor || session.userColor}
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
        onLeaveRoom={handleRequestLeaveRoom}
        onSaveCurrentFile={handleSaveCurrentFile}
        onOpenFromComputer={handleOpenFromComputer}
        fsAccessSupported={fsAccessSupported}
        linkedDiskName={activeLinkedInfo?.diskName || null}
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
        isAiChatOpen={isAiChatOpen}
        onToggleAiChat={() => setIsAiChatOpen((prev) => !prev)}
        isStopped={isCurrentUserStopped}
        showUserChanges={showUserChanges}
        onToggleShowUserChanges={handleToggleShowUserChanges}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        onToggleMobilePeople={() => setIsMobilePeopleOpen((prev) => !prev)}
        onOpenAiKeyModal={() => setIsAiKeyModalOpen(true)}
        onRemoveAiKey={handleRemoveAiKey}
        hasAiKey={Boolean(aiKey)}
        onToggleCustomize={() => setIsCustomizeOpen((prev) => !prev)}
        isCustomizeOpen={isCustomizeOpen}
        canRunActive={canRunActive}
        runTooltipText={runTooltipText}
      />

      {/* Stopped by Host Banner */}
      {isCurrentUserStopped && (
        <div
          className="stopped-banner"
          style={{
            background: 'var(--color-danger-bg)',
            color: 'var(--color-danger)',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid var(--border-color)',
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
        {/* Backdrop for mobile drawer overlays */}
        {(isMobileSidebarOpen || isMobilePeopleOpen) && (
          <div
            className="mobile-drawer-backdrop"
            onClick={() => {
              setIsMobileSidebarOpen(false)
              setIsMobilePeopleOpen(false)
            }}
          />
        )}

        {/* Left Sidebar: File explorer */}
        {!editorPrefs.focusMode && (
          <div
            className={`sidebar-container ${isMobileSidebarOpen ? 'mobile-open' : ''} ${layout.sidebarCollapsed ? 'is-collapsed' : ''}`}
            style={{ width: layout.sidebarCollapsed ? 40 : layout.sidebarWidth }}
          >
            <Sidebar
              files={files}
              activeFile={activeFile}
              onSelectFile={handleSelectFile}
              onCreateFile={handleCreateFile}
              onDeleteFile={handleDeleteFile}
              onRenameFile={handleRenameFile}
              onDuplicateFile={handleDuplicateFile}
              onDownloadFile={handleDownloadSingleFile}
              onCopyFileName={handleCopyFileName}
              onClearAllFiles={handleClearAllFiles}
              users={users}
              isStopped={isCurrentUserStopped}
              isHost={isHost}
              onImportFolder={handleImportFolder}
              onOpenFromComputer={handleOpenFromComputer}
              onUnlinkFile={handleUnlinkFile}
              linkedFiles={linkedFiles}
              fsAccessSupported={fsAccessSupported}
              isCollapsed={layout.sidebarCollapsed}
              onToggleCollapse={() => updateLayout((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }))}
            />
          </div>
        )}

        {/* Draggable Resizer for Sidebar */}
        {!editorPrefs.focusMode && !layout.sidebarCollapsed && (
          <div
            className="panel-resizer panel-resizer-left"
            onMouseDown={handleSidebarResizeStart}
            onDoubleClick={() => updateLayout((prev) => ({ ...prev, sidebarWidth: 240 }))}
            title="Drag to resize Explorer (Double-click to reset)"
          />
        )}

        {/* Center: CodeMirror 6 Editor with Bottom Output Panel */}
        <div className="editor-and-output-column">
          {editorPrefs.focusMode && (
            <button
              type="button"
              className="btn-exit-focus-mode"
              onClick={() => handleUpdateEditorPrefs((prev) => ({ ...prev, focusMode: false }))}
              title="Exit Focus Mode (Esc)"
            >
              Exit Focus Mode
            </button>
          )}
          <Editor
            activeFile={activeFile}
            openFiles={openFiles.length > 0 ? openFiles : (activeFile ? [activeFile] : [])}
            linkedFiles={linkedFiles}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onCreateFile={() => setIsNewFileModalOpen(true)}
            ytext={activeYText}
            workspace={workspace}
            awareness={workspace.awareness}
            remoteUsersViewingThisFile={remoteUsersInSameFile}
            targetScrollLine={targetScrollLine}
            errorHighlight={errorHighlight}
            clearErrorHighlightSeq={clearErrorHighlightSeq}
            onUserInteraction={handleUserInteraction}
            onCursorChange={setCursorPos}
            readOnly={isMainReadOnly || isCurrentUserStopped}
            isReviewMode={isReviewMode}
            isDraft={isDraftEditing}
            onSwitchReviewTab={(tab) => setReviewTab(tab)}
            onPushDraft={() => setIsPushDraftOpen(true)}
            onPointersChange={setPointersReceivedCount}
            isStopped={isCurrentUserStopped}
            frozenUserIds={frozenUserIds}
            showUserChanges={showUserChanges}
            currentUserId={workspace?.getUserId ? workspace.getUserId() : session?.userName}
            currentUserName={session?.userName || 'Anonymous'}
            currentUserColor={currentUserColor || session?.userColor || '#6366f1'}
            users={users}
            theme={theme}
            onImproveWithAi={handleTriggerAi}
            onAskAiWithQuote={handleAskAiWithQuote}
            editorActionsRef={editorActionsRef}
            aiKey={aiKey}
            onRecordAiInlineUsage={handleRecordAiInlineUsage}
            onAiInlineStatusChange={setAiInlineStatus}
            isOffline={status === 'offline'}
            editorPrefs={editorPrefs}
            onChangeEditorPrefs={handleUpdateEditorPrefs}
            isCustomizeOpen={isCustomizeOpen}
            onToggleCustomize={() => setIsCustomizeOpen((prev) => !prev)}
          />

          {/* Bottom Output & Preview Panel */}
          <OutputPanel
            isOpen={isOutputOpen}
            onClose={() => setIsOutputOpen(false)}
            runs={runs}
            onClear={() => setRuns([])}
            isRunning={isRunning}
            onStop={handleStopCode}
            htmlContent={htmlContent}
            isHtmlMode={isHtml}
            showOnlineNotice={showOnlineNotice}
            onDismissOnlineNotice={handleDismissOnlineNotice}
            footerNote={outputFooterNote}
            onJumpToLocation={handleJumpToError}
            onHtmlError={handleHtmlError}
            pendingInputPrompt={pendingInputPrompt}
            onSubmitInteractiveInput={submitInteractiveInput}
            onSendInteractiveEof={sendInteractiveEof}
            onAskAiExplainError={handleAskAiExplainError}
          />
        </div>

        {/* Draggable Resizer for People */}
        {!editorPrefs.focusMode && !layout.peopleCollapsed && (
          <div
            className="panel-resizer panel-resizer-right"
            onMouseDown={handlePeopleResizeStart}
            onDoubleClick={() => updateLayout((prev) => ({ ...prev, peopleWidth: 260 }))}
            title="Drag to resize People (Double-click to reset)"
          />
        )}

        {/* Right: People Panel */}
        {!editorPrefs.focusMode && (
          <div
            className={`people-panel-container ${isMobilePeopleOpen ? 'mobile-open' : ''} ${layout.peopleCollapsed ? 'is-collapsed' : ''}`}
            style={{ width: layout.peopleCollapsed ? 40 : layout.peopleWidth }}
          >
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
              isCollapsed={layout.peopleCollapsed}
              onToggleCollapse={() => updateLayout((prev) => ({ ...prev, peopleCollapsed: !prev.peopleCollapsed }))}
            />
          </div>
        )}

        {/* Collapsible Chat Sidebar */}
        <ChatPanel
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          workspace={workspace}
          session={session}
          isHost={isHost}
        />

        {/* Private Local-Only AI Assistant Sidebar */}
        <AiChatPanel
          isOpen={isAiChatOpen}
          onClose={() => setIsAiChatOpen(false)}
          apiKey={aiKey}
          onOpenKeyModal={() => setIsAiKeyModalOpen(true)}
          isOffline={status === 'offline'}
          isStopped={isCurrentUserStopped}
          readOnly={isMainReadOnly}
          activeFile={activeFile}
          activeCode={activeYText ? normalizeLineEndings(activeYText.toString()) : ''}
          activeLanguage={getLanguageName(activeFile)}
          files={files}
          editorActionsRef={editorActionsRef}
          pendingQuote={pendingAiQuote}
          onClearPendingQuote={() => setPendingAiQuote(null)}
          usageState={aiUsageState}
          onRecordUsage={handleRecordAiUsage}
          onResetUsage={handleResetAiUsage}
          onNotify={showToast}
        />
      </div>

      {/* Bottom Status Bar */}
      {!editorPrefs.focusMode && (
        <StatusBar
          status={status}
          onToggleOnline={handleToggleOnline}
          usersCount={users.length}
          activeLanguage={getLanguageName(activeFile)}
          cursorPos={cursorPos}
          isHost={isHost}
          mode={mode}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          aiInlineStatus={aiInlineStatus}
        />
      )}

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

      {/* Gemini AI Key Modal */}
      <AiKeyModal
        isOpen={isAiKeyModalOpen}
        onClose={() => {
          setIsAiKeyModalOpen(false)
          setPendingAiImprove(null)
        }}
        onSaveKey={handleSaveAiKey}
        initialKey={aiKey}
      />

      {/* Gemini AI Review & Diff Modal */}
      <AiReviewModal
        isOpen={isAiReviewOpen}
        isLoading={isAiLoading}
        error={aiError}
        result={aiResult}
        originalText={aiTarget?.selectedText || ''}
        onAccept={handleAcceptAi}
        onReject={handleCancelOrRejectAi}
        onOpenKeyModal={() => setIsAiKeyModalOpen(true)}
      />

      {/* Live Toast Notifications, Relink Prompt & Live Save Guide */}
      {(toasts.length > 0 || relinkPrompt || showLiveSaveGuideToast) && (
        <div className="toast-container" aria-live="polite" aria-atomic="true">
          {showLiveSaveGuideToast && (
            <div className="toast-message toast-info toast-with-action" role="status">
              <span>Downloaded a copy — live disk overwriting is disabled in this browser.</span>
              <div className="toast-actions">
                <button
                  type="button"
                  className="btn-flat btn-primary btn-xs"
                  onClick={() => {
                    setShowLiveSaveGuideToast(false)
                    setIsLiveSaveGuideOpen(true)
                  }}
                >
                  How to enable live save
                </button>
                <button
                  type="button"
                  className="btn-flat btn-secondary btn-xs"
                  onClick={() => setShowLiveSaveGuideToast(false)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {relinkPrompt && (
            <div className="toast-message toast-danger toast-with-action" role="alert">
              <span>Cannot write to the linked file. Choose it again.</span>
              <div className="toast-actions">
                <button
                  type="button"
                  className="btn-flat btn-primary btn-xs"
                  onClick={() => handleRelinkFile(relinkPrompt.fileName)}
                >
                  Relink
                </button>
                <button
                  type="button"
                  className="btn-flat btn-secondary btn-xs"
                  onClick={() => setRelinkPrompt(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {toasts.map((t) => (
            <div key={t.id} className={`toast-message toast-${t.type}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}

      {/* Browser Live Save Guide Modal */}
      {isLiveSaveGuideOpen && (
        <div className="modal-backdrop" onClick={() => setIsLiveSaveGuideOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '470px' }}>
            <h4 className="modal-title">Enable Live Disk Saving on HTTPS</h4>
            {isBraveBrowser() ? (
              <>
                <p className="modal-desc" style={{ marginBottom: '10px' }}>
                  Brave disables the File System Access API by default. Enable it once to overwrite files directly on disk:
                </p>
                <ol className="guide-steps-list">
                  <li>Copy and open this flags URL in a new tab:</li>
                </ol>
                <div className="guide-flag-row">
                  <code className="guide-flag-code">brave://flags/#file-system-access-api</code>
                  <button
                    type="button"
                    className="btn-flat btn-secondary btn-xs"
                    onClick={async () => {
                      await copyToClipboard('brave://flags/#file-system-access-api')
                      showToast('Copied flag URL — paste it into Brave address bar', 'info')
                    }}
                  >
                    Copy
                  </button>
                </div>
                <ol className="guide-steps-list" start={2} style={{ marginTop: '10px' }}>
                  <li>Set <strong>File System Access API</strong> to <strong>Enabled</strong>.</li>
                  <li>Click <strong>Relaunch</strong> at the bottom right.</li>
                </ol>
              </>
            ) : typeof window !== 'undefined' && !window.isSecureContext ? (
              <p className="modal-desc" style={{ marginBottom: '10px' }}>
                Browsers block live disk saving on non-HTTPS links. Open OffCode using the <strong>HTTPS</strong> link (or <code>http://localhost</code>) in Chrome, Edge, or Brave.
              </p>
            ) : (
              <>
                <p className="modal-desc" style={{ marginBottom: '10px' }}>
                  Your current browser does not allow websites to overwrite files directly on disk:
                </p>
                <ul className="guide-steps-list">
                  <li><strong>Chrome / Edge</strong>: Works automatically on HTTPS links. If prompted, allow <strong>File editing</strong> permission in the address bar lock icon.</li>
                  <li><strong>Brave</strong>: Open <code>brave://flags/#file-system-access-api</code>, set to <strong>Enabled</strong>, and relaunch.</li>
                  <li><strong>Firefox / Safari</strong>: These browsers do not support direct disk overwriting from web apps, so Save downloads a copy.</li>
                </ul>
              </>
            )}
            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn-flat btn-primary"
                onClick={() => setIsLiveSaveGuideOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Room File Conflict Modal for Open from Computer */}
      {pendingLinkConflict && (
        <div className="modal-backdrop" onClick={() => setPendingLinkConflict(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h4 className="modal-title">Link to the existing room file instead?</h4>
            <p className="modal-desc" style={{ marginBottom: '14px' }}>
              <code>{pendingLinkConflict.fileName}</code> already exists in this room. Linking will not overwrite the shared text until you save.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-flat btn-secondary"
                onClick={() => setPendingLinkConflict(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-flat btn-primary"
                onClick={async () => {
                  const target = pendingLinkConflict
                  setPendingLinkConflict(null)
                  await linkFileToHandle(target.fileName, target.handle)
                  setActiveFile(target.fileName)
                  setOpenFiles((prev) => (prev.includes(target.fileName) ? prev : [...prev, target.fileName]))
                  showToast(`Linked to ${target.diskName}`, 'success')
                }}
              >
                Link file
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty Room Text Overwrite Confirmation Modal */}
      {pendingEmptyOverwrite && (
        <div className="modal-backdrop" onClick={() => setPendingEmptyOverwrite(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h4 className="modal-title">Overwrite non-empty file on disk?</h4>
            <p className="modal-desc" style={{ marginBottom: '14px' }}>
              <code>{pendingEmptyOverwrite.fileName}</code> is empty in the room, but <code>{pendingEmptyOverwrite.diskName}</code> on your computer has content. Write the empty file anyway?
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-flat btn-secondary"
                onClick={() => setPendingEmptyOverwrite(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-flat btn-danger"
                onClick={async () => {
                  const target = pendingEmptyOverwrite
                  setPendingEmptyOverwrite(null)
                  const ok = await writeLinkedFile(target.fileName, target.handle, '')
                  if (ok) {
                    showToast(`Saved to ${target.diskName}`, 'success')
                  }
                }}
              >
                Overwrite
              </button>
            </div>
          </div>
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

      {/* Create New File Modal */}
      {isNewFileModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setIsNewFileModalOpen(false)
            setModalFileName('')
          }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '400px' }}
          >
            <h4 className="modal-title">Create New File</h4>
            <p className="modal-desc" style={{ marginBottom: '12px' }}>
              Enter a file name with a supported extension (.py, .js, .ts, .html, .css, etc.)
            </p>
            <input
              type="text"
              className="new-file-input"
              value={modalFileName}
              onChange={(e) => setModalFileName(e.target.value)}
              placeholder="e.g. main.py, index.html"
              autoFocus
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = validateFileName(modalFileName, files, false, { allowNoExtension: true })
                  if (val.valid) {
                    handleCreateFile(modalFileName)
                    setIsNewFileModalOpen(false)
                    setModalFileName('')
                  } else {
                    showToast(val.error, 'error')
                  }
                } else if (e.key === 'Escape') {
                  setIsNewFileModalOpen(false)
                  setModalFileName('')
                }
              }}
            />
            {modalFileName && !validateFileName(modalFileName, files, false, { allowNoExtension: true, checkExtension: false }).valid && (
              <span className="new-file-error" style={{ display: 'block', marginBottom: '10px' }}>
                {validateFileName(modalFileName, files, false, { allowNoExtension: true, checkExtension: false }).error}
              </span>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-flat btn-secondary"
                onClick={() => {
                  setIsNewFileModalOpen(false)
                  setModalFileName('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-flat btn-primary"
                disabled={!modalFileName || !validateFileName(modalFileName, files, false, { allowNoExtension: true, checkExtension: false }).valid}
                onClick={() => {
                  const val = validateFileName(modalFileName, files, false, { allowNoExtension: true })
                  if (val.valid) {
                    handleCreateFile(modalFileName)
                    setIsNewFileModalOpen(false)
                    setModalFileName('')
                  } else {
                    showToast(val.error, 'error')
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fallbackFileInputRef}
        style={{ display: 'none' }}
        onChange={handleFallbackFileChange}
      />

      {/* Leave Room & Shutdown Warning Modal */}
      {isLeaveModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsLeaveModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '440px',
              width: '100%',
              backgroundColor: 'var(--bg-editor, #1e1e1e)',
              border: '1px solid var(--border-color, #333)',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)'
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                color: 'var(--color-danger, #ef4444)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertTriangle size={16} />
              <span>Leave Room & Shutdown Warning</span>
            </h3>
            <p style={{ fontSize: '13.5px', lineHeight: '1.5', margin: '0 0 18px 0', color: 'var(--text-main, #ccc)' }}>
              {users.length <= 1 ? (
                <>
                  You are currently the <strong>only person</strong> in this room.
                  <br /><br />
                  Leaving will <strong>completely shut down this room</strong> and all files in this room will be <strong>permanently deleted</strong>.
                </>
              ) : (
                <>
                  There are currently <strong>{users.length} collaborators</strong> in this room.
                  <br /><br />
                  If all collaborators leave, this room will be shut down and all its files deleted from the server.
                </>
              )}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn-flat btn-secondary btn-sm"
                onClick={() => setIsLeaveModalOpen(false)}
              >
                Stay in Room
              </button>
              <button
                type="button"
                className="btn-flat btn-sm"
                style={{
                  backgroundColor: 'var(--color-danger, #ef4444)',
                  borderColor: 'var(--color-danger, #ef4444)',
                  color: '#ffffff'
                }}
                onClick={executeLeaveRoom}
              >
                Confirm & Leave Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
