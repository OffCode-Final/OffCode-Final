// Gemini API integration for "Improve with AI"
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'

/**
 * Sends selected code along with file context to Gemini Flash-Lite.
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
  if (!apiKey || !apiKey.trim()) {
    const err = new Error('No Gemini API key provided. Please set your API key.')
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
      },
      thinkingConfig: {
        thinkingBudget: 0
      }
    }
  }

  const timeoutMs = 20000
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs)

  // Link caller signal if provided
  if (signal) {
    signal.addEventListener('abort', () => timeoutController.abort())
  }

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify(payload),
      signal: timeoutController.signal
    })
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

  // If thinkingConfig causes an issue (400), retry without it
  if (res.status === 400) {
    try {
      const errClone = await res.clone().json()
      const errMsg = (errClone?.error?.message || '').toLowerCase()
      if (
        errMsg.includes('thinking') ||
        errMsg.includes('budget') ||
        errMsg.includes('unknown field')
      ) {
        delete payload.generationConfig.thinkingConfig
        const retryTimer = setTimeout(() => timeoutController.abort(), timeoutMs)
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey.trim()
            },
            body: JSON.stringify(payload),
            signal: timeoutController.signal
          })
        } finally {
          clearTimeout(retryTimer)
        }
      }
    } catch (_) {
      // ignore parsing error
    }
  }

  if (!res.ok) {
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const error = new Error('Invalid or missing Gemini API key. Please check or change your API key.')
      error.isKeyError = true
      throw error
    }
    if (res.status === 404) {
      throw new Error('AI model name needs updating.')
    }
    if (res.status === 429) {
      throw new Error('Rate limit reached. Please wait a moment and try again.')
    }
    throw new Error(`AI request failed (${res.status}). Please try again.`)
  }

  let data
  try {
    data = await res.json()
  } catch (_) {
    throw new Error('Empty or invalid response from AI model. Please try again.')
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText) {
    throw new Error('Empty or invalid response from AI model. Please try again.')
  }

  try {
    const parsed = JSON.parse(rawText)
    if (typeof parsed.improved !== 'string') {
      throw new Error('Invalid response structure')
    }
    return {
      improved: parsed.improved,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'AI improvements applied.',
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 4) : []
    }
  } catch (_) {
    throw new Error('Empty or invalid response from AI model. Please try again.')
  }
}
