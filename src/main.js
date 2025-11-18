import { app, BrowserWindow, session, ipcMain, dialog, Menu, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { randomUUID } from 'node:crypto'
import { db, initDB, getActiveProfile, findProfile, ensurePermissionRecord } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isMac = process.platform === 'darwin'

let mainWindow

function partitionForProfile(id, incognito = false) {
  return incognito ? `zylo-incog-${id}-${Date.now()}` : `persist:zylo-profile-${id}`
}

function wireDownloadsForSession(ses) {
  if (!ses || ses.__zyloDownloadsWired) return
  ses.__zyloDownloadsWired = true

  ses.on('will-download', (event, item, webContents) => {
    const win = BrowserWindow.fromWebContents(webContents)
    if (!win) return

    const id = randomUUID()
    const fileName = item.getFilename()
    const url = item.getURL()
    const totalBytes = item.getTotalBytes()

    win.webContents.send('download-started', {
      id,
      fileName,
      url,
      totalBytes
    })

    item.on('updated', (_e, state) => {
      win.webContents.send('download-updated', {
        id,
        state,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes()
      })
    })

    item.on('done', async (_e, state) => {
      win.webContents.send('download-done', { id, state })

      try {
        await db.read()
        const profile = getActiveProfile()
        profile.downloads = profile.downloads || []
        profile.downloads.push({
          id,
          fileName,
          filePath: item.getSavePath() || '',
          url,
          size: item.getTotalBytes(),
          state,
          at: Date.now()
        })
        await db.write()
      } catch (err) {
        console.error('Error saving download record:', err)
      }
    })
  })
}

// 🔹 NEW: start Express backend when running the packaged app
async function startBackendIfPackaged() {
  if (!app.isPackaged) return
  try {
    // Just importing server.js starts the server (it calls startServer())
    await import('./server.js')
    console.log('[Zylo] Embedded Express backend started')
  } catch (err) {
    console.error('[Zylo] Failed to start embedded backend:', err)
  }
}

async function createWindow({ incognito = false } = {}) {
  await initDB()
  const profile = getActiveProfile()

  const preload = path.join(__dirname, 'preload.cjs')
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: incognito ? `Zylo (${profile.name} • Incognito)` : `Zylo (${profile.name})`,
    icon:
      process.platform === 'win32'
        ? path.join(__dirname, 'renderer', 'assets', 'icons', 'win', 'icon.ico')
        : path.join(__dirname, 'renderer', 'assets', 'icons', 'linux', '512x512.png'),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      sandbox: false,
      partition: partitionForProfile(profile.id, incognito)
    }
  })
  mainWindow = win

  // If the main window's own webContents tries to open a new window
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Forward to renderer to open as tab
    win.webContents.send('open-url-in-new-tab', url)
    return { action: 'deny' } // don't create a real OS window
  })

  const ses = win.webContents.session

  // --- Minimal adblock (demo) ---
  if (profile.settings.adblock) {
    let blockRules = []
    try {
      const list = fs.readFileSync(path.join(__dirname, 'adblock.txt'), 'utf8')
      blockRules = list.split('\n').map(l => l.trim()).filter(Boolean)
    } catch {}
    ses.webRequest.onBeforeRequest((details, callback) => {
      const url = (details.url || '').toLowerCase()
      const blocked = blockRules.some(
        rule => rule.startsWith('||') && url.includes(rule.slice(2).replace('^', ''))
      )
      if (blocked) return callback({ cancel: true })
      callback({})
    })
  }

  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
  // Only handle the permissions we care about
  if (!['geolocation', 'media', 'camera', 'microphone', 'notifications'].includes(permission)) {
    return callback(false)
  }

  try {
    const origin = new URL(details.requestingUrl || wc.getURL() || 'https://unknown').origin

    await db.read()
    const prof = getActiveProfile()
    const rec = ensurePermissionRecord(prof, origin)

    // Figure out what the site is actually asking for
    const mediaTypes = details.mediaTypes || []
    const wantsCamera =
      permission === 'camera' ||
      (permission === 'media' && mediaTypes.includes('video'))
    const wantsMic =
      permission === 'microphone' ||
      (permission === 'media' && mediaTypes.includes('audio'))

    const wantsGeo  = permission === 'geolocation'
    const wantsNoti = permission === 'notifications'

    // If we already have a decision, apply it WITHOUT showing the modal
    if (wantsGeo) {
      const saved = rec.geolocation || 'ask'
      if (saved === 'allow') return callback(true)
      if (saved === 'deny')  return callback(false)
    }

    if (wantsNoti) {
      const saved = rec.notifications || 'ask'
      if (saved === 'allow') return callback(true)
      if (saved === 'deny')  return callback(false)
    }

    // For camera/microphone we look at them separately
    const savedCam = rec.camera || 'ask'
    const savedMic = rec.microphone || 'ask'

    // If both requested and we have concrete decisions already
    if (wantsCamera && wantsMic && savedCam !== 'ask' && savedMic !== 'ask') {
      const decision = (savedCam === 'allow' && savedMic === 'allow')
      return callback(decision)
    }

    // If only camera requested and decision exists
    if (wantsCamera && !wantsMic && savedCam !== 'ask') {
      return callback(savedCam === 'allow')
    }

    // If only mic requested and decision exists
    if (wantsMic && !wantsCamera && savedMic !== 'ask') {
      return callback(savedMic === 'allow')
    }

    // No saved decision => ask the renderer via modal
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    if (!mainWindow || mainWindow.isDestroyed()) return callback(false)

    // Tell renderer WHAT is being requested so you can show text like
    // "Allow camera?" / "Allow microphone?".
    const type =
      wantsCamera && wantsMic ? 'camera+microphone'
      : wantsCamera ? 'camera'
      : wantsMic ? 'microphone'
      : wantsGeo ? 'geolocation'
      : 'notifications'

    const answer = await new Promise(resolve => {
      const channel = `perm-reply-${reqId}`
      const timeout = setTimeout(() => resolve({ id: reqId, decision: 'deny' }), 15000)
      ipcMain.once(channel, (_e, payload) => {
        clearTimeout(timeout)
        resolve(payload)
      })
      mainWindow.webContents.send('perm-request', { id: reqId, origin, type })
    })

    const granted = answer?.decision === 'allow'

    // Persist the choice per site and per resource
    await db.read()
    const p2 = getActiveProfile()
    const rec2 = ensurePermissionRecord(p2, origin)

    if (type === 'camera+microphone') {
      rec2.camera = granted ? 'allow' : 'deny';
      rec2.microphone = granted ? 'allow' : 'deny';
    } else {
      if (wantsCamera)  rec2.camera = granted ? 'allow' : 'deny';
      if (wantsMic)     rec2.microphone = granted ? 'allow' : 'deny';
    }

    if (wantsGeo)       rec2.geolocation = granted ? 'allow' : 'deny'
    if (wantsNoti)      rec2.notifications = granted ? 'allow' : 'deny'

    await db.write()

    // Let renderer refresh Permissions panel if it's open
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('permissions-updated', { origin })
    }

    callback(granted)
  } catch (err) {
    console.error('Permission handler error', err)
    callback(false)
  }
})


  // --- downloads (per-window) ---
  ses.on('will-download', (event, item) => {
    const id = randomUUID()
    const fileName = item.getFilename()
    const url = item.getURL()
    const totalBytes = item.getTotalBytes()

    win.webContents.send('download-started', {
      id,
      fileName,
      url,
      totalBytes
    })

    item.on('updated', (_e, state) => {
      win.webContents.send('download-updated', {
        id,
        state,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes()
      })
    })

    item.on('done', async (_e, state) => {
      win.webContents.send('download-done', { id, state })

      await db.read()
      const prof = getActiveProfile()
      prof.downloads.push({
        id,
        fileName,
        filePath: item.getSavePath() || '',
        url,
        size: item.getTotalBytes(),
        state,
        at: Date.now()
      })
      await db.write()
    })
  })

  // --- App menu ---
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Window',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow({ incognito: false })
        },
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  return win
}

app.whenReady().then(async () => {
  // 🔹 Start backend when running the installed app
  await startBackendIfPackaged()

  await initDB()
  mainWindow = await createWindow()

  wireDownloadsForSession(session.defaultSession)
  app.on('session-created', ses => {
    wireDownloadsForSession(ses)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Context menu for all webContents
app.on('web-contents-created', (_evt, contents) => {
  contents.on('context-menu', (e, params) => {
    const hasTextSelection = !!params.selectionText
    const isEditable = params.isEditable
    const hasLink = !!params.linkURL
    const hasImage = !!params.srcURL && params.mediaType === 'image'

    const template = [
      ...(contents.canGoBack?.() || contents.canGoForward?.() || contents.reload
        ? [
            {
              label: 'Back',
              enabled: contents.canGoBack?.() || false,
              click: () => contents.goBack?.()
            },
            {
              label: 'Forward',
              enabled: contents.canGoForward?.() || false,
              click: () => contents.goForward?.()
            },
            { label: 'Reload', click: () => contents.reload?.() },
            { type: 'separator' }
          ]
        : []),

      ...(hasLink
        ? [
            {
              label: 'Open Link in New Tab',
              click: () => {
                const win = BrowserWindow.fromWebContents(contents)
                win?.webContents.send('open-url-in-new-tab', params.linkURL)
              }
            },
            {
              label: 'Open Link in Default Browser',
              click: () => shell.openExternal(params.linkURL)
            },
            {
              label: 'Copy Link Address',
              role: 'copyLink',
              click: (m, w) => {
                try {
                  w?.clipboard?.writeText(params.linkURL)
                } catch {}
              }
            },
            { type: 'separator' }
          ]
        : []),

      ...(hasImage
        ? [
            {
              label: 'Open Image in New Tab',
              click: () => {
                const win = BrowserWindow.fromWebContents(contents)
                win?.webContents.send('open-url-in-new-tab', params.srcURL)
              }
            },
            {
              label: 'Save Image As…',
              click: () => contents.downloadURL?.(params.srcURL)
            },
            { type: 'separator' }
          ]
        : []),

      ...(isEditable
        ? [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
            { type: 'separator' }
          ]
        : [...(hasTextSelection ? [{ role: 'copy' }, { type: 'separator' }] : [])]),

      {
        label: 'Inspect Element',
        click: () => {
          contents.inspectElement(params.x, params.y)
          if (contents.isDevToolsOpened && !contents.isDevToolsOpened()) {
            contents.openDevTools({ mode: 'detach' })
          }
        }
      }
    ]

    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: BrowserWindow.fromWebContents(contents) })
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

// ---------- IPC ----------
ipcMain.handle('save-page-as', async (e, { url, suggestedName }) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const p = dialog.showSaveDialogSync(win, {
    defaultPath: suggestedName || 'page.html'
  })
  if (!p) return { ok: false }
  const res = await fetch(url)
  const buf = new Uint8Array(await res.arrayBuffer())
  fs.writeFileSync(p, buf)
  return { ok: true, path: p }
})

ipcMain.handle('new-incognito', () => createWindow({ incognito: true }))
ipcMain.handle('new-window', () => createWindow({ incognito: false }))

ipcMain.handle('set-user-agent', (e, ua) => {
  const wc = BrowserWindow.fromWebContents(e.sender).webContents
  wc.setUserAgent(ua || '')
  return { ok: true }
})

ipcMain.handle('reopen-folder', (_e, p) => {
  if (p) shell.showItemInFolder(p)
  return true
})

ipcMain.handle('switch-profile', async (_e, profileId) => {
  await db.read()
  const target = findProfile(profileId)
  if (!target) return { ok: false, error: 'Profile not found' }
  db.data.activeProfileId = profileId
  await db.write()
  const win = await createWindow()
  const old = BrowserWindow.getAllWindows().find(w => w !== win)
  if (old) old.close()
  return { ok: true }
})

// Permission decision reply channel (renderer -> main)
ipcMain.on('perm-respond', (e, payload) => {
  const channel = `perm-reply-${payload.id}`
  ipcMain.emit(channel, e, payload)
})
