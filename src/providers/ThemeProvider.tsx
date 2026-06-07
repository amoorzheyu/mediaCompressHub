import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { APP_THEME_STORAGE_KEY, appThemes, isAppThemeMode, type AppThemeMode } from '../theme/appTheme'

type ThemeContextValue = {
  mode: AppThemeMode
  setMode: (mode: AppThemeMode) => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): AppThemeMode {
  try {
    const value = localStorage.getItem(APP_THEME_STORAGE_KEY)
    if (isAppThemeMode(value)) return value
  } catch {
    /* ignore */
  }
  return 'dark'
}

function persistTheme(mode: AppThemeMode) {
  try {
    localStorage.setItem(APP_THEME_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppThemeMode>(() => readStoredTheme())

  useLayoutEffect(() => {
    const root = document.documentElement
    const config = appThemes[mode]

    root.dataset.theme = mode
    root.style.setProperty('color-scheme', config.colorScheme)
    Object.entries(config.cssVariables).forEach(([name, value]) => {
      root.style.setProperty(name, value)
    })
    persistTheme(mode)
  }, [mode])

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode: setModeState,
      toggleMode: () => setModeState((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [mode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useAppTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useAppTheme must be used within ThemeProvider')
  }
  return context
}
