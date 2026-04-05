/** Vite `--mode electron` / `electron-dev`（见 package.json scripts） */
export const isElectronApp =
  import.meta.env.MODE === 'electron' || import.meta.env.MODE === 'electron-dev'
