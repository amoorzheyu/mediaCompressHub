import { useState } from 'react'
import { Menu, Modal, Typography } from 'antd'
import {
  CompressOutlined,
  GithubOutlined,
  HeartOutlined,
  HistoryOutlined,
  SettingOutlined,
  WechatOutlined,
} from '@ant-design/icons'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AUTHOR_CONTACT_QRCODE_URL, AUTHOR_TIP_QRCODE_URL } from '../lib/authorQrUrls'
import styles from './Layout.module.css'

const { Text } = Typography

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname === '/' ? '/' : location.pathname
  const [qrModal, setQrModal] = useState<null | 'tip' | 'contact'>(null)

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.brand} end>
          <span className={styles.brandIcon} aria-hidden>
            ◈
          </span>
          <span className={styles.brandText}>
            <strong className={styles.brandName}>压缩坞</strong>
            <span className={styles.brandSub}>本地处理 · 零上传</span>
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
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <a
            className={styles.footerLink}
            href="https://github.com/amoorzheyu/mediaCompressHub"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubOutlined aria-hidden />
            amoorzheyu/mediaCompressHub
          </a>
          <span className={styles.footerSep} aria-hidden>
            ·
          </span>
          <button type="button" className={styles.footerAction} onClick={() => setQrModal('tip')}>
            <HeartOutlined aria-hidden />
            打赏支持
          </button>
          <span className={styles.footerSep} aria-hidden>
            ·
          </span>
          <button type="button" className={styles.footerAction} onClick={() => setQrModal('contact')}>
            <WechatOutlined aria-hidden />
            联系作者
          </button>
        </div>
      </footer>
      <Modal
        title={qrModal === 'tip' ? '感谢支持' : '联系作者'}
        open={qrModal !== null}
        onCancel={() => setQrModal(null)}
        footer={null}
        centered
        destroyOnClose
        width={360}
      >
        <Text type="secondary" className={styles.qrModalHint}>
          {qrModal === 'tip' ? '若觉得有用，欢迎请作者喝杯咖啡。' : '扫码添加或联系作者微信。'}
        </Text>
        <div className={styles.qrFrame}>
          <img
            src={qrModal === 'tip' ? AUTHOR_TIP_QRCODE_URL : AUTHOR_CONTACT_QRCODE_URL}
            alt={qrModal === 'tip' ? '微信收款码' : '作者微信二维码'}
            className={styles.qrImage}
            width={280}
            height={280}
            decoding="async"
          />
        </div>
      </Modal>
    </div>
  )
}
