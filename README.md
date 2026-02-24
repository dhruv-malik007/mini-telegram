# Mini Telegram

A small-scale messaging app similar to Telegram: real-time 1-on-1 chat, user list, and message history. Includes **password-based auth** so you can deploy it and let others sign up and use it with you.

## What it does

- **Sign up** with username, password (min 6 characters), and optional display name
- **Sign in** with username and password
- **See other users** in a sidebar
- **Open a conversation** and send messages
- **Real-time delivery** via WebSockets (Socket.io)
- **Message history** stored in SQLite; sessions secured with JWT (7-day expiry)

## Tech stack

- **Backend:** Node.js, Express, Socket.io, better-sqlite3, bcrypt, jsonwebtoken
- **Frontend:** React (Vite), Socket.io client
- **Data:** SQLite in `data/app.db`

## Run locally

### 1. Install dependencies

```bash
cd mini-telegram
npm install
cd client && npm install && cd ..
```

### 2. Start server and client

```bash
npm run dev
```

- **API + Socket server** at http://localhost:3001  
- **React app** at http://localhost:5173  

Open http://localhost:5173, then **Sign up** to create an account or **Sign in** if you already have one.

### 3. Try with two users

1. Sign up as e.g. `alice` (with a password).
2. Open another browser or incognito window, go to http://localhost:5173, sign up as `bob`.
3. In one window, select the other user and send a message; it appears in both in real time.

## Deploy server from GitHub (Render)

Get a free HTTPS server in a few steps so the web app and Android app can connect.

### 1. Push to GitHub

```bash
cd mini-telegram
git init
git add .
git commit -m "Initial commit"
# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/mini-telegram.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Render

1. Go to [render.com](https://render.com) and sign up (free).
2. **New → Web Service**. Connect your GitHub account and select the `mini-telegram` repo.
3. Render will detect `render.yaml` and use it. If not, set:
   - **Build command:** `npm install && cd client && npm install && npm run build && cd ..`
   - **Start command:** `npm run server`
4. Under **Environment**, add:
   - **JWT_SECRET** — use "Generate" or create a long random string (e.g. from [randomkeygen.com](https://randomkeygen.com)).
5. Click **Create Web Service**. Wait for the first deploy to finish.
6. Copy your app URL, e.g. `https://mini-telegram-xxxx.onrender.com` (no trailing slash).

**Note:** On the free tier, the service may spin down when idle and the disk is ephemeral (data can reset on redeploy). For permanent data, use a paid plan with a persistent disk or an external DB.

---

## Build the APK (Android app)

The APK uses the same React app and connects to your **deployed server** URL.

### 1. Set your server URL and build the web app

Use the Render URL from above (or any HTTPS server):

```bash
cd client
export VITE_API_URL="https://mini-telegram-xxxx.onrender.com"
npm run build
```

(Replace with your real URL, no trailing slash.)

### 2. Create the APK

**Option A — Android Studio (recommended)**

```bash
npx cap sync android
npx cap open android
```

When Android Studio opens: **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The APK is at `client/android/app/build/outputs/apk/debug/app-debug.apk`.

**Option B — Command line** (needs [Android SDK](https://developer.android.com/studio) and `ANDROID_HOME` set)

```bash
cd client
npm run apk
```

APK path: `client/android/app/build/outputs/apk/debug/app-debug.apk`.

### 3. Install on your phone

1. Copy `app-debug.apk` to your phone (USB, cloud, etc.).
2. On the phone, open the APK and install (enable "Install unknown apps" for your file manager or browser if asked).
3. Open the app, sign up or sign in — you'll be using your deployed server.

---

## Other ways to run the server

For a long-running or production setup: **Set `JWT_SECRET`** to a long random string. Never use the default in production. **Use HTTPS** so the Android app can connect. **Persist `data/`** so the SQLite DB survives restarts.

Example (VPS or your machine):

```bash
export JWT_SECRET="your-long-random-secret-here"
export PORT=3001
npm run server
```

Build and serve the web app from the same server: `cd client && npm run build` (the Node server already serves `client/dist` if present).

---

## Project layout

1. **Set `JWT_SECRET`** to a long random string (e.g. `openssl rand -hex 32`). Never use the default in production.
2. **Use HTTPS** so passwords and tokens are encrypted. Android requires HTTPS for production; HTTP is blocked by default.
3. **Persist `data/`** so the SQLite file (users and messages) is kept across restarts.
4. **Run the server** (Node 18+). Example:

```bash
export JWT_SECRET="your-long-random-secret-here"
export PORT=3001
npm run server
```

5. **Serve the built web app** from the same server (the server already serves `client/dist` if you run `cd client && npm run build` first). So one deployed URL serves both the API and the web UI.

**Deploy options:** Any VPS (DigitalOcean, Linode, etc.), Railway, Render, or a home server with a domain and SSL (e.g. Caddy/nginx + Let’s Encrypt).

---

## Building the Android app

The Android app is the same React app packaged with **Capacitor**. It talks to your **deployed server** via the URL you set at build time.

### 1. Deploy the server

Deploy the server (see above) and note its **HTTPS** URL, e.g. `https://my-mini-telegram.example.com`.

### 2. Build the web app with that URL

From the project root:

```bash
cd client
export VITE_API_URL="https://my-mini-telegram.example.com"
npm run build
```

Use your real server URL (no trailing slash). This bakes the URL into the app so it always connects to your server.

### 3. Sync and open in Android Studio

```bash
npx cap sync android
npx cap open android
```

Android Studio will open. Then:

- Use **Build → Build Bundle(s) / APK(s) → Build APK(s)** to create a debug APK, or **Build → Generate Signed Bundle / APK** for a release APK to install on devices or publish.
- Run on a device or emulator with **Run → Run 'app'**.

### 4. Install on devices

- **Debug:** Copy the APK from `client/android/app/build/outputs/apk/debug/` to your phone and install (enable “Install from unknown sources” if needed).
- **Release:** Sign the APK or AAB and share it; you can also publish to the Play Store.

### Notes

- **HTTPS required:** Android blocks plain HTTP to arbitrary hosts. Your server must use HTTPS in production.
- **Same server for everyone:** All users (web and Android) use the same server URL. They sign up / log in with username and password and see the same chats.
- **Rebuild if URL changes:** If you change the server URL, set `VITE_API_URL` again, run `npm run build`, then `npx cap sync android` and rebuild the APK.

## Project layout

```
mini-telegram/
├── client/              # React frontend (Vite) + Capacitor Android
│   ├── src/
│   │   ├── App.jsx
│   │   ├── config.js    # Server URL (VITE_API_URL)
│   │   ├── Login.jsx / ChatList.jsx / Conversation.jsx
│   │   └── api.js
│   ├── android/         # Capacitor Android project (open in Android Studio)
│   ├── capacitor.config.json
│   └── package.json
├── server/
│   ├── index.js         # Express API + Socket.io
│   ├── auth.js          # JWT sign/verify + auth middleware
│   └── db.js            # SQLite schema and connection
├── data/
│   └── app.db           # SQLite DB (created on first run)
├── package.json
└── README.md
```

## API (for reference)

- `POST /api/register` — body: `{ "username", "password", "display_name"? }` → `{ user, token }`
- `POST /api/login` — body: `{ "username", "password" }` → `{ user, token }`
- `GET /api/users` — list other users (requires `Authorization: Bearer <token>`)
- `GET /api/conversation/:otherId` — messages with that user (requires Bearer token)

Real-time: connect with Socket.io, emit `join` with your **token** (not userId); then `send_message` with `{ recipientId, content }`; listen for `new_message`.

## Security note

Passwords are hashed with bcrypt. Tokens are JWTs signed with `JWT_SECRET`. For production, always set a strong `JWT_SECRET` and use HTTPS.
