![Zylo Logo](https://github.com/Hubbzy/Zylo/blob/main/src/renderer/assets/zylo-logo.png)

Zylo Browser
============

![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg) ![Version](https://img.shields.io/badge/version-1.0.0-orange.svg)

Zylo is a desktop web browser built with **Electron**, **Node.js**, and an integrated **Express.js** backend. It provides multi-profile browsing, bookmarks, history, a live downloads shelf, fine-grained site permissions (camera, microphone, geolocation, notifications), and an optional AI assistant powered by **Ollama**.

*   _Currently supports Linux, Mac, and Windows environments._

* * *

Files in This Application
-------------------------

*   `main.js` – Electron main process:
    
    *   Creates the main `BrowserWindow` and loads the UI.
    *   Sets up per-profile sessions via `partitionForProfile()`.
    *   Handles downloads via `session.on('will-download')` and persists them to the profile database.
    *   Implements the permission request handler for camera, mic, geolocation, and notifications.
    *   Starts the embedded Express backend when the app is packaged.
    *   Defines the application and context menus.
*   `preload.cjs` – Preload script (CommonJS) that exposes a safe API to the renderer via `window.native`:
    
    *   Window/file helpers (save page as, new incognito, new window, set user agent, reopen downloads folder).
    *   Download events (`download-started`, `download-updated`, `download-done`).
    *   Permission flow events (`perm-request`, `perm-respond`, `permissions-updated`).
*   `src/server.js` – Express backend:
    
    *   Exposes REST API endpoints under `/api/` for profiles, bookmarks, history, downloads, settings, and permissions.
    *   Proxies AI chat and model discovery to a local Ollama instance.
    *   Starts an HTTP server on `http://localhost:3001` (by default).
*   `src/db.js` – Database helper module:
    
    *   Exports `db`, `initDB()`, `getActiveProfile()`, `findProfile()`, and `ensurePermissionRecord()`.
    *   Stores per-profile data such as settings, bookmarks, history, downloads, and permissions.
*   `src/renderer/index.html` – Main renderer HTML:
    
    *   Defines the browser UI: toolbar, tabs strip, side panel, webview container, downloads shelf, and permission modal.
    *   Includes Bootstrap CSS/JS, Bootstrap Icons, and custom `style.css`.
    *   Loads `renderer.js` as the main front-end script.
*   `src/renderer/renderer.js` – Renderer logic:
    
    *   Manages tabs and `<webview>` instances (navigation, address bar, zoom, find-in-page).
    *   Implements the side panel (Bookmarks, History, Downloads, Permissions, Settings, Sync, AI).
    *   Handles live downloads shelf (start/progress/done chips) via `window.native` events.
    *   Controls the permission modal and current-site permission settings.
    *   Implements Zylo AI chat panel and streaming responses from the backend.
    *   Loads and saves application settings via the Express API.
*   `src/renderer/assets/` – Static assets for the front-end:
    
    *   `css/bootstrap.min.css`, `css/bootstrap-icons.css`, `css/style.css`.
    *   `js/bootstrap.bundle.min.js`.
    *   `zylo-logo.png` – application logo.

* * *

To Use
------

To clone and run this repository, you’ll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer.

From your command line:

**1\. Clone this repository**

    git clone https://github.com/your-username/zylo-browser.git 

**2\. Go into the repository**

    cd zylo-browser 

**3\. Install dependencies**

    npm install 

**4\. Start the Express backend (optional in dev)**

In development, you can either run the backend explicitly or rely on Electron importing `server.js`. To run it directly:

    node src/server.js 

**5\. Run the Electron app**

    npx electron . 

Or, if your `package.json` defines a script such as:

    "scripts": { "start": "electron ." } 

then you can simply run:

    npm start 

Note: If you’re using Linux Bash for Windows, [see this guide](https://www.howtogeek.com/261575/how-to-run-graphical-linux-desktop-applications-from-windows-10s-bash-shell/) or run `node` and `electron` from a regular command prompt / PowerShell.

* * *

Configuration
-------------

Zylo uses a local JSON/embedded database via `db.js`. The Express backend and AI integration include a few configurable values. You can manage most behavior via the in-app Settings panel, but you may also want to adjust some environment-level options.

### Ports and Hosts

*   **Express backend** – by default runs on `http://localhost:3001`.
*   **Ollama** – expected at `http://localhost:11434` for AI chat and model tags.

These are currently defined directly in `server.js`. If you prefer to configure them via environment variables, you can refactor the code to read from `process.env.PORT` or `process.env.OLLAMA_HOST` and then add a `.env` file (using something like `dotenv`).

### In-App Settings

The following settings are stored per profile and can be adjusted via the Settings panel in the UI (under **Settings** → **Side Panel**):

*   `searchEngine` – base URL used when the address bar input is not a full URL (e.g. `https://duckduckgo.com/?q=`).
*   `home` – default home page URL for the Home button.
*   `userAgent` – custom User-Agent string (or `default` to use Electron’s default).
*   `adblock` – boolean toggle enabling a basic text-based ad/tracker blocking using `adblock.txt`.
*   `aiEnabled` – whether Zylo AI features are available.
*   `aiModel` – model identifier for Ollama (e.g. `llama3.1:8b`).

These are persisted in the active profile via `/api/settings`.

* * *

Endpoints
---------

The Express backend exposes several REST API endpoints under `/api/`. They operate on the **active profile** as determined by the database.

### Profiles

*   `GET /api/profiles` – Returns `{ activeProfileId, profiles[] }`.
*   `POST /api/profiles` – Creates a new profile with a given `name`. Copies settings from the current active profile.
*   `POST /api/profiles/activate` – Sets the active profile by `id`.
*   `DELETE /api/profiles/:id` – Deletes a profile (cannot delete the active profile).

### Bookmarks

*   `GET /api/bookmarks` – Returns bookmarks for the active profile.
*   `POST /api/bookmarks` – Adds a bookmark: `{ title, url, favicon }`.
*   `DELETE /api/bookmarks/:id` – Deletes a bookmark by id.

### History

*   `GET /api/history` – Returns recent history for the active profile (reversed, limited to latest entries).
*   `POST /api/history` – Adds a history entry: `{ title, url, favicon }`.
*   `DELETE /api/history` – Clears all history for the active profile.

### Downloads

*   `GET /api/downloads` – Returns persisted downloads for the active profile (latest first).
*   `POST /api/downloads` – (Optional) Adds a download record manually: `{ id, fileName, filePath, url, size, state, at }`.

Note: In typical usage, downloads are recorded directly from the Electron main process via `getActiveProfile().downloads.push()`, and the renderer only reads them with `GET /api/downloads`.

### Settings

*   `GET /api/settings` – Returns the settings object for the active profile.
*   `POST /api/settings` – Merges provided properties into the current profile settings.

### Permissions

*   `GET /api/permissions` – Returns the permissions map: `{ [origin]: { camera, microphone, geolocation, notifications } }`.
*   `POST /api/permissions/set` – Sets a specific permission for an origin: `{ origin, key, value }` where:
    *   `key` is one of `camera`, `microphone`, `geolocation`, `notifications`.
    *   `value` is one of `ask`, `allow`, `deny`.
*   `POST /api/permissions/reset` – Clears all saved permissions for the active profile.

### AI (Ollama)

*   `POST /api/ai/chat` – Proxies streaming chat to the local Ollama server (`/api/chat`) using the configured model.
*   `GET /api/ai/models` – Returns available models from `/api/tags` on the Ollama host (or a fallback list).

* * *

Example Code Usage
------------------

Example: Fetching bookmarks from the backend using plain JavaScript `fetch`:

    async function loadBookmarks() { try { const res = await fetch('http://localhost:3001/api/bookmarks'); if (!res.ok) throw new Error('Request failed: ' + res.status); const bookmarks = await res.json(); console.log('Bookmarks:', bookmarks); } catch (err) { console.error('Failed to fetch bookmarks:', err); } } 

Example: Setting permissions for the current origin (camera & microphone allow):

    async function allowCameraAndMic(origin) { const payloads = [ { origin, key: 'camera', value: 'allow' }, { origin, key: 'microphone', value: 'allow' } ]; for (const p of payloads) { await fetch('http://localhost:3001/api/permissions/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); } } 

In the actual Zylo renderer, these APIs are used to populate the Bookmarks, History, Downloads, Permissions, Settings, Sync, and AI panels, and to keep the browser UI in sync with the active profile.

* * *

Permissions Flow Overview
-------------------------

When a website requests access to camera, microphone, geolocation, or notifications:

1.  The Electron `session.setPermissionRequestHandler` in `main.js` intercepts the request.
2.  The handler:
    *   Determines the **origin** from the requesting URL.
    *   Loads (or initializes) the stored permissions for that origin via `ensurePermissionRecord()`.
    *   If a decision already exists (e.g., camera = `allow`), it immediately responds without prompting.
    *   If no decision exists, it sends an IPC message `perm-request` to the renderer.
3.  The renderer listens via `window.native.onPermissionRequest()` and shows the permission modal:

*   Modal elements: `#perm-modal`, `#perm-title`, `#perm-desc`, `#perm-allow`, `#perm-deny`.
*   The user can choose **Allow** or **Deny**.

4.  The renderer calls `window.native.permRespond(id, decision)` with `allow` or `deny`.
5.  The main process receives the response, persists the values to the DB (per origin and resource), calls `callback(true|false)` to resolve the Electron permission request, and sends `permissions-updated` so the Permissions panel can refresh.

* * *

Downloads Overview
------------------

Zylo provides both a **live downloads shelf** and a **downloads panel**:

*   Live shelf:
    *   Renderer listens for `download-started`, `download-updated`, and `download-done` via `window.native`.
    *   Creates “chips” in `#downloads-list` inside the shelf footer `#downloads-shelf`.
    *   Shows progress bars and state messages (Starting, %, Done, Cancelled, Failed).
    *   Can be manually hidden with `#downloads-hide`.
*   Downloads panel:
    *   Uses `GET /api/downloads` to list persisted downloads for the active profile.
    *   Shows file name, state, size, save path, URL, and timestamp.

* * *

Acknowledgments
---------------

*   [Node.js](https://nodejs.org/)
*   [Express.js](https://expressjs.com/)
*   [Electron](https://www.electronjs.org/)
*   [helmet](https://www.npmjs.com/package/helmet) for security headers
*   [Bootstrap](https://getbootstrap.com/) and [Bootstrap Icons](https://icons.getbootstrap.com/) for UI styling
*   [Ollama](https://ollama.com/) for local LLM support
