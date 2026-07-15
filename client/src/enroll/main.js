import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import 'primeicons/primeicons.css'
import '../style.css'
import { BluePreset, MyPrimeVuePT } from '../primevueTheme.js'
import EnrollApp from './EnrollApp.vue'

// Standalone bootstrap: deliberately does NOT import init.js, so no OIDC
// workers and no login redirect - this page exists for people who cannot
// log in yet. VG is the global declared by enroll-env.js (same pattern as
// Env.js); apiBase resolution mirrors init.js.
if (import.meta.env.DEV) {
  VG.Env.apiBase = `${import.meta.env.VITE_API_ORIGIN}/api`
}
else {
  VG.Env.apiBase = new URL(VG.Env.apiBase || './api', window.location.href).toString()
}

const app = createApp(EnrollApp)
app.use(PrimeVue, {
  theme: {
    preset: BluePreset,
    options: {
      darkModeSelector: '.app-dark',
      prefix: 'p',
    },
  },
  pt: MyPrimeVuePT,
})
app.mount('#app')
