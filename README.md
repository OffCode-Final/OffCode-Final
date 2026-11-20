# OffCode ⚡
### Multiplayer Code Editor that Works Offline

A browser-based collaborative code editor where 4+ developers can edit the same files in real time, keep working smoothly offline, and automatically merge upon reconnect with zero lost characters.

Built with **React**, **CodeMirror 6**, **Pyodide**, and **Yjs CRDTs**.

---

## 🚀 How to Demo in 2 Minutes (For Judges & Non-Coders)

Follow these exact steps to verify all features in under two minutes:

### Step 1: Start the Server & Client
1. In terminal 1 (start the WebSocket sync server):
   ```bash
   npm run start:server
   ```
2. In terminal 2 (start the React web app):
   ```bash
   cd client
   npm run dev
   ```
3. Open your web browser and navigate to: **`http://localhost:5173`**

### Step 2: Open Two Collaborative Windows Side-by-Side
1. In your **Window A** (Left window - Host):
   - Enter your name: `Alice`
   - Room Code: `hackathon-room`
   - Click **"Join Room & Start Coding →"**
2. In your **Window B** (Right window - Peer / Collaborator):
   - Navigate to: `http://localhost:5173/?room=hackathon-room`
   - Enter your name: `Bob`
   - Click **"Join Room & Start Coding →"**

---

### Step 3: Verify the Key Features in Order

#### 1. Live Colored Cursors, Line Tracking & Follow Mode
- Look at the right-side **People** panel in both windows: you will see `2 active` with colored dots for both Alice and Bob.
- Notice the file and live line number tracking next to each person (e.g. `main.js : Ln 6`).
- In Window B, move your cursor or click on different lines.
- **Look at Window A**: You will see Bob's live colored cursor, selection highlight, and floating name tag moving in real time without shifting existing text!
- In Window A, click the **"🎯 Follow"** button next to Bob in the People panel. Window A will automatically navigate to whatever file and line Bob opens!

#### 2. Offline Mode & Zero Lost Characters (Automatic CRDT Reconnect Merge)
1. In Window B (Bob), click the **"🔌 Go Offline"** button in the top bar. The badge changes to red **OFFLINE**.
2. In Window B, type: `// BOB TYPED WHILE OFFLINE`
3. In Window A (Alice, online), type concurrently: `// ALICE CONCURRENT EDIT`
4. Notice that neither window interferes with the other while disconnected.
5. In Window B, click the **"⚡ Go Online"** button in the top bar.
6. The badge flashes **Connecting...** and turns green **ONLINE**.
7. **Verify**: Both edits (`// BOB TYPED WHILE OFFLINE` and `// ALICE CONCURRENT EDIT`) seamlessly merge into both windows with **zero lost characters**!

#### 3. Per-User Undo (Ctrl+Z)
This is the hardest feature in collaborative editing: undoing *only* your own changes, without deleting teammates' text.
1. In Window A (Alice), type: `const greeting = "Hello World";`
2. In Window B (Bob), type right below it: `const team = "Antigravity";`
3. In Window A (Alice), press **Ctrl+Z** (or click the **"Undo"** button in the top bar).
4. **Verify**: Alice's text is undone, but Bob's text (`const team = "Antigravity";`) **remains completely untouched**!
5. In Window A, press **Ctrl+Shift+Z** (or click **"Redo"**) to cleanly restore Alice's edit.

#### 4. Host & Review Mode (Private Drafts, Diff Inspector & Merge)
1. In Window A (Alice is Host, indicated by the `👑 HOST` badge in the top bar):
   - In the top bar mode switch, click **"Review"**.
2. Look at Window B (Bob):
   - A banner appears: *"You're editing your draft. Push it for host review."*
   - Two review tabs appear: `✏️ My Draft (editing)` and `👁️ Main file (read-only)`.
3. In Window B, type a proposed feature in your draft:
   ```javascript
   // Bob's optimized sorting algorithm
   function quickSort(arr) { return arr.sort(); }
   ```
4. Click the `👁️ Main file (read-only)` tab: notice the main file is untouched and protected from direct edits. Switch back to `✏️ My Draft`.
5. Click **"🚀 Push Draft"** in the banner or top bar. Type a description (e.g. *"Added quick sort"*) and submit.
6. **Look at Window A (Host)**:
   - The top bar shows **"📋 Proposals (1)"** with a badge.
   - Alice clicks **"📋 Proposals"** to open the Host Review Drawer.
   - Alice inspects the side-by-side / inline **Visual Diff**: green (`+`) for added lines and red (`-`) for removed lines.
   - Alice clicks **"✓ Accept Proposal"**.
   - The proposal status changes to `✅ Accepted` and applies cleanly to the main file!
   - In Window B, Bob receives an instant notification toast: *"Host ACCEPTED your proposal!"*.
7. If needed, the host can click **"↩ Revert Proposal"** in the Review Drawer to safely roll back the proposal without disturbing other users' cursors.

#### 5. Run Python Offline with Pyodide (Web Worker & Sandboxed Execution)
1. On the left sidebar, click **"+py"** or create a Python file `script.py`.
2. OffCode seeds an initial Python script:
   ```python
   def main():
       print("Hello from Python in OffCode!")
       for i in range(1, 4):
           print(f"Step {i}: CRDT sync verified.")

   if __name__ == "__main__":
       main()
   ```
3. Click the **"▶ Run"** button (or press **Ctrl+Enter**).
4. The bottom **Output Panel** slides up:
   - Pyodide loads offline directly from local files in `client/public/pyodide/` (no external CDN required!).
   - Execution runs safely inside an isolated Web Worker.
   - `stdout` prints cleanly in terminal green.
   - If a script has an infinite loop, click the red **"⏹ Stop"** button to instantly kill the Web Worker and restore responsiveness.
   - If `input()` is called, a friendly message explains that interactive input is not supported in the offline runner.
5. In addition to Python, click **"+js"** to execute JavaScript in an isolated worker with a 10s timeout, or **"+html"** for live sandboxed HTML preview!

#### 6. Save & Download All (.zip)
1. Click **"💾 Save"** (or press **Ctrl+S**): downloads the current file directly to your computer with its exact filename and contents.
2. Click **"📦 Download All (.zip)"**: bundles every file in the collaborative room into a `.zip` archive via `jszip` and triggers a one-click download.

#### 7. Hackathon Demo & Debug Inspector
- Click the **"🔍 Demo Panel"** button in the top bar.
- A live HUD opens showing:
  - **CRDT Client ID**: Unique peer identifier
  - **Connection Status**: Real-time Yjs network provider state
  - **Collaborators in Room**: Active peers count
  - **Room Mode**: `LIVE` vs `REVIEW`
  - **Room Host ID**: Active elected host authority
  - **Pending Proposals**: Count of proposals waiting for review
  - **Per-file Undo/Redo Stacks**: Verifying independent history depth per file and draft
  - **Live Activity Log**: Real-time event stream of network, CRDT, file, and review events
  - **"Simulate Remote Edit"** button: Test concurrent merges with a single click

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 19, Vite, Plain JavaScript (no TypeScript).
- **Editor**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`).
- **Language Support**: Syntax highlighting & indentation for Python, JavaScript, HTML, CSS, JSON, Markdown, C/C++, Java.
- **Offline Code Execution**: Pyodide (ES Module Web Worker, local assets pre-cached by Workbox PWA), Web Worker JS runner with 10s watchdog timeout, sandboxed iframe HTML preview.
- **Diff Engine**: `diff` for side-by-side & inline visual diffing; `diff-match-patch` for host proposal merging.
- **CRDT & Sync**: `yjs`, `y-websocket`, `y-indexeddb`, `y-codemirror.next`.
- **Styling**: Pure CSS with CSS variables, high-contrast accessible One Dark theme, and responsive layouts.
- **Strict Architecture Boundaries**:
  - `client/` (UI, Editor, Workers, Runners): Durgesh
  - `server/`, `tests/`, `client/src/sync/`: Teammate

---

## 🧪 Automated Test Suite

Run the full end-to-end verification test suite:
```bash
npm test
```
All 21 comprehensive test scenarios pass cleanly:
- Concurrent typing on identical lines
- Dual offline edits with identical line/word conflicts
- Long offline edits (1000+ operations)
- Offline IndexedDB persistence surviving browser refresh
- Delete-vs-edit conflict resolution
- 8 simultaneous clients under simulated flaky network conditions
- Server mid-session restart and crash recovery
- Concurrent file creation/deletion
- Large file (5,000+ lines) sync performance benchmark
- Host & author concurrent proposals with 3-way fuzzy patching
- Stale proposal handling & offline proposal reconnect
- Leader/Host election convergence
- Proposal revert isolation
- Non-host permission enforcement
