import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

export function useScrollRestore(routeName, detailRouteName) {
  const router = useRouter()
  const savedScrollY = ref(0)
  const detailRouteNames = Array.isArray(detailRouteName) ? detailRouteName : [detailRouteName]

  const remove = router.afterEach((to, from) => {
    if (from.name === routeName) {
      savedScrollY.value = window.scrollY
    }
    if (to.name === routeName && detailRouteNames.includes(from.name) && (to.params.villageId === undefined || to.params.villageId === from.params.villageId)) {
      const target = savedScrollY.value
      requestAnimationFrame(() => window.scrollTo({ top: target, behavior: 'instant' }))
    }
  })

  onUnmounted(remove)
}
