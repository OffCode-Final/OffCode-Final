# OffCode

Collaborative, offline-first code editor with real-time peer sync and zero data loss.

## What It Does

OffCode allows multiple users to edit code together in real time, continue working uninterrupted when offline, and automatically merge changes upon reconnecting. Built for low-connectivity environments and hackathons, OffCode runs as a single self-contained application serving both the web editor interface and the peer-to-peer sync engine.

### Key Capabilities
- Real-Time Collaboration: Live character-by-character editing with remote caret indicators and peer presence.
- Live Mouse Pointers: Throttled collaborative cursor pointers showing peer names and color badges, with automatic idle fadeout.
- Offline-First Architecture: Local edits are continuously persisted to browser IndexedDB; when the connection drops, users continue editing locally, and all edits merge automatically on reconnect with zero lost characters.
- Per-User Undo and Redo: Undoing edits (Ctrl+Z) only reverts your own changes without reverting or interrupting edits made by peers.
- Host and Review Mode: The host can switch the room into Review mode, enabling non-host collaborators to work in isolated drafts and submit proposals for visual diff review and fuzzy three-way merging.
- In-Editor Chat Sidebar: Real-time collaborative room chat with unread indicators, host message clearing, and join-time message filtering.
- Local Code Execution: Run Python (via local offline Pyodide WebAssembly without external network calls), JavaScript (sandboxed Web Worker with watchdog timeout), and HTML live previews.
- Project Export: Download individual files or bundle the entire project into a ZIP archive.

## Tech Stack

- Frontend: React 19, CodeMirror 6, Vite, Plain JavaScript.
- Editor Themes and Syntax: VS Code Dark+ styling, syntax highlighting for JavaScript, Python, HTML, CSS, JSON, Markdown, C/C++, and Java.
- Synchronization and CRDTs: Yjs, y-websocket, y-indexeddb, y-codemirror.next, y-protocols.
- Offline Execution: Pyodide WebAssembly (pre-cached locally in client/public/pyodide/), isolated Web Workers, sandboxed iframe.
- Backend: Node.js HTTP server, WebSocket (ws) server, atomic disk file persistence.

## System Requirements

- Node.js: Version 18.0.0 or higher (tested on Node.js 20.x and 24.x).
- npm: Version 9.0.0 or higher.
- Modern web browser (Chrome, Edge, Firefox, Safari).
- Operating System: Windows, macOS, or Linux.

## Setup and Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/qdurgeshsingh1234-alt/OffCode.git
cd OffCode

# Step 1: Install dependencies in root and client
npm run setup

# Alternatively, install manually:
# npm install
# cd client && npm install && cd ..

# Step 2: Build the client distribution
npm run build

# Step 3: Start the server
npm start
```

The server starts on port 1234 and automatically serves the built client interface and WebSocket sync service on the same port.

## Two-Device Demo in 3 Steps

Use these 3 steps to demonstrate real-time collaboration between two computers or devices on the same local network:

### Step 1: Start the Server (Host Laptop)
1. Run `npm start` in your terminal.
2. The terminal displays the local URL (`http://localhost:1234`) and your LAN IP address (for example `http://192.168.1.50:1234` or `http://10.x.x.x:1234`).

### Step 2: Host Creates a Room (Device 1)
1. On the host laptop, open `http://localhost:1234` in your browser.
2. Enter your name (for example, "Alice"), select "Create Room", and click "Create & Enter Room".
3. Click "Copy" on the share link (or note the link: `http://<host-ip>:1234/?room=<room-code>`).

### Step 3: Peer Joins Over LAN (Device 2)
1. On a second laptop, phone, or a separate browser profile, open the shared link: `http://<host-ip>:1234/?room=<room-code>`.
2. Enter a name (for example, "Bob") and click "Join Room".
3. Both users can now edit together simultaneously:
   - Moving the mouse displays live colored pointers with names.
   - Typing displays live colored remote carets and updates text instantly.
   - Disconnecting either device allows continued offline editing; reconnecting merges all edits with zero lost characters.

## Running Tests

Execute the automated test suite covering all 32 verification scenarios:

```bash
npm test
```

The test suite validates:
- Real Two-Device LAN Simulation: Live sync, review mode, and offline merge over LAN IP.
- Concurrent editing, dual offline edits, and 1000+ edit stress tests.
- Offline IndexedDB persistence and reload recovery.
- Host leadership election, draft review, and fuzzy patching.
- Server mid-session restart recovery and malformed packet resilience.

## How Sync Works

OffCode uses Conflict-free Replicated Data Types (CRDTs) powered by Yjs.

1. Deterministic Relative Addressing: Rather than tracking text by absolute character indices (which shift when other users type), every character receives a globally unique, immutable identifier tied to the client ID and a monotonic clock timestamp. Each character references its immediate left and right neighbors.
2. Offline Editing and Storage: While offline, edits are applied to an in-memory Yjs document and mirrored immediately to browser IndexedDB storage. Edits persist across page refreshes and browser restarts.
3. State Vectors on Reconnect: When a connection is re-established, the client and server exchange compact state vectors summarizing the edit clocks each side has observed.
4. Delta Exchange: Only missing update fragments are transmitted over the WebSocket connection.
5. Automatic Conflict-Free Merge: Yjs deterministically inserts missing characters into their exact relative positions. No central authority is required to resolve conflicts, and no characters are overwritten or lost.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
