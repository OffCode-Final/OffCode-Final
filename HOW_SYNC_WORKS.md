# How OffCode Sync Works (Judge Cheat Sheet)

A 1-page, plain-English guide to explaining our offline-first collaborative architecture to hackathon judges.

---

### 1. What is a CRDT? (Why not normal WebSockets?)
In traditional apps, when two people edit a document at the same time, the server has to pick a "winner," or one person's edits overwrite another's. If you go offline, merging changes later usually creates nasty Git-style merge conflicts that force someone to manually resolve them.

**OffCode uses a CRDT (Conflict-free Replicated Data Type)** powered by **Yjs**.
- Instead of treating a file as a plain string of characters at index `0, 1, 2...`, every single character typed is assigned an **immutable, globally unique identifier** (consisting of the `clientID` and a monotonic clock timestamp) and points to the character directly before and after it.
- Because character positions are relative to each other rather than fixed array indexes, operations are **commutative**: you can receive them in any order, and math guarantees that every peer converges to the **exact same final text without any central coordinator**.

---

### 2. How Does Offline Editing & Merging Work?
1. **Local Instant Edits**: When a user disconnects or turns off their Wi-Fi, they keep typing with zero lag. Edits are recorded locally into an in-memory Yjs document and immediately mirrored to **IndexedDB** in the browser. Even if the user hard-refreshes the page or reboots their laptop offline, their edits survive.
2. **State Vectors on Reconnect**: When connection is restored, both the client and server exchange a tiny summary called a **State Vector** (e.g., *"I have seen up to edit #42 from Alice and edit #15 from Bob"*).
3. **Delta Sync**: The server sends only the missing updates the client missed, and the client sends only the updates it typed while offline.
4. **Automatic Deterministic Merge**: Yjs weaves the missing characters into the exact relative positions where they were authored. **No characters are lost, no duplicate strings are generated, and no user input is ever overwritten.**

---

### 3. Why Normal AI-Built Sync Engines Break (And How We Solved It)
The problem statement warned that multiplayer offline engines break on edge cases:
- **Concurrent File Creation**: If two users offline create `notes.md` with different text, naive apps pick one and erase the other. Our engine monitors map changes and weaves conflicting offline file contents together with zero lost characters.
- **Delete-vs-Edit Conflict**: If User A deletes a paragraph while User B (offline) types inside that paragraph, normal editors crash or lose User B's edits. With our CRDT relative IDs, the surrounding text is deleted, but User B's typed insertion is safely preserved.
- **Server Restarts Mid-Session**: If the server crashes, our atomic disk persistence restores full room state before accepting new connections, ensuring reconnected clients never lose history.

---

### 4. Review Mode & Host Approval (Safe Proposals)
When review mode is enabled:
- Non-host users edit isolated **Drafts** (`getDraft(file)`).
- When an author pushes a draft, a **Proposal** is created with the author's original base text and proposed text.
- When the Host accepts a proposal, our sync engine runs a **fuzzy 3-way diff (via diff-match-patch)** against the current main file. It applies changes as **minimal insert/delete spans inside a single transaction** rather than replacing the whole file.
- **Why this matters**: Replacing the whole file resets other people's cursors and wipes their undo history. Minimal diff patching allows other collaborators to keep typing live on other lines completely undisturbed!
