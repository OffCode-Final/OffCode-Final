# Offcode Sync Server

Real-time CRDT WebSocket sync server for collaborative code editing powered by **Yjs** and **Node.js**.

## Features

- **Multi-Room Support**: Each URL path (e.g. `ws://localhost:1234/my-room`) operates as an isolated collaborative room.
- **Concurrent Users**: Handles 4, 8, or more simultaneous users per room with real-time awareness (presence cursors) and updates.
- **Disk Persistence**: Document states are automatically flushed to disk (`.ydoc` files), surviving server restarts with zero data loss.
- **LAN Ready**: Binds to `0.0.0.0` by default so any device on the same local network (Wi-Fi / hotspot) can collaborate.
- **Health & Monitoring Endpoints**: Built-in HTTP endpoints with CORS support for health checks and room diagnostics.

## Quick Start (One Command)

From the project root:

```bash
npm run start:server
```

Or from the `server` directory:

```bash
npm start
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Listening port for HTTP and WebSockets | `1234` |
| `HOST` | Bind host address (`0.0.0.0` for all interfaces) | `0.0.0.0` |
| `DATA_DIR` | Directory where `.ydoc` persistence files are stored | `./server/data` |

## HTTP Endpoints

- `GET /health` or `GET /`: Health check returning service status, uptime, and room count.
- `GET /rooms`: Detailed list of active rooms and current connected client counts.
