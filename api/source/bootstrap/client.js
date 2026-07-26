const express = require('express')
const path = require('path')
const writer = require('../utils/writer')
const logger = require('../utils/logger')
const config = require('../utils/config')

function serveClient(app) {

    if (config.client.disabled) {
        logger.writeDebug('serveClient', 'client', {message: 'client disabled'})
        return
    }
    try {
        serveClientEnv(app)
        serveEnrollment(app)
        serveStaticFiles(app)
        logger.writeDebug('serveClient', 'client', { message: 'succeeded setting up client' })
    }
    catch (err) {
        logger.writeError('serveClient', 'client', {message: err.message, stack: err.stack})
    }
}

function getClientEnv(){
    const envJS = 
    `const VG = {
        Env: {
            nodeEnv: "${config.nodeEnv}",
            version: "${config.version}",
            consoleMode: "${config.client.consoleMode}",
            apiBase: "${config.client.apiBase}",
            displayAppManagers: ${config.client.displayAppManagers},
            stateEvents: ${config.client.stateEvents},
            welcome: {
                image: "${config.client.welcome.image}",
                title: "${config.client.welcome.title.replace(/"/g, '\\"')}",
                message: "${config.client.welcome.message.replace(/"/g, '\\"')}",
                link: "${config.client.welcome.link}"
            },
            commit: {
                branch: "${config.commit.branch}",
                sha: "${config.commit.sha}",
                tag: "${config.commit.tag}",
                describe: "${config.commit.describe}"
            },
            oauth: {
                authority:  "${config.client.authority}",
                clientId: "${config.client.clientId}",
                extraScopes: "${config.client.extraScopes ?? ''}",
                scopePrefix: "${config.client.scopePrefix ?? ''}",
                responseMode: "${config.client.responseMode}",
                reauthAction: "${config.client.reauthAction}",
                strictPkce: ${config.client.strictPkce},
                audienceValue: "${config.oauth.audienceValue ?? ''}",
                claims: ${JSON.stringify(config.oauth.claims)},
                idleTimeoutUser: ${config.client.idleTimeoutUser},
                idleTimeoutAdmin: ${config.client.idleTimeoutAdmin},
            },
            experimental: {
                appData: "${config.experimental.appData}",
                logStream: "${config.experimental.logStream}"
            },
            google: {
                clientId: "${config.google.clientId}",
                redirectUri: "${config.google.redirectUri}",
                googleMapsKey: "${config.google.mapsKey}",
            }
        }
    }`
    return envJS
}

function serveClientEnv(app){
    const envJS = getClientEnv()
    app.get('/Env.js', function (req, res) {
        req.component = 'static'
        writer.writeWithContentType(res, { payload: envJS, contentType: "application/javascript" })
    })
}

function serveEnrollment(app){
    // Public enrollment page (design 2026-07-14-volunteer-enrollment).
    // Registered before the static catch-all so the clean URL /enroll works.
    // The env script exposes only apiBase - never the OAuth client config.
    const staticPath = path.join(__dirname, "../", config.client.directory)
    const envJS = `const VG = { Env: { apiBase: "${config.client.apiBase}" } }`
    app.get('/enroll-env.js', function (req, res) {
        req.component = 'static'
        writer.writeWithContentType(res, { payload: envJS, contentType: "application/javascript" })
    })
    app.get('/enroll', function (req, res) {
        req.component = 'static'
        res.sendFile(path.join(staticPath, 'enroll.html'))
    })
}

function serveStaticFiles(app){
    const staticPath = path.join(__dirname, "../",  config.client.directory)
    logger.writeDebug('serveStaticFiles', 'client', {client_static: staticPath})
    const expressStatic = express.static(staticPath)

    app.use('/', (req, res, next) => {
        req.component = 'static'
        expressStatic(req, res, next)
    })
}

module.exports = {
    serveClient,
}
