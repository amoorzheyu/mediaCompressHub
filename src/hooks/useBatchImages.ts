import { useEffect, useRef, useState } from 'react'
import { compressBatchImage, isStaticImage } from '../lib/compress/batchImage'
import type { BatchImageResult, BatchImageSettings } from '../lib/compress/batchImage'
import { readImageMaxUploadBytes } from '../lib/fileUploadLimitSettings'
import { formatBytes } from '../lib/formatBytes'
import { clampBatchImageConcurrency } from '../lib/batchImageConcurrencySettings'

export type BatchImageItem = {
  id: string
  file: File
  status: 'waiting' | 'running' | 'done' | 'error'
  progress: number
  result?: BatchImageResult
  error?: string
}

export function useBatchImages(settings: BatchImageSettings, onBusyChange: (busy: boolean) => void) {
  const [items, setItems] = useState<BatchImageItem[]>([])
  const [busy, setBusy] = useState(false)
  const [lastSettingsKey, setLastSettingsKey] = useState<string | null>(null)
  const settingsKey = JSON.stringify(settings)
  const pendingItems = items.filter(item => item.status === 'waiting' || item.status === 'error')
  const restarting = (lastSettingsKey !== null && lastSettingsKey !== settingsKey) || pendingItems.length === 0
  const running = useRef(false)
  const stopRequested = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; stopRequested.current = true }
  }, [])

  function patch(id: string, changes: Partial<BatchImageItem>) {
    if (mounted.current) setItems(previous => previous.map(item => item.id === id ? { ...item, ...changes } : item))
  }

  function addFiles(files: File[]): string[] {
    if (running.current) return ['请等待当前批次完成后再添加图片']
    const errors: string[] = []
    const limit = readImageMaxUploadBytes()
    const accepted = files.filter(file => {
      if (!isStaticImage(file)) { errors.push(`${file.name}：不支持的静态图片格式`); return false }
      if (file.size > limit) { errors.push(`${file.name}：超过单文件上限 ${formatBytes(limit)}`); return false }
      return true
    }).map(file => ({ id: crypto.randomUUID(), file, status: 'waiting' as const, progress: 0 }))
    setItems(previous => [...previous, ...accepted])
    return errors
  }

  async function start(concurrency: number) {
    if (running.current) return
    const queue = restarting ? items : pendingItems
    if (!queue.length) return
    const queuedIds = new Set(queue.map(item => item.id))
    setItems(previous => previous.map(item => queuedIds.has(item.id)
      ? { ...item, status: 'waiting', progress: 0, result: undefined, error: undefined }
      : item))
    setLastSettingsKey(settingsKey)
    running.current = true
    stopRequested.current = false
    setBusy(true)
    onBusyChange(true)
    let nextIndex = 0
    async function runNext() {
      while (!stopRequested.current && nextIndex < queue.length) {
        const item = queue[nextIndex++]
        patch(item.id, { status: 'running', progress: 0, error: undefined })
        try {
          const result = await compressBatchImage(item.file, settings, progress => patch(item.id, { progress }))
          patch(item.id, { status: 'done', progress: 100, result })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          patch(item.id, {
            status: 'error',
            error: /could not be decoded|image decoding failed|could not decode/i.test(message)
              ? '图片无法解码，请检查文件是否损坏或更换格式'
              : message,
          })
        }
      }
    }
    try {
      const slots = Math.min(clampBatchImageConcurrency(concurrency), queue.length)
      await Promise.all(Array.from({ length: slots }, () => runNext()))
    } finally {
      running.current = false
      if (mounted.current) { setBusy(false); onBusyChange(false) }
    }
  }

  return {
    items, busy, restarting, addFiles, start,
    stop: () => { stopRequested.current = true },
    remove: (id: string) => { if (!running.current) setItems(previous => previous.filter(item => item.id !== id)) },
    clear: () => { if (!running.current) { setItems([]); setLastSettingsKey(null) } },
  }
}
