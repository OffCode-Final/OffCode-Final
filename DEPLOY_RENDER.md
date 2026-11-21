# Deploying OffCode to Render (Free Web Service)

This guide walks anyone through deploying OffCode publicly in minutes.

---

### Step 1: Push Your Code to GitHub
Ensure all code on branch `deploy` is pushed to your GitHub repository:
```bash
git push origin deploy
```

---

### Step 2: Create Web Service on Render
1. Go to [render.com](https://render.com) and click **Sign in** (choose **GitHub**).
2. On your Render Dashboard, click the blue **New +** button in the top right, and select **Web Service**.
3. Under **Connect a repository**, find your `OffCode-Final` repo and click **Connect**.
4. Fill in the fields:
   - **Name**: `offcode` (or any unique name you choose)
   - **Branch**: `deploy`
   - **Runtime**: `Node`
   - **Build Command**: `npm install --include=dev && npm install --include=dev --prefix client && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Select **Free** ($0/month)
5. Under **Advanced**:
   - Add Environment Variable:
     - Key: `NODE_ENV` | Value: `production`
     - Key: `NODE_VERSION` | Value: `20.18.0`
   - Health Check Path: `/health`
   - Auto-Deploy: `Yes`
6. Click **Create Web Service**.

Render will install dependencies, build the frontend bundle with Vite, and launch the server on port 10000. Once the deploy completes, your public URL will look like:
`https://<your-service-name>.onrender.com`

---

### Step 3: Waking Up & Checking Health Before a Demo
Render's free tier automatically spins down (sleeps) when inactive for 15 minutes.
- **Before presenting or sharing links**:
  Open `https://<your-service-name>.onrender.com/health` in your browser.
- When it returns `{"status":"ok","uptime":...}`, the server is awake and ready. Waking up takes roughly 30 to 50 seconds if asleep.
- To trigger a manual rebuild or redeploy anytime, click **Manual Deploy** -> **Deploy latest commit** inside the Render dashboard.

---

### Step 4: Plan B (Zero-Config Tunnel in 60 Seconds)
If Render or cloud deployment is ever delayed or blocked by corporate proxies:
1. Build and run locally:
   ```bash
   npm run build
   npm start
   ```
2. Install Cloudflare tunnel (Windows command prompt or PowerShell):
   ```bash
   winget install --id Cloudflare.cloudflared -e
   ```
3. Expose your local port with a secure public HTTPS link:
   ```bash
   cloudflared tunnel --url http://localhost:1234
   ```
4. Copy the generated `https://*.trycloudflare.com` URL, open it in your browser, and share it with collaborators.

---

### Important Operational Notes
- **Free Tier Sleep**: Free services sleep on inactivity. Visiting the `/health` endpoint warms it up instantly.
- **Ephemeral Storage**: Free instances wipe disk files when restarting or waking up. In OffCode, room sessions persist in-memory while active collaborators are connected and resync seamlessly.
- **Host Controls**: Host capabilities (Stop, Resume, Transfer Host) are managed in-app per room. Use descriptive or randomized room names for shared sessions.
