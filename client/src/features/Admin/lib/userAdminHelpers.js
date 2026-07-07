export function isDuplicateUsername(candidateUsername, existingUsernames, excludeUsername) {
  const candidate = candidateUsername.toLowerCase()
  const exclude = excludeUsername ? excludeUsername.toLowerCase() : null
  return existingUsernames.some(existing => {
    const lower = existing.toLowerCase()
    if (exclude && lower === exclude) return false
    return lower === candidate
  })
}

export function getDeleteConfirmCopy(user) {
  if (!user.lastAccess) {
    return {
      message: `Delete user ${user.username}? This user has never accessed the system and will be removed entirely.`,
      confirmLabel: 'Delete',
    }
  }
  return {
    message: `Deactivate user ${user.username}? This will remove their village grants and set their status to unavailable. Their record is retained for auditing.`,
    confirmLabel: 'Deactivate',
  }
}

export function extractApiErrorMessage(err, fallback) {
  return err?.body?.detail || fallback
}
