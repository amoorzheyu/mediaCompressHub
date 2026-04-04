import { useCallback, useEffect, useState } from 'react'
import { clearAllJobs } from '../lib/idb/db'
import { formatBytes } from '../lib/formatBytes'
import styles from './SettingsPage.module.css'

export function SettingsPage() {
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>({})
  const [cleared, setCleared] = useState(false)

  const refreshEstimate = useCallback(async () => {
    if (!navigator.storage?.estimate) {
      setUsage({})
      return
    }
    const est = await navigator.storage.estimate()
    setUsage({ usage: est.usage, quota: est.quota })
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!navigator.storage?.estimate) {
        if (!cancelled) setUsage({})
        return
      }
      const est = await navigator.storage.estimate()
      if (!cancelled) {
        setUsage({ usage: est.usage, quota: est.quota })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onClearHistory = async () => {
    if (!confirm('确定清空全部本地历史记录？此操作不可撤销。')) return
    await clearAllJobs()
    setCleared(true)
    void refreshEstimate()
    setTimeout(() => setCleared(false), 4000)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>设置与隐私</h1>

      <section className={styles.section} aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className={styles.h2}>
          数据如何存放
        </h2>
        <ul className={styles.list}>
          <li>压缩任务在<strong>专用 Web Worker</strong>中执行，避免拖慢界面。</li>
          <li>历史记录保存在浏览器 <strong>IndexedDB</strong>（域名隔离），不会发送到我们的服务器——本项目<strong>没有后端接口</strong>。</li>
          <li>GIF / 视频使用 FFmpeg.wasm，核心文件从 CDN 拉取后缓存在本地；编解码仍在您的浏览器内完成。</li>
          <li>「100% 隐私」指处理与元数据不上传；您设备上的恶意软件、同步盘或浏览器扩展仍可能访问本地文件，这是任何纯前端工具的共同边界。</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="storage-heading">
        <h2 id="storage-heading" className={styles.h2}>
          本站点存储占用（估算）
        </h2>
        {usage.usage != null && usage.quota != null ? (
          <p className={styles.p}>
            已用约 <strong>{formatBytes(usage.usage)}</strong> / 配额约 <strong>{formatBytes(usage.quota)}</strong>
            （含本站 IndexedDB 与其他同源存储）。
          </p>
        ) : (
          <p className={styles.pMuted}>当前浏览器未提供 storage.estimate，或仅在安全上下文中可用。</p>
        )}
        <button type="button" className={styles.btn} onClick={() => void refreshEstimate()}>
          刷新估算
        </button>
      </section>

      <section className={styles.section} aria-labelledby="danger-heading">
        <h2 id="danger-heading" className={styles.h2}>
          数据控制
        </h2>
        <p className={styles.p}>一键删除 IndexedDB 中的全部历史条目（含缩略图元数据）。</p>
        <button type="button" className={styles.dangerBtn} onClick={() => void onClearHistory()}>
          清空本地历史
        </button>
        {cleared && <p className={styles.ok}>已清空。</p>}
      </section>
    </div>
  )
}
