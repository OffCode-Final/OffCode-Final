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
  Files
} from 'lucide-react'
import { getFileExtension } from '../utils/helpers'

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
  onClearAllFiles,
  users = [],
  isStopped = false,
  isHost = false,
  onImportFolder,
  isCollapsed = false,
  onToggleCollapse
}) {
  const [isCreating, setIsCreating] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [fileToDelete, setFileToDelete] = useState(null)
  const [error, setError] = useState('')
  const [expandedFolders, setExpandedFolders] = useState(() => new Set())
  const folderInputRef = useRef(null)

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

  const handleOpenFolderClick = () => {
    if (isStopped) return
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

  const handleCreateSubmit = (e) => {
    e.preventDefault()
    const trimmed = newFileName.trim()
    if (!trimmed) {
      setError('File name cannot be empty')
      return
    }
    if (files.includes(trimmed)) {
      setError('A file with this name already exists')
      return
    }
    onCreateFile(trimmed)
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

    // Find remote users viewing this file
    const remoteViewers = users.filter((u) => !u.isYou && u.currentFile === filePath)

    return (
      <div
        key={filePath}
        className={`file-row ${isActive ? 'active' : ''}`}
        onClick={() => onSelectFile(filePath)}
        style={{ paddingLeft: `${14 + depth * 14}px` }}
        title={filePath}
      >
        <div className="file-row-main">
          {getLanguageDot(filePath)}
          <span className="file-row-name">{displayName}</span>

          {/* Remote presence dots in user colors */}
          {remoteViewers.length > 0 && (
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
      <aside className="sidebar-rail" onClick={onToggleCollapse} title="Expand Explorer (Ctrl+B)">
        <button
          type="button"
          className="btn-rail-icon"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse()
          }}
          title="Expand Explorer (Ctrl+B)"
          aria-label="Expand Explorer"
        >
          <Files size={16} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          className="btn-rail-icon"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse()
            setTimeout(() => setIsCreating(true), 100)
          }}
          disabled={isStopped}
          title="New file"
          aria-label="New file"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
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
          {isHost && (
            <>
              <button
                type="button"
                className="btn-icon-subtle btn-open-folder"
                onClick={handleOpenFolderClick}
                disabled={isStopped}
                style={isStopped ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                title={isStopped ? 'Editing stopped by host' : 'Import folder'}
                aria-label="Import folder"
              >
                <Upload size={14} strokeWidth={1.75} />
              </button>

              {files.length > 0 && (
                <button
                  type="button"
                  className="btn-icon-subtle btn-clear-all-files"
                  onClick={() => {
                    if (isStopped) return
                    if (onClearAllFiles) onClearAllFiles()
                  }}
                  disabled={isStopped}
                  style={isStopped ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                  title={isStopped ? 'Editing stopped by host' : 'Remove all files'}
                  aria-label="Remove all files"
                >
                  <FolderX size={14} strokeWidth={1.75} />
                </button>
              )}
            </>
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

      {isHost && (
        <input
          type="file"
          ref={folderInputRef}
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: 'none' }}
          onChange={handleFolderChange}
        />
      )}

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
          {error && <span className="new-file-error">{error}</span>}
          <div className="new-file-actions">
            <button type="submit" className="btn-flat btn-primary btn-xs">
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
            <p>No files yet</p>
            <button
              type="button"
              className="btn-flat btn-secondary btn-xs"
              onClick={() => setIsCreating(true)}
              disabled={isStopped}
            >
              Create a file
            </button>
          </div>
        ) : (
          <>
            {Object.keys(tree.folders).sort().map((k) => renderFolderNode(tree.folders[k], 0))}
            {tree.files.sort().map((f) => renderFileRow(f, 0))}
          </>
        )}
      </div>

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
