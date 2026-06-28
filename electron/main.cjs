'use strict'

const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')

function isDevServer() {
  return Boolean(process.env.VITE_DEV_SERVER_URL)
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 12, y: 13 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  if (isDevServer()) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function resolveFfmpegPath() {
  const ffmpegPath = ffmpegInstaller.path
  if (app.isPackaged) {
    return ffmpegPath.replace('app.asar', 'app.asar.unpacked')
  }
  return ffmpegPath
}

function extFromName(name) {
  const ext = path.extname(name)
  return ext || '.bin'
}

function outputNameFromInput(name) {
  const ext = path.extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  return `${base}-compressed.mp4`
}

function parseTimeToSeconds(value) {
  const match = value.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

function parseDuration(stderr) {
  const match = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/)
  if (!match) return null
  return parseTimeToSeconds(match[1])
}

function parseProgressTime(stderr) {
  const matches = stderr.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)
  if (!matches || matches.length === 0) return null
  const last = matches[matches.length - 1].replace('time=', '')
  return parseTimeToSeconds(last)
}

async function cleanupDir(dir) {
  if (!dir) return
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
}

ipcMain.handle('native-video:compress', async (event, payload) => {
  const { jobId, buffer, inputFileName, crf, keepAudio = true } = payload
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-compress-hub-'))
  const input = path.join(tmpDir, `input${extFromName(inputFileName)}`)
  const output = path.join(tmpDir, 'output.mp4')
  const sender = event.sender

  try {
    await fsp.writeFile(input, Buffer.from(buffer))

    const args = keepAudio
      ? [
          '-i',
          input,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
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
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-y',
          output,
        ]
      : [
          '-i',
          input,
          '-map',
          '0:v:0',
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
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-y',
          output,
        ]

    sender.send('native-video:progress', { jobId, progress: 2 })

    await new Promise((resolve, reject) => {
      const child = spawn(resolveFfmpegPath(), args, { windowsHide: true })
      let stderr = ''
      let duration = null

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString()
        stderr += text
        duration = duration ?? parseDuration(stderr)
        const current = parseProgressTime(text)
        if (duration && current != null) {
          const progress = Math.min(99, Math.max(2, Math.round((current / duration) * 100)))
          sender.send('native-video:progress', { jobId, progress })
        }
      })

      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) {
          resolve()
          return
        }
        reject(new Error(stderr.trim() || `FFmpeg 退出码 ${code}`))
      })
    })

    const outBuffer = await fsp.readFile(output)
    const arrayBuffer = outBuffer.buffer.slice(
      outBuffer.byteOffset,
      outBuffer.byteOffset + outBuffer.byteLength,
    )
    sender.send('native-video:progress', { jobId, progress: 100 })

    return {
      buffer: arrayBuffer,
      outputMime: 'video/mp4',
      outputFileName: outputNameFromInput(inputFileName),
    }
  } finally {
    await cleanupDir(tmpDir)
  }
})

app.whenReady().then(async () => {
  await fsp.access(resolveFfmpegPath(), fs.constants.X_OK).catch((e) => {
    console.error('内置 FFmpeg 不可用:', e)
  })

  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
