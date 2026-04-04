/// <reference lib="webworker" />

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import type { FfmpegWorkerIn, FfmpegWorkerToMain } from '../types/compress'

function postToMain(msg: FfmpegWorkerToMain, transfer?: Transferable[]) {
  ;(self as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? [])
}

let ffmpeg: FFmpeg | null = null
let loadPromise: Promise<void> | null = null
let currentJobId: string | null = null

const CORE_VERSION = '0.12.10'

async function ensureLoaded(): Promise<void> {
  if (ffmpeg?.loaded) return
  if (!loadPromise) {
    loadPromise = (async () => {
      const ff = new FFmpeg()
      ff.on('progress', ({ progress }) => {
        if (currentJobId != null) {
          postToMain({
            type: 'ffmpeg:progress',
            jobId: currentJobId,
            progress: Math.min(99, Math.round(progress * 100)),
          })
        }
      })
      const baseURL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`
      await ff.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      ffmpeg = ff
    })()
  }
  try {
    await loadPromise
  } catch (e) {
    loadPromise = null
    ffmpeg = null
    throw e
  }
}

function extFromName(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i) : '.bin'
}

function fileDataToArrayBuffer(data: Uint8Array | string): ArrayBuffer {
  if (typeof data === 'string') {
    throw new Error('FFmpeg 返回了非二进制数据')
  }
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy.buffer
}

self.onmessage = async (ev: MessageEvent<FfmpegWorkerIn>) => {
  const msg = ev.data
  if (msg.type === 'load') {
    try {
      await ensureLoaded()
      postToMain({ type: 'load:done' })
    } catch (e) {
      postToMain({
        type: 'load:error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
    return
  }

  if (msg.type !== 'run') return

  const { jobId, buffer, inputFileName, mode, crf, scaleWidth } = msg
  try {
    await ensureLoaded()
  } catch {
    postToMain({
      type: 'ffmpeg:error',
      jobId,
      message: 'FFmpeg 加载失败，请检查网络后重试',
    })
    return
  }
  const active = ffmpeg!
  currentJobId = jobId
  const ext = extFromName(inputFileName)
  const input = `in_${jobId}${ext}`

  try {
    postToMain({ type: 'ffmpeg:progress', jobId, progress: 2 })
    await active.writeFile(input, new Uint8Array(buffer))

    if (mode === 'gif') {
      const out = `out_${jobId}.gif`
      const scale = Math.max(64, scaleWidth)
      await active.exec([
        '-i',
        input,
        '-vf',
        `fps=12,scale=${scale}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=single[p];[s1][p]paletteuse=dither=bayer`,
        '-loop',
        '0',
        '-y',
        out,
      ])
      const data = await active.readFile(out)
      const outBuf = fileDataToArrayBuffer(data)
      await active.deleteFile(input).catch(() => {})
      await active.deleteFile(out).catch(() => {})
      currentJobId = null
      postToMain(
        {
          type: 'ffmpeg:done',
          jobId,
          buffer: outBuf,
          outputMime: 'image/gif',
          outputFileName: inputFileName.replace(/\.[^.]+$/i, '') + '-compressed.gif',
        },
        [outBuf],
      )
    } else {
      const out = `out_${jobId}.mp4`
      await active.exec([
        '-i',
        input,
        '-c:v',
        'libx264',
        '-crf',
        String(crf),
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-vf',
        `scale='min(${scaleWidth},iw)':-2`,
        '-an',
        '-y',
        out,
      ])
      const data = await active.readFile(out)
      const outBuf = fileDataToArrayBuffer(data)
      await active.deleteFile(input).catch(() => {})
      await active.deleteFile(out).catch(() => {})
      currentJobId = null
      postToMain(
        {
          type: 'ffmpeg:done',
          jobId,
          buffer: outBuf,
          outputMime: 'video/mp4',
          outputFileName: inputFileName.replace(/\.[^.]+$/i, '') + '-compressed.mp4',
        },
        [outBuf],
      )
    }
  } catch (e) {
    currentJobId = null
    await active.deleteFile(input).catch(() => {})
    postToMain({
      type: 'ffmpeg:error',
      jobId,
      message: e instanceof Error ? e.message : String(e),
    })
  }
}
