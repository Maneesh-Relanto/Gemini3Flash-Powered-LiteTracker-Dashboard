
# Getting Started with LiteTrack

## Step 2: Live Verification

### 1. Configure the Dashboard
- Go to the **Integration** tab.
- Paste your Cloudflare Worker URL (e.g., `https://your-worker.your-subdomain.workers.dev`).

### 2. Open Cloudflare Observability
- Log in to your Cloudflare Dashboard.
- Navigate to your worker's settings.
- Click the **Logs** or **Observability** tab.
- Click the **"Live"** button to start streaming real-time logs.

### 3. Verify Connection
- Go back to the LiteTrack app and use the **Event Simulator**.
- Click **"Immediate Ping"** or send a custom payload.
- **Check your Cloudflare window:**
    1. A new **POST** request should appear in the log stream.
    2. Click on that row to expand it.
    3. You will see the message `Event Received: ...` along with your JSON payload.

---

*LiteTrack ensures your analytics data remains entirely under your control.*
