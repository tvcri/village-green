import { useRouter } from 'vue-router'
import { useCurrentUser } from './useCurrentUser.js'

// Setup-time self-guard for single-purpose write components. Second layer
// behind route meta (requiresPermission): keeps the component correct even
// if a future reroute drops or repoints the meta. Uses replace() so the
// forbidden page never enters browser history.
export function useRequirePermission(permission) {
  const { hasPermission } = useCurrentUser()
  const router = useRouter()
  if (!hasPermission(permission)) {
    router.replace({ name: 'villages' })
  }
}
