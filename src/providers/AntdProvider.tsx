import { App, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'

export function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#34d399',
          colorInfo: '#34d399',
          colorSuccess: '#4ade80',
          colorWarning: '#fbbf24',
          colorError: '#f87171',
          colorBgContainer: '#0c0e14',
          colorBgElevated: '#12151f',
          colorBorder: '#1e2433',
          colorBorderSecondary: '#252b3a',
          borderRadius: 10,
          fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
          fontSize: 14,
        },
        components: {
          Button: {
            controlHeight: 38,
            paddingContentHorizontal: 18,
          },
          Card: {
            headerFontSize: 15,
          },
          Tabs: {
            titleFontSize: 15,
            horizontalMargin: '0 0 12px 0',
          },
          Upload: {
            paddingLG: 24,
          },
        },
      }}
    >
      {/* message 轻提示：位置见 index.css（右下角） */}
      <App message={{ duration: 2.4, maxCount: 3 }}>{children}</App>
    </ConfigProvider>
  )
}
