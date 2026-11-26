// AI integration for "Improve with AI" (supports Google Gemini & Groq)
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'
export const GROQ_MODEL = 'llama-3.3-70b-versatile'

/**
 * Sends selected code along with file context to Gemini Flash-Lite or Groq.
 * Returns { improved: string, summary: string, changes: string[] }
 */
export async function improveCodeWithGemini({
  apiKey,
  fullText,
  selectedText,
  from,
  to,
  signal
}) {
  const trimmedKey = (apiKey || '').trim()
  if (!trimmedKey) {
    const err = new Error('No API key provided. Please set your Gemini or Groq API key.')
    err.isKeyError = true
    throw err
  }

  if (selectedText.length > 8000) {
    throw new Error('Select a smaller part of the code (maximum 8,000 characters).')
  }

  // If the file is over 60,000 characters, send only about 200 lines around the selection
  let contextText = fullText
  if (fullText.length > 60000) {
    const lines = fullText.split('\n')
    let charCount = 0
    let startLine = 0
    let endLine = lines.length - 1
    for (let i = 0; i < lines.length; i++) {
      const nextCharCount = charCount + lines[i].length + 1
      if (charCount <= from && from < nextCharCount) {
        startLine = i
      }
      if (charCount <= to && to <= nextCharCount) {
        endLine = i
        break
      }
      charCount = nextCharCount
    }
    const contextStart = Math.max(0, startLine - 100)
    const contextEnd = Math.min(lines.length - 1, endLine + 100)
    contextText = lines.slice(contextStart, contextEnd + 1).join('\n')
  }

  const systemInstruction =
    'You are a careful code reviewer. First read the whole file to understand it. Then improve ONLY the selected part: fix bugs, improve clarity and performance, keep the same behavior, language, naming style and indentation. Do not change anything outside the selection. If nothing needs changing, return the selection unchanged.'

  const prompt = `Full file context:\n\`\`\`\n${contextText}\n\`\`\`\n\nSelected code to improve:\n\`\`\`\n${selectedText}\n\`\`\``

  const isGroq = trimmedKey.startsWith('gsk_')

  const timeoutMs = 20000
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs)

  if (signal) {
    signal.addEventListener('abort', () => timeoutController.abort())
  }

  let res
  try {
    if (isGroq) {
      // Call Groq API
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${trimmedKey}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${systemInstruction} Return JSON with keys: "improved" (string), "summary" (string), "changes" (array of up to 4 strings).`
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        }),
        signal: timeoutController.signal
      })
    } else {
      // Call Google Gemini API (gemini-3.5-flash-lite)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
      const payload = {
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              improved: { type: 'STRING' },
              summary: { type: 'STRING' },
              changes: {
                type: 'ARRAY',
                items: { type: 'STRING' }
              }
            },
            required: ['improved', 'summary', 'changes']
          }
        }
      }

      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': trimmedKey
        },
        body: JSON.stringify(payload),
        signal: timeoutController.signal
      })
    }
  } catch (err) {
    clearTimeout(timer)
    if (timeoutController.signal.aborted) {
      if (signal?.aborted) {
        throw new Error('AI request cancelled.')
      }
      throw new Error('Request timed out after 20 seconds. Please try again.')
    }
    throw new Error('Network failure. Please check your internet connection.')
  }
  clearTimeout(timer)

  if (!res.ok) {
    let errMsg = ''
    try {
      const errBody = await res.json()
      errMsg = errBody?.error?.message || errBody?.message || ''
    } catch (_) {}

    if (res.status === 401 || res.status === 403 || errMsg.toLowerCase().includes('api key')) {
      const error = new Error(`Invalid API key. Please check or change your API key.`)
      error.isKeyError = true
      throw error
    }
    if (res.status === 404) {
      throw new Error('AI model not found or needs updating.')
    }
    if (res.status === 429) {
      throw new Error('Rate limit reached. Please wait a moment and try again.')
    }
    throw new Error(errMsg ? `AI error (${res.status}): ${errMsg}` : `AI request failed with status ${res.status}.`)
  }

  let data
  try {
    data = await res.json()
  } catch (_) {
    throw new Error('Empty or invalid response from AI model. Please try again.')
  }

  let rawText = ''
  if (isGroq) {
    rawText = data?.choices?.[0]?.message?.content
  } else {
    rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text
  }

  if (!rawText) {
    throw new Error('Empty response from AI model. Please try again.')
  }

  try {
    const parsed = JSON.parse(rawText)
    if (typeof parsed.improved !== 'string') {
      throw new Error('Invalid response structure')
    }
    const usage = extractUsageMetadata(data, isGroq, prompt, rawText)
    return {
      improved: parsed.improved,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'AI improvements applied.',
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 4) : [],
      usage
    }
  } catch (_) {
    throw new Error('Could not parse JSON response from AI model. Please try again.')
  }
}

export function extractUsageMetadata(data, isGroq = false, fallbackPromptText = '', fallbackOutputText = '') {
  if (isGroq && data?.usage) {
    const p = Number(data.usage.prompt_tokens) || 0
    const o = Number(data.usage.completion_tokens) || 0
    const t = Number(data.usage.total_tokens) || (p + o)
    if (t > 0 || p > 0 || o > 0) {
      return { promptTokens: p, outputTokens: o, totalTokens: t, approx: false }
    }
  }
  if (!isGroq && data?.usageMetadata) {
    const m = data.usageMetadata
    const p = Number(m.promptTokenCount) || 0
    const o = Number(m.candidatesTokenCount) || 0
    const t = Number(m.totalTokenCount) || (p + o)
    if (t > 0 || p > 0 || o > 0) {
      return { promptTokens: p, outputTokens: o, totalTokens: t, approx: false }
    }
  }
  const approxPrompt = Math.max(1, Math.ceil((fallbackPromptText || '').length / 4))
  const approxOutput = Math.ceil((fallbackOutputText || '').length / 4)
  return {
    promptTokens: approxPrompt,
    outputTokens: approxOutput,
    totalTokens: approxPrompt + approxOutput,
    approx: true
  }
}

/**
 * Truncates long files to ~200 lines around a selection/cursor line when over 60,000 chars.
 */
export function buildChatFileContext(fullText, aroundLine = 1) {
  const raw = String(fullText || '')
  if (raw.length <= 60000) return { text: raw, truncated: false }
  const lines = raw.split('\n')
  const targetIdx = Math.max(0, Math.min(lines.length - 1, (aroundLine || 1) - 1))
  const start = Math.max(0, targetIdx - 100)
  const end = Math.min(lines.length - 1, targetIdx + 100)
  return {
    text: lines.slice(start, end + 1).join('\n'),
    truncated: true,
    startLine: start + 1,
    endLine: end + 1
  }
}

function mapAiHttpError(status, errMsg = '') {
  const lower = String(errMsg || '').toLowerCase()
  if (status === 401 || status === 403 || lower.includes('api key')) {
    const error = new Error('Invalid API key. Please check or change your Gemini key.')
    error.isKeyError = true
    return error
  }
  if (status === 429) {
    return new Error('Rate limit reached (429). Wait a moment and try again.')
  }
  if (status === 404) {
    return new Error('AI model not found or needs updating.')
  }
  return new Error(errMsg ? `AI error (${status}): ${errMsg}` : `AI request failed with status ${status}.`)
}

/**
 * Streams a multi-turn coding chat response using Gemini streamGenerateContent?alt=sse
 * with 20s idle timeout, AbortController stop support, and non-streaming fallback.
 */
export async function streamChatWithGemini({
  apiKey,
  systemInstruction,
  contents,
  signal,
  onChunk
}) {
  const trimmedKey = (apiKey || '').trim()
  if (!trimmedKey) {
    const err = new Error('No API key provided. Add your Gemini API key to chat.')
    err.isKeyError = true
    throw err
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are offline. Reconnect to the internet to use AI chat.')
  }

  const isGroq = trimmedKey.startsWith('gsk_')
  const approxInputChars = JSON.stringify({ systemInstruction, contents })

  const createIdleController = () => {
    const controller = new AbortController()
    let timedOut = false
    let timer = null

    const arm = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, 20000)
    }
    arm()

    const onExternalAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) {
        controller.abort()
      } else {
        signal.addEventListener('abort', onExternalAbort, { once: true })
      }
    }

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onExternalAbort)
    }

    return { controller, arm, cleanup, wasTimedOut: () => timedOut }
  }

  const runNonStreamingFallback = async () => {
    const idle = createIdleController()
    try {
      let res
      if (isGroq) {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${trimmedKey}`
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0.4,
            messages: [
              { role: 'system', content: systemInstruction },
              ...contents.map((c) => ({
                role: c.role === 'model' ? 'assistant' : 'user',
                content: c.parts.map((p) => p.text).join('')
              }))
            ]
          }),
          signal: idle.controller.signal
        })
      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': trimmedKey
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: { temperature: 0.4 }
          }),
          signal: idle.controller.signal
        })
      }

      if (!res.ok) {
        let errMsg = ''
        try {
          const b = await res.json()
          errMsg = b?.error?.message || b?.message || ''
        } catch (_) {}
        throw mapAiHttpError(res.status, errMsg)
      }

      const data = await res.json()
      const candidate = data?.candidates?.[0]
      if (!isGroq && candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
        const blockText = candidate?.content?.parts?.map((p) => p.text || '').join('') || ''
        if (!blockText) {
          throw new Error(`Response was blocked (${candidate.finishReason}). Try rephrasing your question.`)
        }
      }

      const fullText = isGroq
        ? (data?.choices?.[0]?.message?.content || '')
        : (candidate?.content?.parts?.map((p) => p.text || '').join('') || '')

      if (!fullText) {
        throw new Error('The AI returned an empty response. Please try again.')
      }

      if (onChunk) onChunk(fullText)
      return {
        text: fullText,
        usage: extractUsageMetadata(data, isGroq, approxInputChars, fullText)
      }
    } catch (err) {
      if (idle.controller.signal.aborted) {
        if (signal?.aborted) {
          const abortErr = new Error('Stopped.')
          abortErr.isAbort = true
          throw abortErr
        }
        if (idle.wasTimedOut()) {
          throw new Error('AI response timed out after 20 seconds of inactivity.')
        }
      }
      throw err
    } finally {
      idle.cleanup()
    }
  }

  // Primary streaming path for Gemini SSE
  if (isGroq) {
    return runNonStreamingFallback()
  }

  const idle = createIdleController()
  let accumulatedText = ''
  let lastUsageData = null
  let lastFinishReason = ''

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': trimmedKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.4 }
      }),
      signal: idle.controller.signal
    })

    if (!res.ok) {
      let errMsg = ''
      try {
        const b = await res.json()
        errMsg = b?.error?.message || b?.message || ''
      } catch (_) {}
      const mapped = mapAiHttpError(res.status, errMsg)
      if (mapped.isKeyError || res.status === 429) {
        throw mapped
      }
      idle.cleanup()
      return await runNonStreamingFallback()
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      idle.cleanup()
      return await runNonStreamingFallback()
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''

    const processLine = (rawLine) => {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) return
      const payloadStr = line.slice(5).trim()
      if (!payloadStr || payloadStr === '[DONE]') return
      try {
        const chunkJson = JSON.parse(payloadStr)
        if (chunkJson.usageMetadata) {
          lastUsageData = chunkJson
        }
        const cand = chunkJson?.candidates?.[0]
        if (cand?.finishReason) {
          lastFinishReason = cand.finishReason
        }
        const deltaText = cand?.content?.parts?.map((p) => p.text || '').join('') || ''
        if (deltaText) {
          accumulatedText += deltaText
          if (onChunk) onChunk(accumulatedText)
        }
      } catch (_) {}
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      idle.arm()
      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split(/\r?\n/)
      sseBuffer = lines.pop() || ''
      for (const l of lines) {
        processLine(l)
      }
    }

    if (sseBuffer.trim()) {
      processLine(sseBuffer)
    }

    if (!accumulatedText) {
      if (lastFinishReason && lastFinishReason !== 'STOP' && lastFinishReason !== 'MAX_TOKENS') {
        throw new Error(`Response was blocked (${lastFinishReason}). Try rephrasing your question.`)
      }
      idle.cleanup()
      return await runNonStreamingFallback()
    }

    return {
      text: accumulatedText,
      usage: extractUsageMetadata(lastUsageData, false, approxInputChars, accumulatedText)
    }
  } catch (err) {
    if (err?.isKeyError || err?.isAbort) throw err
    if (idle.controller.signal.aborted) {
      if (signal?.aborted) {
        const abortErr = new Error('Stopped.')
        abortErr.isAbort = true
        throw abortErr
      }
      if (idle.wasTimedOut()) {
        throw new Error('AI response timed out after 20 seconds of inactivity.')
      }
    }
    if (!accumulatedText && !String(err?.message || '').includes('Rate limit') && !String(err?.message || '').includes('blocked')) {
      try {
        idle.cleanup()
        return await runNonStreamingFallback()
      } catch (fallbackErr) {
        throw fallbackErr
      }
    }
    throw err
  } finally {
    idle.cleanup()
  }
}
