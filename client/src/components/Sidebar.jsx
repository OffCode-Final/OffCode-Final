import { useState, useRef, useEffect } from 'react'
import {
  Plus,
  Trash2,
  Folder,
  FolderOpen,
  FolderX,
  ChevronRight,
  ChevronDown,
  Upload,
  Info,
  ChevronLeft,
  Files,
  FileUp,
  Link2,
  MoreHorizontal,
  Unlink,
  Pencil,
  CopyPlus,
  Copy,
  Download
} from 'lucide-react'
import { getFileExtension, validateFileName, normalizeLineEndings } from '../utils/helpers'

function buildTree(fileList) {
  const root = { name: '', path: '', folders: {}, files: [] }

  for (const f of fileList) {
    const parts = f.split('/')
    if (parts.length === 1) {
      root.files.push(f)
    } else {
      let current = root
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i]
        if (!current.folders[seg]) {
          current.folders[seg] = {
            name: seg,
            path: parts.slice(0, i + 1).join('/'),
            folders: {},
            files: []
          }
        }
        current = current.folders[seg]
      }
      current.files.push(f)
    }
  }
  return root
}

export default function Sidebar({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onDuplicateFile,
  onDownloadFile,
  onCopyFileName,
  onClearAllFiles,
  users = [],
  isStopped = false,
  isHost = false,
  onImportFolder,
  onOpenFromComputer,
  onUnlinkFile,
  linkedFiles = {},
  fsAccessSupported = true,
  isCollapsed = false,
  onToggleCollapse
}) {
  const [isCreating, setIsCreating] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [fileToDelete, setFileToDelete] = useState(null)
  const [openRowMenuFile, setOpenRowMenuFile] = useState(null)
  const [renamingFile, setRenamingFile] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [openMenuLocation, setOpenMenuLocation] = useState(null)
  const [isConfirmRemoveAllOpen, setIsConfirmRemoveAllOpen] = useState(false)
  const [error, setError] = useState('')
  const [expandedFolders, setExpandedFolders] = useState(() => new Set())
  const folderInputRef = useRef(null)
  const openMenuTimerRef = useRef(null)
  const headerOpenMenuRef = useRef(null)
  const emptyOpenMenuRef = useRef(null)

  const showOpenMenu = (location) => {
    if (isStopped) return
    if (openMenuTimerRef.current) {
      clearTimeout(openMenuTimerRef.current)
      openMenuTimerRef.current = null
    }
    setOpenMenuLocation(location)
  }

  const scheduleHideOpenMenu = (location) => {
    if (openMenuTimerRef.current) {
      clearTimeout(openMenuTimerRef.current)
    }
    openMenuTimerRef.current = setTimeout(() => {
      openMenuTimerRef.current = null
      setOpenMenuLocation((prev) => (prev === location ? null : prev))
    }, 140)
  }

  useEffect(() => {
    if (!openMenuLocation) return
    const handleOutside = (e) => {
      const container = openMenuLocation === 'header' ? headerOpenMenuRef.current : emptyOpenMenuRef.current
      if (container && !container.contains(e.target)) {
        setOpenMenuLocation(null)
      }
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpenMenuLocation(null)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openMenuLocation])

  useEffect(() => {
    return () => {
      if (openMenuTimerRef.current) {
        clearTimeout(openMenuTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!openRowMenuFile) return
    const handleOutside = () => setOpenRowMenuFile(null)
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openRowMenuFile])

  // Expand newly discovered folders by default so all imported files are visible
  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      for (const f of files) {
        const parts = f.split('/')
        for (let i = 1; i < parts.length; i++) {
          next.add(parts.slice(0, i).join('/'))
        }
      }
      return next
    })
  }, [files])

  const toggleFolder = (folderPath) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      return next
    })
  }

  const handleOpenFolderClick = async () => {
    if (isStopped) return
    if (typeof window !== 'undefined' && window.showDirectoryPicker) {
      try {
        let dirHandle = null
        try {
          dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
        } catch (modeErr) {
          if (modeErr?.name === 'AbortError') return
          dirHandle = await window.showDirectoryPicker()
        }
        const filesList = []
        let skippedCount = 0

        async function scanDir(dir, prefix = '') {
          for await (const entry of dir.values()) {
            const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
            if (entry.kind === 'directory') {
              if (entry.name === 'node_modules' || entry.name.startsWith('.git') || entry.name === '.DS_Store') {
                skippedCount++
                continue
              }
              await scanDir(entry, relPath)
            } else if (entry.kind === 'file') {
              const file = await entry.getFile()
              if (file.size > 1024 * 1024) {
                skippedCount++
                continue
              }
              try {
                const text = normalizeLineEndings(await file.text())
                filesList.push({ file, relPath, text, handle: entry })
              } catch (_) {
                skippedCount++
              }
            }
          }
        }

        await scanDir(dirHandle)
        if (onImportFolder) {
          onImportFolder(filesList, skippedCount)
        }
        return
      } catch (err) {
        if (err.name === 'AbortError') return
        console.warn('showDirectoryPicker fallback:', err)
      }
    }
    folderInputRef.current?.click()
  }

  const handleFolderChange = (e) => {
    const selectedFiles = e.target.files
    if (selectedFiles && selectedFiles.length > 0) {
      if (onImportFolder) {
        onImportFolder(selectedFiles)
      }
    }
  }

  const liveFileValidation = newFileName
    ? validateFileName(newFileName, files, false, { allowNoExtension: true, checkExtension: false })
    : { valid: false, error: '' }

  const handleCreateSubmit = (e) => {
    e.preventDefault()
    const val = validateFileName(newFileName, files, false, { allowNoExtension: true })
    if (!val.valid) {
      setError(val.error)
      return
    }
    onCreateFile(newFileName.trim())
    setNewFileName('')
    setIsCreating(false)
    setError('')
  }

  const confirmDelete = () => {
    if (fileToDelete) {
      onDeleteFile(fileToDelete)
      setFileToDelete(null)
    }
  }

  // Get a colored language dot using one calm palette
  const getLanguageDot = (filename) => {
    const ext = getFileExtension(filename)
    return <span className={`lang-palette-dot file-icon-${ext || 'txt'}`} aria-hidden="true" />
  }

  const tree = buildTree(files)

  const renderFileRow = (filePath, depth = 0) => {
    const isActive = activeFile === filePath
    const displayName = filePath.split('/').pop()
    const linkedInfo = linkedFiles[filePath] || null
    const isMenuOpen = openRowMenuFile === filePath
    const isRenaming = renamingFile === filePath

    // Find remote users viewing this file
    const remoteViewers = users.filter((u) => !u.isYou && u.currentFile === filePath)

    const commitRename = () => {
      const next = renameValue.trim()
      setRenamingFile(null)
      if (!next || next === displayName) return
      if (onRenameFile) onRenameFile(filePath, next)
    }

    return (
      <div
        key={filePath}
        className={`file-row ${isActive ? 'active' : ''}`}
        onClick={() => {
          if (!isRenaming) onSelectFile(filePath)
        }}
        onContextMenu={(e) => {
          if (isStopped || isRenaming) return
          e.preventDefault()
          e.stopPropagation()
          setOpenRowMenuFile(filePath)
        }}
        style={{ paddingLeft: `${14 + depth * 14}px` }}
        title={linkedInfo ? `${filePath} (Linked to ${linkedInfo.diskName})` : filePath}
      >
        <div className="file-row-main">
          {getLanguageDot(filePath)}
          {isRenaming ? (
            <input
              type="text"
              className="file-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setRenamingFile(null)
                }
              }}
              autoFocus
              spellCheck={false}
            />
          ) : (
            <span className="file-row-name">{displayName}</span>
          )}
          {linkedInfo && !isRenaming && (
            <span
              className="file-link-badge"
              title={`Linked to ${linkedInfo.diskName}`}
              aria-label={`Linked to ${linkedInfo.diskName}`}
            >
              <Link2 size={11} strokeWidth={1.75} />
            </span>
          )}

          {/* Remote presence dots in user colors */}
          {remoteViewers.length > 0 && !isRenaming && (
            <div className="file-presence-dots">
              {remoteViewers.map((viewer) => (
                <span
                  key={viewer.clientId}
                  className="file-presence-dot"
                  style={{ backgroundColor: viewer.color }}
                  title={`${viewer.name} is viewing this file`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="file-row-actions" onMouseDown={(e) => e.stopPropagation()}>
          <div className="file-row-menu-wrap">
            <button
              type="button"
              className="btn-file-row-menu"
              onClick={(e) => {
                e.stopPropagation()
                setOpenRowMenuFile(isMenuOpen ? null : filePath)
              }}
              title={`Actions for ${displayName}`}
              aria-label={`File options for ${displayName}`}
              aria-expanded={isMenuOpen}
            >
              <MoreHorizontal size={13} strokeWidth={1.75} />
            </button>
            {isMenuOpen && (
              <div className="file-row-dropdown" role="menu">
                {!isStopped && (
                  <button
                    type="button"
                    role="menuitem"
                    className="file-row-dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenRowMenuFile(null)
                      setRenamingFile(filePath)
                      setRenameValue(displayName)
                    }}
                  >
                    <Pencil size={12} strokeWidth={1.75} />
                    <span>Rename</span>
                  </button>
                )}
                {!isStopped && (
                  <button
                    type="button"
                    role="menuitem"
                    className="file-row-dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenRowMenuFile(null)
                      if (onDuplicateFile) onDuplicateFile(filePath)
                    }}
                  >
                    <CopyPlus size={12} strokeWidth={1.75} />
                    <span>Duplicate</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="file-row-dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenRowMenuFile(null)
                    if (onCopyFileName) onCopyFileName(filePath)
                  }}
                >
                  <Copy size={12} strokeWidth={1.75} />
                  <span>Copy name</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="file-row-dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenRowMenuFile(null)
                    if (onDownloadFile) onDownloadFile(filePath)
                  }}
                >
                  <Download size={12} strokeWidth={1.75} />
                  <span>Download</span>
                </button>
                {linkedInfo && (
                  <button
                    type="button"
                    role="menuitem"
                    className="file-row-dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenRowMenuFile(null)
                      if (onUnlinkFile) onUnlinkFile(filePath)
                    }}
                  >
                    <Unlink size={12} strokeWidth={1.75} />
                    <span>Unlink</span>
                  </button>
                )}
                {!isStopped && (
                  <button
                    type="button"
                    role="menuitem"
                    className="file-row-dropdown-item text-danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenRowMenuFile(null)
                      setFileToDelete(filePath)
                    }}
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-delete-row"
            onClick={(e) => {
              e.stopPropagation()
              if (isStopped) return
              setFileToDelete(filePath)
            }}
            disabled={isStopped}
            style={isStopped ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            title={isStopped ? 'Editing stopped by host' : `Delete ${filePath}`}
            aria-label={isStopped ? 'Editing stopped by host' : `Delete ${filePath}`}
          >
            <Trash2 size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    )
  }

  const renderFolderNode = (folderNode, depth = 0) => {
    const isExpanded = expandedFolders.has(folderNode.path)
    const subFolderKeys = Object.keys(folderNode.folders).sort()
    const folderFiles = [...folderNode.files].sort()

    return (
      <div key={folderNode.path} className="tree-folder-group">
        <div
          className="file-row folder-row"
          onClick={() => toggleFolder(folderNode.path)}
          style={{
            paddingLeft: `${12 + depth * 14}px`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          title={folderNode.path}
        >
          <span className="folder-chevron" aria-hidden="true">
            {isExpanded ? <ChevronDown size={13} strokeWidth={1.75} /> : <ChevronRight size={13} strokeWidth={1.75} />}
          </span>
          <span className="folder-icon" aria-hidden="true">
            {isExpanded ? <FolderOpen size={14} strokeWidth={1.75} /> : <Folder size={14} strokeWidth={1.75} />}
          </span>
          <span className="file-row-name folder-name">
            {folderNode.name}
          </span>
        </div>

        {isExpanded && (
          <div className="folder-children" style={{ borderLeft: '1px solid var(--border-subtle)', marginLeft: `${18 + depth * 14}px` }}>
            {subFolderKeys.map((k) => renderFolderNode(folderNode.folders[k], depth + 1))}
            {folderFiles.map((f) => renderFileRow(f, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Collapsed rail mode (40px)
  if (isCollapsed) {
    return (
      <aside className="sidebar-rail" title="Explorer">
        <button
          type="button"
          className="btn-rail-icon"
          onClick={onToggleCollapse}
          title="Expand Explorer (Ctrl+B)"
          aria-label="Expand Explorer"
        >
          <Files size={16} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          className="btn-rail-icon"
          onClick={() => {
            onToggleCollapse()
            setTimeout(() => setIsCreating(true), 120)
          }}
          disabled={isStopped}
          title="New file"
          aria-label="New file"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>

        {/* Compact File Rail List */}
        <div className="rail-files-scroll" role="list" aria-label="Open files">
          {files.map((filePath) => {
            const isActive = activeFile === filePath
            const ext = getFileExtension(filePath)
            // 2 or 3 letter badge
            const badge = (ext.length <= 3 ? ext : ext.slice(0, 3)).toUpperCase() || 'TXT'
            const displayName = filePath.split('/').pop()
            const remoteViewers = users.filter((u) => !u.isYou && u.currentFile === filePath)

            return (
              <button
                key={filePath}
                type="button"
                className={`rail-file-btn ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectFile(filePath)
                }}
                title={`${displayName} (${filePath})`}
                aria-label={`Open ${displayName}`}
              >
                {/* Active caret indicator */}
                {isActive && <span className="rail-active-caret" aria-hidden="true" />}

                {/* 2-3 letter badge with language color dot */}
                <span className={`rail-badge file-icon-${ext || 'txt'}`}>
                  {badge}
                </span>

                {/* Remote Presence dots */}
                {remoteViewers.length > 0 && (
                  <div className="rail-presence-dots">
                    {remoteViewers.map((viewer) => (
                      <span
                        key={viewer.clientId}
                        className="rail-presence-dot"
                        style={{ backgroundColor: viewer.color }}
                        title={`${viewer.name} is viewing this file`}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <button
            type="button"
            className="btn-icon-subtle btn-collapse-panel"
            onClick={onToggleCollapse}
            title="Collapse Explorer (Ctrl+B)"
            aria-label="Collapse Explorer"
          >
            <ChevronLeft size={14} strokeWidth={1.75} />
          </button>
          <span className="sidebar-title">EXPLORER</span>
        </div>

        <div className="sidebar-header-actions">
          <div
            ref={headerOpenMenuRef}
            className={`open-menu-wrapper ${openMenuLocation === 'header' ? 'is-open' : ''}`}
            onMouseEnter={() => showOpenMenu('header')}
            onMouseLeave={() => scheduleHideOpenMenu('header')}
          >
            <button
              type="button"
              className="btn-header-open"
              onClick={() => {
                if (isStopped) return
                setOpenMenuLocation((prev) => (prev === 'header' ? null : 'header'))
              }}
              disabled={isStopped}
              title={isStopped ? 'Editing stopped by host' : 'Open folder or file from computer'}
              aria-haspopup="menu"
              aria-expanded={openMenuLocation === 'header'}
              aria-label="Open.."
            >
              <span>Open..</span>
              <ChevronDown size={11} strokeWidth={1.75} />
            </button>

            {openMenuLocation === 'header' && !isStopped && (
              <div className="open-dropdown-menu" role="menu">
                <div className="open-dropdown-surface">
                  <button
                    type="button"
                    role="menuitem"
                    className="open-dropdown-item"
                    onClick={() => {
                      setOpenMenuLocation(null)
                      handleOpenFolderClick()
                    }}
                  >
                    <FolderOpen size={14} strokeWidth={1.75} />
                    <span>Folder</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="open-dropdown-item"
                    onClick={() => {
                      setOpenMenuLocation(null)
                      if (onOpenFromComputer) onOpenFromComputer()
                    }}
                  >
                    <FileUp size={14} strokeWidth={1.75} />
                    <span>File</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {files.length > 0 && (
            <button
              type="button"
              className="btn-icon-subtle btn-clear-all-files"
              onClick={() => {
                if (isStopped) return
                setIsConfirmRemoveAllOpen(true)
              }}
              disabled={isStopped}
              style={isStopped ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
              title={isStopped ? 'Editing stopped by host' : 'Remove all files'}
              aria-label="Remove all files"
            >
              <FolderX size={14} strokeWidth={1.75} />
            </button>
          )}

          <button
            type="button"
            className="btn-icon-subtle"
            onClick={() => {
              if (isStopped) return
              setIsCreating(true)
              setError('')
            }}
            disabled={isStopped}
            style={isStopped ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            title={isStopped ? 'Editing stopped by host' : 'New file'}
            aria-label={isStopped ? 'Editing stopped by host' : 'New file'}
          >
            <Plus size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={folderInputRef}
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleFolderChange}
      />

      {/* New file input form */}
      {isCreating && (
        <form onSubmit={handleCreateSubmit} className="new-file-form">
          <input
            type="text"
            className="new-file-input"
            value={newFileName}
            onChange={(e) => {
              setNewFileName(e.target.value)
              setError('')
            }}
            placeholder="e.g. main.ts, script.py"
            aria-label="New file name"
            spellCheck={false}
            autoComplete="off"
            autoFocus
          />
          {(error || (newFileName && !liveFileValidation.valid)) && (
            <span className="new-file-error">{error || liveFileValidation.error}</span>
          )}
          <div className="new-file-actions">
            <button
              type="submit"
              className="btn-flat btn-primary btn-xs"
              disabled={!newFileName || !liveFileValidation.valid || isStopped}
            >
              Create
            </button>
            <button
              type="button"
              className="btn-flat btn-secondary btn-xs"
              onClick={() => {
                setIsCreating(false)
                setNewFileName('')
                setError('')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* File Tree */}
      <div className="file-list" role="tree" aria-label="Project files">
        {files.length === 0 && !isCreating ? (
          <div className="sidebar-empty">
            <Folder size={28} strokeWidth={1.5} className="sidebar-empty-icon" />
            <p className="sidebar-empty-text">No files yet</p>
            <div className="sidebar-empty-actions">
              <button
                type="button"
                className="btn-flat btn-primary btn-sm"
                onClick={() => setIsCreating(true)}
                disabled={isStopped}
              >
                Create a file
              </button>
              <div
                ref={emptyOpenMenuRef}
                className={`open-menu-wrapper open-menu-empty ${openMenuLocation === 'empty' ? 'is-open' : ''}`}
                onMouseEnter={() => showOpenMenu('empty')}
                onMouseLeave={() => scheduleHideOpenMenu('empty')}
              >
                <button
                  type="button"
                  className="btn-flat btn-secondary btn-sm btn-empty-open"
                  onClick={() => {
                    if (isStopped) return
                    setOpenMenuLocation((prev) => (prev === 'empty' ? null : 'empty'))
                  }}
                  disabled={isStopped}
                  aria-haspopup="menu"
                  aria-expanded={openMenuLocation === 'empty'}
                >
                  <span>Open..</span>
                  <ChevronDown size={13} strokeWidth={1.75} />
                </button>

                {openMenuLocation === 'empty' && !isStopped && (
                  <div className="open-dropdown-menu open-dropdown-empty" role="menu">
                    <div className="open-dropdown-surface">
                      <button
                        type="button"
                        role="menuitem"
                        className="open-dropdown-item"
                        onClick={() => {
                          setOpenMenuLocation(null)
                          handleOpenFolderClick()
                        }}
                      >
                        <FolderOpen size={14} strokeWidth={1.75} />
                        <span>Folder</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="open-dropdown-item"
                        onClick={() => {
                          setOpenMenuLocation(null)
                          if (onOpenFromComputer) onOpenFromComputer()
                        }}
                      >
                        <FileUp size={14} strokeWidth={1.75} />
                        <span>File</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {Object.keys(tree.folders).sort().map((k) => renderFolderNode(tree.folders[k], 0))}
            {tree.files.sort().map((f) => renderFileRow(f, 0))}
          </>
        )}
      </div>

      {/* Remove All Files confirmation dialog */}
      {isConfirmRemoveAllOpen && (
        <div className="modal-backdrop" onClick={() => setIsConfirmRemoveAllOpen(false)}>
          <div className="modal-card modal-delete" onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-title">Remove All Files</h4>
            <p className="modal-desc">
              Are you sure you want to delete all {files.length} file{files.length === 1 ? '' : 's'} from the workspace? This will permanently delete them for everyone in the room.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-flat btn-secondary"
                onClick={() => setIsConfirmRemoveAllOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-flat btn-danger btn-confirm-remove-all"
                onClick={() => {
                  setIsConfirmRemoveAllOpen(false)
                  if (onClearAllFiles) onClearAllFiles()
                }}
              >
                Remove All Files
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {fileToDelete && (
        <div className="modal-backdrop" onClick={() => setFileToDelete(null)}>
          <div className="modal-card modal-delete" onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-title">Delete File</h4>
            <p className="modal-desc">
              Are you sure you want to delete <code>{fileToDelete}</code>? This will delete it for everyone in the room.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-flat btn-secondary"
                onClick={() => setFileToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-flat btn-danger"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
