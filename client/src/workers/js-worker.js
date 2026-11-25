import { transform } from 'sucrase'

// Measure line offset added by new Function(...) using a known error on line 3
let LINE_OFFSET = 2
try {
  new Function('\n\nthrow new Error("__offset_probe__")')()
} catch (probeErr) {
  const stack = String(probeErr?.stack || '')
  const m = stack.match(/<anonymous>:(\d+):(\d+)/) || stack.match(/Function:(\d+):(\d+)/)
  if (m) {
    LINE_OFFSET = Math.max(0, parseInt(m[1], 10) - 3)
  }
}

function extractLocationFromStack(stack, offset) {
  if (!stack) return { line: null, col: null }
  const lines = String(stack).split(/\r?\n/)
  for (const l of lines) {
    const m =
      l.match(/<anonymous>:(\d+):(\d+)/) ||
      l.match(/Function:(\d+):(\d+)/) ||
      l.match(/eval:(\d+):(\d+)/)
    if (m) {
      const rawLine = parseInt(m[1], 10)
      const col = parseInt(m[2], 10)
      const line = rawLine - offset
      if (line > 0) {
        return { line, col }
      }
    }
  }
  return { line: null, col: null }
}

self.prompt = () => {
  throw new Error('prompt() is not supported in the JavaScript runner.')
}

self.onmessage = (e) => {
  const { code, isTs, isTsx } = e.data

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

  self.onerror = (message, source, lineno, colno, err) => {
    const fromStack = extractLocationFromStack(err?.stack, LINE_OFFSET)
    const rawLine = lineno ? lineno - LINE_OFFSET : null
    const line = fromStack.line || (rawLine && rawLine > 0 ? rawLine : null)
    const col = fromStack.col || (colno || null)
    self.postMessage({
      type: 'error',
      data: err?.stack || String(message),
      errorName: err?.name || 'Error',
      errorMessage: err?.message || String(message).replace(/^Uncaught\s+[A-Za-z_]+Error:\s*/, ''),
      line,
      col,
      stack: err?.stack || ''
    })
    return true
  }

  let executableCode = code

  if (isTs || isTsx) {
    if (isTsx && (/(from\s+['"]react['"]|require\(['"]react['"]\))/i.test(code))) {
      self.postMessage({
        type: 'error',
        data: 'Cannot run TSX code that imports React. The execution sandbox does not include React.',
        errorName: 'Error',
        errorMessage: 'Cannot run TSX code that imports React. The execution sandbox does not include React.',
        line: null,
        col: null
      })
      return
    }

    try {
      const transforms = ['typescript']
      if (isTsx) transforms.push('jsx')
      const transformed = transform(code, { transforms })
      executableCode = transformed.code
    } catch (err) {
      const locLine = err?.loc?.line || null
      const locCol = err?.loc?.column != null ? err.loc.column + 1 : null
      self.postMessage({
        type: 'error',
        data: `TypeScript transpilation failed: ${err.message}`,
        errorName: 'SyntaxError',
        errorMessage: err.message,
        line: locLine,
        col: locCol
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
    const isSyntax = err?.name === 'SyntaxError'
    const loc = isSyntax ? { line: null, col: null } : extractLocationFromStack(err?.stack, LINE_OFFSET)
    self.postMessage({
      type: 'error',
      data: err?.stack || err?.message || String(err),
      errorName: err?.name || 'Error',
      errorMessage: err?.message || String(err),
      line: loc.line,
      col: loc.col,
      stack: err?.stack || ''
    })
  }
}
