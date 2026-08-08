'use strict'

// Read an error-response body for inclusion in an Error message, never
// throwing: an unreadable body must not mask the failure being reported.
async function safeReadBody(res) {
  try {
    const text = await res.text()
    return text || '<empty body>'
  }
  catch (err) {
    return `<failed to read body: ${err.message}>`
  }
}

module.exports = { safeReadBody }
