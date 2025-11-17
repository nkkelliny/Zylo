// src/db.js
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

/**
 * Default DB structure
 */
function defaultData() {
  const baseSettings = {
    searchEngine: 'https://duckduckgo.com/?q=',
    home: 'https://example.com',
    userAgent: 'default',
    adblock: true,
    aiEnabled: true,
    aiModel: 'llama3.1:8b',
    aiSystemPrompt:
      "You are Zylo’s page assistant. Be concise, truthful, and cite page fragments when helpful."
  }

  return {
    activeProfileId: 'default',
    profiles: [
      {
        id: 'default',
        name: 'Default',
        createdAt: Date.now(),
        settings: { ...baseSettings },
        bookmarks: [],
        history: [],
        downloads: [],
        // origin -> { camera|microphone|geolocation: 'ask'|'allow'|'deny' }
        permissions: {}
      }
    ]
  }
}

/**
 * Decide where to store the DB file.
 * - In Electron (dev or packaged), use app.getPath('userData')  → writeable, per-user.
 * - In plain Node (e.g. running just the Express server), use ../data.
 */
let dataDir

if (process.versions && process.versions.electron) {
  // Running under Electron
  const { app } = await import('electron')
  dataDir = app.getPath('userData') // e.g. C:\Users\You\AppData\Roaming\Zylo Browser
} else {
  // Plain Node (dev server)
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  dataDir = path.join(__dirname, '..', 'data')
}

const dbFile = path.join(dataDir, 'store.json')

// Ensure the directory exists (NOT the file itself)
fs.mkdirSync(path.dirname(dbFile), { recursive: true })

// LowDB v7+ setup
const adapter = new JSONFile(dbFile)
export const db = new Low(adapter, defaultData())

export async function initDB() {
  // Load from disk (or defaultData() if file missing/invalid)
  await db.read()

  if (!db.data || typeof db.data !== 'object') {
    db.data = defaultData()
  }

  // Backfill / sanity checks
  db.data.activeProfileId ||= 'default'

  if (!Array.isArray(db.data.profiles) || db.data.profiles.length === 0) {
    db.data = defaultData()
  } else {
    const base = defaultData().profiles[0]
    for (const p of db.data.profiles) {
      p.settings   ||= { ...base.settings }
      p.bookmarks  ||= []
      p.history    ||= []
      p.downloads  ||= []
      p.permissions ||= {}
    }
  }

  await db.write()
}

export function getActiveProfile() {
  const { profiles, activeProfileId } = db.data
  return profiles.find(p => p.id === activeProfileId) || profiles[0]
}

export function findProfile(id) {
  return db.data.profiles.find(p => p.id === id)
}

export function ensurePermissionRecord(profile, origin) {
  profile.permissions[origin] ||= {
    camera: 'ask',
    microphone: 'ask',
    geolocation: 'ask',
    notifications: 'ask'
  }
  return profile.permissions[origin]
}

