/**
 * OffCode Update Logs (Changelog) Data
 * 
 * Each release contains:
 * - version: String (e.g., 'v1.1')
 * - releaseDate: String (e.g., 'November 2026')
 * - title: String
 * - isCurrent: Boolean
 * - logs: Array of { item: string, detail: string } formatted as 1-line summaries.
 */

export const UPDATE_LOGS = [
  {
    version: 'v1.3',
    title: 'Clean Errors, Live Disk Save, Private AI Chat & Inline AI',
    releaseDate: 'November 2026',
    isCurrent: true,
    logs: [
      {
        item: 'Clean Error Cards & Interactive Python Input',
        detail: 'Readable error blocks with clickable source jumps, filtered tracebacks, and IDLE-style inline input() prompts.'
      },
      {
        item: 'Universal Autocomplete & Offline Ghost Preview',
        detail: 'Keyword snippets across 19+ file types, room-wide identifiers, and dimmed Tab/Enter inline preview.'
      },
      {
        item: 'Live Disk Linking & File Row Actions',
        detail: 'Open files/folders with direct in-place Ctrl+S and optional 1.5s auto-save on HTTPS, plus Rename, Duplicate, and Download.'
      },
      {
        item: 'Private AI Chat with Quoting & Token Usage',
        detail: 'Streaming Gemini sidebar with safe markdown, code/error quoting, Insert/Replace actions, and local token tracking.'
      },
      {
        item: 'Opt-In AI Inline Suggestions',
        detail: 'Optional multi-line ghost completions triggered after typing pauses, with rate limiting and isolated local undo.'
      }
    ]
  },
  {
    version: 'v1.2',
    title: 'Multi-Language Runners, Autocomplete & Draft Proposals',
    releaseDate: 'November 2026',
    isCurrent: false,
    logs: [
      {
        item: 'Multi-Language Cloud Runners',
        detail: 'Sandboxed remote execution support for C, C++, Java, Rust, Go, Ruby, and PHP with 15s timeout, stdin support, and offline guards.'
      },
      {
        item: 'Client-Side JS & TS Execution',
        detail: 'Isolated Web Worker execution engine for running JavaScript and TypeScript directly in the browser with full console capture.'
      },
      {
        item: 'Native CodeMirror Autocompletion',
        detail: 'Integrated keyword and language snippet completion with Tab key template insertion.'
      },
      {
        item: 'Solo-Host Review & Draft Proposals',
        detail: 'Complete draft branch workflow allowing room hosts and collaborators to draft and review code proposals before merging into main.'
      },
      {
        item: 'Peer-to-Peer Chat Soft-Delete',
        detail: 'Shared message deletion across all room participants synchronized over Yjs CRDT.'
      },
      {
        item: 'Simulate Offline & Debug Tools',
        detail: 'Built-in offline mode toggle and live awareness inspector to stress-test collaboration resilience.'
      }
    ]
  },
  {
    version: 'v1.1',
    title: 'Room Lifecycle, Security & PWA Auto-Reload',
    releaseDate: 'November 2026',
    isCurrent: false,
    logs: [
      {
        item: 'Blank Canvas Initial State',
        detail: 'Stripped all boilerplate starter templates; new files now open completely blank and ready to code.'
      },
      {
        item: 'Ephemeral Room Memory Wipe',
        detail: 'Automatic purge of chats, files, proposals, server disk data, and IndexedDB caches when a room is emptied.'
      },
      {
        item: 'Live Room Polling',
        detail: 'Background room existence check every 2.5s on the Join screen without requiring manual page refresh.'
      },
      {
        item: 'Instant PWA Auto-Reload',
        detail: 'Configured Workbox auto-reloading (skipWaiting) so users receive new app deployments instantly without Ctrl+F5.'
      },
      {
        item: 'In-App Update Logs',
        detail: 'One-click Changelog viewer in the top-right toolbar to track all feature releases and version notes.'
      },
      {
        item: 'Room Security & Protection',
        detail: 'Real-time room validation and password authentication to safeguard private collaborative sessions.'
      }
    ]
  },
  {
    version: 'v1.0',
    title: 'OffCode Core Platform Release',
    releaseDate: 'November 2026',
    isCurrent: false,
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
