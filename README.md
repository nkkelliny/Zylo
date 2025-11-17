# Zylo Browser – Project README

# ===============================

# 

# An Electron-based multi-profile browser with a local Express backend, bookmarks, history, downloads shelf, site permissions, and optional local AI assistant powered by Ollama.

# 

# Electron Express.js Node.js Local-first Multi-profile Downloads shelf Permission controls Ollama AI

# 

# 1\\. Overview

# ------------

# 

# Zylo is a desktop web browser built on \*\*Electron\*\* with a separate \*\*local Express server\*\* for profile data, settings, sync, and AI integration. It aims to be a lightweight, local-first browsing companion with:

# 

# \*   Multiple browser profiles (with separate sessions and storage).

# \*   Bookmarks and history per profile (with favicons).

# \*   A live downloads shelf plus a persisted downloads panel.

# \*   Per-site permission management for camera, microphone, geolocation, and notifications.

# \*   Local AI assistant (“Zylo AI”) proxied through the Express API to Ollama.

# \*   Profile sync (export/import JSON) via the backend.

# 

# \### Key Components

# 

# \*   `main.js` – Electron main process, windows, sessions, permissions, downloads.

# \*   `preload.cjs` – Safe IPC bridge between renderer and main.

# \*   `renderer/index.html` – Browser UI (toolbar, tabs, side panel, downloads shelf, AI UI).

# \*   `renderer/renderer.js` – Front-end logic (tabs, navigation, panels, AI chat, downloads shelf).

# \*   `server.js` – Express API: profiles, bookmarks, history, downloads, permissions, settings, AI.

# \*   `db.js` – Local database adapter (e.g. lowdb or similar JSON / embedded DB).

# 

# \### Major Features

# 

# \*   Multi-profile support with profile selector.

# \*   Per-profile settings (home page, search engine, user agent, ad-block toggle, AI model).

# \*   Side panel with tabs for Bookmarks, History, Downloads, Permissions, Settings, Sync, and AI.

# \*   Downloads shelf at the bottom with live progress chips.

# \*   Permission modal prompting when a site requests camera/mic/geo/notifications.

# \*   AI panel connected to local Ollama via `/api/ai/chat` and `/api/ai/models`.

# 

# 2\\. Architecture

# ----------------

# 

# \### 2.1 Process \& UI Flow

# 

# 1\.  \*\*Main process (`main.js`)\*\*

# &nbsp;   \*   Creates the BrowserWindow and loads `renderer/index.html`.

# &nbsp;   \*   Uses `partitionForProfile(profile.id, incognito)` to isolate sessions.

# &nbsp;   \*   Wires `session` events:

# &nbsp;       \*   `will-download` – forwards download events to the renderer and saves to DB.

# &nbsp;       \*   `setPermissionRequestHandler` – intercepts permission requests and coordinates with renderer via IPC.

# &nbsp;   \*   Configures application menus and a contextual right-click menu for back/forward/reload, links, images, etc.

# 2\.  \*\*Preload (`preload.cjs`)\*\*

# &nbsp;   \*   Exposes a safe `window.native` API to the renderer.

# &nbsp;   \*   Bridges:

# &nbsp;       \*   Window/file helpers (save page, new incognito, new window, user agent, reopen folder, profile switching).

# &nbsp;       \*   Downloads shelf events (`download-started`, `download-updated`, `download-done`).

# &nbsp;       \*   Permissions flow (`perm-request`, `perm-respond`, `permissions-updated`).

# 3\.  \*\*Renderer (`renderer.js`)\*\*

# &nbsp;   \*   Manages tabs with <webview> elements.

# &nbsp;   \*   Handles navigation, address bar, and toolbar actions.

# &nbsp;   \*   Renders bookmarks \& history, including favicons.

# &nbsp;   \*   Displays downloads shelf and downloads panel.

# &nbsp;   \*   Shows permission modal and site permissions UI.

# &nbsp;   \*   Handles AI chat UI and streaming responses from the backend.

# 4\.  \*\*Express Backend (`server.js`)\*\*

# &nbsp;   \*   Runs at `http://localhost:3001`.

# &nbsp;   \*   Provides REST endpoints for profiles, bookmarks, history, downloads, settings, permissions, sync, and AI.

# &nbsp;   \*   Uses `initDB()`, `db.read()`, `db.write()`, and `getActiveProfile()` to persist data.

# 

# 3\\. Project Structure

# ---------------------

# 

# &nbsp;   .

# &nbsp;   ├─ package.json

# &nbsp;   ├─ main.js               # Electron main process

# &nbsp;   ├─ preload.cjs           # Preload script exposing `window.native`

# &nbsp;   ├─ src/

# &nbsp;   │  ├─ server.js          # Express backend with REST API \& AI proxy

# &nbsp;   │  └─ db.js              # Database helper (initDB, db, getActiveProfile, findProfile, ensurePermissionRecord)

# &nbsp;   └─ src/renderer/

# &nbsp;      ├─ index.html         # Browser UI layout (toolbar, tabs, sidepanel, downloads shelf, modal)

# &nbsp;      ├─ renderer.js        # Renderer logic (tabs, nav, downloads, permissions, AI, sync)

# &nbsp;      └─ assets/

# &nbsp;         ├─ css/

# &nbsp;         │  ├─ bootstrap.min.css

# &nbsp;         │  ├─ bootstrap-icons.css

# &nbsp;         │  └─ style.css    # Custom styles

# &nbsp;         ├─ js/

# &nbsp;         │  └─ bootstrap.bundle.min.js

# &nbsp;         └─ zylo-logo.png

# &nbsp;   

# 

# 4\\. Installation \& Setup

# ------------------------

# 

# \### 4.1 Prerequisites

# 

# \*   \*\*Node.js\*\* (LTS recommended).

# \*   \*\*npm\*\* or \*\*yarn\*\*.

# \*   \*\*Ollama\*\* (optional, for AI features) running locally at `http://localhost:11434` with at least one model pulled (default `llama3.1:8b`).

# 

# \### 4.2 Install Dependencies

# 

# &nbsp;   # from project root

# &nbsp;   npm install

# &nbsp;   # or

# &nbsp;   yarn install

# &nbsp;   

# 

# \### 4.3 Development Run

# 

# In development, you typically run the Express server and Electron in the same process via imports:

# 

# 1\.  \*\*Start the backend (if needed standalone)\*\*:

# &nbsp;   

# &nbsp;       node src/server.js

# &nbsp;   

# &nbsp;   In this project, `server.js` calls `startServer()` on import, so importing it in `main.js` (or using the helper `startBackendIfPackaged()`) will also run it.

# &nbsp;   

# 2\.  \*\*Start Electron\*\*:

# &nbsp;   

# &nbsp;       npx electron .

# &nbsp;   

# 

# \*\*Note:\*\* The helper `startBackendIfPackaged()` in `main.js` automatically imports `./server.js` when `app.isPackaged` is true, so packaged builds will start the backend automatically.

# 

# 5\\. Core Features

# -----------------

# 

# \### 5.1 Profiles

# 

# Profiles are stored in the local DB and each profile has its own Electron `partition`, bookmarks, history, downloads, permissions, and settings.

# 

# \#### Backend (server.js)

# 

# \*   `GET /api/profiles` – list profiles, returns `activeProfileId` and array of profiles.

# \*   `POST /api/profiles` – create profile (name required), copies settings from current active profile.

# \*   `POST /api/profiles/activate` – set active profile in DB.

# \*   `DELETE /api/profiles/:id` – delete profile (cannot delete active one).

# 

# \#### Renderer

# 

# \*   `loadProfiles()` fetches profiles and populates the `<select id="profile-switch">`.

# \*   Changing profile fires `/api/profiles/activate` then `window.native.switchProfile(id)`.

# \*   The main process closes the old window and opens a new window for the selected profile.

# 

# \### 5.2 Tabs \& Navigation

# 

# \*   Tabs are DOM elements with `.tab` class; each tab corresponds to a `<webview>` in the main area.

# \*   `createTab(startUrl, title)` creates a new tab + webview pair and attaches events.

# \*   Navigation is handled by:

# &nbsp;   \*   Address bar (`#url`) and `go()` function, using `/api/settings` search engine.

# &nbsp;   \*   Back/forward/reload/stop buttons.

# &nbsp;   \*   Home button (`openHomeTab()`) uses `settings.home`.

# \*   Favicons:

# &nbsp;   \*   `page-favicon-updated` event updates the tab icon.

# &nbsp;   \*   On load, if no favicon present, falls back to `https://origin/favicon.ico`.

# 

# \### 5.3 Bookmarks \& History

# 

# \#### Bookmarks

# 

# \*   `GET /api/bookmarks` – list bookmarks for active profile.

# \*   `POST /api/bookmarks` – add bookmark with `{title, url, favicon}`.

# \*   `DELETE /api/bookmarks/:id` – delete bookmark.

# \*   Renderer has:

# &nbsp;   \*   Bookmarks panel (`#panel-bookmarks`).

# &nbsp;   \*   `refreshBookmarks()`, `renderFaviconHtml()` for icons.

# &nbsp;   \*   Ctrl/Cmd + D to bookmark the current page.

# 

# \#### History

# 

# \*   `GET /api/history` – latest history items (up to 1000).

# \*   `POST /api/history` – called from renderer on navigation, stores `{title, url, favicon}`.

# \*   `DELETE /api/history` – clear history for active profile.

# \*   History panel (`#panel-history`) supports:

# &nbsp;   \*   Click to re-open URL.

# &nbsp;   \*   “Clear All” button to wipe history.

# 

# \### 5.4 Downloads

# 

# Downloads are handled on two levels: a live shelf for in-progress downloads and a persistent panel via the backend.

# 

# \#### Main Process (Electron)

# 

# \*   `session.on('will-download')` handles file downloads triggered by web contents.

# \*   Sends IPC messages:

# &nbsp;   \*   `download-started` – id, fileName, url, totalBytes.

# &nbsp;   \*   `download-updated` – id, state, receivedBytes, totalBytes.

# &nbsp;   \*   `download-done` – id, state.

# \*   On completion, also persists to DB through `getActiveProfile().downloads.push({ ... })` in both:

# &nbsp;   \*   `wireDownloadsForSession()` (for default/global sessions).

# &nbsp;   \*   Per-window `ses.on('will-download')` handler.

# 

# \#### Backend (server.js)

# 

# \*   `GET /api/downloads` – returns completed downloads for active profile, newest first.

# \*   `POST /api/downloads` – allows adding a download record via API (not required if main process already writes directly).

# 

# \#### Renderer – Live Shelf \& Panel

# 

# \*   Downloads shelf is `#downloads-shelf` (footer) with chips in `#downloads-list`.

# \*   Renderer uses `window.native.onDownloadStarted/Updated/Done` to maintain `downloadsState` and update chips.

# \*   `refreshDownloads()` queries `/api/downloads` and fills `#panel-downloads` in the side panel.

# \*   Hide shelf button (`#downloads-hide`) toggles the shelf visibility.

# 

# \### 5.5 Permissions \& Permission Modal

# 

# Zylo manages per-site permissions for camera, microphone, geolocation, and notifications. Decisions are persisted and respected on future requests.

# 

# \#### Main Process Logic

# 

# \*   `ses.setPermissionRequestHandler(async (wc, permission, callback, details) => { ... })`:

# &nbsp;   \*   Handles only `geolocation`, `media`, `camera`, `microphone`, `notifications`.

# &nbsp;   \*   Determines origin from `details.requestingUrl` or `wc.getURL()`.

# &nbsp;   \*   Uses DB helpers `getActiveProfile()` and `ensurePermissionRecord()` to fetch / initialize permissions per origin.

# &nbsp;   \*   If saved decision exists (allow/deny) it immediately calls `callback(true|false)` without prompting.

# &nbsp;   \*   If no decision:

# &nbsp;       \*   Sends IPC `'perm-request'` with `{id, origin, type}` to renderer.

# &nbsp;       \*   Waits for `'perm-reply-\_id\_'` event (bridged by `ipcMain.on('perm-respond')`).

# &nbsp;       \*   Persists the decision back to DB for the origin and resource(s).

# &nbsp;       \*   Calls `callback(granted)` for Electron’s permission flow.

# &nbsp;       \*   Notifies renderer via `'permissions-updated'`.

# \*   Camera + microphone: can be requested separately or via `media` with `details.mediaTypes`.

# 

# \#### Preload / Renderer Integration

# 

# \*   `preload.cjs`:

# &nbsp;   \*   Internal registry for permission listeners (e.g. `permRequestListeners`).

# &nbsp;   \*   Exposes:

# &nbsp;       \*   `native.onPermissionRequest(cb)` – register callback for permission prompts.

# &nbsp;       \*   `native.permRespond(id, decision)` – send reply back to main process (`allow` or `deny`).

# &nbsp;       \*   `native.onPermissionsUpdated(cb)` – refresh permissions UI when DB changes.

# \*   \*\*Permission Modal UI\*\* in `index.html`:

# &nbsp;   \*   Modal root: `#perm-modal`.

# &nbsp;   \*   Text: `#perm-title`, `#perm-desc`.

# &nbsp;   \*   Actions: `#perm-allow`, `#perm-deny`, and header close `#perm-deny-x`.

# &nbsp;   \*   “Remember” checkbox: `#perm-remember` (you can tie this into how you persist decisions).

# \*   \*\*Permissions Panel\*\* in side panel:

# &nbsp;   \*   Current site origin label: `#perm-current-origin`.

# &nbsp;   \*   Selectors for each permission: `#perm-camera`, `#perm-microphone`, `#perm-geolocation`, `#perm-notifications`.

# &nbsp;   \*   Actions: `#perm-save-current`, `#perm-reset-current`, `#perm-reset-all`.

# &nbsp;   \*   Saved origins list: `#perm-sites-list`.

# &nbsp;   \*   Renderer calls:

# &nbsp;       \*   `GET /api/permissions` to build `state.permissionsMap` and `#perm-sites-list`.

# &nbsp;       \*   `POST /api/permissions/set` to update individual origin/key pairs.

# &nbsp;       \*   `POST /api/permissions/reset` to clear all decisions for active profile.

# 

# \### 5.6 Settings

# 

# \*   `GET /api/settings` – fetches settings for active profile.

# \*   `POST /api/settings` – updates settings via patch.

# \*   Fields:

# &nbsp;   \*   `searchEngine` – base URL, e.g., `https://duckduckgo.com/?q=`.

# &nbsp;   \*   `home` – home page URL.

# &nbsp;   \*   `userAgent` – custom UA string or `'default'`.

# &nbsp;   \*   `adblock` – boolean toggle for basic text-based adblocking.

# &nbsp;   \*   `aiEnabled` – whether AI features are enabled.

# &nbsp;   \*   `aiModel` – model name for Ollama (e.g. `llama3.1:8b`).

# \*   Renderer:

# &nbsp;   \*   `loadSettings()` – populates Settings panel inputs.

# &nbsp;   \*   Save button (`#save-settings`) posts updates and calls `window.native.setUserAgent()` to update UA.

# 

# \### 5.7 Sync (Profile Export / Import)

# 

# \*   Sync panel (`#panel-sync`) provides:

# &nbsp;   \*   `#sync-export` – triggers `/api/sync/export` (assumes server route present) and downloads JSON.

# &nbsp;   \*   `#sync-import-file` – file input for JSON.

# &nbsp;   \*   `#sync-import` – sends parsed JSON to `/api/sync/import` (assumes server route present) to merge/replace data.

# \*   After import, `loadProfiles()` is called so the profile selector reflects new data.

# 

# \### 5.8 AI (Ollama) Integration

# 

# \*   Backend:

# &nbsp;   \*   `POST /api/ai/chat` – streams chat from Ollama using `/api/chat` endpoint.

# &nbsp;   \*   `GET /api/ai/models` – proxies `/api/tags` from Ollama to list models.

# \*   Renderer UI:

# &nbsp;   \*   AI panel (`#panel-ai`) with `#ai-model`, `#ai-enabled`, `#ai-save`.

# &nbsp;   \*   Chat:

# &nbsp;       \*   Messages container: `#ai-messages`.

# &nbsp;       \*   Input: `#ai-text`, Send button: `#ai-send`.

# &nbsp;       \*   “Ask about page” button: `#ai-ask-page` (scrapes text from current webview and sends as context).

# &nbsp;   \*   `loadModels()` – fetches available models and populates the dropdown.

# &nbsp;   \*   `streamChat()` – streams NDJSON from the backend and appends content to the chat.

# 

# 6\\. Keyboard Shortcuts

# ----------------------

# 

# Shortcut

# 

# Action

# 

# `Ctrl/Cmd + D`

# 

# Add current page to bookmarks.

# 

# `Ctrl/Cmd + L`

# 

# Focus address bar.

# 

# `Ctrl/Cmd + T`

# 

# Open a new tab.

# 

# `Ctrl/Cmd + W`

# 

# Close active tab.

# 

# `Ctrl/Cmd + R`

# 

# Reload active tab (ignoring cache).

# 

# `Cmd/Ctrl + Shift + N` (menu)

# 

# New window (non-incognito).

# 

# 7\\. Configuration \& Environment

# -------------------------------

# 

# Most configuration is stored in the DB via the Settings UI, but you should be aware of:

# 

# \*   \*\*Ollama\*\* must be running locally at `http://localhost:11434` if AI is enabled.

# \*   Express server listens on `http://localhost:3001` by default (see `PORT` in `server.js`).

# \*   Electron CSP is defined in `index.html`:

# &nbsp;   \*   `connect-src 'self' http://localhost:3001;` allows API requests.

# &nbsp;   \*   `img-src 'self' data: blob: https:` allows favicons and site images.

# 

# 8\\. Packaging

# -------------

# 

# For production builds, you will typically use `electron-builder` or similar. The important behavior is that:

# 

# \*   `startBackendIfPackaged()` imports `./server.js` when `app.isPackaged` is true.

# \*   `server.js` immediately starts the Express app via `await startServer()`.

# \*   The renderer continues to talk to `http://localhost:3001` as in development.

# 

# 9\\. Troubleshooting

# -------------------

# 

# \### 9.1 Express API not reachable

# 

# \*   Check that the console shows `\[express] http://localhost:3001`.

# \*   Ensure nothing else is already bound to port 3001.

# \*   If packaged, confirm `startBackendIfPackaged()` is being invoked (check logs).

# 

# \### 9.2 Downloads Shelf Not Updating

# 

# \*   Verify that `will-download` is firing in `main.js` (add console logs temporarily).

# \*   Ensure `preload.cjs` exposes `onDownloadStarted/Updated/Done` correctly and that `renderer.js` registers those handlers.

# \*   Check that the downloads shelf (`#downloads-shelf`) is not accidentally hidden.

# 

# \### 9.3 Permission Modal Not Showing

# 

# \*   Confirm `session.setPermissionRequestHandler` is being called on the correct session.

# \*   Check that `native.onPermissionRequest()` in the renderer is used to hook into `perm-request` events.

# \*   Make sure `#perm-modal` exists in `index.html` and renderer toggles visibility classes correctly.

# 

# \### 9.4 AI Not Responding

# 

# \*   Check that Ollama is running and reachable on `http://localhost:11434`.

# \*   Verify that the selected model exists (e.g., `ollama list`).

# \*   Make sure `aiEnabled` is checked in Settings and saved.

# \*   Check the Express logs for any error messages in `/api/ai/chat` or `/api/ai/models` handlers.

# 

# 10\\. Extending Zylo

# -------------------

# 

# \*   \*\*New side panel sections\*\* – add a new panel button in `index.html` and extend `showPanel()` in `renderer.js`.

# \*   \*\*Extra settings\*\* – add fields to `settings` object in DB and expose them via `/api/settings`.

# \*   \*\*More permissions\*\* – extend `ensurePermissionRecord` in `db.js` and permission handler in `main.js`.

# \*   \*\*Alternative AI backends\*\* – add new endpoints in `server.js` or change the Ollama URLs to other providers.

# 

# Zylo is designed to be a hackable, local-first browser shell. Feel free to adapt it to your own workflows, internal tooling, or specialized browsing needs.

