import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Y = require('yjs');

/**
 * File-based persistence adapter for Yjs documents.
 * 
 * Guarantees:
 * 1. Synchronous loading: The doc is fully populated before any WebSocket sync message is sent.
 * 2. Atomic disk writes: Uses temp file + rename to prevent corrupted files on crash.
 * 3. Debounced saves during rapid edits + immediate flush on close or server shutdown.
 */
export class FilePersistence {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.pendingSaves = new Map(); // docName -> { timeout, ydoc }
  }

  getFilePath(docName) {
    // Sanitize docName for safe filename on Windows/Linux/macOS
    const safeName = encodeURIComponent(docName).replace(/[^a-zA-Z0-9_\-.~]/g, '_');
    return path.join(this.dataDir, `${safeName}.ydoc`);
  }

  /**
   * Called by y-websocket when a room document is created.
   * Loads existing state from disk synchronously so late joiners and reconnected
   * clients receive the complete history immediately.
   */
  bindState(docName, ydoc) {
    const filePath = this.getFilePath(docName);
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath);
        if (data.length > 0) {
          Y.applyUpdate(ydoc, new Uint8Array(data));
          console.log(`[Persistence] Restored room "${docName}" from disk (${data.length} bytes)`);
        }
      } catch (err) {
        console.error(`[Persistence] Error reading "${filePath}":`, err);
      }
    } else {
      console.log(`[Persistence] New room created: "${docName}"`);
    }

    // Listen for updates and schedule debounced save
    ydoc.on('update', (_update, _origin) => {
      this.scheduleSave(docName, ydoc);
    });
  }

  scheduleSave(docName, ydoc, delayMs = 150) {
    if (this.pendingSaves.has(docName)) {
      return;
    }

    const timeout = setTimeout(() => {
      this.pendingSaves.delete(docName);
      this.saveDocNow(docName, ydoc);
    }, delayMs);

    this.pendingSaves.set(docName, { timeout, ydoc });
  }

  /**
   * Atomically save a Y.Doc to disk using write-to-temp + rename.
   */
  saveDocNow(docName, ydoc) {
    if (this.pendingSaves.has(docName)) {
      clearTimeout(this.pendingSaves.get(docName).timeout);
      this.pendingSaves.delete(docName);
    }

    const filePath = this.getFilePath(docName);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;

    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      fs.writeFileSync(tempPath, Buffer.from(state));
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      console.error(`[Persistence] Failed saving room "${docName}":`, err);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
    }
  }

  /**
   * Called by y-websocket when all connections to a room have disconnected.
   */
  async writeState(docName, ydoc) {
    this.saveDocNow(docName, ydoc);
    console.log(`[Persistence] Flushed and saved room "${docName}" (all clients disconnected)`);
  }

  /**
   * Flush all active rooms to disk immediately (e.g. on server shutdown).
   */
  flushAll(docsMap) {
    // Flush any pending scheduled saves
    for (const [docName, entry] of this.pendingSaves.entries()) {
      clearTimeout(entry.timeout);
      this.saveDocNow(docName, entry.ydoc);
    }
    this.pendingSaves.clear();

    // Flush all loaded docs in memory
    if (docsMap) {
      for (const [docName, doc] of docsMap.entries()) {
        this.saveDocNow(docName, doc);
      }
    }
    console.log('[Persistence] All room documents safely flushed to disk.');
  }
}
