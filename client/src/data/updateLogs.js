/**
 * OffCode Update Logs (Changelog) Data
 * 
 * Each release contains:
 * - version: String (e.g., 'v1.0')
 * - releaseDate: String (e.g., 'November 2026')
 * - title: String
 * - isCurrent: Boolean
 * - logs: Array of strings or { item: string, detail: string } formatted as 1-line summaries.
 */

export const UPDATE_LOGS = [
  {
    version: 'v1.0',
    title: 'OffCode Core Platform Release',
    releaseDate: 'November 2026',
    isCurrent: true,
    logs: [
      {
        item: 'Real-time Multiplayer Sync',
        detail: 'Simultaneous code editing powered by Yjs CRDT with conflict-free merges.'
      },
      {
        item: 'Offline-First Resilience',
        detail: 'Full local editing without internet and automatic re-sync via IndexedDB upon reconnect.'
      },
      {
        item: 'Live Carets & Cursors',
        detail: 'Real-time collaborator color carets, active selection highlights, and mouse pointers.'
      },
      {
        item: 'In-Browser Python Execution',
        detail: 'Sandboxed Python runner running entirely client-side via Pyodide WebAssembly.'
      },
      {
        item: 'Interactive HTML/CSS Preview',
        detail: 'Live sandboxed preview resolving relative stylesheets and scripts directly across room files.'
      },
      {
        item: 'Collaborator Follow Mode',
        detail: 'One-click camera follow locking onto any active collaborator’s viewport and line number.'
      },
      {
        item: 'Review Mode & Host Powers',
        detail: 'Host authority to freeze editing, review pull proposals with side-by-side diffs, or pass host.'
      },
      {
        item: 'In-Room Chat',
        detail: 'Low-latency collaborative chat with unread counters, timestamps, and user presence dots.'
      },
      {
        item: 'Show User Changes Underlines',
        detail: 'Toggleable colored underlines beneath lines written or modified by other collaborators.'
      },
      {
        item: 'Improve with AI (Gemini & Groq)',
        detail: 'Contextual code improvements and diff replacement on any selected snippet.'
      },
      {
        item: 'Workspace Folder Import & ZIP Export',
        detail: 'Load whole local folders into virtual workspace and download all room files as a .zip.'
      },
      {
        item: 'Dual Theme System',
        detail: 'Polished developer-grade Dark and Light themes with instant toggle and tokenized design.'
      },
      {
        item: 'Per-User Isolated Undo/Redo',
        detail: 'Personal undo and redo history that never reverts edits made by your teammates.'
      },
      {
        item: 'Mobile-Responsive Drawers',
        detail: 'Collapsible navigation drawers and accessible focus states for devices below 900px.'
      }
    ]
  }
]
