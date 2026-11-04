'use strict';
const SmError = require('../utils/error')
const { hasPermission } = require('../utils/authz')

function requireAdmin (req) {
  if (!hasPermission(req.userObject, 'drop_reason:admin')) throw new SmError.PrivilegeError()
}

// The handlers for one drop-reason catalog. catalog is a makeCatalog instance
// and idParam its path parameter.
module.exports = function makeDropReasonController (catalog, idParam) {
  return {
    list: async (req, res, next) => {
      try { res.json(await catalog.list()) }
      catch (err) { next(err) }
    },

    create: async (req, res, next) => {
      try {
        requireAdmin(req)
        const id = await catalog.create(req.body, req.userObject.userId)
        res.status(201).json(await catalog.get(id))
      }
      catch (err) { next(err) }
    },

    patch: async (req, res, next) => {
      try {
        requireAdmin(req)
        const id = req.params[idParam]
        if (!(await catalog.get(id))) throw new SmError.NotFoundError()
        await catalog.patch(id, req.body, req.userObject.userId)
        res.json(await catalog.get(id))
      }
      catch (err) { next(err) }
    },

    remove: async (req, res, next) => {
      try {
        requireAdmin(req)
        const id = req.params[idParam]
        if (!(await catalog.get(id))) throw new SmError.NotFoundError()
        await catalog.remove(id, req.userObject.userId)
        res.status(204).end()
      }
      catch (err) { next(err) }
    },
  }
}
