// Loads the pre-minted tokens written by run.js. Test files import { tokens }.
// Fails loudly if the suite wasn't started through run.js (which mints them).
import fs from 'node:fs'
import { config } from '../setup/env.js'

let tokens
try {
  tokens = JSON.parse(fs.readFileSync(config.paths.tokensFile, 'utf8'))
} catch (e) {
  throw new Error(
    `Could not read ${config.paths.tokensFile}. Run the suite with \`npm test\` ` +
    `(node run.js), which boots the stack and mints tokens. (${e.message})`,
  )
}

export { tokens }
