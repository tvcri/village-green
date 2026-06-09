import { computed } from 'vue'

export function useCurrentUser() {
  const user = computed(() => VG.curUser)

  const isAdmin = computed(() => !!user.value?.privileges?.admin)

  const canCreateCollection = computed(() => !!user.value?.privileges?.create_collection)

  function getCollectionGrant(collectionId) {
    if (!user.value?.collectionGrants || !collectionId) {
      return null
    }
    const id = String(collectionId)
    return user.value.collectionGrants.find(
      // eslint-disable-next-line antfu/consistent-list-newline
      g => String(g.collection.collectionId) === id) ?? null
  }

  function hasCollectionAccess(collectionId) {
    return getCollectionGrant(collectionId) !== null
  }

  function getCollectionRoleId(collectionId) {
    const grant = getCollectionGrant(collectionId)
    return grant?.roleId ?? null
  }

  return {
    user,
    isAdmin,
    canCreateCollection,
    getCollectionGrant,
    hasCollectionAccess,
    getCollectionRoleId,
  }
}
