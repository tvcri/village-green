/**
 * General-purpose HTML utilities.
 */

/**
 * Escape HTML entities to prevent XSS when interpolating into HTML strings.
 */
export function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render a small subset of Markdown (paragraphs, **bold**, *italic*) to HTML.
 * Input is escaped first, so only the tags this function inserts can appear —
 * intentionally narrower than a full Markdown parser (e.g. `marked`) since the
 * privacy-rules content this supports is short prose, not structured docs.
 */
export function renderSimpleMarkdown(str) {
  if (!str) return ''
  return escapeHtml(str)
    .split(/\n{2,}/)
    .map(para => para.trim())
    .filter(Boolean)
    .map(para => {
      const inline = para
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>')
      return `<p>${inline}</p>`
    })
    .join('')
}
