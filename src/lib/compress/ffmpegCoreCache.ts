/** FFmpeg core 资源持久化到 IndexedDB，避免每次刷新都从 CDN 重新下载。 */

const DB_NAME = 'mediaCompressHub-ffmpeg-core'
const STORE = 'core'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
  })
}

async function idbGet(key: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const r = store.get(key)
      r.onerror = () => reject(r.error)
      r.onsuccess = () => resolve(r.result as ArrayBuffer | undefined)
    })
  } finally {
    db.close()
  }
}

async function idbPut(key: string, value: ArrayBuffer): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(STORE).put(value, key)
    })
  } finally {
    db.close()
  }
}

/**
 * 与 @ffmpeg/util 的 toBlobURL 行为一致，但优先使用 IndexedDB 中的副本。
 */
export async function cachedFfmpegCoreBlobURL(
  remoteUrl: string,
  mimeType: string,
  coreVersion: string,
  asset: 'js' | 'wasm',
): Promise<string> {
  const key = `v${coreVersion}:${asset}`
  let buf: ArrayBuffer | undefined
  try {
    buf = await idbGet(key)
  } catch {
    // 隐私模式等场景下 IDB 可能不可用，走网络
  }

  if (!buf) {
    const res = await fetch(remoteUrl)
    if (!res.ok) {
      throw new Error(`FFmpeg core 下载失败: ${res.status} ${remoteUrl}`)
    }
    buf = await res.arrayBuffer()
    try {
      await idbPut(key, buf)
    } catch {
      // 写入失败不影响本次使用
    }
  }

  const blob = new Blob([buf], { type: mimeType })
  return URL.createObjectURL(blob)
}
