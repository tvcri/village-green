import { watch } from 'vue'

/**
 * Watch a dependency and execute refetch functions when it changes.
 * Used to re-fetch data when route params change.
 *
 * @param {import('vue').Ref | import('vue').Computed} dependency - The value to watch
 * @param {Function | Function[]} executors - Execute function(s) to call on change
 */
export function useRefetchOnChange(dependency, executors) {
  const refetchFns = Array.isArray(executors) ? executors : [executors]
  watch(dependency, () => {
    refetchFns.forEach(fn => fn())
  })
}
