/**
 * Remote Code Execution via Wandbox public API (free, keyless, CORS enabled)
 * Used for C, C++, Java, Go, Rust, PHP, and Ruby.
 */

export const REMOTE_ENDPOINT = 'https://wandbox.org/api/compile.json'

export const COMPILER_MAP = {
  c: 'gcc-head-c',
  cpp: 'gcc-head',
  cxx: 'gcc-head',
  cc: 'gcc-head',
  java: 'openjdk-jdk-21+35',
  go: 'go-1.22.8',
  rust: 'rust-1.100.0',
  rs: 'rust-1.100.0',
  php: 'php-8.3.12',
  ruby: 'ruby-3.4.9',
  rb: 'ruby-3.4.9'
}

export function isOnlineLanguage(ext) {
  return Boolean(COMPILER_MAP[ext?.toLowerCase()])
}

export function getCompilerForExt(ext) {
  return COMPILER_MAP[ext?.toLowerCase()] || null
}

/**
 * Runs code on the remote execution service.
 * @param {Object} options
 * @param {string} options.ext File extension
 * @param {string} options.code Source code
 * @param {string} [options.stdin] Standard input if provided
 * @param {AbortSignal} [options.signal] AbortController signal
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, duration: number }>}
 */
export async function runRemoteCode({ ext, code, stdin = '', signal }) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Running this language needs internet.')
  }

  const compiler = getCompilerForExt(ext)
  if (!compiler) {
    throw new Error(`Running ${ext} is not supported by the remote runner.`)
  }

  const payload = {
    compiler,
    code,
    stdin: stdin || undefined
  }

  const startTime = performance.now()

  let response
  try {
    response = await fetch(REMOTE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Execution was stopped.')
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Running this language needs internet.')
    }
    throw new Error(`Failed to reach code execution service: ${err.message}`)
  }

  if (response.status === 429) {
    throw new Error('Service rate limit reached. Please wait a moment and try again.')
  }

  if (response.status >= 500) {
    throw new Error('Online execution service is temporarily unavailable. Please try again later.')
  }

  if (!response.ok) {
    throw new Error(`Service returned HTTP ${response.status}.`)
  }

  const data = await response.json()
  const duration = ((performance.now() - startTime) / 1000).toFixed(2)

  const stdout = data.program_output || ''
  const stderr = [data.compiler_error, data.program_error]
    .filter(Boolean)
    .join('\n')
    .trim()

  return {
    stdout,
    stderr,
    status: data.status,
    duration
  }
}
