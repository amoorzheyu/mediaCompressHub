import { theme } from 'antd'

export type AppThemeMode = 'dark' | 'light'

export const APP_THEME_STORAGE_KEY = 'media-compress-hub:theme'

type AppThemeConfig = {
  colorScheme: AppThemeMode
  cssVariables: Record<`--${string}`, string>
  antdTokens: {
    colorPrimary: string
    colorInfo: string
    colorSuccess: string
    colorWarning: string
    colorError: string
    colorBgContainer: string
    colorBgElevated: string
    colorBorder: string
    colorBorderSecondary: string
    colorText: string
    colorTextSecondary: string
  }
}

const commonTokens = {
  borderRadius: 10,
  fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
  fontSize: 14,
}

export const appThemes: Record<AppThemeMode, AppThemeConfig> = {
  dark: {
    colorScheme: 'dark',
    cssVariables: {
      '--bg-root': '#07080c',
      '--bg-elevated': '#0e1018',
      '--bg-panel': '#0c0e14',
      '--bg-hover': '#141824',
      '--border': '#1e2433',
      '--border-strong': '#2a3347',
      '--text': '#e8ebf4',
      '--text-soft': '#c4c9d8',
      '--muted': '#8b93a8',
      '--accent': '#5ee1c0',
      '--accent-dim': '#2fb89c',
      '--accent-glow': 'rgba(94, 225, 192, 0.35)',
      '--ok': '#7cdb9a',
      '--danger': '#f0808a',
      '--shadow-panel': '0 18px 50px rgba(0, 0, 0, 0.45)',
    },
    antdTokens: {
      colorPrimary: '#34d399',
      colorInfo: '#34d399',
      colorSuccess: '#4ade80',
      colorWarning: '#fbbf24',
      colorError: '#f87171',
      colorBgContainer: '#0c0e14',
      colorBgElevated: '#12151f',
      colorBorder: '#1e2433',
      colorBorderSecondary: '#252b3a',
      colorText: '#e8ebf4',
      colorTextSecondary: '#c4c9d8',
    },
  },
  light: {
    colorScheme: 'light',
    cssVariables: {
      '--bg-root': '#f5f7f4',
      '--bg-elevated': '#ffffff',
      '--bg-panel': '#ffffff',
      '--bg-hover': '#eef4ef',
      '--border': '#dbe4dc',
      '--border-strong': '#b9c9bc',
      '--text': '#17231d',
      '--text-soft': '#42514a',
      '--muted': '#66736c',
      '--accent': '#0f9f7a',
      '--accent-dim': '#0b7f62',
      '--accent-glow': 'rgba(15, 159, 122, 0.2)',
      '--ok': '#16834a',
      '--danger': '#c23b4b',
      '--shadow-panel': '0 18px 44px rgba(34, 49, 41, 0.1)',
    },
    antdTokens: {
      colorPrimary: '#0f9f7a',
      colorInfo: '#0f9f7a',
      colorSuccess: '#16834a',
      colorWarning: '#b7791f',
      colorError: '#c23b4b',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#dbe4dc',
      colorBorderSecondary: '#e6eee7',
      colorText: '#17231d',
      colorTextSecondary: '#42514a',
    },
  },
}

export function isAppThemeMode(value: string | null): value is AppThemeMode {
  return value === 'dark' || value === 'light'
}

export function getAntdTheme(mode: AppThemeMode) {
  return {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      ...commonTokens,
      ...appThemes[mode].antdTokens,
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
  }
}
