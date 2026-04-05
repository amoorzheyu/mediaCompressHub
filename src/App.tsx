import { lazy, Suspense } from 'react'
import { Spin } from 'antd'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AntdProvider } from './providers/AntdProvider'

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function RouteFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <Spin size="large" aria-label="页面加载中" />
    </div>
  )
}

const Router = import.meta.env.VITE_USE_HASH_ROUTER === 'true' ? HashRouter : BrowserRouter

export default function App() {
  return (
    <AntdProvider>
      <Router>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </AntdProvider>
  )
}
