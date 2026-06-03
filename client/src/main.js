import PrimeVue from 'primevue/config'
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

// this is a dark mode override — in the future we may want to make this dynamic based on user preference?
// if (typeof document !== 'undefined') {
//   document.documentElement.classList.add('app-dark')
// }

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
      // Use the presence of .app-dark on <html> to enable dark mode
        darkModeSelector: '.app-dark',
      },
    },
    pt: MyPrimeVuePT,
  })

  app.use(router)
  app.provide('worker', VG.oidcWorker)
  // Debug: log current route after router is ready
  console.log('window.location.pathname', window.location.pathname)
  console.log('router base', router.options.history.base)
  console.log('router.currentRoute.value', router.currentRoute.value)
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
