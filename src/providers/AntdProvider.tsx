import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'
import { useAppTheme } from './ThemeProvider'
import { getAntdTheme } from '../theme/appTheme'

export function AntdProvider({ children }: { children: ReactNode }) {
  const { mode } = useAppTheme()

  return (
    <ConfigProvider
      locale={zhCN}
      theme={getAntdTheme(mode)}
    >
      {/* message 轻提示：位置见 index.css（右下角） */}
      <App message={{ duration: 2.4, maxCount: 3 }}>{children}</App>
    </ConfigProvider>
  )
}
