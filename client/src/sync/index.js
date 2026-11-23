import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

// Curated distinct color palette for collaborator cursors and awareness presence
export const PALETTE_COLORS = [
  '#0284c7', // Sky Blue
  '#059669', // Emerald
  '#7c3aed', // Purple
  '#e11d48', // Rose
  '#d97706', // Amber
  '#4f46e5', // Indigo
  '#0d9488', // Teal
  '#c026d3', // Fuchsia
  '#ea580c', // Orange
  '#0891b2', // Cyan
  '#16a34a', // Green
  '#9333ea', // Violet
];

export function pickNonConflictingColor(usedColors = new Set(), preferred = null) {
  if (preferred && !usedColors.has(String(preferred).trim().toLowerCase())) {
    return preferred;
  }
  const available = PALETTE_COLORS.filter(
    (c) => !usedColors.has(c.toLowerCase())
  );
  if (available.length > 0) {
    const idx = Math.floor(Math.random() * available.length);
    return available[idx];
  }
  // If palette is fully occupied, generate a distinct random HSL
  for (let i = 0; i < 30; i++) {
    const hue = Math.floor(Math.random() * 360);
    const candidate = `hsl(${hue}, 75%, 45%)`;
    if (!usedColors.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
}

/**
 * Derives the WebSocket sync server URL automatically:
 * 1. VITE_SYNC_SERVER_URL environment variable takes highest priority.
 * 2. In browser production builds, derives from location (same host and port):
 *    (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host
 * 3. In Vite dev mode (port 5173), falls back to ws://<hostname>:1234.
 * 4. In Node test environments, falls back to ws://localhost:1234.
 */
export function getDefaultSyncServerUrl() {
  const envUrl =
    (typeof process !== 'undefined' && process.env?.VITE_SYNC_SERVER_URL) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SYNC_SERVER_URL);
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim();
  }

  if (typeof window !== 'undefined' && window.location) {
    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    if (loc.port === '5173') {
      return `${wsProto}//${loc.hostname || 'localhost'}:1234`;
    }
    return `${wsProto}//${loc.host}`;
  }

  return 'ws://localhost:1234';
}

export const SYNC_SERVER_URL = getDefaultSyncServerUrl();

/**
 * Safe random ID generator that works in non-secure contexts (http://192.168.x.x)
 * as well as secure contexts and headless Node. Never uses crypto.randomUUID.
 */
function generateSafeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      return 'user_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {}
  }
  return 'user_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

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
        uid = generateSafeId();
        window.localStorage.setItem('offcode_user_id', uid);
      }
      return uid;
    } catch (_) {}
  }

  // 3. Fallback for headless / test environments
  return generateSafeId();
}

/**
 * Creates and initializes a complete workspace sync instance.
 *
 * Implements:
 * - Yjs CRDT document with 'files', 'drafts', 'draftBases', 'proposals', 'meta'
 * - Real-time WebSocket provider with auto-reconnect and state vector exchange
 * - IndexedDB persistence per room (offline survival across refresh)
 * - Awareness presence (cursor, username, color, file viewing)
 * - Host election, host claim takeover, mode management ('live' / 'review'), and transfer
 * - Safe concurrent file creation and delete-vs-edit conflict resolution
 * - Review mode: drafts, proposals, fuzzy 3-way diff/patch apply & revert
 */
export function createWorkspace({
  roomId = 'default',
  userName = 'Anonymous',
  userColor = '#6366f1',
  password = '',
  userId = null,
  serverUrl = null,
  WebSocketPolyfill = null,
  disableIndexedDB = false
} = {}) {
  const currentUserId = getUserId(userId);
  // Normalize room code: case-insensitive and trimmed
  const cleanRoomId = (roomId || 'default').trim().toLowerCase();
  const effectiveServerUrl = serverUrl || getDefaultSyncServerUrl();

  const ydoc = new Y.Doc();

  // Root CRDT Shared Types
  const files = ydoc.getMap('files');            // filename -> Y.Text
  const drafts = ydoc.getMap('drafts');          // `${userId}|${file}` -> Y.Text
  const draftBases = ydoc.getMap('draftBases');  // `${userId}|${file}` -> string
  const proposals = ydoc.getMap('proposals');    // proposalId -> Object
  const meta = ydoc.getMap('meta');              // 'hostId', 'mode' ('live' | 'review')

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
      idbPersistence = new IndexeddbPersistence(`offcode-${cleanRoomId}`, ydoc);
      idbPromise = idbPersistence.whenSynced;
    } catch (err) {
      console.warn('[Sync] Failed initializing IndexedDB persistence:', err);
    }
  }

  // 2. WebSocket Provider Setup
  const wsOptions = {
    connect: true,
    maxBackoffTime: 2500,
    params: password ? { pass: password } : {}
  };
  if (WebSocketPolyfill) {
    wsOptions.WebSocketPolyfill = WebSocketPolyfill;
  }

  const provider = new WebsocketProvider(effectiveServerUrl, cleanRoomId, ydoc, wsOptions);
  const awareness = provider.awareness;

  // Initial random non-conflicting color
  let activeColor = userColor || PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)];

  // Set local awareness state
  awareness.setLocalStateField('user', {
    name: userName || 'Anonymous',
    color: activeColor,
    id: currentUserId
  });

  // Ensure cursor color is never identical to another active user in the same room
  const ensureUniqueColor = () => {
    const states = awareness.getStates();
    const myClientId = ydoc.clientID;
    const remoteColors = new Set();
    let collision = false;

    states.forEach((state, clientId) => {
      if (clientId !== myClientId && state?.user?.color) {
        const peerColor = String(state.user.color).trim().toLowerCase();
        remoteColors.add(peerColor);
        if (peerColor === String(activeColor).trim().toLowerCase()) {
          // If collision occurs, peer with lower client ID keeps color; higher client ID yields
          if (myClientId >= clientId) {
            collision = true;
          }
        }
      }
    });

    if (collision) {
      const nextColor = pickNonConflictingColor(remoteColors);
      if (nextColor !== activeColor) {
        activeColor = nextColor;
        const curUser = awareness.getLocalState()?.user || {};
        awareness.setLocalStateField('user', {
          ...curUser,
          color: nextColor
        });
      }
    }
  };

  awareness.on('change', ensureUniqueColor);

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
  let idbLoaded = false;
  idbPromise.then(() => {
    idbLoaded = true;
  });

  const tryElectHost = () => {
    // Rule: hostId may be set ONLY when all of these are true:
    // 1. IndexedDB has loaded
    // 2. websocket provider has completed its first sync with the server (provider.synced is true)
    // 3. meta.hostId is still empty after that
    // Never while status is connecting or offline, never from a timeout fallback.
    if (!idbLoaded) return;
    if (!provider || !provider.synced) return;
    if (status === 'connecting' || status === 'offline') return;

    if (!meta.has('hostId') || !meta.get('hostId')) {
      meta.set('hostId', currentUserId);
    }
    if (!meta.has('mode') || meta.get('mode') === 'free') {
      meta.set('mode', 'live');
    }
  };

  const seedDefaultFiles = () => {
    if (files.size === 0) {
      const host = meta.get('hostId');
      if (host === currentUserId || !host) {
        const defaultFile = new Y.Text();
        files.set('main.js', defaultFile);
        defaultFile.insert(0, '');
        trackFile('main.js', defaultFile);
      }
    }
  };

  // Provider sync listener: triggers host election and default file seeding
  provider.on('synced', (isSynced) => {
    if (isSynced) {
      tryElectHost();
      seedDefaultFiles();
    }
  });

  // 5. whenReady Promise
  const whenReady = new Promise((resolve) => {
    idbPromise.then(() => {
      idbLoaded = true;
      if (provider.synced) {
        tryElectHost();
        seedDefaultFiles();
        resolve();
      } else if (isManualOffline) {
        seedDefaultFiles();
        resolve();
      } else {
        let resolved = false;
        const onSync = (isSynced) => {
          if (isSynced && !resolved) {
            resolved = true;
            tryElectHost();
            seedDefaultFiles();
            resolve();
          }
        };
        provider.on('synced', onSync);

        // Timeout fallback: resolve whenReady so editor UI displays,
        // but NEVER elect host from timeout fallback!
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            seedDefaultFiles();
            resolve();
          }
        }, 500);
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
      const existing = getText(cleanName);
      if (existing && existing.length === 0 && initialContent) {
        existing.insert(0, initialContent);
      }
      return existing;
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
  const getHostId = () => meta.get('hostId') || null;
  const getHost = () => getHostId();

  const isHost = () => {
    const host = getHostId();
    return host !== null && host === currentUserId;
  };

  const claimHost = () => {
    const currentHost = getHostId();
    if (!currentHost) {
      meta.set('hostId', currentUserId);
      return true;
    }
    // Check if current host is present in live awareness
    const states = awareness.getStates();
    let hostIsActive = false;
    for (const state of states.values()) {
      if (state?.user?.id === currentHost) {
        hostIsActive = true;
        break;
      }
    }
    if (!hostIsActive) {
      meta.set('hostId', currentUserId);
      return true;
    }
    return false;
  };

  const transferHost = (newHostId) => {
    if (!isHost()) return false;
    if (!newHostId || typeof newHostId !== 'string') return false;
    meta.set('hostId', newHostId.trim());
    return true;
  };

  const getMode = () => {
    const mode = meta.get('mode');
    return mode === 'review' ? 'review' : 'live';
  };

  const setMode = (newMode) => {
    if (!isHost()) return false;
    const mode = (newMode === 'review') ? 'review' : 'live';
    meta.set('mode', mode);
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

    const proposalId = `prop_${Date.now()}_${generateSafeId()}`;
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
    try {
      awareness.setLocalState(null);
    } catch (_) {}

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
    getHostId,
    getHost,
    isHost,
    claimHost,
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
