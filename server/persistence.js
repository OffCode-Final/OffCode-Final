import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';

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
    const safeName = encodeURIComponent(docName).replace(/[^a-zA-Z0-9_\-.~]/g, '_');
    return path.join(this.dataDir, `${safeName}.ydoc`);
  }

  bindState(docName, ydoc) {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (_) {}
    }

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

    ydoc.on('update', () => {
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

  saveDocNow(docName, ydoc) {
    if (this.pendingSaves.has(docName)) {
      clearTimeout(this.pendingSaves.get(docName).timeout);
      this.pendingSaves.delete(docName);
    }

    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (_) {}
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

  async writeState(docName, ydoc) {
    this.saveDocNow(docName, ydoc);
    console.log(`[Persistence] Flushed and saved room "${docName}" (all clients disconnected)`);
  }

  flushAll(docsMap) {
    for (const [docName, entry] of this.pendingSaves.entries()) {
      clearTimeout(entry.timeout);
      this.saveDocNow(docName, entry.ydoc);
    }
    this.pendingSaves.clear();

    if (docsMap) {
      for (const [docName, doc] of docsMap.entries()) {
        this.saveDocNow(docName, doc);
      }
    }
    console.log('[Persistence] All room documents safely flushed to disk.');
  }

  hasDoc(docName) {
    const filePath = this.getFilePath(docName);
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
    } catch (_) {
      return false;
    }
  }

  deleteDoc(docName) {
    const filePath = this.getFilePath(docName);
    if (this.pendingSaves.has(docName)) {
      clearTimeout(this.pendingSaves.get(docName).timeout);
      this.pendingSaves.delete(docName);
    }
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Persistence] Deleted room data from disk: "${docName}"`);
        return true;
      }
    } catch (err) {
      console.error(`[Persistence] Error deleting room "${docName}":`, err);
    }
    return false;
  }
}
