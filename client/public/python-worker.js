/**
 * Web Worker for running Python via Pyodide offline (Module Worker)
 */

import { loadPyodide } from '/pyodide/pyodide.mjs'

let pyodideInstance = null
let isInitializing = false
let measuredLineOffset = 0

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

    // Verify whether <exec> line numbers have any offset vs editor line numbers
    try {
      await py.runPythonAsync('\n\ncompile("x = ?", "<exec>", "exec")')
    } catch (probeErr) {
      const m = String(probeErr?.message || '').match(/File "<exec>", line (\d+)/)
      if (m) {
        const reported = parseInt(m[1], 10)
        // compile() executes on line 3 in the probe string, and inner "<exec>" compiles line 1
        // Use a syntax error directly in runPythonAsync to measure <exec> offset
        measuredLineOffset = 0
      }
    }
    try {
      await py.runPythonAsync('a = 1\nb = 2\nc = )')
    } catch (probeErr) {
      const m = String(probeErr?.message || '').match(/File "<exec>", line (\d+)/)
      if (m) {
        measuredLineOffset = parseInt(m[1], 10) - 3
      }
    }

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
  const { type, code, stdinLines } = e.data

  if (type === 'run') {
    const decoder = new TextDecoder()
    let pendingStdout = ''

    const flushPendingLines = () => {
      let nlIdx
      while ((nlIdx = pendingStdout.indexOf('\n')) !== -1) {
        const line = pendingStdout.slice(0, nlIdx)
        pendingStdout = pendingStdout.slice(nlIdx + 1)
        self.postMessage({ type: 'stdout', data: line })
      }
    }

    try {
      const py = await getPyodide()

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
          self.postMessage({ type: 'stderr', data: str })
        }
      })

      py.setStdin({
        stdin: () => {
          if (queueIdx >= queue.length) {
            // Flush any waiting prompt before EOFError fires
            pendingStdout += decoder.decode()
            if (pendingStdout.length > 0) {
              self.postMessage({ type: 'stdout', data: pendingStdout })
              pendingStdout = ''
            }
            return undefined
          }
          const nextLine = queue[queueIdx++]
          pendingStdout += decoder.decode()
          self.postMessage({
            type: 'stdout',
            data: pendingStdout,
            echo: nextLine
          })
          pendingStdout = ''
          return nextLine
        }
      })

      const startTime = performance.now()
      self.postMessage({ type: 'status', message: 'Running Python script...' })

      const result = await py.runPythonAsync(code)

      pendingStdout += decoder.decode()
      flushPendingLines()
      if (pendingStdout.length > 0) {
        self.postMessage({ type: 'stdout', data: pendingStdout })
        pendingStdout = ''
      }

      const duration = ((performance.now() - startTime) / 1000).toFixed(3)

      self.postMessage({
        type: 'done',
        duration,
        result: result !== undefined && result !== null ? String(result) : null
      })
    } catch (err) {
      pendingStdout += decoder.decode()
      flushPendingLines()
      if (pendingStdout.length > 0) {
        self.postMessage({ type: 'stdout', data: pendingStdout })
        pendingStdout = ''
      }
      self.postMessage({
        type: 'error',
        data: err.message || String(err),
        lineOffset: measuredLineOffset
      })
    }
  }
}
