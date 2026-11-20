/**
 * Web Worker for running JavaScript safely with console interception
 */

self.onmessage = (e) => {
  const { code } = e.data

  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn
  const originalInfo = console.info

  console.log = (...args) => {
    self.postMessage({
      type: 'stdout',
      data: args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
        .join(' ')
    })
  }

  console.error = (...args) => {
    self.postMessage({
      type: 'stderr',
      data: args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
        .join(' ')
    })
  }

  console.warn = (...args) => {
    self.postMessage({
      type: 'stdout',
      data: '[WARN] ' + args.map((a) => String(a)).join(' ')
    })
  }

  console.info = (...args) => {
    self.postMessage({
      type: 'stdout',
      data: '[INFO] ' + args.map((a) => String(a)).join(' ')
    })
  }

  const startTime = performance.now()
  try {
    const fn = new Function(code)
    const result = fn()
    const duration = ((performance.now() - startTime) / 1000).toFixed(3)

    self.postMessage({
      type: 'done',
      duration,
      result: result !== undefined ? String(result) : null
    })
  } catch (err) {
    self.postMessage({
      type: 'error',
      data: err.stack || err.message || String(err)
    })
  }
}
