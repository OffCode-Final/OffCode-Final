import { useState, useEffect, useRef, useMemo } from 'react'
import {
  X,
  Plus,
  Send,
  Square,
  History,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Key,
  BarChart2,
  ChevronDown,
  CornerDownLeft,
  Replace
} from 'lucide-react'
import { streamChatWithGemini, buildChatFileContext } from '../ai/gemini'
import {
  loadAiChats,
  saveAiChats,
  formatTokenCount
} from '../utils/aiStorage'

const STARTER_CHIPS = [
  'Explain this code',
  'Find bugs',
  'Add comments',
  'Make it faster'
]

const SYSTEM_INSTRUCTION =
  'You are a concise coding assistant inside a collaborative code editor. Use fenced code blocks with the language identifier (for example ```python or ```js). When changing quoted code, return the full replacement for that part.'

function createNewChatRecord() {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: 'New chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  }
}

function renderInlineSpans(text, keyPrefix) {
  const parts = []
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIdx = 0
  let match
  let partIdx = 0

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index))
    }
    const token = match[0]
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={`${keyPrefix}-c-${partIdx++}`} className="ai-inline-code">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-b-${partIdx++}`}>
          {token.slice(2, -2)}
        </strong>
      )
    }
    lastIdx = tokenRegex.lastIndex
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx))
  }
  return parts.length > 0 ? parts : text
}

function CodeBlockCard({
  language,
  code,
  canEditEditor,
  disabledReason,
  onInsertAtCursor,
  onReplaceSelection
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch (_) {}
  }

  return (
    <div className="ai-code-block">
      <div className="ai-code-block-header">
        <span className="ai-code-lang">{language || 'code'}</span>
        <div className="ai-code-actions">
          <button
            type="button"
            className="ai-code-btn"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            className="ai-code-btn"
            disabled={!canEditEditor}
            title={disabledReason || 'Insert at cursor'}
            onClick={() => onInsertAtCursor && onInsertAtCursor(code)}
          >
            <CornerDownLeft size={11} />
            <span>Insert at cursor</span>
          </button>
          <button
            type="button"
            className="ai-code-btn"
            disabled={!canEditEditor}
            title={disabledReason || 'Replace selection'}
            onClick={() => onReplaceSelection && onReplaceSelection(code)}
          >
            <Replace size={11} />
            <span>Replace selection</span>
          </button>
        </div>
      </div>
      <pre className="ai-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderSafeMarkdown(
  rawText,
  { canEditEditor, disabledReason, onInsertAtCursor, onReplaceSelection }
) {
  const text = String(rawText || '')
  if (!text) return null

  const segments = []
  const lines = text.split('\n')
  let inCode = false
  let codeLang = ''
  let codeLines = []
  let textLines = []

  const flushText = () => {
    if (textLines.length > 0) {
      segments.push({ type: 'text', text: textLines.join('\n') })
      textLines = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceMatch = line.match(/^\s*```([A-Za-z0-9_+-]*)\s*$/)
    if (!inCode && fenceMatch) {
      flushText()
      inCode = true
      codeLang = fenceMatch[1] || ''
      codeLines = []
    } else if (inCode && /^\s*```\s*$/.test(line)) {
      segments.push({ type: 'code', language: codeLang, code: codeLines.join('\n') })
      inCode = false
      codeLang = ''
      codeLines = []
    } else if (inCode) {
      codeLines.push(line)
    } else {
      textLines.push(line)
    }
  }

  if (inCode) {
    segments.push({ type: 'code', language: codeLang, code: codeLines.join('\n') })
  } else {
    flushText()
  }

  const elements = []
  segments.forEach((seg, segIdx) => {
    if (seg.type === 'code') {
      elements.push(
        <CodeBlockCard
          key={`seg-code-${segIdx}`}
          language={seg.language}
          code={seg.code}
          canEditEditor={canEditEditor}
          disabledReason={disabledReason}
          onInsertAtCursor={onInsertAtCursor}
          onReplaceSelection={onReplaceSelection}
        />
      )
      return
    }

    const blockLines = seg.text.split('\n')
    let idx = 0
    while (idx < blockLines.length) {
      const line = blockLines[idx]
      if (!line.trim()) {
        idx++
        continue
      }

      if (/^\s*[-*]\s+/.test(line)) {
        const items = []
        while (idx < blockLines.length && /^\s*[-*]\s+/.test(blockLines[idx])) {
          items.push(blockLines[idx].replace(/^\s*[-*]\s+/, ''))
          idx++
        }
        elements.push(
          <ul key={`seg-${segIdx}-ul-${idx}`} className="ai-md-list">
            {items.map((item, k) => (
              <li key={k}>{renderInlineSpans(item, `ul-${segIdx}-${idx}-${k}`)}</li>
            ))}
          </ul>
        )
        continue
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const items = []
        while (idx < blockLines.length && /^\s*\d+\.\s+/.test(blockLines[idx])) {
          items.push(blockLines[idx].replace(/^\s*\d+\.\s+/, ''))
          idx++
        }
        elements.push(
          <ol key={`seg-${segIdx}-ol-${idx}`} className="ai-md-list">
            {items.map((item, k) => (
              <li key={k}>{renderInlineSpans(item, `ol-${segIdx}-${idx}-${k}`)}</li>
            ))}
          </ol>
        )
        continue
      }

      const paraLines = []
      while (
        idx < blockLines.length &&
        blockLines[idx].trim() &&
        !/^\s*[-*]\s+/.test(blockLines[idx]) &&
        !/^\s*\d+\.\s+/.test(blockLines[idx])
      ) {
        paraLines.push(blockLines[idx])
        idx++
      }
      elements.push(
        <p key={`seg-${segIdx}-p-${idx}`} className="ai-md-para">
          {renderInlineSpans(paraLines.join('\n'), `p-${segIdx}-${idx}`)}
        </p>
      )
    }
  })

  return elements
}

export default function AiChatPanel({
  isOpen,
  onClose,
  apiKey = '',
  onOpenKeyModal,
  isOffline = false,
  isStopped = false,
  readOnly = false,
  activeFile = null,
  activeCode = '',
  activeLanguage = '',
  files = [],
  editorActionsRef,
  pendingQuote = null,
  onClearPendingQuote,
  usageState,
  onRecordUsage,
  onResetUsage,
  onNotify
}) {
  const [chats, setChats] = useState(() => {
    const loaded = loadAiChats()
    return loaded.length > 0 ? loaded : [createNewChatRecord()]
  })
  const [activeChatId, setActiveChatId] = useState(() => {
    const loaded = loadAiChats()
    return loaded[0]?.id || null
  })
  const [inputText, setInputText] = useState('')
  const [includeCurrentFile, setIncludeCurrentFile] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isUsageOpen, setIsUsageOpen] = useState(false)
  const [copiedMsgId, setCopiedMsgId] = useState(null)

  const abortControllerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const historyRef = useRef(null)
  const usageRef = useRef(null)

  // Keep activeChatId aligned with chats list
  useEffect(() => {
    if (!chats.some((c) => c.id === activeChatId)) {
      if (chats.length > 0) {
        setActiveChatId(chats[0].id)
      } else {
        const fresh = createNewChatRecord()
        setChats([fresh])
        setActiveChatId(fresh.id)
      }
    }
  }, [chats, activeChatId])

  useEffect(() => {
    saveAiChats(chats)
  }, [chats])

  useEffect(() => {
    const handleOutside = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setIsHistoryOpen(false)
      }
      if (usageRef.current && !usageRef.current.contains(e.target)) {
        setIsUsageOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Focus input when opened with a quote
  useEffect(() => {
    if (isOpen && pendingQuote && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen, pendingQuote])

  // Auto-grow textarea height
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(120, Math.max(36, el.scrollHeight))}px`
  }, [inputText])

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || chats[0],
    [chats, activeChatId]
  )

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ block: 'end' })
    }
  }, [activeChat?.messages?.length, isStreaming])

  const updateChatById = (chatId, updater) => {
    setChats((prev) =>
      prev
        .map((c) => (c.id === chatId ? updater(c) : c))
        .slice(0, 50)
    )
  }

  const handleNewChat = () => {
    if (isStreaming && abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const fresh = createNewChatRecord()
    setChats((prev) => [fresh, ...prev].slice(0, 50))
    setActiveChatId(fresh.id)
    setIsHistoryOpen(false)
  }

  const handleDeleteChat = (chatId, e) => {
    e.stopPropagation()
    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== chatId)
      return remaining.length > 0 ? remaining : [createNewChatRecord()]
    })
  }

  const buildRequestContents = (priorMessages, nextUserMessageText, quoteToAttach) => {
    const historyWindow = priorMessages
      .filter((m) => !m.error && m.text)
      .slice(-20) // up to last 10 user/assistant turns
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }))

    const ctxLines = []
    if (files.length > 0) {
      ctxLines.push(`Open room files: ${files.join(', ')}`)
    }
    if (activeFile) {
      ctxLines.push(`Active file: ${activeFile} (${activeLanguage || 'Plain Text'})`)
    }
    if (includeCurrentFile && activeFile && activeCode) {
      const aroundLine =
        quoteToAttach?.startLine ||
        editorActionsRef?.current?.getCursorLine?.() ||
        1
      const sliced = buildChatFileContext(activeCode, aroundLine)
      const note = sliced.truncated
        ? ` (excerpt lines ${sliced.startLine}-${sliced.endLine})`
        : ''
      ctxLines.push(`Current file${note}:\n\`\`\`${activeLanguage || ''}\n${sliced.text}\n\`\`\``)
    }
    if (quoteToAttach) {
      if (quoteToAttach.kind === 'error') {
        ctxLines.push(
          `Quoted error (${quoteToAttach.label}):\n\`\`\`\n${quoteToAttach.text}\n\`\`\``
        )
      } else {
        const rangePart = quoteToAttach.startLine
          ? ` (lines ${quoteToAttach.startLine}-${quoteToAttach.endLine})`
          : ''
        ctxLines.push(
          `Quoted code from ${quoteToAttach.fileName}${rangePart}:\n\`\`\`\n${quoteToAttach.text}\n\`\`\``
        )
      }
    }

    const userPrompt = ctxLines.length > 0
      ? `${ctxLines.join('\n\n')}\n\nQuestion:\n${nextUserMessageText}`
      : nextUserMessageText

    return [...historyWindow, { role: 'user', parts: [{ text: userPrompt }] }]
  }

  const executePrompt = async ({ text, quote = null, replaceMessages = null }) => {
    if (!activeChat || isStreaming) return
    const trimmed = String(text || '').trim()
    if (!trimmed) return

    const chatId = activeChat.id
    const baseMessages = replaceMessages !== null ? replaceMessages : activeChat.messages
    const isFirstQuestion = baseMessages.filter((m) => m.role === 'user').length === 0
    const nextTitle = isFirstQuestion
      ? (trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed)
      : activeChat.title

    const userMsg = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: trimmed,
      quote: quote || null
    }
    const assistantMsgId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const assistantPlaceholder = {
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      usage: null,
      error: null,
      isKeyError: false
    }

    updateChatById(chatId, (c) => ({
      ...c,
      title: nextTitle,
      updatedAt: Date.now(),
      messages: [...baseMessages, userMsg, assistantPlaceholder]
    }))

    const resolvedKey = (apiKey || '').trim() || (() => {
      try {
        return (window.localStorage.getItem('offcode-gemini-key') || '').trim()
      } catch (_) {
        return ''
      }
    })()

    if (!resolvedKey) {
      updateChatById(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                text: 'No Gemini API key configured yet.',
                error: 'No Gemini API key configured yet.',
                isKeyError: true
              }
            : m
        )
      }))
      return
    }

    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      updateChatById(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                text: 'You are offline. Reconnect to the internet to ask the AI.',
                error: 'Offline'
              }
            : m
        )
      }))
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsStreaming(true)

    try {
      const contents = buildRequestContents(baseMessages, trimmed, quote)
      const res = await streamChatWithGemini({
        apiKey: resolvedKey,
        systemInstruction: SYSTEM_INSTRUCTION,
        contents,
        signal: controller.signal,
        onChunk: (partial) => {
          updateChatById(chatId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, text: partial } : m
            )
          }))
        }
      })

      updateChatById(chatId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: c.messages.map((m) =>
          m.id === assistantMsgId
            ? { ...m, text: res.text, usage: res.usage, error: null }
            : m
        )
      }))

      if (onRecordUsage) {
        onRecordUsage({
          chatId,
          chatTitle: nextTitle,
          category: 'chat',
          usage: res.usage
        })
      }
    } catch (err) {
      const errMsg = err?.isAbort ? 'Generation stopped.' : (err?.message || 'AI request failed.')
      updateChatById(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                text: m.text || errMsg,
                error: errMsg,
                isKeyError: Boolean(err?.isKeyError)
              }
            : m
        )
      }))
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setIsStreaming(false)
    }
  }

  const handleSend = () => {
    const trimmed = inputText.trim()
    if (!trimmed && !pendingQuote) return
    const questionText = trimmed || 'Explain this.'
    const quoteToSend = pendingQuote || null
    setInputText('')
    if (quoteToSend && onClearPendingQuote) {
      onClearPendingQuote()
    }
    executePrompt({ text: questionText, quote: quoteToSend })
  }

  const handleRegenerate = (assistantMsgIndex) => {
    if (!activeChat || isStreaming) return
    const msgs = activeChat.messages
    let userIdx = assistantMsgIndex - 1
    while (userIdx >= 0 && msgs[userIdx].role !== 'user') {
      userIdx--
    }
    if (userIdx < 0) return
    const userMsg = msgs[userIdx]
    executePrompt({
      text: userMsg.text,
      quote: userMsg.quote || null,
      replaceMessages: msgs.slice(0, userIdx)
    })
  }

  const canEditEditor = Boolean(activeFile && !readOnly && !isStopped && !isOffline)
  let editorDisabledReason = ''
  if (!activeFile) editorDisabledReason = 'Open a file first'
  else if (isStopped) editorDisabledReason = 'Editing stopped by host'
  else if (readOnly) editorDisabledReason = 'Main file tab is read-only'
  else if (isOffline) editorDisabledReason = 'AI code edits are disabled while offline'

  const handleInsertAtCursor = (code) => {
    if (!canEditEditor || !editorActionsRef?.current?.insertAtCursor) return
    const ok = editorActionsRef.current.insertAtCursor(code)
    if (ok && onNotify) onNotify('Inserted code at cursor', 'success')
  }

  const handleReplaceSelection = (code) => {
    if (!canEditEditor || !editorActionsRef?.current?.replaceSelection) return
    const ok = editorActionsRef.current.replaceSelection(code)
    if (onNotify) {
      onNotify(
        ok ? 'Replaced selection' : 'Select code in the editor first to replace it',
        ok ? 'success' : 'info'
      )
    }
  }

  if (!isOpen) return null

  const chatUsage = (activeChat && usageState?.byChat?.[activeChat.id]) || {
    prompt: 0,
    output: 0,
    total: 0,
    requests: 0,
    approx: false
  }
  const totalUsage = usageState?.total || {
    prompt: 0,
    output: 0,
    total: 0,
    requests: 0,
    approx: false
  }
  const usageRows = [
    ...Object.entries(usageState?.byChat || {}).map(([id, row]) => ({ id, ...row })),
    ...(usageState?.other?.improve?.requests > 0
      ? [{ id: 'other-improve', ...usageState.other.improve }]
      : []),
    ...(usageState?.other?.inline?.requests > 0
      ? [{ id: 'other-inline', ...usageState.other.inline }]
      : [])
  ]

  return (
    <aside className="ai-chat-panel" aria-label="Private AI Assistant">
      <div className="ai-chat-header">
        <div className="ai-chat-title-group">
          <Sparkles size={13} strokeWidth={1.75} />
          <span className="chat-title">AI ASSISTANT</span>
        </div>

        <div className="ai-chat-header-actions">
          <button
            type="button"
            className="btn-icon-bar"
            onClick={handleNewChat}
            title="New chat"
            aria-label="New chat"
          >
            <Plus size={14} />
          </button>

          <div className="ai-popover-wrap" ref={historyRef}>
            <button
              type="button"
              className={`btn-icon-bar ${isHistoryOpen ? 'active' : ''}`}
              onClick={() => setIsHistoryOpen((prev) => !prev)}
              title="Chat history (local only)"
              aria-label="Chat history"
            >
              <History size={14} />
              <ChevronDown size={11} />
            </button>
            {isHistoryOpen && (
              <div className="ai-dropdown-popover" role="menu">
                <div className="ai-popover-title">Saved chats ({chats.length}/50)</div>
                <div className="ai-history-list">
                  {chats.map((c) => (
                    <div
                      key={c.id}
                      className={`ai-history-item ${c.id === activeChat?.id ? 'active' : ''}`}
                      onClick={() => {
                        if (isStreaming && abortControllerRef.current) {
                          abortControllerRef.current.abort()
                        }
                        setActiveChatId(c.id)
                        setIsHistoryOpen(false)
                      }}
                    >
                      <span className="ai-history-name">{c.title || 'New chat'}</span>
                      <button
                        type="button"
                        className="ai-history-del"
                        onClick={(e) => handleDeleteChat(c.id, e)}
                        title="Delete chat"
                        aria-label={`Delete ${c.title || 'chat'}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="ai-popover-wrap" ref={usageRef}>
            <button
              type="button"
              className={`btn-icon-bar ${isUsageOpen ? 'active' : ''}`}
              onClick={() => setIsUsageOpen((prev) => !prev)}
              title="Token usage"
              aria-label="Token usage"
            >
              <BarChart2 size={14} />
            </button>
            {isUsageOpen && (
              <div className="ai-dropdown-popover ai-usage-popover">
                <div className="ai-usage-top">
                  <span>
                    Token usage since {new Date(usageState?.since || Date.now()).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    className="btn-flat btn-secondary btn-xs"
                    onClick={() => {
                      if (onResetUsage) onResetUsage()
                    }}
                  >
                    Reset usage
                  </button>
                </div>
                {usageRows.length === 0 ? (
                  <div className="ai-usage-empty">No AI requests recorded yet.</div>
                ) : (
                  <div className="ai-usage-table-wrap">
                    <table className="ai-usage-table">
                      <thead>
                        <tr>
                          <th>Chat / Feature</th>
                          <th>Req</th>
                          <th>In</th>
                          <th>Out</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usageRows.map((row) => (
                          <tr key={row.id}>
                            <td className="ai-usage-name">{row.title}</td>
                            <td>{row.requests}</td>
                            <td>{formatTokenCount(row.prompt)}</td>
                            <td>{formatTokenCount(row.output)}</td>
                            <td>
                              {formatTokenCount(row.total)}
                              {row.approx ? ' approx' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-icon-bar"
            onClick={onClose}
            title="Close AI panel"
            aria-label="Close AI panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="ai-context-bar">
        <label className="ai-include-label">
          <input
            type="checkbox"
            checked={includeCurrentFile}
            onChange={(e) => setIncludeCurrentFile(e.target.checked)}
          />
          <span>
            Include current file{activeFile ? ` (${activeFile.split('/').pop()})` : ''}
          </span>
        </label>
        <span className="ai-private-badge" title="Saved only in your browser">Private</span>
      </div>

      <div className="ai-chat-messages">
        {!activeChat?.messages?.length ? (
          <div className="ai-chat-empty">
            <p className="ai-empty-heading">Private coding assistant</p>
            <p className="ai-empty-sub">Chats stay on your device only. Select code to quote it.</p>
            <div className="ai-starter-chips">
              {STARTER_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="ai-starter-chip"
                  onClick={() => executePrompt({ text: chip, quote: pendingQuote || null })}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          activeChat.messages.map((msg, idx) => (
            <div key={msg.id} className={`ai-msg ai-msg-${msg.role}`}>
              {msg.role === 'user' ? (
                <div className="ai-user-bubble">
                  {msg.quote && (
                    <div className="ai-msg-quote-tag">
                      {msg.quote.label}
                    </div>
                  )}
                  <div className="ai-user-text">{msg.text}</div>
                </div>
              ) : (
                <div className="ai-assistant-block">
                  {msg.error && msg.isKeyError ? (
                    <div className="ai-inline-error">
                      <span>{msg.error}</span>
                      <button
                        type="button"
                        className="btn-flat btn-primary btn-xs"
                        onClick={onOpenKeyModal}
                      >
                        <Key size={11} />
                        <span>Add your Gemini key</span>
                      </button>
                    </div>
                  ) : msg.error && !msg.text ? (
                    <div className="ai-inline-error">{msg.error}</div>
                  ) : (
                    <div className="ai-md-body">
                      {renderSafeMarkdown(msg.text, {
                        canEditEditor,
                        disabledReason: editorDisabledReason,
                        onInsertAtCursor: handleInsertAtCursor,
                        onReplaceSelection: handleReplaceSelection
                      })}
                      {msg.error && (
                        <div className="ai-inline-error" style={{ marginTop: 6 }}>{msg.error}</div>
                      )}
                    </div>
                  )}

                  {!(isStreaming && idx === activeChat.messages.length - 1) && (
                    <div className="ai-assistant-meta">
                      {msg.usage ? (
                        <span className="ai-msg-tokens">
                          {formatTokenCount(msg.usage.totalTokens)} tokens (in {formatTokenCount(msg.usage.promptTokens)}, out {formatTokenCount(msg.usage.outputTokens)}){msg.usage.approx ? ' approx' : ''}
                        </span>
                      ) : <span />}
                      <div className="ai-msg-actions">
                        {msg.text && (
                          <button
                            type="button"
                            className="ai-meta-btn"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(msg.text)
                                setCopiedMsgId(msg.id)
                                setTimeout(() => setCopiedMsgId(null), 1500)
                              } catch (_) {}
                            }}
                            title="Copy answer"
                          >
                            {copiedMsgId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                            <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="ai-meta-btn"
                          onClick={() => handleRegenerate(idx)}
                          disabled={isStreaming}
                          title="Regenerate answer"
                        >
                          <RotateCcw size={11} />
                          <span>Regenerate</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-input-dock">
        {pendingQuote && (
          <div className="ai-quote-chip">
            <div className="ai-quote-chip-top">
              <span className="ai-quote-chip-label">{pendingQuote.label}</span>
              <button
                type="button"
                className="ai-quote-chip-close"
                onClick={onClearPendingQuote}
                aria-label="Remove quote"
                title="Remove quote"
              >
                <X size={12} />
              </button>
            </div>
            <pre className="ai-quote-chip-preview">{pendingQuote.preview}</pre>
          </div>
        )}

        <div className="ai-input-row">
          <textarea
            ref={textareaRef}
            className="ai-chat-textarea"
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!isStreaming) handleSend()
              }
            }}
            placeholder={
              !apiKey
                ? 'Ask AI (add Gemini key to send)...'
                : 'Ask about this code... (Enter sends)'
            }
          />
          {isStreaming ? (
            <button
              type="button"
              className="btn-flat btn-danger btn-xs ai-send-btn"
              onClick={() => abortControllerRef.current?.abort()}
              title="Stop generating"
            >
              <Square size={12} />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-flat btn-primary btn-xs ai-send-btn"
              onClick={handleSend}
              disabled={!inputText.trim() && !pendingQuote}
              title="Send (Enter)"
            >
              <Send size={12} />
            </button>
          )}
        </div>

        <div className="ai-usage-footer">
          This chat: {formatTokenCount(chatUsage.total)} tokens (in {formatTokenCount(chatUsage.prompt)}, out {formatTokenCount(chatUsage.output)}){chatUsage.approx ? ' approx' : ''} | All AI use: {formatTokenCount(totalUsage.total)} tokens | {totalUsage.requests} request{totalUsage.requests === 1 ? '' : 's'}
        </div>
      </div>
    </aside>
  )
}
