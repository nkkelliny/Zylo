// src/server.js
import express from 'express'
import helmet from 'helmet'
import { db, initDB, getActiveProfile, findProfile } from './db.js'
import { randomUUID } from 'node:crypto'

const app = express()
app.use(helmet())
app.use(express.json())

// Make sure DB is ready before handling requests
await initDB()

// ---- Profiles ----
app.get('/api/profiles', async (_req, res) => {
  await db.read()
  res.json({
    activeProfileId: db.data.activeProfileId,
    profiles: db.data.profiles.map(p => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt
    }))
  })
})

app.post('/api/profiles', async (req, res) => {
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })

  await db.read()
  const id =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) +
    '-' +
    Math.random().toString(36).slice(2, 6)

  db.data.profiles.push({
    id,
    name,
    createdAt: Date.now(),
    settings: { ...getActiveProfile().settings },
    bookmarks: [],
    history: [],
    downloads: [],
    permissions: {}
  })
  await db.write()
  res.json({ ok: true, id })
})

app.post('/api/profiles/activate', async (req, res) => {
  const { id } = req.body || {}
  await db.read()
  if (!findProfile(id)) return res.status(404).json({ error: 'not found' })
  db.data.activeProfileId = id
  await db.write()
  res.json({ ok: true })
})

app.delete('/api/profiles/:id', async (req, res) => {
  const { id } = req.params
  await db.read()
  if (db.data.activeProfileId === id) {
    return res.status(400).json({ error: 'cannot delete active profile' })
  }
  db.data.profiles = db.data.profiles.filter(p => p.id !== id)
  await db.write()
  res.json({ ok: true })
})

// ---- Bookmarks (per active profile, with favicon) ----
app.get('/api/bookmarks', async (_req, res) => {
  await db.read()
  res.json(getActiveProfile().bookmarks)
})

app.post('/api/bookmarks', async (req, res) => {
  const { title, url, favicon } = req.body || {}
  if (!url) return res.status(400).json({ error: 'url required' })

  await db.read()
  const p = getActiveProfile()
  const exists = p.bookmarks.find(b => b.url === url)
  if (!exists) {
    p.bookmarks.push({
      id: randomUUID(),
      title: title || url,
      url,
      favicon: favicon || '',   // store favicon URL
      createdAt: Date.now()
    })
  }
  await db.write()
  res.json({ ok: true })
})

app.delete('/api/bookmarks/:id', async (req, res) => {
  await db.read()
  const p = getActiveProfile()
  p.bookmarks = p.bookmarks.filter(b => b.id !== req.params.id)
  await db.write()
  res.json({ ok: true })
})

// ---- History (with favicon) ----
app.get('/api/history', async (_req, res) => {
  await db.read()
  res.json(
    getActiveProfile()
      .history.slice()
      .reverse()
      .slice(0, 1000)
  )
})

app.post('/api/history', async (req, res) => {
  const { title, url, favicon } = req.body || {}
  if (!url) return res.status(400).json({ error: 'url required' })

  await db.read()
  const p = getActiveProfile()
  p.history.push({
    id: randomUUID(),
    title: title || url,
    url,
    favicon: favicon || '',   // store favicon URL
    visitedAt: Date.now()
  })
  await db.write()
  res.json({ ok: true })
})

app.delete('/api/history', async (_req, res) => {
  await db.read()
  getActiveProfile().history = []
  await db.write()
  res.json({ ok: true })
})

// ---- Downloads (persist finished from main; list all) ----
app.get('/api/downloads', async (_req, res) => {
  await db.read()
  res.json(getActiveProfile().downloads.slice().reverse())
})

app.post('/api/downloads', async (req, res) => {
  const { id, fileName, filePath, url, size, state, at } = req.body || {}
  if (!url) return res.status(400).json({ error: 'url required' })

  await db.read()
  const p = getActiveProfile()
  p.downloads = p.downloads || []
  p.downloads.push({
    id: id || randomUUID(),
    fileName: fileName || '(unnamed)',
    filePath: filePath || '',
    url,
    size: size ?? 0,
    state: state || 'completed',
    at: at || Date.now()
  })
  await db.write()
  res.json({ ok: true })
})

// ---- Settings ----
app.get('/api/settings', async (_req, res) => {
  await db.read()
  res.json(getActiveProfile().settings)
})

app.post('/api/settings', async (req, res) => {
  const patch = req.body || {}
  await db.read()
  Object.assign(getActiveProfile().settings, patch)
  await db.write()
  res.json({ ok: true })
})

// ---- Permissions (view, set & reset) ----
app.get('/api/permissions', async (_req, res) => {
  await db.read()
  res.json(getActiveProfile().permissions || {})
})

app.post('/api/permissions/reset', async (_req, res) => {
  await db.read()
  getActiveProfile().permissions = {}
  await db.write()
  res.json({ ok: true })
})

// Set a specific permission for an origin (camera/microphone/geolocation/notifications)
app.post('/api/permissions/set', async (req, res) => {
  const { origin, key, value } = req.body || {}
  const validKeys   = ['camera', 'microphone', 'geolocation', 'notifications']
  const validValues = ['ask', 'allow', 'deny']

  if (!origin || !validKeys.includes(key) || !validValues.includes(value)) {
    return res.status(400).json({ error: 'Invalid origin/key/value' })
  }

  await db.read()
  const profile = getActiveProfile()
  profile.permissions ||= {}
  profile.permissions[origin] ||= {
    camera: 'ask',
    microphone: 'ask',
    geolocation: 'ask',
    notifications: 'ask'
  }

  profile.permissions[origin][key] = value
  await db.write()

  res.json({ ok: true })
})

// ---- OLLAMA AI ----
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, model } = req.body || {}
    await db.read()
    const s = getActiveProfile().settings
    if (!s.aiEnabled) {
      return res.status(400).json({ error: 'AI disabled in settings' })
    }

    const defaultSystemPrompt = `
You are Zylo AI, the built-in browsing companion for the Zylo Browser.
- You help the user understand and work with the content of the current browser tab.
- The user or the browser will send you page text, summaries, or snippets when asking about a site.
- When answering, be concise, clear, and practical.
- Use the page context you are given plus your general knowledge, but never pretend you can see the screen yourself.
- If something is not in the provided page text or is ambiguous, say so explicitly and ask for clarification when helpful.
`.trim()

    const body = {
      model: model || s.aiModel || 'llama3.1:8b',
      stream: true,
      messages: [
        { role: 'system', content: defaultSystemPrompt },
        ...(messages || [])
      ]
    }

    const r = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => '')
      return res.status(502).json({ error: 'Ollama error', detail: text })
    }

    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Transfer-Encoding', 'chunked')

    const reader = r.body.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) res.write(value)
    }
    res.end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'AI proxy failed' })
  }
})

app.get('/api/ai/models', async (_req, res) => {
  try {
    const r = await fetch('http://localhost:11434/api/tags')
    const data = await r.json()
    res.json(data)
  } catch {
    res.status(200).json({ models: [{ name: 'llama3.1:8b' }] })
  }
})

// ---- Start server (used for dev AND packaged) ----
const PORT = 3001
let serverInstance = null

export async function startServer(port = PORT) {
  if (serverInstance) return serverInstance
  serverInstance = app.listen(port, () => {
    console.log(`[express] http://localhost:${port}`)
  })
  return serverInstance
}

// Start immediately when this module is loaded (dev `node src/server.js`
// AND when imported from Electron main in packaged app)
await startServer()
