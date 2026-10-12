import { onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'

// Ask before leaving a page with unsaved changes (UI spec §8). isDirty is a
// getter, so the guard always reads the current state. It stands down when
// init.js is navigating away for logout or re-auth (VG.navigatingAway).
export function useUnsavedChangesGuard (isDirty) {
  const confirm = useConfirm()

  function onBeforeUnload (e) {
    if (!isDirty() || globalThis.VG?.navigatingAway) return
    e.preventDefault()
    e.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

  onBeforeRouteLeave(() => {
    if (!isDirty()) return true
    return new Promise(resolve => {
      confirm.require({
        header: 'Discard changes?',
        message: 'You have changes that are not saved.',
        acceptLabel: 'Discard',
        rejectLabel: 'Keep editing',
        acceptProps: { severity: 'danger' },
        rejectProps: { severity: 'secondary' },
        accept: () => resolve(true),
        reject: () => resolve(false),
        onHide: () => resolve(false),
      })
    })
  })
}
