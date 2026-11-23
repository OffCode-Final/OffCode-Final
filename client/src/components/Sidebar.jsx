import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Plus,
  Trash2,
  FileCode,
  FileText,
  AlertCircle,
  Folder,
  FolderOpen,
  FolderX,
  ChevronRight,
  ChevronDown,
  Upload,
  Info
} from 'lucide-react'
import { getFileExtension, SUPPORTED_EXTENSIONS } from '../utils/helpers'

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
  onImportFolder
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
    e.target.value = ''
  }

  const handleCreateSubmit = (e) => {
    e.preventDefault()
    const cleanName = newFileName.trim()

    if (!cleanName) {
      setError('Enter a file name.')
      return
    }

    const ext = getFileExtension(cleanName)
    if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
      setError(`Supported extensions: ${SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(', ')}`)
      return
    }

    if (files.includes(cleanName)) {
      setError('A file with this name already exists.')
      return
    }

    onCreateFile(cleanName)
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

  const getFileIcon = (filename) => {
    const ext = getFileExtension(filename)
    if (ext === 'md') {
      return <FileText size={14} className="file-icon file-icon-md" />
    }
    if (ext === 'txt') {
      return <FileText size={14} className="file-icon file-icon-txt" />
    }
    if (ext === 'py') {
      return <FileCode size={14} className="file-icon file-icon-py" />
    }
    if (['js', 'jsx', 'mjs'].includes(ext)) {
      return <FileCode size={14} className="file-icon file-icon-js" />
    }
    if (['ts', 'tsx'].includes(ext)) {
      return <FileCode size={14} className="file-icon file-icon-ts" />
    }
    if (['html', 'htm'].includes(ext)) {
      return <FileCode size={14} className="file-icon file-icon-html" />
    }
    if (['css'].includes(ext)) {
      return <FileCode size={14} className="file-icon file-icon-css" />
    }
    if (ext === 'json') {
      return <FileCode size={14} className="file-icon file-icon-json" />
    }
    if (['c', 'h'].includes(ext)) {
      return <FileCode size={14} className="file-icon file-icon-c" />
    }
    if (['cpp', 'cxx', 'cc', 'hpp'].includes(ext)) {
      return <FileCode size={14} className="file-icon file-icon-cpp" />
    }
    if (ext === 'java') {
      return <FileCode size={14} className="file-icon file-icon-java" />
    }
    if (ext === 'php') {
      return <FileCode size={14} className="file-icon file-icon-php" />
    }
    if (ext === 'rs') {
      return <FileCode size={14} className="file-icon file-icon-rs" />
    }
    if (ext === 'go') {
      return <FileCode size={14} className="file-icon file-icon-go" />
    }
    if (ext === 'rb') {
      return <FileCode size={14} className="file-icon file-icon-rb" />
    }
    return <FileCode size={14} className="file-icon" />
  }

  const tree = useMemo(() => buildTree(files), [files])
  const rootFolders = Object.keys(tree.folders).sort()
  const rootFiles = [...tree.files].sort()

  const renderFileRow = (filePath, depth = 0) => {
    const isActive = filePath === activeFile
    const displayName = filePath.split('/').pop()
    const remoteViewers = users.filter((u) => !u.isYou && u.currentFile === filePath)

    return (
      <div
        key={filePath}
        className={`file-row ${isActive ? 'active' : ''}`}
        onClick={() => onSelectFile(filePath)}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        title={filePath}
      >
        <div className="file-row-main">
          {getFileIcon(filePath)}
          <span className="file-row-name">{displayName}</span>

          {/* Presence indicator dot for remote collaborators */}
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
          <Trash2 size={13} />
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
          <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }}>
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-warning)' }}>
            {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
          <span className="file-row-name" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
            {folderNode.name}
          </span>
        </div>

        {isExpanded && (
          <div className="folder-children">
            {subFolderKeys.map((k) => renderFolderNode(folderNode.folders[k], depth + 1))}
            {folderFiles.map((f) => renderFileRow(f, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <span className="sidebar-title">EXPLORER</span>
        <div className="sidebar-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {isHost && (
            <>
              <button
                type="button"
                className="btn-icon-subtle btn-open-folder"
                onClick={handleOpenFolderClick}
                disabled={isStopped}
                style={isStopped ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                title={isStopped ? 'Editing stopped by host' : 'Open folder (one-time copy)'}
              >
                <Upload size={14} />
              </button>

              <span
                className="btn-icon-subtle info-tooltip-trigger"
                title="Open folder is a one-time copy; edits do not write back to computer."
                tabIndex={0}
                aria-label="Open folder information"
                style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', color: 'var(--text-faint)' }}
              >
                <Info size={13} />
              </span>

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
                  title={isStopped ? 'Editing stopped by host' : 'Remove all files / close folder'}
                >
                  <FolderX size={14} />
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
            <Plus size={15} />
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
        <form onSubmit={handleCreateSubmit} className="new-file-box">
          <input
            type="text"
            className="text-input new-file-input"
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
          {error && (
            <div className="validation-msg">
              <AlertCircle size={12} />
              <span>{error}</span>
            </div>
          )}

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

      {/* Compact File and Folder Tree List */}
      <div className="file-list">
        {files.length === 0 ? (
          <div className="file-list-empty">No files in workspace.</div>
        ) : (
          <>
            {rootFolders.map((fKey) => renderFolderNode(tree.folders[fKey], 0))}
            {rootFiles.map((fileName) => renderFileRow(fileName, 0))}
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {fileToDelete && (
        <div className="modal-backdrop" onClick={() => setFileToDelete(null)}>
          <div className="modal-card modal-delete" onClick={(e) => e.stopPropagation()}>
            <h4>Delete File</h4>
            <p>Delete "{fileToDelete}"? This cannot be undone.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-flat btn-danger btn-sm"
                onClick={confirmDelete}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn-flat btn-secondary btn-sm"
                onClick={() => setFileToDelete(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
