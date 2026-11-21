import { useState } from 'react'
import { Plus, Trash2, FileCode, FileText, AlertCircle } from 'lucide-react'
import { getFileExtension, SUPPORTED_EXTENSIONS } from '../utils/helpers'

export default function Sidebar({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  users = [],
  isStopped = false
}) {
  const [isCreating, setIsCreating] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [fileToDelete, setFileToDelete] = useState(null)
  const [error, setError] = useState('')

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
    if (['md', 'txt'].includes(ext)) {
      return <FileText size={14} className="file-icon" />
    }
    return <FileCode size={14} className="file-icon" />
  }

  return (
    <aside className="sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <span className="sidebar-title">FILES</span>
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
        >
          <Plus size={15} />
        </button>
      </div>

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
            placeholder="e.g. script.py, app.js"
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

      {/* Compact File List */}
      <div className="file-list">
        {files.length === 0 ? (
          <div className="file-list-empty">No files in workspace.</div>
        ) : (
          files.map((fileName) => {
            const isActive = fileName === activeFile
            const remoteViewers = users.filter(
              (u) => !u.isYou && u.currentFile === fileName
            )

            return (
              <div
                key={fileName}
                className={`file-row ${isActive ? 'active' : ''}`}
                onClick={() => onSelectFile(fileName)}
                title={fileName}
              >
                <div className="file-row-main">
                  {getFileIcon(fileName)}
                  <span className="file-row-name">{fileName}</span>

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
                    setFileToDelete(fileName)
                  }}
                  disabled={isStopped}
                  style={isStopped ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                  title={isStopped ? 'Editing stopped by host' : `Delete ${fileName}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })
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
