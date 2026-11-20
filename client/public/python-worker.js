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

    // Override input() with a friendly explanation
    py.runPython(`
import sys

def _unsupported_input(*args, **kwargs):
    raise RuntimeError("Interactive input() is not supported in offline execution. Please hardcode your inputs as variables in the script.")

__builtins__.input = _unsupported_input
`)

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
  const { type, code } = e.data

  if (type === 'run') {
    try {
      const py = await getPyodide()

      // Wire stdout & stderr
      py.setStdout({
        batched: (str) => {
          self.postMessage({ type: 'stdout', data: str })
        }
      })
      py.setStderr({
        batched: (str) => {
          self.postMessage({ type: 'stderr', data: str })
        }
      })

      const startTime = performance.now()
      self.postMessage({ type: 'status', message: 'Running Python script...' })

      const result = await py.runPythonAsync(code)
      const duration = ((performance.now() - startTime) / 1000).toFixed(3)

      self.postMessage({
        type: 'done',
        duration,
        result: result !== undefined && result !== null ? String(result) : null
      })
    } catch (err) {
      self.postMessage({
        type: 'error',
        data: err.message || String(err)
      })
    }
  }
}
