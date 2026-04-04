import { NavLink, Outlet } from 'react-router-dom'
import styles from './Layout.module.css'

export function Layout() {
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
        <nav className={styles.nav} aria-label="主导航">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}
          >
            压缩
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}
          >
            历史
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}
          >
            设置
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
