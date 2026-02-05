# 🚀 Getting Started with LiteTrack

Follow this guide to establish your analytics pipeline and begin generating AI-driven insights.

---

## Step 1: Receiver Setup
To collect data, you need a globally distributed endpoint. We recommend **Cloudflare Workers**.

1. Create a new Cloudflare Worker.
2. Use the template code found in the **Deployment** tab of the LiteTrack dashboard.
3. **Important:** Ensure your worker includes the following headers to allow the dashboard to communicate with it:
   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Allow-Methods: POST, OPTIONS`
   - `Access-Control-Allow-Headers: Content-Type`

---

## Step 2: Establish the Handshake

1. Navigate to the **Integration** tab in your dashboard.
2. Enter your Worker URL into the **Handshake Center**.
3. Click **"Establish Connection"**.
4. **Success Check:** You should see a green "Receiver Active" badge in the header. If you see a red error, check your Worker's CORS settings.

---

## Step 3: Simulation & Verification

Verify your pipeline without waiting for organic traffic.

1. **Quick Simulation:** Use the buttons in the **Integration** tab to trigger common paths (Home -> Pricing -> Signup).
2. **Payload Dispatch:** Use the JSON editor to send custom metadata. Try adding properties like `loadTime` or `tags` to see how the dashboard handles them.
3. **Live Stream:** Watch the **Live Stream** window on the Overview tab to see events arrive within milliseconds.

---

## Step 4: AI Insights & Configuration

LiteTrack uses Google Gemini to turn raw events into strategy.

1. **API Key:** Click the **"Manage Keys"** button in the **Settings** tab. This opens the AI Studio selector. Select a project with billing enabled to access Gemini 3 models.
2. **Analysis:** Click **"AI Traffic Analysis"** in the top right of the dashboard.
3. **Model Selection:** Use the **AI Strategy Engine** in Settings to switch between:
   - **Flash:** Fast, cost-effective for general summaries.
   - **Pro:** High-reasoning for complex conversion drop-off analysis.

---

## ❓ Troubleshooting

### CORS Errors
If the dashboard cannot "Verify" your endpoint:
- Check that your Worker handles the `OPTIONS` preflight request.
- Ensure the URL starts with `https://`.

### AI Analysis Failing
- Ensure you have selected a valid API key in the **Settings** tab.
- Check that your traffic data contains at least a few events (simulation counts!).

### Theme Persistence
- LiteTrack uses `localStorage` to save your theme. If you clear your browser data, it will default back to Light mode.

---

[Back to README.md](./README.md)