import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

if (import.meta.env.MODE === 'electron' || import.meta.env.MODE === 'electron-dev') {
  document.documentElement.dataset.electronApp = 'true'
}

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
