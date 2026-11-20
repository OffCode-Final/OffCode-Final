# OffCode Two-Device Real-World Demo Guide
### How to run live multiplayer code editing between two laptops or a phone on the same Wi-Fi (or anywhere over the internet)

---

## ⚡ Quick Summary (Non-Coder Friendly)
OffCode runs as a **single all-in-one application**. The same server serves both the web editor user interface and handles real-time peer-to-peer CRDT sync over WebSockets on the exact same port (`1234`). You only need to share **one link** with your friend.

---

## Step 1: Build & Start the Server (Laptop A / Host)

On your laptop (the host):
1. Open PowerShell in the project directory (`C:\dev\offcode`).
2. Run these two commands:
   ```powershell
   npm run build
   npm start
   ```
3. You will see a banner in your terminal with your LAN IP and a **QR Code**:
   ```text
   ====================================================
   🚀 OffCode All-in-One Server running on port 1234
   💻 Local URL:        http://localhost:1234
   📡 WebSocket URL:    ws://localhost:1234/<roomId>
   🩺 Health check:     http://localhost:1234/health

   🌐 Share these link(s) with your friend on the same Wi-Fi:
      👉 http://192.168.1.50:1234
   
   📱 Scan this QR code on a phone or second device:
   [QR Code appears here]
   ====================================================
   ```

---

## Step 2: Allow the Port through Windows Firewall (One-Time Setup)

Windows blocks incoming connections from other devices on your Wi-Fi by default. You need to allow port `1234`:

1. Press `Win + X` on your keyboard and choose **Terminal (Admin)** or **PowerShell (Run as Administrator)**.
2. Copy and paste this exact command and press Enter:
   ```powershell
   netsh advfirewall firewall add rule name="OffCode Sync Server" dir=in action=allow protocol=TCP localport=1234
   ```
3. You will see: `Ok.`
4. You only ever need to run this command once. Windows will now allow incoming traffic on port 1234.

*(To remove the rule after the hackathon, run: `netsh advfirewall firewall delete rule name="OffCode Sync Server"`)*

---

## Step 3: Join the Room from the Second Device (Laptop B / Phone)

1. Open a browser (Chrome, Edge, Safari, Brave, Firefox) on the second device.
2. Make sure the second device is connected to the **same Wi-Fi** as your laptop.
3. Open the link printed in your terminal (for example: `http://192.168.1.50:1234`). Or simply point your phone's camera at the terminal QR code to open it instantly.
4. Join the same room name (for example: `hackathon`).
5. **Boom!** You are now editing code simultaneously:
   - Live character edits synchronize in <5ms.
   - Colored cursors and user selections show each person's position.
   - Host can switch between **Live Mode** and **Review Mode**.

---

## Step 4: What to Do If Hostel / College / Hotel Wi-Fi Blocks Device-to-Device Traffic (Client Isolation)

Some public, dorm, or university Wi-Fi networks enable **Client Isolation** (AP isolation). When client isolation is turned on by the router, devices on the same Wi-Fi cannot see each other directly.

If Laptop B cannot load the `http://192.168.x.x:1234` link, choose one of these two instant solutions:

### Solution A: Use a Phone Mobile Hotspot (Simplest & 100% Reliable)
1. Turn on the Personal Hotspot on your smartphone (iPhone or Android).
2. Connect both Laptop A and Laptop B to the hotspot.
3. On Laptop A, run `npm start` again. It will print your new hotspot IP (e.g., `http://192.168.43.10:1234`).
4. Laptop B opens that link. Hotspots never have client isolation; it works instantly.

### Solution B: Quick Cloudflare Tunnel (Free, No Account Needed, Public HTTPS Link)
Cloudflare provides free public tunnels that bridge directly to your local port without port forwarding or firewall hassles. It also gives you a secure `https://` and `wss://` link!

1. On Laptop A, open a new PowerShell terminal and run:
   ```powershell
   npx cloudflared tunnel --url http://localhost:1234
   ```
2. In the terminal output, look for the line:
   ```text
   Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
   https://random-words-xyz.trycloudflare.com
   ```
3. Copy that `https://...` link and send it to your friend (via WhatsApp, Slack, Discord, or SMS).
4. Anyone in the world can open that link on any device or cellular data and edit live with you!

---

## Step 5: Simplest 1-Click Public Cloud Deployment (Render / Railway)

If you want a permanent link on the public internet where judges can test the app without your laptop running:

### Deploy to Render (Free Web Service)
1. Push your repository to GitHub.
2. Sign in to [Render.com](https://render.com) (free account).
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Set the settings:
   - **Environment**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
6. Click **Deploy Web Service**.
7. Render will provide a free URL: `https://offcode.onrender.com`.
8. *Note on persistence*: Render Free tier spins down when idle for 15 minutes and uses an ephemeral disk (documents stay in memory and disk while active; idle resets the disk to defaults). For persistent storage across free tier sleep, you can attach a Render Persistent Disk (`/var/data` mapped to `DATA_DIR`) or deploy to Railway.

---

## Step 6: What to Test During the Demo (Show Judges These Edge Cases)

1. **Simultaneous Live Typing**: Both users type into the same line. Zero characters lost, deterministic convergence.
2. **Review Mode (Host Approval)**:
   - Host switches mode to `Review`.
   - Guest types changes into a draft and clicks **Submit Proposal**.
   - Host sees the proposed diff and clicks **Accept**. The diff is cleanly patched into the main code without replacing the whole file or disrupting active cursors.
3. **Extreme Offline Merge**:
   - Turn off Wi-Fi on Laptop B (or click **Go Offline**).
   - Laptop B types a whole new function.
   - Laptop A edits surrounding code.
   - Turn Wi-Fi back on Laptop B (or click **Go Online**).
   - In <200ms, both laptops cleanly merge all edits.
4. **Host Departure & Takeover**:
   - Close the browser tab on Host.
   - Guest clicks **Claim Host** and assumes host authority.
