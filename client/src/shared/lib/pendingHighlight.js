let pendingId = null

export const setPendingHighlight = (id) => { pendingId = id }
export const consumePendingHighlight = () => { const id = pendingId; pendingId = null; return id }
