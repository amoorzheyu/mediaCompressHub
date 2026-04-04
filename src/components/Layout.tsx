import { Menu } from 'antd'
import { CompressOutlined, HistoryOutlined, SettingOutlined } from '@ant-design/icons'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import styles from './Layout.module.css'

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname === '/' ? '/' : location.pathname

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.brand} end>
          <span className={styles.brandIcon} aria-hidden>
            ◈
          </span>
          <span>
            <strong>压缩坞</strong>
            <small className={styles.brandSub}>本地处理 · 零上传</small>
          </span>
        </NavLink>
        <Menu
          mode="horizontal"
          disabledOverflow
          selectedKeys={[path]}
          items={[
            { key: '/', label: '压缩', icon: <CompressOutlined /> },
            { key: '/history', label: '历史', icon: <HistoryOutlined /> },
            { key: '/settings', label: '设置', icon: <SettingOutlined /> },
          ]}
          onClick={({ key }) => navigate(key)}
          className={styles.topMenu}
        />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
