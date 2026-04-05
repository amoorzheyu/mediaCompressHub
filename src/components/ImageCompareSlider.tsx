import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'
import styles from './ImageCompareSlider.module.css'

type ImageCompareSliderProps = {
  originalSrc: string
  processedSrc: string
  altOriginal?: string
  altProcessed?: string
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function ImageCompareSlider({
  originalSrc,
  processedSrc,
  altOriginal = '原图',
  altProcessed = '压缩后',
}: ImageCompareSliderProps) {
  const [splitPct, setSplitPct] = useState(50)
  const rootRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const setFromClientX = useCallback((clientX: number) => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width <= 0) return
    const x = clientX - r.left
    setSplitPct(clamp((x / r.width) * 100, 2, 98))
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      setFromClientX(e.clientX)
    }
    const onUp = () => {
      draggingRef.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setFromClientX])

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!draggingRef.current) return
      const t = e.touches[0]
      if (t) setFromClientX(t.clientX)
    }
    const onEnd = () => {
      draggingRef.current = false
    }
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [setFromClientX])

  const onPointerDownDivider = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = true
      setFromClientX(e.clientX)
    },
    [setFromClientX],
  )

  const onPointerDownRoot = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest(`.${styles.divider}`)) return
      setFromClientX(e.clientX)
    },
    [setFromClientX],
  )

  const onTouchStartRoot = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const t = e.touches[0]
      if (!t) return
      if ((e.target as HTMLElement).closest(`.${styles.divider}`)) {
        draggingRef.current = true
      }
      setFromClientX(t.clientX)
    },
    [setFromClientX],
  )

  return (
    <div className={styles.root}>
      <div
        ref={rootRef}
        className={styles.stack}
        onMouseDown={onPointerDownRoot}
        onTouchStart={onTouchStartRoot}
        role="presentation"
      >
        <div className={styles.stage}>
          <img
            src={processedSrc}
            alt={altProcessed}
            className={styles.imgProcessed}
            draggable={false}
          />
          <div className={styles.clip} style={{ width: `${splitPct}%` }}>
            <img
              src={originalSrc}
              alt={altOriginal}
              className={styles.imgOriginal}
              draggable={false}
            />
          </div>
          <div className={styles.labels}>
            <span className={`${styles.label} ${styles.labelLeft}`}>原图</span>
            <span className={`${styles.label} ${styles.labelRight}`}>压缩后</span>
          </div>
          <div
            className={styles.divider}
            style={{ left: `${splitPct}%` }}
            onMouseDown={onPointerDownDivider}
            aria-hidden
          />
        </div>
      </div>
      <p className={styles.hint}>拖动中间竖线对比；点击画面可快速跳转分割位置</p>
    </div>
  )
}

type FileComparePreviewProps = {
  file: File
  processedSrc: string
  altProcessed?: string
}

/** 原图 blob URL 须在 effect 中创建/释放；勿用 useMemo，否则 Strict Mode 下 revoke 后仍复用失效 URL。 */
export function FileComparePreview({ file, processedSrc, altProcessed }: FileComparePreviewProps) {
  const [originalSrc, setOriginalSrc] = useState<string | null>(null)

  useLayoutEffect(() => {
    const u = URL.createObjectURL(file)
    setOriginalSrc(u)
    return () => {
      URL.revokeObjectURL(u)
      setOriginalSrc(null)
    }
  }, [file])

  if (!originalSrc) {
    return (
      <div className={styles.root}>
        <div className={styles.stack}>
          <div className={styles.stage}>
            <img
              src={processedSrc}
              alt={altProcessed ?? '压缩后'}
              className={styles.imgProcessed}
              draggable={false}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <ImageCompareSlider
      originalSrc={originalSrc}
      processedSrc={processedSrc}
      altOriginal={file.name}
      altProcessed={altProcessed}
    />
  )
}
