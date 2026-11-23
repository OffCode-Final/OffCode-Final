import { transform } from 'sucrase'

self.onmessage = (e) => {
  const { code, isTs, isTsx } = e.data

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

  let executableCode = code

  if (isTs || isTsx) {
    if (isTsx && (/(from\s+['"]react['"]|require\(['"]react['"]\))/i.test(code))) {
      self.postMessage({
        type: 'error',
        data: 'Cannot run TSX code that imports React. The execution sandbox does not include React.'
      })
      return
    }

    try {
      const transforms = ['typescript']
      if (isTsx) transforms.push('jsx')
      const transformed = transform(code, { transforms })
      executableCode = transformed.code
    } catch (err) {
      self.postMessage({
        type: 'error',
        data: `TypeScript transpilation failed: ${err.message}`
      })
      return
    }
  }

  const startTime = performance.now()
  try {
    const fn = new Function(executableCode)
    const result = fn()
    const duration = ((performance.now() - startTime) / 1000).toFixed(3)

    self.postMessage({
      type: 'done',
      duration,
      result: result !== undefined ? String(result) : null,
      isTs: Boolean(isTs || isTsx)
    })
  } catch (err) {
    self.postMessage({
      type: 'error',
      data: err.stack || err.message || String(err)
    })
  }
}
