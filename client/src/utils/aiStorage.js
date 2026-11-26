const CHATS_KEY = 'offcode-ai-chats'
const USAGE_KEY = 'offcode-ai-usage'
const MAX_CHATS = 50

export function createEmptyUsageState() {
  return {
    since: Date.now(),
    total: { prompt: 0, output: 0, total: 0, requests: 0, approx: false },
    byChat: {},
    other: {
      improve: { title: 'Improve with AI', prompt: 0, output: 0, total: 0, requests: 0, approx: false },
      inline: { title: 'AI inline suggestions', prompt: 0, output: 0, total: 0, requests: 0, approx: false }
    }
  }
}

export function loadAiChats() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(CHATS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_CHATS) : []
  } catch (_) {
    return []
  }
}

export function saveAiChats(chats) {
  if (typeof window === 'undefined' || !window.localStorage) return
  const list = Array.isArray(chats) ? chats.slice(0, MAX_CHATS) : []
  try {
    window.localStorage.setItem(CHATS_KEY, JSON.stringify(list))
  } catch (_) {
    // If localStorage is full, prune older chats and retry once
    try {
      window.localStorage.setItem(CHATS_KEY, JSON.stringify(list.slice(0, 20)))
    } catch (_) {}
  }
}

export function loadAiUsage() {
  const fresh = createEmptyUsageState()
  if (typeof window === 'undefined' || !window.localStorage) return fresh
  try {
    const raw = window.localStorage.getItem(USAGE_KEY)
    if (!raw) return fresh
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fresh
    return {
      since: typeof parsed.since === 'number' ? parsed.since : fresh.since,
      total: { ...fresh.total, ...(parsed.total || {}) },
      byChat: parsed.byChat && typeof parsed.byChat === 'object' ? parsed.byChat : {},
      other: {
        improve: { ...fresh.other.improve, ...(parsed.other?.improve || {}) },
        inline: { ...fresh.other.inline, ...(parsed.other?.inline || {}) }
      }
    }
  } catch (_) {
    return fresh
  }
}

export function saveAiUsage(usage) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(usage))
  } catch (_) {}
}

export function resetAiUsage() {
  const fresh = createEmptyUsageState()
  saveAiUsage(fresh)
  return fresh
}

export function addUsageSample(currentUsage, { chatId = null, chatTitle = '', category = 'chat', usage = null }) {
  const base = currentUsage ? {
    since: currentUsage.since || Date.now(),
    total: { ...(currentUsage.total || createEmptyUsageState().total) },
    byChat: { ...(currentUsage.byChat || {}) },
    other: {
      improve: { ...(currentUsage.other?.improve || createEmptyUsageState().other.improve) },
      inline: { ...(currentUsage.other?.inline || createEmptyUsageState().other.inline) }
    }
  } : createEmptyUsageState()

  const prompt = Math.max(0, Number(usage?.promptTokens) || 0)
  const output = Math.max(0, Number(usage?.outputTokens) || 0)
  const total = Math.max(0, Number(usage?.totalTokens) || (prompt + output))
  const approx = Boolean(usage?.approx)

  base.total.prompt += prompt
  base.total.output += output
  base.total.total += total
  base.total.requests += 1
  if (approx) base.total.approx = true

  if (category === 'improve' || category === 'inline') {
    const prev = base.other[category]
    base.other[category] = {
      ...prev,
      prompt: prev.prompt + prompt,
      output: prev.output + output,
      total: prev.total + total,
      requests: prev.requests + 1,
      approx: Boolean(prev.approx || approx)
    }
  } else if (chatId) {
    const prev = base.byChat[chatId] || {
      title: chatTitle || 'Untitled chat',
      prompt: 0,
      output: 0,
      total: 0,
      requests: 0,
      approx: false
    }
    base.byChat[chatId] = {
      title: chatTitle || prev.title,
      prompt: prev.prompt + prompt,
      output: prev.output + output,
      total: prev.total + total,
      requests: prev.requests + 1,
      approx: Boolean(prev.approx || approx)
    }
  }

  saveAiUsage(base)
  return base
}

export function formatTokenCount(n) {
  const num = Number(n) || 0
  return num.toLocaleString()
}
