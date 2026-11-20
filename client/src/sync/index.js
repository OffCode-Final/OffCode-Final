import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

// Configure server URL
export const SYNC_SERVER_URL =
  (typeof process !== 'undefined' && process.env?.VITE_SYNC_SERVER_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SYNC_SERVER_URL) ||
  'ws://localhost:1234';

/**
 * Generates or retrieves a persistent user ID.
 * Supports URL ?as=<name> override for multi-user local testing.
 */
export function getUserId(optionsUserId = null) {
  if (optionsUserId && typeof optionsUserId === 'string' && optionsUserId.trim()) {
    return optionsUserId.trim();
  }

  if (typeof window !== 'undefined') {
    // 1. URL ?as=<name> parameter takes highest priority
    try {
      const params = new URLSearchParams(window.location.search);
      const asParam = params.get('as');
      if (asParam && asParam.trim()) {
        return asParam.trim();
      }
    } catch (_) {}

    // 2. localStorage persistence
    try {
      let uid = window.localStorage.getItem('offcode_user_id');
      if (!uid) {
        uid = 'user_' + Math.random().toString(36).slice(2, 10);
        window.localStorage.setItem('offcode_user_id', uid);
      }
      return uid;
    } catch (_) {}
  }

  // 3. Fallback for headless / test environments
  return 'user_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Creates and initializes a complete workspace sync instance.
 *
 * Implements:
 * - Yjs CRDT document with 'files', 'drafts', 'draftBases', 'proposals', 'meta'
 * - Real-time WebSocket provider with auto-reconnect and state vector exchange
 * - IndexedDB persistence per room (offline survival across refresh)
 * - Awareness presence (cursor, username, color, file viewing)
 * - Host election, mode management ('free' / 'review'), and transfer
 * - Safe concurrent file creation and delete-vs-edit conflict resolution
 * - Review mode: drafts, proposals, fuzzy 3-way diff/patch apply & revert
 */
export function createWorkspace({
  roomId = 'default',
  userName = 'Anonymous',
  userColor = '#6366f1',
  userId = null,
  serverUrl = SYNC_SERVER_URL,
  WebSocketPolyfill = null,
  disableIndexedDB = false
} = {}) {
  const currentUserId = getUserId(userId);
  const ydoc = new Y.Doc();

  // Root CRDT Shared Types
  const files = ydoc.getMap('files');            // filename -> Y.Text
  const drafts = ydoc.getMap('drafts');          // `${userId}|${file}` -> Y.Text
  const draftBases = ydoc.getMap('draftBases');  // `${userId}|${file}` -> string
  const proposals = ydoc.getMap('proposals');    // proposalId -> Object
  const meta = ydoc.getMap('meta');              // 'hostId', 'mode' ('free' | 'review')

  // Connection & Status Tracking
  let status = 'connecting';
  let isManualOffline = false;
  const statusListeners = new Set();
  const fileListeners = new Set();
  const proposalListeners = new Set();
  const metaListeners = new Set();

  const notifyStatus = (newStatus) => {
    if (status !== newStatus) {
      status = newStatus;
      statusListeners.forEach((cb) => {
        try {
          cb(status);
        } catch (err) {
          console.error('Error in status callback:', err);
        }
      });
    }
  };

  // Local Snapshots for Safe Conflict Handling
  const localSnapshots = new Map(); // filename -> string
  const editedWhileOffline = new Set(); // filenames touched while disconnected
  const observedTexts = new WeakSet();

  const updateSnapshot = (fileName, content) => {
    localSnapshots.set(fileName, content);
  };

  const trackFile = (fileName, ytext) => {
    if (!ytext.doc) return;
    updateSnapshot(fileName, ytext.toString());
    if (!observedTexts.has(ytext)) {
      observedTexts.add(ytext);
      ytext.observe(() => {
        const content = ytext.toString();
        updateSnapshot(fileName, content);
        if (status !== 'online') {
          editedWhileOffline.add(fileName);
        }
      });
    }
  };

  // 1. IndexedDB Persistence Layer
  let idbPersistence = null;
  const hasIDB = !disableIndexedDB && (
    (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') ||
    (typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined')
  );

  let idbPromise = Promise.resolve();
  if (hasIDB) {
    try {
      idbPersistence = new IndexeddbPersistence(`offcode-${roomId}`, ydoc);
      idbPromise = idbPersistence.whenSynced;
    } catch (err) {
      console.warn('[Sync] Failed initializing IndexedDB persistence:', err);
    }
  }

  // 2. WebSocket Provider Setup
  const wsOptions = {
    connect: true,
    maxBackoffTime: 2500
  };
  if (WebSocketPolyfill) {
    wsOptions.WebSocketPolyfill = WebSocketPolyfill;
  }

  const provider = new WebsocketProvider(serverUrl, roomId, ydoc, wsOptions);
  const awareness = provider.awareness;

  // Set local awareness state
  awareness.setLocalStateField('user', {
    name: userName || 'Anonymous',
    color: userColor || '#6366f1',
    id: currentUserId
  });

  // Track provider connection status
  provider.on('status', (event) => {
    if (isManualOffline) {
      notifyStatus('offline');
      return;
    }

    if (event.status === 'connected') {
      notifyStatus('online');
    } else if (event.status === 'connecting') {
      notifyStatus('connecting');
    } else {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        notifyStatus('offline');
      } else {
        notifyStatus('connecting');
      }
    }
  });

  // Browser Online / Offline Hardware Event Listeners
  const handleBrowserOnline = () => {
    if (!isManualOffline) {
      provider.connect();
      notifyStatus('connecting');
    }
  };

  const handleBrowserOffline = () => {
    provider.disconnect();
    notifyStatus('offline');
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);
  }

  // 3. Conflict Resolution & File Observation
  const handleFilesChange = (event) => {
    const sortedFiles = Array.from(files.keys()).sort();
    fileListeners.forEach((cb) => {
      try {
        cb(sortedFiles);
      } catch (err) {
        console.error('Error in onFilesChange callback:', err);
      }
    });

    if (event && event.changes && event.changes.keys) {
      for (const [key, change] of event.changes.keys) {
        // Edge Case A: One user deleted file while we edited it offline
        if (change.action === 'delete') {
          if (editedWhileOffline.has(key)) {
            const savedContent = localSnapshots.get(key);
            if (savedContent) {
              const restoredText = new Y.Text();
              files.set(key, restoredText);
              restoredText.insert(0, savedContent);
              editedWhileOffline.delete(key);
              trackFile(key, restoredText);
            }
          }
        }

        // Edge Case B: Two users created the same filename concurrently offline
        if (change.action === 'update') {
          const currentText = files.get(key);
          const mySnapshot = localSnapshots.get(key);
          if (currentText instanceof Y.Text && mySnapshot) {
            trackFile(key, currentText);
            const currentStr = currentText.toString();
            if (!currentStr.includes(mySnapshot)) {
              currentText.insert(
                currentText.length,
                (currentStr && !currentStr.endsWith('\n') ? '\n' : '') + mySnapshot
              );
            }
          }
        }
      }
    }
  };

  files.observe(handleFilesChange);

  // Proposal & Meta Observers
  const handleProposalsChange = () => {
    const list = Array.from(proposals.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    proposalListeners.forEach((cb) => {
      try {
        cb(list);
      } catch (err) {
        console.error('Error in onProposalsChange callback:', err);
      }
    });
  };
  proposals.observe(handleProposalsChange);

  const handleMetaChange = () => {
    metaListeners.forEach((cb) => {
      try {
        cb(meta);
      } catch (err) {
        console.error('Error in onMetaChange callback:', err);
      }
    });
  };
  meta.observe(handleMetaChange);

  // 4. Initial Seeding and Host Election Logic
  let isInitialized = false;
  const initSession = () => {
    if (isInitialized) return;
    isInitialized = true;

    // A. Host Election:
    if (!meta.has('hostId') || !meta.get('hostId')) {
      meta.set('hostId', currentUserId);
    }
    if (!meta.has('mode')) {
      meta.set('mode', 'free');
    }

    // B. Default File Seeding:
    if (files.size === 0) {
      const host = meta.get('hostId');
      if (host === currentUserId || !host) {
        const defaultFile = new Y.Text();
        files.set('main.js', defaultFile);
        defaultFile.insert(
          0,
          `// Welcome to OffCode!\n// Collaborative editing that works offline.\n\nfunction helloWorld() {\n  console.log("Hello from ${userName || 'User'}!");\n}\n\nhelloWorld();\n`
        );
        trackFile('main.js', defaultFile);
      }
    }
  };

  // 5. whenReady Promise
  const whenReady = new Promise((resolve) => {
    idbPromise.then(() => {
      if (provider.synced || isManualOffline) {
        initSession();
        resolve();
      } else {
        let resolved = false;
        const onSync = (isSynced) => {
          if (isSynced && !resolved) {
            resolved = true;
            initSession();
            resolve();
          }
        };
        provider.on('synced', onSync);

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            initSession();
            resolve();
          }
        }, 300);
      }
    });
  });

  // 6. Contract Core File Methods
  const getText = (fileName) => {
    const text = files.get(fileName);
    if (text instanceof Y.Text) {
      trackFile(fileName, text);
      return text;
    }
    return null;
  };

  const listFiles = () => {
    return Array.from(files.keys()).sort();
  };

  const createFile = (fileName, initialContent = '') => {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Valid fileName string is required');
    }
    const cleanName = fileName.trim();
    if (!cleanName) return null;

    if (files.has(cleanName)) {
      return getText(cleanName);
    }

    const ytext = new Y.Text();
    files.set(cleanName, ytext);
    if (initialContent) {
      ytext.insert(0, initialContent);
    }
    trackFile(cleanName, ytext);
    return ytext;
  };

  const deleteFile = (fileName) => {
    if (files.has(fileName)) {
      files.delete(fileName);
      localSnapshots.delete(fileName);
      editedWhileOffline.delete(fileName);
    }
  };

  const onFilesChange = (cb) => {
    fileListeners.add(cb);
    return () => fileListeners.delete(cb);
  };

  // 7. Network / Status Controls
  const getStatus = () => status;

  const onStatusChange = (cb) => {
    statusListeners.add(cb);
    return () => statusListeners.delete(cb);
  };

  const goOffline = () => {
    if (status === 'offline') return;
    isManualOffline = true;
    provider.disconnect();
    notifyStatus('offline');
  };

  const goOnline = () => {
    isManualOffline = false;
    notifyStatus('connecting');
    provider.connect();
  };

  // 8. Host & Room Mode Methods
  const getHost = () => meta.get('hostId') || null;

  const isHost = () => {
    const host = getHost();
    return host !== null && host === currentUserId;
  };

  const transferHost = (newHostId) => {
    if (!isHost()) return false;
    if (!newHostId || typeof newHostId !== 'string') return false;
    meta.set('hostId', newHostId.trim());
    return true;
  };

  const getMode = () => meta.get('mode') || 'free';

  const setMode = (newMode) => {
    if (!isHost()) return false;
    if (newMode !== 'free' && newMode !== 'review') return false;
    meta.set('mode', newMode);
    return true;
  };

  const onMetaChange = (cb) => {
    metaListeners.add(cb);
    return () => metaListeners.delete(cb);
  };

  // 9. Review Mode: Drafts & Proposals Logic
  const getDraftKey = (file, uid = currentUserId) => `${uid}|${file}`;

  const getDraft = (file) => {
    const key = getDraftKey(file);
    const existing = drafts.get(key);
    if (existing instanceof Y.Text) {
      return existing;
    }

    const mainText = getText(file);
    const initialContent = mainText ? mainText.toString() : '';

    const newDraft = new Y.Text();
    drafts.set(key, newDraft);
    if (initialContent) {
      newDraft.insert(0, initialContent);
    }
    draftBases.set(key, initialContent);
    return newDraft;
  };

  const getDraftBase = (file) => {
    const key = getDraftKey(file);
    return draftBases.get(key) || '';
  };

  const pushDraft = (file, message = '') => {
    const draftText = getDraft(file);
    const base = getDraftBase(file);
    const proposed = draftText.toString();

    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const proposal = {
      id: proposalId,
      authorId: currentUserId,
      file,
      message: message || '',
      base,
      proposed,
      status: 'pending',
      createdAt: Date.now()
    };

    proposals.set(proposalId, proposal);
    return proposalId;
  };

  const listProposals = () => {
    return Array.from(proposals.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  };

  const onProposalsChange = (cb) => {
    proposalListeners.add(cb);
    return () => proposalListeners.delete(cb);
  };

  const applyDiffToYText = (targetText, targetNewString) => {
    const currentString = targetText.toString();
    const diffs = dmp.diff_main(currentString, targetNewString);
    dmp.diff_cleanupSemantic(diffs);

    ydoc.transact(() => {
      let index = 0;
      for (const [op, text] of diffs) {
        if (op === 0) { // DIFF_EQUAL
          index += text.length;
        } else if (op === 1) { // DIFF_INSERT
          targetText.insert(index, text);
          index += text.length;
        } else if (op === -1) { // DIFF_DELETE
          targetText.delete(index, text.length);
        }
      }
    });
  };

  const acceptProposal = (id) => {
    if (!isHost()) return;

    const prop = proposals.get(id);
    if (!prop || prop.status !== 'pending') return;

    const targetText = getText(prop.file);
    if (!targetText) {
      proposals.set(id, {
        ...prop,
        status: 'rejected',
        error: `File "${prop.file}" was deleted from main before acceptance`
      });
      return;
    }

    const currentMain = targetText.toString();
    const patches = dmp.patch_make(prop.base, prop.proposed);
    const [newText, results] = dmp.patch_apply(patches, currentMain);

    const warnings = [];
    results.forEach((success, idx) => {
      if (!success) {
        warnings.push(`Hunk #${idx + 1} could not be applied cleanly`);
      }
    });

    applyDiffToYText(targetText, newText);

    proposals.set(id, {
      ...prop,
      status: 'accepted',
      warnings: warnings.length > 0 ? warnings : undefined,
      acceptedAt: Date.now()
    });

    const authorDraftKey = getDraftKey(prop.file, prop.authorId);
    draftBases.set(authorDraftKey, targetText.toString());
  };

  const rejectProposal = (id) => {
    if (!isHost()) return;
    const prop = proposals.get(id);
    if (!prop || prop.status !== 'pending') return;

    proposals.set(id, {
      ...prop,
      status: 'rejected',
      rejectedAt: Date.now()
    });
  };

  const revertProposal = (id) => {
    if (!isHost()) return;
    const prop = proposals.get(id);
    if (!prop || prop.status !== 'accepted') return;

    const targetText = getText(prop.file);
    if (!targetText) {
      proposals.set(id, {
        ...prop,
        error: `Cannot revert: file "${prop.file}" does not exist`
      });
      return;
    }

    const currentMain = targetText.toString();
    const patches = dmp.patch_make(prop.proposed, prop.base);
    const [revertedText, results] = dmp.patch_apply(patches, currentMain);

    const warnings = [];
    results.forEach((success, idx) => {
      if (!success) {
        warnings.push(`Revert hunk #${idx + 1} could not apply cleanly`);
      }
    });

    applyDiffToYText(targetText, revertedText);

    proposals.set(id, {
      ...prop,
      status: 'reverted',
      warnings: warnings.length > 0 ? warnings : undefined,
      revertedAt: Date.now()
    });
  };

  // 10. Clean Workspace Teardown
  const destroy = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
    }

    files.unobserve(handleFilesChange);
    proposals.unobserve(handleProposalsChange);
    meta.unobserve(handleMetaChange);

    fileListeners.clear();
    statusListeners.clear();
    proposalListeners.clear();
    metaListeners.clear();

    try {
      provider.destroy();
    } catch (_) {}

    if (idbPersistence) {
      try {
        idbPersistence.destroy();
      } catch (_) {}
    }

    try {
      ydoc.destroy();
    } catch (_) {}
  };

  return {
    ydoc,
    files,
    awareness,
    meta,
    drafts,
    draftBases,
    proposals,
    getUserId: () => currentUserId,
    getText,
    listFiles,
    createFile,
    deleteFile,
    onFilesChange,
    getStatus,
    onStatusChange,
    goOffline,
    goOnline,
    whenReady,
    destroy,

    // Addendum methods:
    getHost,
    isHost,
    transferHost,
    getMode,
    setMode,
    onMetaChange,
    getDraft,
    getDraftBase,
    pushDraft,
    listProposals,
    onProposalsChange,
    acceptProposal,
    rejectProposal,
    revertProposal
  };
}
