# Mini Telegram

A small-scale messaging app similar to Telegram: real-time 1-on-1 chat, user list, and message history. Includes **password-based auth** so you can deploy it and let others sign up and use it with you.

## What it does

- **Sign up** with username, password (min 6 characters), and optional display name
- **Sign in** with username and password
- **See other users** in a sidebar
- **Open a conversation** and send messages
- **Real-time delivery** via WebSockets (Socket.io)
- **Message history** stored in SQLite; sessions secured with JWT (7-day expiry)
- **Delete chat** — remove all messages in a conversation (for both participants)
- **Admin** — a default admin account is created on first run (username: `admin`, password: `admin112233`); admins can delete any conversation, delete users, and promote others to admin

## Tech stack

- **Backend:** Node.js, Express, Socket.io, bcrypt, jsonwebtoken
- **Data:** SQLite in `data/app.db` (local), or **Turso** (free online SQLite) when configured
- **Frontend:** React (Vite), Socket.io client

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

**Note:** On the free tier, the service may spin down when idle and the disk is ephemeral (data can reset on redeploy). For **persistent messages** without a paid disk, use **Turso** (free online SQLite) below.

### Optional: Turso (free online database)

Use [Turso](https://turso.tech) for a free, hosted SQLite database so messages persist across deploys and restarts.

1. Sign up at [turso.tech](https://turso.tech) and install the CLI: `curl -sSfL https://get.turso.tech/install.sh | sh`
2. Create a database: `turso db create mini-telegram`
3. Get URL and token:
   - `turso db show mini-telegram --url`
   - `turso db tokens create mini-telegram`
4. Set environment variables (locally or in Render **Environment**):
   - `TURSO_DATABASE_URL` = the database URL (e.g. `libsql://mini-telegram-xxx.turso.io`)
   - `TURSO_AUTH_TOKEN` = the token from step 3

If both are set, the server uses Turso instead of local `data/app.db`. No code changes needed.

### Optional: MEGA cloud (photos & videos)

To let users share photos and videos in chat, use [MEGA](https://mega.io) as a data lake. Files are uploaded to your MEGA account and shared via public links.

1. Create a MEGA account.
2. Set in `.env` (or your host’s environment):
   - `MEGA_EMAIL` = your MEGA email
   - `MEGA_PASSWORD` = your MEGA password

If both are set, the **Attach** button (⊕) in the conversation lets users send images and videos (stored on MEGA, linked in messages). If not set, the attach button will show “Media upload not configured”.

### Optional: Push notifications

To send browser push notifications when the user gets a new message:

1. Generate VAPID keys (one-time):  
   `npx web-push generate-vapid-keys`
2. Set in `.env` (or your host’s environment):
   - `VAPID_PUBLIC_KEY` or `VAPID_PUBLIC` = the public key
   - `VAPID_PRIVATE_KEY` or `VAPID_PRIVATE` = the private key

If both are set, users can click **Enable notifications** in the sidebar to receive push notifications when they’re not in the app.

---

## Create the Android app

The Android app is the same Mini Telegram UI in a native shell. It talks to your **deployed server** (e.g. Render). You need a **server URL** (HTTPS) before building.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Android Studio](https://developer.android.com/studio) (to build the APK)
- Your server already deployed and its URL (e.g. `https://mini-telegram-xxxx.onrender.com`)

### Step 1: Build the web app and sync to Android

From the **project root** (replace the URL with your server):

```bash
chmod +x scripts/build-android.sh
./scripts/build-android.sh https://mini-telegram-3z7r.onrender.com
```

Or from the `client` folder:

```bash
cd client
export VITE_API_URL="https://mini-telegram-xxxx.onrender.com"
npm run build
npx cap sync android
```

### Step 2: Build the APK in Android Studio

**Option A – Open from terminal (recommended)**

From the project root, run:

```bash
# Replace the path if your Android Studio is elsewhere
~/Downloads/android-studio-panda1-patch1-linux/android-studio/bin/studio.sh "$(pwd)/client/android"
```

**Option B – Open from inside Android Studio**

1. Launch Android Studio (e.g. from your app menu or run `studio.sh`).
2. On the welcome screen, click **Open** (or **File → Open**).
3. Go to your project and select the **`client/android`** folder (not the repo root).
4. Click **OK**.

**Then in Android Studio:**

1. **Wait for Gradle sync** – A progress bar at the bottom will say “Syncing…” or “Gradle build finished”. Wait until it’s done (first time can take a few minutes).
2. **Build the APK** – Top menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. **Find the APK** – When the build finishes, a small notification appears at the bottom right. Click **Locate** to open the folder. Or open this path yourself:  
   `client/android/app/build/outputs/apk/debug/app-debug.apk`.

### Step 3: Install on your phone

1. Copy `app-debug.apk` to your phone (USB, email, cloud, etc.).
2. On the phone, open the APK and install (allow “Install unknown apps” if prompted).
3. Open **Mini Telegram**, sign in or sign up — the app uses your deployed server.

### Optional: Build APK from command line

If you have the [Android SDK](https://developer.android.com/studio) and `ANDROID_HOME` set:

```bash
cd client
npm run apk
```

APK path: `client/android/app/build/outputs/apk/debug/app-debug.apk`.

---

## Other ways to run the server

For a long-running or production setup: **Set `JWT_SECRET`** to a long random string. Never use the default in production. **Use HTTPS** so the Android app can connect. For persistent data, use **Turso** (see above) or ensure **`data/`** is persisted so the local SQLite DB survives restarts.

Example (VPS or your machine):

```bash
export JWT_SECRET="your-long-random-secret-here"
export PORT=3001
npm run server
```

Build and serve the web app from the same server: `cd client && npm run build` (the Node server already serves `client/dist` if present).

---

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
│   └── db.js            # SQLite (local) or Turso (online) schema and connection
├── data/
│   └── app.db           # SQLite DB (created on first run)
├── package.json
├── render.yaml          # Deploy from GitHub to Render
├── scripts/
│   └── build-android.sh # One-command build + sync for Android
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
