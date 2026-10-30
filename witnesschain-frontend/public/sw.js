// public/sw.js — Offline queue via IndexedDB
const DB_NAME = 'witnesschain_offline'
const STORE_NAME = 'queue'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME, { autoIncrement: true })
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = reject
  })
}

async function queueRequest(data) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(data)
    tx.oncomplete = resolve
    tx.onerror = reject
  })
}

async function retryQueue() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const all = await new Promise(r => { const req = store.getAll(); req.onsuccess = () => r(req.result) })
  const keys = await new Promise(r => { const req = store.getAllKeys(); req.onsuccess = () => r(req.result) })
  for (let i = 0; i < all.length; i++) {
    try {
      await fetch(all[i].url, { method: 'POST', body: new Uint8Array(all[i].body) })
      store.delete(keys[i])
    } catch {}
  }
}

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/analyze') && event.request.method === 'POST') {
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        const body = await event.request.arrayBuffer()
        await queueRequest({ url: event.request.url, body: Array.from(new Uint8Array(body)), ts: Date.now() })
        return new Response(JSON.stringify({ queued: true }), { headers: { 'Content-Type': 'application/json' } })
      })
    )
  }
})

self.addEventListener('sync', event => {
  if (event.tag === 'retry-queue') event.waitUntil(retryQueue())
})