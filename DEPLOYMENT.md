# Deployment & LAN Demo Guide for OffCode

This guide covers how to deploy the OffCode sync server publicly with secure WebSockets (`wss://`), as well as how to run an offline multiplayer demo on local Wi-Fi or a mobile hotspot with zero internet.

---

## 1. Hosting Publicly with HTTPS / WSS

The sync server is a standard Node.js WebSocket service. It works out-of-the-box on modern cloud platforms.

### Option A: Render (Easiest Free Tier)

1. Push your code to GitHub.
2. Sign in to [Render.com](https://render.com) and click **New > Web Service**.
3. Connect your `OffCode` repository.
4. Configure the settings:
   - **Root Directory**: `server` (or leave root and set start command below)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Plan**: Free
5. Add Environment Variables:
   - `PORT`: `10000` (Render sets this automatically)
   - `DATA_DIR`: `/tmp/data` (or attach a Render Persistent Disk for long-term storage)
6. Once deployed, Render provides an HTTPS URL: `https://offcode-sync.onrender.com`.
7. Your WebSocket endpoint will be:
   ```text
   wss://offcode-sync.onrender.com
   ```
8. Set in the client `.env`:
   ```env
   VITE_SYNC_SERVER_URL=wss://offcode-sync.onrender.com
   ```

### Option B: Railway / Fly.io

- **Railway**: Click **New Project > Deploy from GitHub repo**. Railway automatically detects the Node service, exposes a public domain with automatic TLS, and converts `https://` to `wss://` seamlessly.
- **Fly.io**: Run `fly launch` in the `server` directory. Fly will generate a `fly.toml` with port `8080/443` and issue free SSL certificates.

---

## 2. Hostel Wi-Fi / Hotspot LAN Mode (Demo from One Laptop)

You do **not** need internet access to demo multiplayer editing to judges! You can run the entire system on a local network (hostel Wi-Fi, classroom router, or your phone's Wi-Fi hotspot).

### Step 1: Connect Devices to the Same Network
Connect your laptop and your judges' phones or laptops to the same Wi-Fi network or phone mobile hotspot.

### Step 2: Find Your Laptop's LAN IP
Open PowerShell on your laptop:
```powershell
ipconfig
```
Look for **IPv4 Address** under your Wi-Fi adapter (e.g. `192.168.1.45` or `10.167.129.155`).

### Step 3: Start the Sync Server
Run:
```powershell
npm run start:server
```
The server will automatically bind to `0.0.0.0` and print your detected LAN address:
```text
====================================================
🚀 Offcode Yjs Sync Server running on port 1234
📡 Local address:   ws://localhost:1234/<roomId>
🩺 Health check:    http://localhost:1234/health
🌐 LAN address:     ws://192.168.1.45:1234/<roomId>
====================================================
```

### Step 4: Run the Vite Client for the Network
In `client/`, start Vite with `--host`:
```powershell
npm run dev -- --host
```
Vite will output:
```text
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.1.45:5173/
```

### Step 5: Connect Judges!
Anyone connected to the same Wi-Fi can open:
```text
http://192.168.1.45:5173/
```
They will instantly join the same room, see each other's live cursor positions, and collaborate seamlessly!

---

## 3. Environment Variables Reference

| Variable | Scope | Description | Default |
|---|---|---|---|
| `PORT` | Server | TCP port the HTTP and WebSocket server listens on | `1234` |
| `HOST` | Server | Network interface to bind (`0.0.0.0` binds to all LAN interfaces) | `0.0.0.0` |
| `DATA_DIR` | Server | Filesystem path where persistent `.ydoc` files are saved | `./server/data` |
| `VITE_SYNC_SERVER_URL` | Client | WebSocket server address read by client sync engine | `ws://localhost:1234` |
