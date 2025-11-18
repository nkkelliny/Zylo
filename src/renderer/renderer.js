// src/renderer/renderer.js

// ---------- Helpers ----------
const $  = (sel) => document.querySelector(sel)
const $$ = (sel) => Array.from(document.querySelectorAll(sel))

async function api(path, opts = {}) {
  const res = await fetch(`http://localhost:3001${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  })
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

// ---------- DOM refs ----------
const tabsEl         = $('#tabs')
const webviewsEl     = $('#webviews')
const urlEl          = $('#url')
const lockEl         = $('#lock')
const sidepanel      = $('#sidepanel')
const newTabBtn      = $('#newTab')
const profileSwitch  = $('#profile-switch')

// Find bar
const findBar   = $('#findbar')
const findInput = $('#findText')

// Downloads shelf
const shelf      = $('#downloads-shelf')
const shelfList  = $('#downloads-list')
const shelfHide  = $('#downloads-hide')

// Permission modal (shown only when necessary)
const permModal     = $('#perm-modal')
const permTitle     = $('#perm-title')
const permDesc      = $('#perm-desc')
const permAllowBtn  = $('#perm-allow')
const permDenyBtn   = $('#perm-deny')

// Permissions UI refs (always visible in Permissions tab)
const permOriginLabel   = $('#perm-current-origin')
const permCameraSelect  = $('#perm-camera')
const permMicSelect     = $('#perm-microphone')
const permGeoSelect     = $('#perm-geolocation')
const permNotiSelect    = $('#perm-notifications')
const permSaveCurrent   = $('#perm-save-current')
const permResetCurrent  = $('#perm-reset-current')
const permResetAll      = $('#perm-reset-all')
const permSitesList     = $('#perm-sites-list')

// AI panel
const aiMsgs     = $('#ai-messages')
const aiText     = $('#ai-text')
const aiSend     = $('#ai-send')
const aiAskPage  = $('#ai-ask-page')
const aiModelSel = $('#ai-model')
const aiEnabled  = $('#ai-enabled')
const aiSaveBtn  = $('#ai-save')

// ---------- App State ----------
const state = {
  // tabs: { id, wv, wrap, tab, domReady, pendingUrl, favicon }
  tabs: [],
  activeId: null,
  zoom: {},                    // tabId -> zoomLevelDelta
  downloads: {},               // id -> { fileName, savePath, progress, state }
  permissionsMap: {}           // origin -> { camera, microphone, geolocation, notifications }
}

// Modal DOM
const permReqModal = $('#perm-request-modal')
const permReqTitle = $('#perm-modal-title')
const permReqText  = $('#perm-modal-text')
const permReqAllow = $('#perm-modal-allow')
const permReqDeny  = $('#perm-modal-deny')

let currentPermReqId = null

// Receive request from main process
window.native?.onPermissionRequest?.((_e, data) => {
  currentPermReqId = data.id

  permReqTitle.textContent = `Allow ${data.type}?`
  permReqText.textContent = `${data.origin} is requesting access to your ${data.type}.`
  
  permReqModal.classList.remove('hidden')
})

permReqAllow.onclick = () => {
  if (!currentPermReqId) return
  window.native.sendPermissionDecision(currentPermReqId, 'allow')
  permReqModal.classList.add('hidden')
}

permReqDeny.onclick = () => {
  if (!currentPermReqId) return
  window.native.sendPermissionDecision(currentPermReqId, 'deny')
  permReqModal.classList.add('hidden')
}


// ========== Permission Modal Handling ==========
if (window.native && window.native.onPermissionRequest) {
  window.native.onPermissionRequest((req) => {
    // req = { id, origin, type }
    permModal.classList.remove('d-none');

    permTitle.textContent = `This site wants to use your ${req.type}`;
    permDesc.textContent = `${req.origin} is requesting access to your ${req.type}.`;

    // Button: Deny
    permDenyBtn.onclick = () => {
      window.native.permRespond(req.id, 'deny');
      permModal.classList.add('d-none');
    };

    // Button: Allow
    permAllowBtn.onclick = () => {
      window.native.permRespond(req.id, 'allow');
      permModal.classList.add('d-none');
    };

    // X button
    const xBtn = document.querySelector('#perm-deny-x');
    if (xBtn) {
      xBtn.onclick = () => {
        window.native.permRespond(req.id, 'deny');
        permModal.classList.add('d-none');
      };
    }
  });
}


// =============================
// Profiles
// =============================
async function loadProfiles() {
  const data = await api('/api/profiles')
  profileSwitch.innerHTML = data.profiles
    .map(p => `<option value="${p.id}" ${p.id === data.activeProfileId ? 'selected' : ''}>${p.name}</option>`)
    .join('')
}

profileSwitch.onchange = async () => {
  const id = profileSwitch.value
  await api('/api/profiles/activate', { method: 'POST', body: JSON.stringify({ id }) })
  const r = await window.native.switchProfile(id)
  if (!r?.ok) alert('Failed to switch profile')
}

// =============================
// Tabs / Favicons
// =============================

function getActive() {
  return state.tabs.find(t => t.id === state.activeId)
}

function getCurrentOrigin() {
  const rec = getActive()
  if (!rec) return null
  const url = safeGetURL(rec.wv)
  try {
    const u = new URL(url)
    return u.origin
  } catch {
    return null
  }
}

function getActiveFavicon() {
  const rec = getActive()
  return rec?.favicon || ''
}

/**
 * Update the favicon shown in the tab strip for a given tab.
 */
function updateTabFavicon(tabId, faviconUrl) {
  const rec = state.tabs.find(t => t.id === tabId)
  if (rec) rec.favicon = faviconUrl || ''

  const tabEl = tabsEl.querySelector(`.tab[data-id="${tabId}"]`)
  if (!tabEl) return

  const wrapper = tabEl.querySelector('.tab-icon-wrapper')
  if (!wrapper) return

  // Clear existing icon
  wrapper.innerHTML = ''

  if (faviconUrl) {
    const img = document.createElement('img')
    img.className = 'tab-icon'
    img.src = faviconUrl
    img.alt = ''
    wrapper.appendChild(img)
  } else {
    // fallback globe
    const span = document.createElement('span')
    span.className = 'tab-icon fallback'
    span.textContent = '🌐'
    wrapper.appendChild(span)
  }
}

function createTab(startUrl, title = 'New Tab') {
  const id = crypto.randomUUID()

  const wrap = document.createElement('div')
  wrap.className = 'webview-wrap'
  wrap.dataset.id = id

  const wv = document.createElement('webview')
  wv.setAttribute('allowpopups', '')
  wv.style.width = '100%'
  wv.style.height = '100%'

  wrap.appendChild(wv)
  webviewsEl.appendChild(wrap)

  const tab = document.createElement('div')
  tab.className = 'tab'
  tab.dataset.id = id
  // favicon placeholder + title + close button
  tab.innerHTML = `
    <span class="tab-icon-wrapper">
      <span class="tab-icon fallback">🌐</span>
    </span>
    <span class="title">${title}</span>
    <button class="close btn btn-outline-secondary" title="Close">×</button>
  `
  tabsEl.appendChild(tab)

  const tabRec = {
    id,
    wv,
    wrap,
    tab,
    domReady: false,
    pendingUrl: null,
    favicon: ''
  }
  state.tabs.push(tabRec)
  attachWebviewEvents(id)

  // First navigation via src attribute (safe before dom-ready)
  if (startUrl && typeof startUrl === 'string') {
    wv.setAttribute('src', startUrl)
    tabRec.pendingUrl = startUrl
    updateAddressBar(startUrl)
  }

  setActive(id)
  updateCurrentSitePermissionsUI()
}

// From main process context menu: open link/image in a new tab
if (window.native?.onOpenUrlInNewTab) {
  window.native.onOpenUrlInNewTab((url) => {
    if (!url) return
    createTab(url)
  })
}

function setActive(id) {
  state.activeId = id
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === id))
  $$('.webview-wrap').forEach(w => w.classList.toggle('active', w.dataset.id === id))

  const rec = getActive()
  if (!rec) return

  const current = rec.domReady
    ? (rec.wv.getURL ? rec.wv.getURL() : '')
    : (rec.wv.getAttribute('src') || rec.pendingUrl || '')

  updateAddressBar(current)
  updateCurrentSitePermissionsUI()
}

function attachWebviewEvents(id) {
  const rec = state.tabs.find(t => t.id === id)
  const { wv, tab } = rec

  wv.addEventListener('dom-ready', () => {
    rec.domReady = true
    if (rec.pendingUrl) {
      try {
        const current = wv.getURL?.()
        if (!current || current === 'about:blank') {
          wv.loadURL(rec.pendingUrl).catch(() => {})
        }
      } catch {
        wv.loadURL(rec.pendingUrl).catch(() => {})
      }
      rec.pendingUrl = null
    }
  })

   // 🔹 Handle links that want a new window/tab
  wv.addEventListener('new-window', (e) => {
    // e.url is the requested URL
    e.preventDefault()  // prevent Electron from spawning a separate window
    if (!e.url) return

    // Open as a Zylo tab instead
    createTab(e.url)
  })

  wv.addEventListener('did-start-loading', () => $('#reload').textContent = '↻')
  wv.addEventListener('did-stop-loading',  () => $('#reload').textContent = '↻')

  wv.addEventListener('page-title-updated', (e) => {
    tab.querySelector('.title').textContent = e.title
  })

  // Favicons from webview event
  wv.addEventListener('page-favicon-updated', (e) => {
    const icons = e.favicons || []
    const favicon = icons[0] || ''
    updateTabFavicon(id, favicon)
  })

  wv.addEventListener('did-navigate', onNavigated)
  wv.addEventListener('did-navigate-in-page', onNavigated)

  wv.addEventListener('did-finish-load', () => {
    const url = safeGetURL(wv)
    try {
      const u = new URL(url)
      lockEl.textContent = (u.protocol === 'https:') ? '🔒' : '⚠'
      lockEl.title = u.origin
    } catch {
      lockEl.textContent = '⚪'
      lockEl.title = 'Unknown'
    }

    // Fallback favicon if none yet
    if (!rec.favicon && url) {
      try {
        const u = new URL(url)
        const fallback = `${u.origin}/favicon.ico`
        updateTabFavicon(id, fallback)
      } catch {
        // ignore invalid URL
      }
    }

    updateCurrentSitePermissionsUI()
  })

  async function onNavigated(e) {
    const url = e.url
    updateAddressBar(url)
    updateCurrentSitePermissionsUI()

    // Store history with favicon
    const favicon = rec.favicon || ''
    await api('/api/history', {
      method: 'POST',
      body: JSON.stringify({
        title: wv.getTitle(),
        url,
        favicon
      })
    }).catch(() => {})
  }
}

function safeGetURL(wv) {
  try { return wv.getURL?.() || '' } catch { return '' }
}

// =============================
// Navigation / Address bar
// =============================
async function go(input) {
  const settings = await api('/api/settings')
  let u = input.trim()
  if (!u) return
  if (!/^[a-z]+:\/\//i.test(u)) {
    if (/\s/.test(u) || !u.includes('.')) u = `${settings.searchEngine}${encodeURIComponent(input)}`
    else u = 'https://' + u
  }
  navigateTo(state.activeId, u)
}

function navigateTo(id, u) {
  const rec = state.tabs.find(t => t.id === id)
  if (!rec) return
  if (!rec.domReady) {
    rec.pendingUrl = u
    rec.wv.setAttribute('src', u)
  } else {
    try { rec.wv.loadURL(u) } catch { rec.wv.setAttribute('src', u) }
  }
}

function updateAddressBar(u) {
  urlEl.value = u
  try {
    const url = new URL(u)
    lockEl.title = url.origin
    lockEl.textContent = (url.protocol === 'https:') ? '🔒' : '⚠'
  } catch {
    lockEl.textContent = '⚪'
    lockEl.title = 'Unknown'
  }
}

// =============================
// Toolbar buttons
// =============================
$('#back').onclick     = () => { const { wv } = getActive(); wv.canGoBack()    && wv.goBack() }
$('#forward').onclick  = () => { const { wv } = getActive(); wv.canGoForward() && wv.goForward() }
$('#reload').onclick   = () => { const { wv } = getActive(); wv.reload() }
$('#stop').onclick     = () => { const { wv } = getActive(); wv.stop() }
$('#home').onclick     = openHomeTab
$('#devtools').onclick = () => { const { wv } = getActive(); wv.openDevTools() }
$('#incog').onclick    = () => window.native.newIncognito()
$('#newwin').onclick    = () => window.native.newWindow()
$('#menu').onclick     = () => sidepanel.classList.toggle('hidden')
$('#ai').onclick       = async () => { showPanel('ai'); await loadSettings(); await loadModels() }

urlEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(urlEl.value) })
newTabBtn.onclick = () => createTab('about:blank')

// Tabs click (activate/close)
tabsEl.addEventListener('click', (e) => {
  const el = e.target
  const tabEl = el.closest('.tab'); if (!tabEl) return
  if (el.classList.contains('close')) closeTab(tabEl.dataset.id)
  else setActive(tabEl.dataset.id)
})

function closeTab(id) {
  const idx = state.tabs.findIndex(t => t.id === id)
  if (idx === -1) return
  const t = state.tabs[idx]
  t.wrap.remove()
  t.tab.remove()
  state.tabs.splice(idx, 1)
  if (state.activeId === id && state.tabs.length) setActive(state.tabs[0].id)
}

// =============================
// Find-in-page
// =============================
$('#find').onclick      = () => { findBar.classList.remove('hidden'); findInput.focus() }
$('#findClose').onclick = () => { findBar.classList.add('hidden'); const { wv } = getActive(); wv.stopFindInPage('clearSelection') }
$('#findPrev').onclick  = () => doFind(true)
$('#findNext').onclick  = () => doFind(false)
findInput.addEventListener('keydown', e => { if (e.key === 'Enter') doFind(e.shiftKey) })

function doFind(backwards) {
  const { wv } = getActive()
  const text = findInput.value
  wv.findInPage(text, { findNext: true, forward: !backwards })
}

// =============================
// Zoom
// =============================
$('#zoomIn').onclick    = () => changeZoom(0.1)
$('#zoomOut').onclick   = () => changeZoom(-0.1)
$('#zoomReset').onclick = () => setZoom(0)

function changeZoom(delta) {
  const { id } = getActive()
  setZoom((state.zoom[id] || 0) + delta)
}
function setZoom(v) {
  const { id, wv } = getActive()
  state.zoom[id] = Math.max(-0.9, Math.min(2, v))
  wv.setZoomFactor(1 + state.zoom[id])
  $('#zoomReset').textContent = Math.round((1 + state.zoom[id]) * 100) + '%'
}

// =============================
// Side Panel switching
// =============================
$('.panel-tabs').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return
  showPanel(btn.dataset.panel)
})

function showPanel(key) {
  $$('.panel').forEach(p => p.classList.add('hidden'))
  sidepanel.classList.remove('hidden')
  const id = '#panel-' + key
  $(id).classList.remove('hidden')
  if (id === '#panel-bookmarks')    refreshBookmarks()
  if (id === '#panel-history')      refreshHistory()
  if (id === '#panel-downloads')    refreshDownloads()
  if (id === '#panel-permissions')  refreshPermissions()
  if (id === '#panel-settings')     loadSettings()
  if (id === '#panel-sync')         setupSync()
  if (id === '#panel-ai')          { loadSettings(); loadModels() }
}

// =============================
// Bookmarks (with favicons)
// =============================
function renderFaviconHtml(favicon, url) {
  let icon = favicon || ''
  if (!icon && url) {
    try {
      const u = new URL(url)
      icon = `${u.origin}/favicon.ico`
    } catch {
      // ignore
    }
  }
  if (!icon) {
    return `<span class="bookmark-icon-fallback me-2">🌐</span>`
  }
  return `<img src="${icon}" alt="" class="bookmark-icon me-2" style="width:16px;height:16px;object-fit:contain;">`
}

async function refreshBookmarks() {
  const list = await api('/api/bookmarks')
  const panel = $('#panel-bookmarks')
  panel.innerHTML =
    `<h3>Bookmarks</h3>` +
    list.map(b => `
      <div class="item d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center">
          ${renderFaviconHtml(b.favicon, b.url)}
          <a href="#" data-url="${b.url}" class="open">${b.title}</a>
        </div>
        <button class="del btn btn-outline-danger btn-sm" data-id="${b.id}"><i class="bi bi-trash-fill"></i></button>
      </div>
    `).join('') +
    `<button id="add-bm" class="btn btn-outline-secondary btn-sm mt-2">Add current tab</button>`

  panel.onclick = async (e) => {
    if (e.target.classList.contains('open')) {
      e.preventDefault()
      navigateTo(state.activeId, e.target.dataset.url)
    }
    if (e.target.classList.contains('del')) {
      await fetch(`http://localhost:3001/api/bookmarks/${e.target.dataset.id}`, { method: 'DELETE' })
      refreshBookmarks()
    }
  }

  $('#add-bm').onclick = async () => {
    const rec = getActive()
    if (!rec) return
    const { wv } = rec
    const url = safeGetURL(wv)
    const title = wv.getTitle()
    const favicon = rec.favicon || ''

    await api('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ title, url, favicon })
    })
    refreshBookmarks()
  }
}

// =============================
// History (with favicons)
// =============================
async function refreshHistory() {
  const list = await api('/api/history')
  const panel = $('#panel-history')
  panel.innerHTML =
    `<h3>History</h3><button class="btn btn-outline-secondary btn-sm mb-2" id="clear-hist">Clear All</button>` +
    list.map(h => `
      <div class="item d-flex align-items-center">
        ${renderFaviconHtml(h.favicon, h.url)}
        <a href="#" data-url="${h.url}" class="open">
          ${new Date(h.visitedAt).toLocaleString()} — ${h.title || h.url}
        </a>
      </div>
    `).join('')

  panel.onclick = e => {
    if (e.target.classList.contains('open')) {
      e.preventDefault()
      navigateTo(state.activeId, e.target.dataset.url)
    }
  }

  $('#clear-hist').onclick = async () => {
    await fetch('http://localhost:3001/api/history', { method: 'DELETE' })
    refreshHistory()
  }
}

// =============================
// Downloads (completed list in panel)
// =============================
async function refreshDownloads() {
  const list = await api('/api/downloads')
  const panel = $('#panel-downloads')
  panel.innerHTML = `<h3>Downloads</h3>` + list.map(d => `
    <div class="item">
      <div><strong>${d.fileName || '(unnamed)'}</strong> — ${d.state} — ${d.size || 0} bytes</div>
      <div>${d.filePath || ''}</div>
      <div><a href="${d.url}" target="_blank">${d.url}</a></div>
      <div>${new Date(d.at).toLocaleString()}</div>
    </div>
  `).join('')
}

// =============================
// Permissions (viewer + controls)
// =============================
function updateCurrentSitePermissionsUI() {
  if (!permOriginLabel) return

  const origin = getCurrentOrigin()
  if (!origin) {
    permOriginLabel.textContent = '(no valid site)'
    if (permCameraSelect) permCameraSelect.value = 'ask'
    if (permMicSelect)    permMicSelect.value   = 'ask'
    if (permGeoSelect)    permGeoSelect.value   = 'ask'
    if (permNotiSelect)   permNotiSelect.value  = 'ask'
    return
  }

  permOriginLabel.textContent = origin

  const perms = state.permissionsMap[origin] || {
    camera: 'ask',
    microphone: 'ask',
    geolocation: 'ask',
    notifications: 'ask'
  }

  if (permCameraSelect) permCameraSelect.value = perms.camera || 'ask'
  if (permMicSelect)    permMicSelect.value    = perms.microphone || 'ask'
  if (permGeoSelect)    permGeoSelect.value    = perms.geolocation || 'ask'
  if (permNotiSelect)   permNotiSelect.value   = perms.notifications || 'ask'
}

async function refreshPermissions() {
  const map = await api('/api/permissions')
  state.permissionsMap = map || {}

  // Fill the "saved sites" summary
  if (permSitesList) {
    const entries = Object.entries(state.permissionsMap)
    if (!entries.length) {
      permSitesList.innerHTML = '<span class="text-muted">No saved decisions yet.</span>'
    } else {
      permSitesList.innerHTML = entries.map(([origin, perms]) => `
        <div class="item border-bottom py-1">
          <div class="fw-semibold small">${origin}</div>
          <div class="small text-muted">
            camera: ${perms.camera || 'ask'} •
            mic: ${perms.microphone || 'ask'} •
            geo: ${perms.geolocation || 'ask'} •
            notif: ${perms.notifications || 'ask'}
          </div>
        </div>
      `).join('')
    }
  }

  // Refresh current-site controls
  updateCurrentSitePermissionsUI()
}

async function saveCurrentOriginPermissions() {
  const origin = getCurrentOrigin()
  if (!origin) {
    alert('No active site to save permissions for.')
    return
  }

  const payloads = []

  if (permCameraSelect) payloads.push({ key: 'camera',       value: permCameraSelect.value })
  if (permMicSelect)    payloads.push({ key: 'microphone',   value: permMicSelect.value })
  if (permGeoSelect)    payloads.push({ key: 'geolocation',  value: permGeoSelect.value })
  if (permNotiSelect)   payloads.push({ key: 'notifications', value: permNotiSelect.value })

  for (const p of payloads) {
    await api('/api/permissions/set', {
      method: 'POST',
      body: JSON.stringify({ origin, key: p.key, value: p.value })
    }).catch(err => console.error('Failed to update permission', err))
  }

  await refreshPermissions()
}

// Wire buttons (if present)
if (permSaveCurrent) {
  permSaveCurrent.onclick = saveCurrentOriginPermissions
}

if (permResetCurrent) {
  permResetCurrent.onclick = async () => {
    const origin = getCurrentOrigin()
    if (!origin) return
    const keys = ['camera', 'microphone', 'geolocation', 'notifications']
    for (const key of keys) {
      await api('/api/permissions/set', {
        method: 'POST',
        body: JSON.stringify({ origin, key, value: 'ask' })
      }).catch(() => {})
    }
    await refreshPermissions()
  }
}

if (permResetAll) {
  permResetAll.onclick = async () => {
    if (!confirm('Reset all saved permission decisions for this profile?')) return
    await api('/api/permissions/reset', { method: 'POST', body: '{}' })
    await refreshPermissions()
  }
}

// Live-refresh permissions panel when main process persists a decision
if (window.native && window.native.onPermissionsUpdated) {
  window.native.onPermissionsUpdated(() => {
    const panel = document.querySelector('#panel-permissions')
    if (panel && !panel.classList.contains('hidden')) refreshPermissions()
  })
}

// =============================
// Settings
// =============================
async function loadSettings() {
  const s = await api('/api/settings')
  $('#set-search').value        = s.searchEngine || ''
  $('#set-home').value          = s.home || ''
  $('#set-ua').value            = s.userAgent || 'default'
  $('#set-adblock').checked     = !!s.adblock
  $('#set-ai-enabled').checked  = !!s.aiEnabled
  $('#set-ai-model').value      = s.aiModel || 'llama3.1:8b'
}

$('#save-settings').onclick = async () => {
  const payload = {
    searchEngine: $('#set-search').value.trim(),
    home:         $('#set-home').value.trim(),
    userAgent:    $('#set-ua').value,
    adblock:      $('#set-adblock').checked,
    aiEnabled:    $('#set-ai-enabled').checked,
    aiModel:      $('#set-ai-model').value.trim()
  }
  await api('/api/settings', { method: 'POST', body: JSON.stringify(payload) })
  if (payload.userAgent && payload.userAgent !== 'default') await window.native.setUserAgent(payload.userAgent)
  else await window.native.setUserAgent('')
  alert('Settings have been saved successfully!')
}

// =============================
// Sync (export/import current profile)
// =============================
function setupSync() {
  $('#sync-export').onclick = async () => {
    const blobText = await api('/api/sync/export') // returns string
    const a = document.createElement('a')
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(blobText)
    a.download = 'zylo-profile-export.json'
    a.click()
  }
  $('#sync-import').onclick = async () => {
    const f = $('#sync-import-file').files?.[0]
    if (!f) return alert('Choose a JSON file first.')
    const text = await f.text()
    try {
      const obj = JSON.parse(text)
      await api('/api/sync/import', { method:'POST', body: JSON.stringify({ profile: obj }) })
      alert('Imported. Use the profile selector to switch if needed.')
      await loadProfiles()
    } catch { alert('Invalid JSON.') }
  }
}

// =============================
// Hotkeys
// =============================
document.addEventListener('keydown', async (e) => {
  if (e.metaKey || e.ctrlKey) {
    if (e.key.toLowerCase() === 'd') {
      const rec = getActive()
      if (!rec) return
      const { wv } = rec
      const url = safeGetURL(wv)
      const title = wv.getTitle()
      const favicon = rec.favicon || ''
      await api('/api/bookmarks', {
        method: 'POST',
        body: JSON.stringify({ title, url, favicon })
      })
      e.preventDefault()
      refreshBookmarks()
    }
    if (e.key.toLowerCase() === 'l') { urlEl.focus(); urlEl.select(); e.preventDefault() }
    if (e.key === 't') { createTab('about:blank'); e.preventDefault() }
    if (e.key === 'w') { closeTab(state.activeId); e.preventDefault() }
    if (e.key === 'r') { const { wv } = getActive(); wv.reloadIgnoringCache(); e.preventDefault() }
  }
})

// =============================
// AI (Ollama)
// =============================
async function loadModels() {
  try {
    const data = await (await fetch('http://localhost:3001/api/ai/models')).json()
    const models = data.models || data || []
    aiModelSel.innerHTML = models
      .map(m => `<option value="${m.model || m.name}">${m.model || m.name}</option>`)
      .join('')
    const s = await api('/api/settings')
    aiModelSel.value = s.aiModel || 'llama3.1:8b'
    aiEnabled.checked = !!s.aiEnabled
  } catch {
    aiModelSel.innerHTML = `<option value="llama3.1:8b">llama3.1:8b</option>`
    const s = await api('/api/settings')
    aiEnabled.checked = !!s.aiEnabled
  }
}

aiSaveBtn.onclick = async () => {
  const s = await api('/api/settings')
  await api('/api/settings', {
    method:'POST',
    body: JSON.stringify({ ...s, aiEnabled: aiEnabled.checked, aiModel: aiModelSel.value })
  })
  alert('AI settings saved.')
}

function pushMsg(role, content) {
  const el = document.createElement('div')
  el.className = `ai-msg ${role === 'user' ? 'user' : 'assistant'}`
  el.textContent = content
  aiMsgs.appendChild(el)
  aiMsgs.scrollTop = aiMsgs.scrollHeight
}

async function streamChat(messages) {
  const res = await fetch('http://localhost:3001/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ messages, model: aiModelSel.value })
  })
  if (!res.ok || !res.body) {
    pushMsg('assistant', '⚠️ AI unavailable. Is Ollama running?')
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  const live = document.createElement('div')
  live.className = 'ai-msg assistant'
  aiMsgs.appendChild(live)
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    acc += decoder.decode(value, { stream: true })
    const lines = acc.split('\n'); acc = lines.pop() || ''
    for (const ln of lines) {
      if (!ln.trim()) continue
      try {
        const j = JSON.parse(ln)
        if (j.message?.content) {
          live.textContent += j.message.content
          aiMsgs.scrollTop = aiMsgs.scrollHeight
        }
      } catch {}
    }
  }
}

aiSend.onclick = async () => {
  const text = aiText.value.trim()
  if (!text) return
  aiText.value = ''
  pushMsg('user', text)
  await streamChat([{ role:'user', content: text }])
}

aiText.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend.click() }
})

aiAskPage.onclick = async () => {
  const { wv } = getActive()
  try {
    const page = await wv.executeJavaScript(`(function(){
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script,style,noscript').forEach(n=>n.remove());
      const text = clone.innerText || '';
      return { title: document.title, url: location.href, text: text.slice(0, 20000) };
    })()`)
    const q = `You are Zylo AI, the built-in browsing companion for the Zylo Browser.
You are answering questions about this specific page.

URL: ${page.url}
Title: ${page.title}

Content:
${page.text}`
    pushMsg('user', 'Summarize this page and highlight key points.')
    await streamChat([{ role:'user', content: q }])
  } catch {
    pushMsg('assistant','Could not read page content (some sites block access).')
  }
}

// =============================
// Downloads Shelf (live)
// =============================
const downloadsState = {} // id -> { state, progress, ... }

function ensureShelfVisible() {
  if (!shelf) return
  shelf.classList.remove('hidden')
}

function createDownloadChip(d) {
  const chip = document.createElement('div')
  chip.className = 'download-chip'
  chip.dataset.id = d.id
  chip.innerHTML = `
    <span class="name">${d.fileName || 'Download'}</span>
    <span class="status">Starting…</span>
    <div class="progress"><span></span></div>
  `
  return chip
}

// Start
if (window.native && window.native.onDownloadStarted) {
  window.native.onDownloadStarted((d) => {
    downloadsState[d.id] = {
      id: d.id,
      fileName: d.fileName,
      url: d.url,
      totalBytes: d.totalBytes || 0,
      progress: 0,
      state: 'progressing'
    }

    ensureShelfVisible()

    const chip = createDownloadChip(d)
    shelfList.appendChild(chip)
  })
}

// Progress
if (window.native && window.native.onDownloadUpdated) {
  window.native.onDownloadUpdated((d) => {
    const entry = downloadsState[d.id]
    if (!entry) return

    const chip = shelfList.querySelector(`.download-chip[data-id="${d.id}"]`)
    if (!chip) return

    const bar   = chip.querySelector('.progress > span')
    const label = chip.querySelector('.status')

    let pct = 0
    if (d.totalBytes && d.totalBytes > 0) {
      pct = Math.round((d.receivedBytes / d.totalBytes) * 100)
    }

    entry.progress = pct
    entry.state = d.state

    if (bar)   bar.style.width = pct + '%'
    if (label) label.textContent = pct > 0 ? `${pct}%` : 'Starting…'
  })
}

// Done
if (window.native && window.native.onDownloadDone) {
  window.native.onDownloadDone((d) => {
    const entry = downloadsState[d.id]
    if (!entry) return

    entry.state = d.state

    const chip  = shelfList.querySelector(`.download-chip[data-id="${d.id}"]`)
    if (!chip) return

    const bar   = chip.querySelector('.progress > span')
    const label = chip.querySelector('.status')

    if (bar) bar.style.width = '100%'

    if (label) {
      if (d.state === 'completed') label.textContent = 'Done'
      else if (d.state === 'cancelled') label.textContent = 'Cancelled'
      else label.textContent = 'Failed'
    }

    // 🔥 NEW — Persist download to backend DB
    api('/api/downloads', {
      method: 'POST',
      body: JSON.stringify({
        id: d.id,
        fileName: entry.fileName,
        filePath: entry.filePath || '',
        url: entry.url,
        size: entry.totalBytes || 0,
        state: d.state,
        at: Date.now()
      })
    }).catch(err => console.error('Failed to persist download', err))
  })
}


// Hide shelf manually
if (shelfHide) {
  shelfHide.onclick = () => shelf.classList.add('hidden')
}

// =============================
// Boot
// =============================
async function openHomeTab() {
  const s = await api('/api/settings')
  createTab(s.home || 'https://example.com', 'Home')
}

;(async function boot() {
  await loadProfiles()
  await refreshPermissions()   // so the permissions tab reflects stored map
  openHomeTab()
  refreshBookmarks()
})()
