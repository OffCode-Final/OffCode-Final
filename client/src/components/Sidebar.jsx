import { useState } from 'react'
import { getFileBadgeInfo, SUPPORTED_EXTENSIONS, getFileExtension } from '../utils/helpers'

export default function Sidebar({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onDeleteFile
}) {
  const [isCreating, setIsCreating] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [fileToDelete, setFileToDelete] = useState(null)
  const [error, setError] = useState('')

  const handleCreateSubmit = (e) => {
    e.preventDefault()
    const cleanName = newFileName.trim()

    if (!cleanName) {
      setError('Please provide a file name.')
      return
    }

    // Check if filename has an extension
    const ext = getFileExtension(cleanName)
    if (!ext) {
      setError('Please include an extension (e.g. .py, .js, .html, .css, .json, .md, .cpp, .java).')
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

  const handleQuickPreset = (preset) => {
    // Generate a unique name for this extension
    let base = preset.defaultName
    let counter = 1
    while (files.includes(base)) {
      const ext = preset.ext
      const raw = preset.defaultName.replace(`.${ext}`, '')
      base = `${raw}${counter}.${ext}`
      counter++
    }
    onCreateFile(base)
    setIsCreating(false)
    setError('')
  }

  const confirmDelete = () => {
    if (fileToDelete) {
      onDeleteFile(fileToDelete)
      setFileToDelete(null)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">FILES</span>
        <button
          type="button"
          className="btn-add-file"
          onClick={() => {
            setIsCreating(true)
            setError('')
          }}
          title="Create a new file with any supported extension"
        >
          + New File
        </button>
      </div>

      {/* New file input form */}
      {isCreating && (
        <form onSubmit={handleCreateSubmit} className="new-file-form">
          <input
            type="text"
            className="text-input new-file-input"
            value={newFileName}
            onChange={(e) => {
              setNewFileName(e.target.value)
              setError('')
            }}
            placeholder="e.g. main.py, app.js, index.html"
            autoFocus
          />
          {error && <div className="input-error">{error}</div>}

          {/* Quick 1-click language extension presets */}
          <div className="preset-chips-container">
            <span className="preset-label">Quick Presets:</span>
            <div className="preset-chips">
              {SUPPORTED_EXTENSIONS.map((p) => (
                <button
                  key={p.ext}
                  type="button"
                  className="btn-preset-chip"
                  onClick={() => handleQuickPreset(p)}
                  title={`Create new ${p.label} file`}
                >
                  +{p.ext}
                </button>
              ))}
            </div>
          </div>

          <div className="new-file-actions">
            <button type="submit" className="btn-small btn-primary">
              Create File
            </button>
            <button
              type="button"
              className="btn-small btn-secondary"
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

      {/* Files list */}
      <div className="file-list">
        {files.length === 0 ? (
          <div className="sidebar-empty">
            <p>No files in workspace.</p>
            <button
              type="button"
              className="btn-small btn-primary"
              onClick={() => setIsCreating(true)}
            >
              Create First File
            </button>
          </div>
        ) : (
          files.map((fileName) => {
            const badge = getFileBadgeInfo(fileName)
            const isActive = fileName === activeFile

            return (
              <div
                key={fileName}
                className={`file-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectFile(fileName)}
                title={`Open ${fileName}`}
              >
                <div className="file-item-left">
                  <span
                    className="file-badge"
                    style={{ backgroundColor: badge.color }}
                  >
                    {badge.label}
                  </span>
                  <span className="file-name">{fileName}</span>
                </div>

                <button
                  type="button"
                  className="btn-delete-file"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFileToDelete(fileName)
                  }}
                  title={`Delete ${fileName}`}
                >
                  ✕
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Delete confirmation modal */}
      {fileToDelete && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Delete File</h3>
            <p>
              Are you sure you want to delete <strong>{fileToDelete}</strong>?
              This will remove it for all collaborators in this room.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-small btn-danger"
                onClick={confirmDelete}
              >
                Delete File
              </button>
              <button
                type="button"
                className="btn-small btn-secondary"
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
