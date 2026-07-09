import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import VueDevtools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const envOrigin = env.VITE_ENV_ORIGIN
  return {
    base: command === 'build' ? './' : '/',
    plugins: [
      vue(), 
      VueDevtools()
    ],
    server: {
      // Proxy requests for Env.js to the API server in development only
      proxy: {
        '/Env.js': {
          target: envOrigin,
          changeOrigin: true,
          rewrite: (path) => `/Env.js`,
        },
        '/js/workers/oidc-worker.js': {
          target: envOrigin,
          changeOrigin: true,
        },
      },
    },
    build: {
      sourcemap: true,
    },
    optimizeDeps: {
      // Only reachable via the lazy-loaded /volunteer route, so Vite's dep
      // scanner never sees them at startup — without this they're discovered
      // on first visit, forcing a one-time full dev-server reload.
      include: [
        'primevue/tabs',
        'primevue/tablist',
        'primevue/tab',
        'primevue/tabpanels',
        'primevue/tabpanel',
      ],
    },
  }
})
