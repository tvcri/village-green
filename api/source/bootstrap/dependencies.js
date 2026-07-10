const logger = require('../utils/logger')
const auth = require('../utils/auth')
const config = require('../utils/config')
const db = require('../service/utils')
const UserService = require('../service/UserService')
const { serializeError } = require('../utils/serializeError')
const state = require('../utils/state')

async function initializeDependencies() {
  try {
      await Promise.all([
          auth.initializeAuth(),
          db.initializeDatabase()
      ])

      if (config.settings.bootstrapAdmin) {
        await UserService.ensureBootstrapAdmin(config.settings.bootstrapAdmin)
        logger.writeInfo('bootstrap', 'bootstrapAdmin', { username: config.settings.bootstrapAdmin })
      }
  }
  catch (e) {
    logger.writeError('dependencies', 'fail', {message:'Unable to setup dependencies'})
    state.setState('fail')
  }
}

module.exports = {
  initializeDependencies
}
