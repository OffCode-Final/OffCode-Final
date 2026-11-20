# OffCode ⚡
### Multiplayer Code Editor that Works Offline

A browser-based collaborative code editor where multiple people can edit the same files in real time, keep working smoothly when offline, and automatically merge upon reconnect with zero lost characters.

Built with **React**, **CodeMirror 6**, and **Yjs CRDTs**.

---

## 🚀 How to Demo in 2 Minutes (For Judges & Non-Coders)

Follow these exact steps to verify all features in under two minutes:

### Step 1: Start the App
1. Open your terminal in the `client` directory:
   ```bash
   cd client
   npm install
   npm run dev
   ```
2. Open your web browser and navigate to: **`http://localhost:5173`**

### Step 2: Open Two Collaborative Windows
1. In your **Window A** (e.g. Chrome / Brave):
   - Enter your name: `Alice`
   - Room Code: `hackathon-room`
   - Click **"Join Room & Start Coding →"**
2. Open a **Window B** (or another browser / tab):
   - Navigate to the same URL: `http://localhost:5173/?room=hackathon-room`
   - Enter your name: `Bob`
   - Click **"Join Room & Start Coding →"**

---

### Step 3: Verify the Key Features

#### 1. Live Colored Cursors & Presence
- Look at the right-side **People** panel in both windows: you will see `2 active` with colored dots for both Alice and Bob.
- Click into the code editor in Window B and move your cursor around.
- **Look at Window A**: You will see Bob's live colored cursor and floating name tag moving in real time!
- At the top of the editor tab, notice the active peer indicator: `Also viewing: [B]`.

#### 2. Multi-File Isolation
- In Window B, click **"+ New File"** on the left sidebar, type `script.py`, and click **Create**.
- Window B automatically switches to `script.py`.
- **Look at Window A**: Window A is still in `main.js`. Notice that Bob's cursor **does not** appear in `main.js`! The People panel in Window A accurately shows that Bob is viewing `script.py`.

#### 3. Per-User Undo (Ctrl+Z)
This is the hardest feature in collaborative editing: undoing *only* your changes, without deleting teammates' text.
1. In Window A (Alice), type: `// ALICE'S CODE`
2. In Window B (Bob), type right after it: `// BOB'S CONCURRENT EDIT`
3. In Window A (Alice), press **Ctrl+Z** (or click the **"Undo (1)"** button in the top bar).
4. **Verify**: Alice's text (`// ALICE'S CODE`) is removed, but Bob's text (`// BOB'S CONCURRENT EDIT`) **remains completely intact**!
5. In Window A, click **"Redo (1)"** (or press Ctrl+Shift+Z) to restore Alice's change.

#### 4. Offline Mode & Automatic Reconnect Merge
1. In Window A, click the **"🔌 Go Offline"** button in the top bar. The badge changes to red **Offline**.
2. In Window A, type: `// TYPED WHILE OFFLINE`
3. **Look at Window B**: Notice that Bob does **not** see Alice's offline edit yet.
4. In Window B, type: `// BOB TYPED CONCURRENTLY ONLINE`
5. In Window A, click the **"⚡ Go Online"** button in the top bar.
6. The badge flashes **Connecting...** and turns green **Online**.
7. **Verify**: Both edits (`// TYPED WHILE OFFLINE` and `// BOB TYPED CONCURRENTLY ONLINE`) seamlessly merge into both windows with **zero lost characters**!

#### 5. Hackathon Demo & Debug Inspector
- Click the **"🔍 Demo Panel"** button in the top bar.
- A live HUD opens showing:
  - Your unique CRDT Client ID
  - Real-time connection status
  - Number of peers in awareness
  - **Per-file Undo/Redo stack depths** (verifying that only local changes are counted)
  - Live activity event log capturing CRDT sync events, network transitions, and undo actions
  - **"🤖 Simulate Remote Edit"** button (lets judges test concurrent CRDT merging with a single click!)

---

## 🛠️ Tech Stack & Constraints Followed

- **Frontend**: Plain JavaScript (no TypeScript), React 19, Vite.
- **Editor**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`).
- **Syntax Highlighting**: Official CodeMirror modes for `.js`, `.py`, `.html`, `.css`, `.json`.
- **Theme**: One Dark clean IDE theme with custom floating cursor badges.
- **CRDT Engine**: `yjs`, `y-protocols`, `y-codemirror.next`.
- **Styling**: Pure CSS with CSS variables, high-contrast accessible palettes, and responsive layouts.
- **Strict Team Split**:
  - UI & Editor (`client/` except `client/src/sync/`): Durgesh
  - Sync server, tests, and real offline storage: Teammate

---

## 📝 Teammate Handover & Contract Verification

The UI strictly communicates with the sync engine through the agreed contract in `client/src/sync/index.js`:
- `createWorkspace({ roomId, userName, userColor })`
- Methods: `getText(fileName)`, `listFiles()`, `createFile(name, content)`, `deleteFile(name)`, `onFilesChange(cb)`, `getStatus()`, `onStatusChange(cb)`, `goOffline()`, `goOnline()`, `whenReady`, `destroy()`.

### 📌 Note for Teammate (Real Server & Offline Storage Implementation)
When replacing `client/src/sync/index.js` with your production WebSocket and IndexedDB implementation:
1. **Initial Sync on Reconnect**: Ensure `goOnline()` triggers a Yjs Sync Step 1 message to the server so that any files or edits created by other peers while this client was disconnected are promptly fetched and merged into `ydoc.getMap('files')`.
2. **IndexedDB Persistence**: Initialize `y-indexeddb` with room name `roomId` so offline edits persist across full page refreshes.
