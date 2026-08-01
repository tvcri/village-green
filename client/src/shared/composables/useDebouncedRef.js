import { customRef } from 'vue'

export function useDebouncedRef(value, delay = 200) {
  let timeout
  let triggerFn
  const ref = customRef((track, trigger) => {
    triggerFn = trigger
    return {
      get() {
        track()
        return value
      },
      set(newValue) {
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          value = newValue
          trigger()
        }, delay)
      },
    }
  })
  // Deliberately a method ON the ref object (an escape hatch bypassing the
  // debounce), not the wrapped value — the rule's autofix would break it.
  // eslint-disable-next-line vue/no-ref-as-operand
  ref.immediate = (newValue) => {
    clearTimeout(timeout)
    value = newValue
    triggerFn()
  }
  return ref
}
