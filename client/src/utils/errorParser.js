/**
 * Structured error parsing and plain-English hints for Python, JS/TS, and HTML outputs.
 */

const PYTHON_HINTS = {
  IndentationError: 'Check the spaces at the start of this line.',
  TabError: 'Mix of tabs and spaces in indentation. Use consistent spaces on this line.',
  NameError: 'This name is not defined yet. Check the spelling or define it first.',
  TypeError: 'An operation or function was used with an incompatible value type.',
  ZeroDivisionError: 'You cannot divide by zero. Check the divisor before dividing.',
  IndexError: 'List or sequence index is out of range. Check the length before indexing.',
  KeyError: 'That key does not exist in the dictionary. Check the key name or use .get().',
  AttributeError: 'This object does not have that attribute or method. Check the name and type.',
  ValueError: 'The value has the right type, but is not valid for this operation.',
  ModuleNotFoundError: 'This module is not available offline.',
  ImportError: 'This module or symbol could not be imported offline.',
  EOFError: 'The program asked for input but the Input box has no more values. Add one value per line and run again.'
}

export function getPythonHint(errorType, message, line) {
  if (errorType === 'SyntaxError') {
    const msg = String(message || '')
    if (/unterminated triple-quoted string/i.test(msg) || /EOF while scanning triple-quoted/i.test(msg)) {
      return `A triple quote was opened and never closed. It starts on line ${line || 1}.`
    }
    if (/invalid syntax/i.test(msg)) {
      return 'Check this line and the line above for a missing bracket, quote or colon.'
    }
    if (/unterminated string/i.test(msg) || /EOL while scanning string/i.test(msg)) {
      return 'A string quote was opened on this line and never closed.'
    }
    if (/expected ':'/i.test(msg)) {
      return 'Add a colon ":" at the end of this statement.'
    }
    if (/was never closed/i.test(msg)) {
      return 'An opening bracket or parenthesis was never closed.'
    }
    return 'Check this line and the line above for a missing bracket, quote or colon.'
  }

  return PYTHON_HINTS[errorType] || 'Check the highlighted line and error message above.'
}

export function getJsHint(errorType, message) {
  const msg = String(message || '')
  if (errorType === 'SyntaxError') {
    return 'Check for a missing bracket, parenthesis, quote, or semicolon.'
  }
  if (errorType === 'ReferenceError') {
    if (/prompt is not defined/i.test(msg)) {
      return 'prompt() is not supported in the JavaScript runner.'
    }
    return 'This variable or function is not defined yet. Check spelling or declare it first.'
  }
  if (errorType === 'TypeError') {
    if (/undefined|null/i.test(msg)) {
      return 'Tried to read a property or call a function on undefined or null.'
    }
    return 'A value has the wrong type for this operation or function call.'
  }
  if (errorType === 'RangeError') {
    return 'A number or recursion depth is outside the allowed range.'
  }
  if (/prompt\(\) is not supported/i.test(msg)) {
    return 'JavaScript prompt() is not supported in the offline sandbox.'
  }
  return 'Check the highlighted line and error message above.'
}

function stripCommonLeadingSpaces(sourceLine, caretLine) {
  if (sourceLine == null && caretLine == null) {
    return { sourceLine: null, caretLine: null }
  }
  if (sourceLine != null && caretLine == null) {
    const trimmed = sourceLine.replace(/^\s+/, '')
    return { sourceLine: trimmed, caretLine: null }
  }
  const s = sourceLine || ''
  const c = caretLine || ''
  const leadS = (s.match(/^ */) || [''])[0].length
  const leadC = (c.match(/^ */) || [''])[0].length
  const strip = Math.min(leadS, leadC)
  return {
    sourceLine: s.slice(strip),
    caretLine: c.slice(strip)
  }
}

function normalizeUserFileName(frameFile, runFileName) {
  if (!frameFile) return runFileName
  if (frameFile === '<exec>' || frameFile === '<string>') return runFileName
  return frameFile
}

function isInternalPythonPath(filePath) {
  if (!filePath) return false
  return (
    filePath.includes('/lib/') ||
    filePath.includes('\\lib\\') ||
    filePath.includes('_pyodide') ||
    filePath.includes('site-packages')
  )
}

export function parsePythonTraceback(rawError, code = '', fileName = 'main.py', lineOffset = 0) {
  const rawText = String(rawError || '').trim()
  const lines = rawText.split(/\r?\n/)
  const codeLines = String(code || '').split(/\r?\n/)
  const baseRunName = fileName ? fileName.split('/').pop() : fileName

  // Match Python frame headers: File "...", line N(, in name)
  const frameRegex = /^\s*File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(.+))?$/
  const allFrames = []
  let currentFrame = null

  // Find the final ErrorType: message line (walk from bottom)
  let errorLineIdx = lines.length - 1
  while (errorLineIdx >= 0 && !lines[errorLineIdx].trim()) {
    errorLineIdx--
  }
  const finalLine = errorLineIdx >= 0 ? lines[errorLineIdx].trim() : rawText
  const errMatch = finalLine.match(/^([A-Za-z_][A-Za-z0-9_.]*Error|Exception|Warning|KeyboardInterrupt|SystemExit)(?::\s*(.*))?$/)
  const errorType = errMatch ? errMatch[1] : 'Error'
  const message = errMatch ? (errMatch[2] || '') : finalLine

  for (let i = 0; i < errorLineIdx; i++) {
    const line = lines[i]
    const m = line.match(frameRegex)
    if (m) {
      currentFrame = {
        rawFile: m[1],
        line: Math.max(1, parseInt(m[2], 10) - (lineOffset || 0)),
        fn: m[3] ? m[3].trim() : '',
        codeLine: null,
        caretLine: null
      }
      allFrames.push(currentFrame)
    } else if (currentFrame) {
      if (/^\s*[~^]+\s*$/.test(line)) {
        currentFrame.caretLine = line
      } else if (currentFrame.codeLine === null && line.trim() !== '' && !/^\s*\.\.\.<\d+ lines>\.\.\.\s*$/.test(line)) {
        currentFrame.codeLine = line
      }
    }
  }

  // Keep only frames whose file is "<exec>" or the run file's name, dropping internal Pyodide/stdlib paths
  const userFrames = allFrames.filter((f) => {
    if (isInternalPythonPath(f.rawFile)) return false
    return (
      f.rawFile === '<exec>' ||
      f.rawFile === fileName ||
      f.rawFile === baseRunName
    )
  })

  const lastFrame = userFrames.length > 0 ? userFrames[userFrames.length - 1] : null
  let targetLine = lastFrame ? lastFrame.line : null

  const isSyntaxLike = errorType === 'SyntaxError' || errorType === 'IndentationError' || errorType === 'TabError'

  // Verify line number against editor code for SyntaxError/IndentationError/TabError
  let rawSourceLine = lastFrame?.codeLine ?? null
  const rawCaretLine = lastFrame?.caretLine ?? null

  if (targetLine && codeLines.length > 0) {
    if (isSyntaxLike && rawSourceLine !== null) {
      const echoedTrim = rawSourceLine.trim()
      const currentEditorLine = codeLines[targetLine - 1]
      if (currentEditorLine === undefined || currentEditorLine.trim() !== echoedTrim) {
        // Check small offsets if Pyodide shifted lines
        for (const delta of [-1, 1, -2, 2, -3, 3]) {
          const candidateIdx = targetLine - 1 + delta
          if (candidateIdx >= 0 && candidateIdx < codeLines.length && codeLines[candidateIdx].trim() === echoedTrim) {
            targetLine = candidateIdx + 1
            break
          }
        }
      }
    } else if (rawSourceLine === null && targetLine >= 1 && targetLine <= codeLines.length) {
      rawSourceLine = codeLines[targetLine - 1]
    }
  }

  let col = null
  if (rawCaretLine) {
    const caretIdx = rawCaretLine.search(/\^/)
    if (caretIdx >= 0) {
      // Standard Python traceback indents echoed lines by 4 spaces
      const leadRaw = rawSourceLine ? (rawSourceLine.match(/^ */) || [''])[0].length : 4
      const editorLine = targetLine && codeLines[targetLine - 1] ? codeLines[targetLine - 1] : ''
      const leadEditor = (editorLine.match(/^ */) || [''])[0].length
      const tbPrefix = Math.max(0, leadRaw - leadEditor)
      col = Math.max(1, caretIdx - tbPrefix + 1)
    }
  }

  const stripped = stripCommonLeadingSpaces(rawSourceLine, rawCaretLine)

  const titlePrefix = errorType === 'SyntaxError'
    ? 'Syntax error'
    : errorType === 'IndentationError'
    ? 'Indentation error'
    : errorType === 'TabError'
    ? 'Tab error'
    : errorType

  const title = targetLine ? `${titlePrefix} on line ${targetLine}` : titlePrefix
  const locationLabel = targetLine ? `${fileName}:${targetLine}` : null

  const stack = userFrames.map((f) => ({
    file: normalizeUserFileName(f.rawFile, fileName),
    line: f.line,
    fn: f.fn || '<module>'
  }))

  // Special case: EOFError from input()
  if (errorType === 'EOFError' && /EOF when reading a line/i.test(message)) {
    return {
      title: targetLine ? `Input needed on line ${targetLine}` : 'Input needed',
      errorType,
      message: 'EOF when reading a line',
      fileName,
      locationLabel,
      line: targetLine,
      col,
      clickable: Boolean(targetLine),
      sourceLine: stripped.sourceLine,
      caretLine: stripped.caretLine,
      stack,
      hint: PYTHON_HINTS.EOFError,
      rawText
    }
  }

  return {
    title,
    errorType,
    message,
    fileName,
    locationLabel,
    line: targetLine,
    col,
    clickable: Boolean(targetLine),
    sourceLine: stripped.sourceLine,
    caretLine: stripped.caretLine,
    stack,
    hint: getPythonHint(errorType, message, targetLine),
    rawText
  }
}

export function parseJsError(errPayload, code = '', fileName = 'script.js') {
  const rawText = typeof errPayload === 'string'
    ? errPayload
    : (errPayload?.stack || errPayload?.data || errPayload?.message || String(errPayload || ''))
  const errorType = errPayload?.errorName || (rawText.match(/^([A-Za-z_][A-Za-z0-9_]*Error):/) || [])[1] || 'Error'
  const message = errPayload?.errorMessage || rawText.split(/\r?\n/)[0].replace(/^[A-Za-z_][A-Za-z0-9_]*Error:\s*/, '')
  const codeLines = String(code || '').split(/\r?\n/)

  let line = typeof errPayload?.line === 'number' && errPayload.line > 0 ? errPayload.line : null
  let col = typeof errPayload?.col === 'number' && errPayload.col > 0 ? errPayload.col : null

  // SyntaxError from new Function has no line number
  if (errorType === 'SyntaxError' && !line) {
    return {
      title: 'Syntax error',
      errorType,
      message,
      fileName: null,
      locationLabel: null,
      line: null,
      col: null,
      clickable: false,
      sourceLine: null,
      caretLine: null,
      stack: [],
      hint: getJsHint(errorType, message),
      rawText
    }
  }

  if (line && line > codeLines.length) {
    line = codeLines.length
  }

  let sourceLine = null
  let caretLine = null
  if (line && line >= 1 && line <= codeLines.length) {
    const rawLine = codeLines[line - 1]
    const lead = (rawLine.match(/^ */) || [''])[0].length
    sourceLine = rawLine.slice(lead)
    if (col) {
      const shiftedCol = Math.max(1, col - lead)
      caretLine = ' '.repeat(shiftedCol - 1) + '^'
    }
  }

  const title = line ? `${errorType} on line ${line}` : errorType
  const locationLabel = line ? `${fileName}:${line}` : null

  return {
    title,
    errorType,
    message,
    fileName,
    locationLabel,
    line,
    col,
    clickable: Boolean(line),
    sourceLine,
    caretLine,
    stack: [],
    hint: getJsHint(errorType, message),
    rawText
  }
}

export function parseHtmlError(errPayload, rawHtml = '', resolvedHtml = '', fileName = 'index.html') {
  const rawMessage = String(errPayload?.message || 'Script error')
  const rawLine = typeof errPayload?.line === 'number' && errPayload.line > 0 ? errPayload.line : null
  const rawCol = typeof errPayload?.col === 'number' && errPayload.col > 0 ? errPayload.col : null
  const rawText = errPayload?.stack ? `${rawMessage}\n${errPayload.stack}` : rawMessage

  const errMatch = rawMessage.match(/^(?:Uncaught\s+)?([A-Za-z_][A-Za-z0-9_]*Error):\s*(.*)$/)
  const errorType = errMatch ? errMatch[1] : 'Error'
  const message = errMatch ? errMatch[2] : rawMessage

  let fromInlined = false
  let editorLine = null
  let sourceLine = null
  let caretLine = null

  if (rawLine && resolvedHtml) {
    const resolvedLines = resolvedHtml.split(/\r?\n/)
    const rawLines = String(rawHtml || '').split(/\r?\n/)

    // Check if rawLine falls inside a <script data-offcode-inlined="..."> block
    let inInlined = false
    for (let i = 0; i < Math.min(rawLine, resolvedLines.length); i++) {
      const l = resolvedLines[i]
      if (/<script[^>]*data-offcode-inlined=/i.test(l)) {
        inInlined = true
      }
      if (inInlined && /<\/script>/i.test(l) && i + 1 < rawLine) {
        inInlined = false
      }
    }
    if (inInlined) {
      fromInlined = true
    } else if (rawLine <= resolvedLines.length) {
      const errSrcLine = resolvedLines[rawLine - 1]
      const trimmed = errSrcLine.trim()
      if (rawLines[rawLine - 1] && rawLines[rawLine - 1].trim() === trimmed) {
        editorLine = rawLine
      } else if (trimmed) {
        const matchIdx = rawLines.findIndex((l) => l.trim() === trimmed)
        if (matchIdx >= 0) {
          editorLine = matchIdx + 1
        }
      }
      if (errSrcLine) {
        const lead = (errSrcLine.match(/^ */) || [''])[0].length
        sourceLine = errSrcLine.slice(lead)
        if (rawCol) {
          caretLine = ' '.repeat(Math.max(0, rawCol - 1 - lead)) + '^'
        }
      }
    }
  }

  const displayLine = fromInlined ? rawLine : (editorLine || rawLine)
  const title = displayLine ? `${errorType} on line ${displayLine}` : errorType
  const locationLabel = fromInlined
    ? 'in preview'
    : (editorLine ? `${fileName}:${editorLine}` : (rawLine ? 'in preview' : null))

  return {
    title,
    errorType,
    message,
    fileName: fromInlined ? null : fileName,
    locationLabel,
    line: fromInlined ? null : editorLine,
    col: fromInlined ? null : rawCol,
    clickable: Boolean(!fromInlined && editorLine),
    sourceLine,
    caretLine,
    stack: [],
    hint: getJsHint(errorType, message),
    rawText
  }
}
