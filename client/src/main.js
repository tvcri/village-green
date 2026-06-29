import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { createApp, h } from 'vue'
import App from './App.vue'
import { setupOidcHandler } from './auth/useOidcWorker.js'
import { setupStateHandler } from './auth/useStateWorker.js'
import { BluePreset, MyPrimeVuePT } from './primevueTheme.js'
import router from './router'
import { api, configureApiSpec } from './shared/api/apiClient.js'

import { useGlobalError } from './shared/composables/useGlobalError.js'
import 'primeicons/primeicons.css'
import './style.css'

// Light theme is default. Dark mode can be enabled by adding 'app-dark' class to document root.
// User preference stored in localStorage under 'vg-theme' key.

try {
  const app = createApp(App)

  // Global Error Handler
  const { triggerError } = useGlobalError()
  app.config.errorHandler = (err, instance, info) => {
    console.error('Unhandled Global Error:', err, info)
    triggerError(err)
  }

  // Fetch and configure API Spec
  const spec = await api.get('/op/definition')
  configureApiSpec(spec)

  app.use(PrimeVue, {
    theme: {
      preset: BluePreset,
      options: {
        // Light theme is default. Dark mode enabled when .app-dark class is on <html>
        darkModeSelector: '.app-dark',
        prefix: 'p',
      },
    },
    pt: MyPrimeVuePT,
  })

  app.use(ToastService)
  app.directive('tooltip', Tooltip)
  app.use(router)
  app.provide('worker', VG.oidcWorker)
  // Debug: log current route after router is ready
  console.log('window.location.pathname', window.location.pathname)
  console.log('router base', router.options.history.base)
  console.log('router.currentRoute.value', router.currentRoute.value)
  // Reload on stale chunk errors after hot deploy (Vite renames chunks on rebuild)
  window.addEventListener('vite:preloadError', () => {
    window.location.reload()
  })
  router.onError((err, to) => {
    if (
      err.message.includes('Failed to fetch dynamically imported module') ||
      err.message.includes('Importing a module script failed')
    ) {
      window.location.assign(to.fullPath)
    }
  })

  setupStateHandler() // set up state worker message handling
  setupOidcHandler() // set up OIDC worker message handling
  app.mount('#app')
}
// catch all for any errors
catch (err) {
  const apiErrApp = createApp({
    render: () => h('div', { style: 'padding:24px;' }, `Bootstrap failed.${err}`),
  })
  apiErrApp.mount('#app')
}
