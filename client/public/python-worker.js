/**
 * Web Worker for running Python via Pyodide offline (Module Worker)
 */

import { loadPyodide } from '/pyodide/pyodide.mjs'

let pyodideInstance = null
let isInitializing = false

async function getPyodide() {
  if (pyodideInstance) return pyodideInstance
  if (isInitializing) {
    while (!pyodideInstance) {
      await new Promise((r) => setTimeout(r, 50))
    }
    return pyodideInstance
  }

  isInitializing = true
  self.postMessage({ type: 'status', message: 'Loading local Pyodide Python engine...' })

  try {
    const py = await loadPyodide({
      indexURL: '/pyodide/'
    })

    pyodideInstance = py
    self.postMessage({ type: 'status', message: 'Python engine ready.' })
    return py
  } catch (err) {
    self.postMessage({ type: 'error', data: `Failed to initialize Pyodide: ${err.message}` })
    throw err
  } finally {
    isInitializing = false
  }
}

self.onmessage = async (e) => {
  const { type, runId, code, stdinLines, allowInteractive = true } = e.data

  if (type === 'run') {
    const decoder = new TextDecoder()
    let pendingStdout = ''
    let waitingForInput = false
    let waitingPrompt = ''

    const flushPendingLines = () => {
      let nlIdx
      while ((nlIdx = pendingStdout.indexOf('\n')) !== -1) {
        const line = pendingStdout.slice(0, nlIdx)
        pendingStdout = pendingStdout.slice(nlIdx + 1)
        self.postMessage({ type: 'stdout', runId, data: line })
      }
    }

    let py = null
    let ns = null

    try {
      py = await getPyodide()

      const queue = Array.isArray(stdinLines) ? [...stdinLines] : []
      let queueIdx = 0

      // Stream stdout byte-by-byte so input() prompts appear before stdin() is called
      py.setStdout({
        write: (buf) => {
          pendingStdout += decoder.decode(buf, { stream: true })
          flushPendingLines()
          return buf.length
        }
      })

      py.setStderr({
        batched: (str) => {
          self.postMessage({ type: 'stderr', runId, data: str })
        }
      })

      py.setStdin({
        stdin: () => {
          if (queueIdx >= queue.length) {
            pendingStdout += decoder.decode()
            if (allowInteractive) {
              waitingForInput = true
              waitingPrompt = pendingStdout
              pendingStdout = ''
              return undefined
            }
            if (pendingStdout.length > 0) {
              self.postMessage({ type: 'stdout', runId, data: pendingStdout })
              pendingStdout = ''
            }
            return undefined
          }
          const nextLine = queue[queueIdx++]
          pendingStdout += decoder.decode()
          self.postMessage({
            type: 'stdout',
            runId,
            data: pendingStdout,
            echo: nextLine
          })
          pendingStdout = ''
          return nextLine
        }
      })

      const startTime = performance.now()
      ns = py.toPy({ __name__: '__main__' })
      const result = await py.runPythonAsync(code, { globals: ns })

      pendingStdout += decoder.decode()
      flushPendingLines()
      if (pendingStdout.length > 0) {
        self.postMessage({ type: 'stdout', runId, data: pendingStdout })
        pendingStdout = ''
      }

      const duration = ((performance.now() - startTime) / 1000).toFixed(3)

      self.postMessage({
        type: 'done',
        runId,
        duration,
        result: result !== undefined && result !== null ? String(result) : null
      })
    } catch (err) {
      if (waitingForInput && /EOFError/i.test(err?.message || '')) {
        self.postMessage({
          type: 'need_input',
          runId,
          prompt: waitingPrompt
        })
        return
      }

      pendingStdout += decoder.decode()
      flushPendingLines()
      if (pendingStdout.length > 0) {
        self.postMessage({ type: 'stdout', runId, data: pendingStdout })
        pendingStdout = ''
      }
      self.postMessage({
        type: 'error',
        runId,
        data: err.message || String(err),
        lineOffset: 0
      })
    } finally {
      if (ns && typeof ns.destroy === 'function') {
        try {
          ns.destroy()
        } catch (_) {}
      }
    }
  }
}
