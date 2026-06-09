import { ref, computed } from 'vue'

let isDark = null
const THEME_KEY = 'vg-theme'

function getInitialTheme() {
  if (isDark !== null) return isDark

  const stored = localStorage.getItem(THEME_KEY)
  if (stored !== null) {
    isDark = stored === 'dark'
  } else {
    // Check system preference
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return isDark
}

export function useTheme() {
  const isDarkRef = ref(getInitialTheme())

  function applyTheme() {
    isDark = isDarkRef.value
    if (isDark) {
      document.documentElement.classList.add('app-dark')
    } else {
      document.documentElement.classList.remove('app-dark')
    }
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
  }

  function toggleTheme() {
    isDarkRef.value = !isDarkRef.value
    applyTheme()
  }

  // Apply theme on first mount
  applyTheme()

  return {
    isDark: isDarkRef,
    toggleTheme,
  }
}
