import { computed, ref } from 'vue'

const THEME_KEY = 'vg-theme'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

// Module-level state so every useTheme() instance shares one source of truth
// and the pre-paint theme choice made in index.html isn't redone/undone.
let mode = null // 'light' | 'dark' | 'system'
const isDarkRef = ref(false)

function resolveIsDark(m) {
  return m === 'system' ? darkQuery.matches : m === 'dark'
}

function applyIsDark(dark) {
  isDarkRef.value = dark
  document.documentElement.classList.toggle('app-dark', dark)
}

function onSystemChange() {
  if (mode === 'system') applyIsDark(darkQuery.matches)
}

function setMode(newMode) {
  mode = newMode
  localStorage.setItem(THEME_KEY, mode)
  applyIsDark(resolveIsDark(mode))
}

function init() {
  if (mode !== null) return

  const stored = localStorage.getItem(THEME_KEY)
  mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  applyIsDark(resolveIsDark(mode))
  darkQuery.addEventListener('change', onSystemChange)
}

export function useTheme() {
  init()

  const modeRef = computed({
    get: () => mode,
    set: (newMode) => setMode(newMode),
  })

  function toggleTheme() {
    setMode(isDarkRef.value ? 'light' : 'dark')
  }

  return {
    isDark: isDarkRef,
    mode: modeRef,
    setMode,
    toggleTheme,
  }
}
