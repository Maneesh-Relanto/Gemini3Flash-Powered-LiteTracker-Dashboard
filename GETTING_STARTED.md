# Getting Started with LiteTrack

## Step 1: Receiver Setup
- Deploy your Cloudflare Worker using the provided code in the **Deployment** tab.
- **Crucial:** Ensure your Worker handles `OPTIONS` requests and includes `Access-Control-Allow-Origin: *` (or your specific domain) to prevent CORS errors during the dashboard handshake.

## Step 2: Establish Connection

### 1. The Handshake
- Go to the **Integration** tab.
- Paste your Cloudflare Worker URL (e.g., `https://your-worker.your-subdomain.workers.dev`).
- Click **"Establish Connection"**. LiteTrack will send a verification ping. 
- *If it fails:* Check your Worker logs in Cloudflare and ensure CORS headers are active.

### 2. Live Verification
- Once connected, the **Event Simulator** will unlock.
- Open your Cloudflare Worker **Logs** or **Observability** tab in a separate window.
- Click **"Send Test Event"** in LiteTrack.
- You should see a "Sync Success" toast and a corresponding entry in your Cloudflare log stream.

---

## Step 3: Real-time Funnel Testing

Funnels visualize the journey your users take. LiteTrack allows you to test these journeys without leaving the dashboard.

### 1. View the Pipeline
- Navigate to the **Funnels** tab.
- You will see the default "Conversion Pipeline". This is calculated live from a mix of seed data and your current session events.

### 2. Live Highlighting (The "Ping" Test)
To verify your funnel logic is working:
- Go to the **Integration** tab.
- Find the **"Funnel Triggers"** list.
- Click **"3. Started Signup"**.
- Immediately switch to the **Funnels** tab.
- **The Result:** You will see a **green pinging dot** next to the "Started Signup" step, and the user count will have incremented. This confirms that LiteTrack correctly parsed your incoming event into the conversion model.

### 3. Funnel Rules
The default funnel uses these logic rules:
- **Visited Home**: `path` is `/home`.
- **Viewed Pricing**: `path` is `/pricing`.
- **Started Signup**: `type` is `signup_start`.
- **Completed**: `type` is `purchase_complete`.

---

## Step 4: AI Insights
- After simulating several events, click **"Generate AI Insights"** in the header.
- **Gemini 3 Flash** will analyze the balance between your simulated traffic and seed data to provide performance scores and engagement suggestions.

---

*LiteTrack ensures your analytics data remains lightweight, edge-optimized, and entirely under your control.*