import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const wsReadyStateClosing = 2;
const wsReadyStateClosed = 3;

const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';

let persistence = null;

export const setPersistence = (p) => {
  persistence = p;
};

export const getPersistence = () => persistence;

export const docs = new Map();
export const roomPasswords = new Map();
export const createdRooms = new Set();

const messageSync = 0;
const messageAwareness = 1;

const updateHandler = (update, _origin, doc) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));
};

export class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: gcEnabled });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    const awarenessChangeHandler = ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs !== undefined) {
          added.forEach((clientID) => connControlledIDs.add(clientID));
          removed.forEach((clientID) => connControlledIDs.delete(clientID));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    };

    this.awareness.on('update', awarenessChangeHandler);
    this.on('update', updateHandler);
  }
}

export const getYDoc = (docname, gc = true) => {
  if (docs.has(docname)) {
    return docs.get(docname);
  }
  const doc = new WSSharedDoc(docname);
  doc.gc = gc;
  if (persistence !== null) {
    persistence.bindState(docname, doc);
  }
  docs.set(docname, doc);
  return doc;
};

const messageListener = (conn, doc, message) => {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync:
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
        break;
      default:
        break;
    }
  } catch (err) {
    // Malformed packet or decoding error: safely ignore without crashing the server
    console.warn('[Yjs Server] Malformed message safely ignored:', err?.message || err);
  }
};

const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    // Bump awareness clock for controlled clients so all remaining peers accept removal
    for (const clientID of controlledIds) {
      const curMeta = doc.awareness.meta.get(clientID);
      if (curMeta) {
        doc.awareness.meta.set(clientID, {
          clock: curMeta.clock + 1,
          lastUpdated: Math.floor(Date.now() / 1000)
        });
      }
    }
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds),
      null
    );
    if (doc.conns.size === 0) {
      if (process.env.NODE_ENV !== 'test') {
        if (persistence !== null && typeof persistence.deleteDoc === 'function') {
          persistence.deleteDoc(doc.name);
        }
        docs.delete(doc.name);
        roomPasswords.delete(doc.name);
        createdRooms.delete(doc.name);
        try {
          doc.destroy();
        } catch (_) {}
        console.log(`[Persistence] Room "${doc.name}" completely shut down and files deleted (0 clients remaining)`);
      } else if (persistence !== null) {
        persistence.writeState(doc.name, doc).then(() => {
          doc.destroy();
        });
        docs.delete(doc.name);
      }
    }
  }
  try {
    conn.close();
  } catch (_) {}
};

const send = (doc, conn, m) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(m, {}, (err) => {
      if (err != null) closeConn(doc, conn);
    });
  } catch (e) {
    closeConn(doc, conn);
  }
};

const pingTimeout = 30000;

export const setupWSConnection = (conn, req, { docName = (req.url || '').slice(1).split('?')[0], gc = true } = {}) => {
  const cleanDocName = decodeURIComponent(docName).trim().toLowerCase();

  // Extract password from query string: ?pass=...
  let providedPassword = '';
  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    providedPassword = (parsedUrl.searchParams.get('pass') || '').trim();
  } catch (_) {}

  // Enforce password if room has one
  if (roomPasswords.has(cleanDocName)) {
    const requiredPassword = roomPasswords.get(cleanDocName);
    if (requiredPassword && requiredPassword !== providedPassword) {
      console.warn(`[Auth] Rejected WebSocket connection to "${cleanDocName}": Incorrect room password`);
      try {
        conn.close(4401, 'Unauthorized: Incorrect room password');
      } catch (_) {}
      return;
    }
  }

  conn.binaryType = 'arraybuffer';
  const doc = getYDoc(cleanDocName, gc);
  doc.conns.set(conn, new Set());
  createdRooms.add(cleanDocName);

  conn.on('error', (err) => {
    if (doc.conns.has(conn)) {
      closeConn(doc, conn);
    }
  });

  conn.on('message', (message) => {
    messageListener(conn, doc, new Uint8Array(message));
  });

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch (e) {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);

  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });

  conn.on('pong', () => {
    pongReceived = true;
  });

  // Send initial Sync Step 1 and Awareness to the newly connected client
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const aEncoder = encoding.createEncoder();
      encoding.writeVarUint(aEncoder, messageAwareness);
      encoding.writeVarUint8Array(
        aEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      send(doc, conn, encoding.toUint8Array(aEncoder));
    }
  }
};
