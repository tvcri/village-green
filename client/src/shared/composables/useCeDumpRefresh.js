import { watch } from 'vue'
import { useStateWorker } from '../../auth/useStateWorker.js'

/**
 * Calls onRefresh whenever ceDumpTime changes in the state worker.
 * Only active while the calling component is mounted (watch auto-cleans up on unmount).
 *
 * @param {Function} onRefresh - Called when a new ceDumpTime is detected
 */
export function useCeDumpRefresh(onRefresh) {
  const { state } = useStateWorker()

  watch(
    () => state.value?.ceDumpTime,
    (newTime, oldTime) => {
      if (newTime && oldTime && newTime !== oldTime) {
        onRefresh()
      }
    }
  )
}
