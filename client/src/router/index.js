import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { navigationGuard } from './navigationGuards.js'

const Placeholder = {
  template: '<div style="padding: 2rem;"><h1>Page not implemented</h1><p>Current route: {{ $route.path }}</p></div>'
}

const routes = [
  {
    path: '/',
    name: 'home',
    component: Placeholder,
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: Placeholder,
  },
]

let historyBase
if (import.meta.env.DEV) {
  historyBase = import.meta.env.VITE_HASH_ROUTES === '1' ? null : '/'
}
else {
  historyBase = VG.Env.pathPrefix ? `${VG.Env.pathPrefix}client-v2/` : null
}

const router = createRouter({
  history: historyBase ? createWebHistory(historyBase) : createWebHashHistory(),
  routes,
})

router.beforeEach(navigationGuard)

export default router
