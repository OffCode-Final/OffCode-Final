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
    return {
      improved: parsed.improved,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'AI improvements applied.',
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 4) : []
    }
  } catch (_) {
    throw new Error('Could not parse JSON response from AI model. Please try again.')
  }
}
