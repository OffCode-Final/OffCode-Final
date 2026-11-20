# OffCode
### Multiplayer Code Editor that Works Offline

A browser-based collaborative code editor where multiple developers can edit the same files in real time, keep working smoothly offline, and automatically merge upon reconnect with zero lost characters.

Built with React, CodeMirror 6, Pyodide WebAssembly, and Yjs CRDTs. Styled in VS Code Dark+ theme.

---

## Two Device Live Demo in 3 Steps

Use these 3 steps to demonstrate live collaboration between two real devices (laptops, phones, or tablets on the same Wi-Fi) or two browser profiles on the same computer:

### Step 1: Start the Server & Client
1. In terminal 1, start the WebSocket sync server:
   ```bash
   npm run start:server
   ```
2. In terminal 2, start the React client:
   ```bash
   cd client
   npm run dev
   ```
   The terminal will print your local URL (`http://localhost:5173`) and Network URL (e.g. `http://192.168.1.50:5173`).

### Step 2: Host Creates a Room (Device A)
1. On Device A (or Window A), navigate to: **`http://localhost:5173`**
2. In the Join screen:
   - Enter your name: `Alice`
   - Select **"Create Room"** (a clean room code like `room-4921` is auto-generated)
   - Click **"Create & Enter Room"**
3. Alice enters the editor as **Host** (indicated in the bottom status bar and top bar).
4. Click the **"Copy"** button next to the Share Link in the Join screen (or share `http://<your-ip>:5173/?room=<room-code>`).

### Step 3: Friend Joins the Room (Device B)
1. On Device B (or a private/incognito window), open the shared link:
   **`http://<your-ip>:5173/?room=<room-code>`**
2. The Room Code is automatically prefilled. Enter name: `Bob` and click **"Join Room"**.
3. **Verify Live Collaboration**:
   - Both devices immediately see each other in the right-side **People** panel (`2 collaborators`) with colored dots, active file name, and real-time line numbers.
   - When Bob moves his cursor or selects text, Alice sees Bob's live colored caret and name tag in real time.
   - Bob can click **"Follow"** next to Alice in the People panel to automatically track Alice's file and cursor position.

---

## Key Features Verification Walkthrough

### 1. Offline Editing & Automatic Reconnect Merge (Zero Lost Characters)
1. In Bob's window, click **"Online"** in the bottom status bar (or click "More actions -> Disconnect"). The status turns red **Offline**, and a banner displays: *"Cannot reach the server. Check the link and Wi-Fi. (Offline editing is enabled)"*.
2. In Bob's window (while offline), type: `// BOB TYPED WHILE OFFLINE`
3. In Alice's window (online), type concurrently on the same line: `// ALICE CONCURRENT EDIT`
4. In Bob's window, click **"Retry Connection"** in the banner.
5. The connection reconnects to **Online**.
6. **Result**: Both Alice's and Bob's edits merge cleanly with **zero lost characters** thanks to Yjs CRDT conflict resolution.

### 2. Multi-File Isolation
1. In Alice's sidebar, click **"New file"**, type `script.py`, and click **Create**.
2. Alice automatically switches to `script.py`.
3. Notice that Bob is still in `main.js`. Bob's cursor is **not** rendered in `script.py`—each collaborator's cursor only renders in the file they are currently viewing.
4. The People panel accurately shows Alice in `script.py:1` and Bob in `main.js:1`.

### 3. Per-User Undo (Ctrl+Z)
Collaborative per-user undo ensures undoing your own changes never deletes or reverts teammates' work.
1. In Alice's window, type: `const greeting = "Hello World";`
2. In Bob's window, type directly below it: `const team = "Antigravity";`
3. In Alice's window, press **Ctrl+Z** (or click the Undo icon in the top bar).
4. **Result**: Alice's text is undone, while Bob's text (`const team = "Antigravity";`) **remains completely intact**.
5. In Alice's window, press **Ctrl+Shift+Z** (or click Redo) to restore Alice's edit.

### 4. Host & Review Mode (Private Drafts, Visual Diff, and 3-Way Fuzzy Merge)
1. On Device A (Alice is Host): in the top bar mode toggle, switch from **"Live"** to **"Review"**.
2. On Device B (Bob):
   - A banner appears: *"Review mode active. Editing your private draft. Push when ready for host review."*
   - Two review tabs appear: `My Draft (editing)` and `Main file (read-only)`.
3. In Bob's draft, add a function:
   ```javascript
   function calculateTotal(items) {
     return items.reduce((sum, item) => sum + item.price, 0);
   }
   ```
4. Click `Main file (read-only)`: verify that the main file is protected and unchanged.
5. Switch back to `My Draft`, click **"Push Draft"**, enter a summary message (`"Add calculateTotal utility"`), and submit.
6. On Device A (Alice, Host):
   - The top bar displays **"Proposals (1)"**.
   - Alice clicks **"Proposals"** to open the Host Review Drawer.
   - Alice reviews the visual side-by-side / inline diff (`+` green additions, `-` red deletions).
   - Alice clicks **"Accept"**.
7. The proposed changes are merged into the shared file using 3-way fuzzy patching without disrupting other collaborators' cursors. Bob receives an instant toast notification: *"Host accepted your proposal"*.
8. Alice can also click **"Revert"** in the Review Drawer to safely roll back the proposal at any time.

### 5. Local Offline Code Execution
1. Open or create `script.py`.
2. Click **"Run"** in the top bar (or press **Ctrl+Enter**).
3. The bottom **Output Panel** opens:
   - Pyodide WebAssembly engine loads offline from local files in `client/public/pyodide/` (no CDN or external network needed).
   - Python executes inside an isolated Web Worker, capturing `stdout` and execution duration.
   - If an infinite loop occurs, click **"Stop"** to terminate the Web Worker and immediately unblock the UI.
   - If `input()` is called, a friendly message explains that interactive console input is disabled in offline execution.
4. JavaScript files run in an isolated Web Worker with a 10-second watchdog timer.
5. HTML files render live previews inside a sandboxed iframe.

### 6. Save & Download All (.zip)
1. Click **"Save"** in the top bar (or press **Ctrl+S**): downloads the active file directly to your PC with its exact filename and content.
2. Click **"More actions -> Download all (.zip)"**: bundles all files in the current workspace into a `.zip` archive using JSZip and triggers a browser download.

---

## Tech Stack & Architecture

- **Frontend**: React 19, Vite, Plain JavaScript (no TypeScript).
- **Styling**: VS Code Dark+ CSS design system (editor `#1e1e1e`, sidebar `#252526`, top bar `#323233`, status bar `#007acc`, zero emojis).
- **Fonts**: Self-hosted Inter (UI) and JetBrains Mono (Code/Output) via `@fontsource`.
- **Editor**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`).
- **Languages**: Python, JavaScript, HTML, CSS, JSON, Markdown, C/C++, Java.
- **Offline Code Execution**: Pyodide (ES Module Web Worker, local assets pre-cached by Workbox PWA), Web Worker JS runner with 10s watchdog timeout, sandboxed iframe HTML preview.
- **CRDT Sync Engine**: `yjs`, `y-websocket`, `y-indexeddb`, `y-codemirror.next`.
- **Strict Role Boundaries**:
  - `client/` (UI, Editor, Workers, Runners): Durgesh
  - `server/`, `tests/`, `client/src/sync/`: Teammate

---

## Automated Test Suite

Run the full end-to-end verification test suite:
```bash
npm test
```
All 26 comprehensive test scenarios pass cleanly:
- 15 Sync engine & offline merge scenarios (concurrent lines, dual offline edits, 1000+ edit stress, IndexedDB reload, delete-vs-edit conflicts, flaky Wi-Fi, server crash recovery, file create/delete conflicts, 5000+ line large file benchmark, concurrent proposals, stale proposals, offline proposal reconnect, leader election, proposal revert, non-host permissions).
- 4 Contract verification scenarios (exact API surface, host/mode live-review semantics, safe user IDs without crypto.randomUUID, room code normalization).
- 4 Server persistence scenarios (health check endpoint, 4+ simultaneous users, multi-room isolation, disk persistence surviving server restart).
