import { readonly, ref } from 'vue'

const error = ref(null)

export function useGlobalError() {
  const triggerError = (err) => {
    console.error('Global error triggered:', err)
    if (typeof err === 'string') {
      error.value = { message: err }
    }
    else if (err instanceof Error) {
      // message/name/stack are non-enumerable built-ins and must be copied
      // explicitly; the spread picks up an error's own enumerable props
      // (e.g. ApiError's status, url, body) so they aren't lost. Stack goes
      // last so the useful fields lead in the modal's JSON dump.
      error.value = {
        name: err.name,
        message: err.message,
        ...err,
        stack: err.stack,
      }
    }
    else {
      error.value = { message: 'An unknown error occurred', details: err }
    }
  }

  const clearError = () => {
    error.value = null
  }

  return {
    error: readonly(error),
    triggerError,
    clearError,
  }
}
