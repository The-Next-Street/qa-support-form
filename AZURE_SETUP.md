# Azure AD App Registration — Step-by-Step Setup

Before you can run the QA form app, you need to register it in Azure Active Directory
so it can authenticate users and write to SharePoint. This takes about 5 minutes.

---

## Step 1 — Open Azure Portal

1. Go to https://portal.azure.com
2. Sign in with your Microsoft work account (The Next Street admin account)

---

## Step 2 — Register a New App

1. In the search bar at the top, type **App registrations** and click it
2. Click **+ New registration**
3. Fill in:
   - **Name:** `QA Support Form` (or any name you like)
   - **Supported account types:** Select **"Accounts in this organizational directory only (The Next Street only)"**
   - **Redirect URI:** Select **Single-page application (SPA)** from the dropdown, then enter:
     - For local testing: `http://localhost:3000`
     - For your deployed URL: `https://your-app-url.com` (add this too once you have it)
4. Click **Register**

---

## Step 3 — Copy Your IDs

After registering, you'll be on the app's Overview page. Copy these two values — you'll need them in Step 5:

- **Application (client) ID** — looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Directory (tenant) ID** — looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## Step 4 — Add API Permissions

1. In the left menu, click **API permissions**
2. Click **+ Add a permission**
3. Click **Microsoft Graph**
4. Click **Delegated permissions**
5. Search for **Sites.ReadWrite.All** and check the box
6. Click **Add permissions**
7. Click **Grant admin consent for The Next Street** (requires admin account) → click **Yes**

> **Note:** If you don't have admin rights, ask your IT admin to grant consent.
> The "Grant admin consent" button turns a green checkmark when done.

---

## Step 5 — Update authConfig.js

Open `src/authConfig.js` in the project folder and replace the placeholders:

```js
clientId: "YOUR_CLIENT_ID",     ← paste your Application (client) ID here
authority: "https://login.microsoftonline.com/YOUR_TENANT_ID",  ← paste your Directory (tenant) ID here
```

Example:
```js
clientId: "3aee9b67-f31c-4ff4-9bf3-f36145de370a",
authority: "https://login.microsoftonline.com/0812948c-d8a4-4cd0-914e-59942e064343",
```

---

## Step 6 — Run the App

In the project folder, run:

```bash
npm install
npm start
```

The app will open at http://localhost:3000. Click "Sign in with Microsoft" — it will pop up
a Microsoft login window. After signing in, the full QA form will appear.

---

## Step 7 — Deploy (Optional)

To make the app available to your whole team:

**Option A — Azure Static Web Apps (recommended, free tier available)**
1. Push the project to a GitHub repo
2. Go to portal.azure.com → Create a resource → Static Web App
3. Connect it to your GitHub repo, set build preset to "React"
4. Azure will auto-deploy on every push

**Option B — Any static hosting (Netlify, Vercel, etc.)**
1. Run `npm run build` — this creates a `build/` folder
2. Upload the `build/` folder to your host
3. Add your deployed URL as a Redirect URI in the Azure app registration (Step 2, Redirect URI)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Application not found" on sign-in | Check the clientId in authConfig.js |
| "Reply URL mismatch" error | Add your current URL as a Redirect URI in Azure |
| 403 from SharePoint | Admin hasn't granted consent yet (Step 4) |
| Popup blocked | Allow popups for your app URL in your browser |
