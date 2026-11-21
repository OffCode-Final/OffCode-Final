/**
 * Collaborative User Change Highlighting for OffCode.
 *
 * Implements:
 * 1. Authorship formatting on local insertions in Y.Text.
 * 2. Visual decorations in CodeMirror 6 with colored underlines matching each collaborator's cursor color.
 * 3. Individual user toggle (ON/OFF) persisted in localStorage.
 * 4. Collaborator hover tooltip showing "Edited by [Name]".
 * 5. Full offline-first support and CRDT-level attribution persistence.
 */

import { RangeSetBuilder, StateEffect, Compartment } from '@codemirror/state'
import { Decoration, ViewPlugin, hoverTooltip, EditorView } from '@codemirror/view'
import { ySyncAnnotation, ySyncFacet } from 'y-codemirror.next'

export const userChangesCompartment = new Compartment()
export const updateUserChangesEffect = StateEffect.define()

/**
 * Builds a RangeSet of mark decorations highlighting code inserted/modified
 * by other collaborators. The current user's own contributions are never underlined.
 */
export function buildUserChangeDecorations(docLength, ytext, currentUserId, showUserChanges, userMap) {
  if (!showUserChanges || !ytext || typeof ytext.toDelta !== 'function') {
    return Decoration.none
  }

  let delta
  try {
    delta = ytext.toDelta()
  } catch (err) {
    console.warn('[UserChanges] Failed getting ytext delta:', err)
    return Decoration.none
  }

  const builder = new RangeSetBuilder()
  let pos = 0
  let currentSpan = null

  const addSpan = (span) => {
    const from = Math.max(0, Math.min(span.from, docLength))
    const to = Math.max(from, Math.min(span.to, docLength))
    if (to > from) {
      builder.add(
        from,
        to,
        Decoration.mark({
          class: 'cm-user-change-underline',
          attributes: {
            style: `text-decoration: underline 1.5px ${span.color}; text-underline-offset: 3px; text-decoration-skip-ink: none;`,
            title: `Edited by ${span.name}`
          }
        })
      )
    }
  }

  for (let i = 0; i < delta.length; i++) {
    const op = delta[i]
    const len = typeof op.insert === 'string' ? op.insert.length : 1
    const attrs = op.attributes

    // Only underline code attributed to another collaborator (not current user)
    if (attrs && attrs.author && attrs.author !== currentUserId) {
      const user = userMap ? userMap.get(attrs.author) : null
      const color = user?.color || attrs.color || '#6366f1'
      const name = user?.name || attrs.name || 'Collaborator'

      if (
        currentSpan &&
        currentSpan.author === attrs.author &&
        currentSpan.to === pos &&
        currentSpan.color === color
      ) {
        currentSpan.to = pos + len
      } else {
        if (currentSpan) {
          addSpan(currentSpan)
        }
        currentSpan = { from: pos, to: pos + len, author: attrs.author, name, color }
      }
    } else {
      if (currentSpan) {
        addSpan(currentSpan)
        currentSpan = null
      }
    }

    pos += len
  }

  if (currentSpan) {
    addSpan(currentSpan)
  }

  return builder.finish()
}

/**
 * ViewPlugin that manages and maps user change decorations in real time.
 */
export function createUserChangePlugin(ytext, currentUserId, showUserChanges, userMap) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view
        this.decorations = buildUserChangeDecorations(
          view.state.doc.length,
          ytext,
          currentUserId,
          showUserChanges,
          userMap
        )

        let rafId = null
        const schedule =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (fn) => setTimeout(fn, 16)

        this.onYTextChange = () => {
          if (rafId) return
          rafId = schedule(() => {
            rafId = null
            if (this.view && !this.view.isDestroyed) {
              this.view.dispatch({
                effects: [updateUserChangesEffect.of(null)]
              })
            }
          })
        }

        if (ytext && typeof ytext.observe === 'function') {
          ytext.observe(this.onYTextChange)
        }
      }

      update(update) {
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes)
        }
        if (update.effects.some((e) => e.is(updateUserChangesEffect))) {
          this.decorations = buildUserChangeDecorations(
            update.state.doc.length,
            ytext,
            currentUserId,
            showUserChanges,
            userMap
          )
        }
      }

      destroy() {
        if (ytext && typeof ytext.unobserve === 'function') {
          ytext.unobserve(this.onYTextChange)
        }
      }
    },
    {
      decorations: (v) => v.decorations
    }
  )
}

/**
 * Listens for local keystrokes/pastes and formats newly inserted characters
 * in Y.Text with contributor attribution metadata.
 */
export function createLocalAttributionListener(ytext, currentUserId, currentUserName, currentUserColor) {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged || !ytext || !ytext.doc) return

    // Skip remote updates applied by yCollab
    const isRemote = update.transactions.some((tr) => tr.annotation(ySyncAnnotation))
    if (isRemote) return

    // Retrieve ySyncFacet config so the transaction origin is grouped with yCollab
    let conf = null
    try {
      conf = update.view.state.facet(ySyncFacet)
    } catch (_) {}
    const origin = conf || 'attribution'

    // Format all inserted spans
    try {
      ytext.doc.transact(() => {
        update.changes.iterChanges((fromA, toA, fromB, toB) => {
          const len = toB - fromB
          if (len > 0) {
            ytext.format(fromB, len, {
              author: currentUserId,
              name: currentUserName || 'Collaborator',
              color: currentUserColor || '#6366f1'
            })
          }
        })
      }, origin)
    } catch (err) {
      console.warn('[UserChanges] Failed attributing local edit:', err)
    }
  })
}

/**
 * Displays a clean hover tooltip showing "Edited by [Name]" with author color dot.
 */
export function createUserChangeTooltip(ytext, currentUserId, showUserChanges, userMap) {
  return hoverTooltip((view, pos) => {
    if (!showUserChanges || !ytext || typeof ytext.toDelta !== 'function') return null

    let delta
    try {
      delta = ytext.toDelta()
    } catch (_) {
      return null
    }

    let cur = 0
    for (let i = 0; i < delta.length; i++) {
      const op = delta[i]
      const len = typeof op.insert === 'string' ? op.insert.length : 1
      if (pos >= cur && pos < cur + len) {
        const attrs = op.attributes
        if (attrs && attrs.author && attrs.author !== currentUserId) {
          const user = userMap ? userMap.get(attrs.author) : null
          const color = user?.color || attrs.color || '#6366f1'
          const name = user?.name || attrs.name || 'Collaborator'

          return {
            pos: cur,
            end: cur + len,
            above: true,
            create() {
              const dom = document.createElement('div')
              dom.className = 'cm-user-change-tooltip'

              const dot = document.createElement('span')
              dot.className = 'cm-tooltip-dot'
              dot.style.backgroundColor = color

              const text = document.createElement('span')
              text.textContent = 'Edited by '

              const strong = document.createElement('strong')
              strong.textContent = name
              text.appendChild(strong)

              dom.appendChild(dot)
              dom.appendChild(text)
              return { dom }
            }
          }
        }
        return null
      }
      cur += len
    }
    return null
  })
}

export const userChangeBaseTheme = EditorView.baseTheme({
  '.cm-user-change-underline': {
    textDecorationSkipInk: 'none'
  },
  '.cm-user-change-tooltip': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    backgroundColor: '#252526',
    color: '#cccccc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '11px',
    border: '1px solid #3c3c3c',
    borderRadius: '4px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    lineHeight: '1.2',
    zIndex: '100'
  },
  '.cm-user-change-tooltip .cm-tooltip-dot': {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0
  },
  '.cm-user-change-tooltip strong': {
    color: '#ffffff',
    fontWeight: 600
  }
})

/**
 * Creates the complete extension bundle for User Changes.
 */
export function createUserChangesExtension({
  ytext,
  currentUserId,
  currentUserName,
  currentUserColor,
  users = [],
  showUserChanges = false
}) {
  if (!ytext) return []

  const userMap = new Map()
  if (Array.isArray(users)) {
    for (const u of users) {
      if (u.userId) {
        userMap.set(u.userId, { name: u.name, color: u.color })
      }
    }
  }

  return [
    userChangeBaseTheme,
    createLocalAttributionListener(ytext, currentUserId, currentUserName, currentUserColor),
    createUserChangePlugin(ytext, currentUserId, showUserChanges, userMap),
    createUserChangeTooltip(ytext, currentUserId, showUserChanges, userMap)
  ]
}
