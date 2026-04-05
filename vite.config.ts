import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron' || mode === 'electron-dev'

  return {
    base: mode === 'electron' ? './' : '/',
    plugins: [
      react(),
      VitePWA({
        disable: isElectron,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: '压缩坞 · 本地媒体压缩',
          short_name: '压缩坞',
          description: '纯本地图片、GIF、视频压缩，文件从不上传',
          theme_color: '#07080c',
          background_color: '#07080c',
          display: 'standalone',
          start_url: '/',
          lang: 'zh-CN',
          icons: [
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,svg}'],
        },
      }),
    ],
  }
})
