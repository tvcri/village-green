import { computed, ref } from 'vue'

const THEME_KEY = 'vg-theme'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

// Module-level state so every useTheme() instance shares one source of truth
// and the pre-paint theme choice made in index.html isn't redone/undone.
// Must be a ref: components render from reads of `mode`, so a plain variable
// here silently freezes every consumer's view of the current setting.
const modeState = ref(null) // 'light' | 'dark' | 'system'
const isDarkRef = ref(false)

function resolveIsDark(m) {
  return m === 'system' ? darkQuery.matches : m === 'dark'
}

function applyIsDark(dark) {
  isDarkRef.value = dark
  document.documentElement.classList.toggle('app-dark', dark)
}

function onSystemChange() {
  if (modeState.value === 'system') applyIsDark(darkQuery.matches)
}

function setMode(newMode) {
  modeState.value = newMode
  localStorage.setItem(THEME_KEY, newMode)
  applyIsDark(resolveIsDark(newMode))
}

function init() {
  if (modeState.value !== null) return

  const stored = localStorage.getItem(THEME_KEY)
  modeState.value = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  applyIsDark(resolveIsDark(modeState.value))
  darkQuery.addEventListener('change', onSystemChange)
}

export function useTheme() {
  init()

  const modeRef = computed({
    get: () => modeState.value,
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
