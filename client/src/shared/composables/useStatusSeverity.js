export const useStatusSeverity = () => {
  const getStatusSeverity = (status) => {
    const statusLower = status?.toLowerCase() || ''
    if (statusLower.includes('cancelled')) {
      return 'danger'
    }
    switch (statusLower) {
      case 'open':
        return 'warn'
      case 'confirmed':
        return 'info'
      case 'completed':
        return 'success'
      case 'unmatched':
        return 'secondary'
      default:
        return 'info'
    }
  }

  return { getStatusSeverity }
}
