import { ref } from 'vue'

const noTokenMessage = ref(null)

export function setupOidcHandler() {
  const bc = new BroadcastChannel(VG.oidcWorker.channelName)
  bc.addEventListener('message', async (event) => {
    if (event.data?.type === 'noToken') {
      // The tab that initiated logout receives its own teardown broadcast a
      // beat before its end-session navigation commits; don't flash the
      // re-auth modal at it. Other tabs (flag false there) still prompt.
      if (VG.oidcWorker.isLoggingOut) return
      const noTokenData = {
        type: 'noToken',
        isIdle: event.data.isIdle,
        ...event.data,
      }
      noTokenMessage.value = noTokenData
    }
    else if (event.data?.type === 'accessToken') {
      noTokenMessage.value = null
    }
  })
}

export function useOidcWorker() {
  return {
    noTokenMessage,
  }
}
