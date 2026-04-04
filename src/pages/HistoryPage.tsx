import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteJob, listJobs, type JobRecord } from '../lib/idb/db'
import { formatBytes } from '../lib/formatBytes'
import styles from './HistoryPage.module.css'

const kindLabel: Record<JobRecord['kind'], string> = {
  image: '图片',
  gif: 'GIF',
  video: '视频',
}

function JobThumb({ blob, fallback }: { blob: Blob | undefined; fallback: string }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])
  if (!url) {
    return (
      <div className={styles.thumbPlaceholder} aria-hidden>
        {fallback.slice(0, 1)}
      </div>
    )
  }
  return <img className={styles.thumb} src={url} alt="" />
}

export function HistoryPage() {
  const [rows, setRows] = useState<JobRecord[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listJobs()
      setRows(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onDelete = async (id: string) => {
    await deleteJob(id)
    await refresh()
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>处理历史</h1>
        <p className={styles.sub}>
          以下仅为本机 IndexedDB 中的元数据与可选缩略图；压缩成品默认不长期保存，需当时下载。
        </p>
      </header>

      {loading && <p className={styles.muted}>加载中…</p>}
      {!loading && rows.length === 0 && <p className={styles.empty}>暂无记录。去「压缩」页面试试吧。</p>}

      <ul className={styles.list}>
        {rows.map((job) => (
          <li key={job.id} className={styles.card}>
            <div className={styles.cardMain}>
              <JobThumb blob={job.thumbnailBlob} fallback={kindLabel[job.kind]} />
              <div className={styles.meta}>
                <div className={styles.name}>{job.inputName}</div>
                <div className={styles.line}>
                  <span className={styles.badge}>{kindLabel[job.kind]}</span>
                  <time dateTime={new Date(job.createdAt).toISOString()}>
                    {new Date(job.createdAt).toLocaleString()}
                  </time>
                </div>
                {job.status === 'done' ? (
                  <div className={styles.line}>
                    {formatBytes(job.inputBytes)} → {formatBytes(job.outputBytes)}
                    {job.outputMime && <span className={styles.mime}> · {job.outputMime}</span>}
                    {job.width != null && job.height != null && (
                      <span className={styles.dim}>
                        {' '}
                        · {job.width}×{job.height}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className={styles.errLine}>失败：{job.errorMessage ?? '未知错误'}</div>
                )}
              </div>
            </div>
            <button type="button" className={styles.delBtn} onClick={() => void onDelete(job.id)}>
              删除记录
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
