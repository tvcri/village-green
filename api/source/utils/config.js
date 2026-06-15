const ourPackage = require("../package.json")

// Array of known insecure kid values
const insecureKids = ['FJ86GcF3jTbNLOco4NvZkUCIUmfYCqoqtOQeMfbhNlE']

const config = {
    version: `${process.env.COMMIT_DESCRIBE ? process.env.COMMIT_DESCRIBE.replace(/-g[0-9a-f]+$/, "").replace(/-/g, "+") : ourPackage.version}`,
    commit: {
        branch: process.env.COMMIT_BRANCH || 'na',
        sha: process.env.COMMIT_SHA || 'na',
        tag: process.env.COMMIT_TAG || 'na',
        describe: process.env.COMMIT_DESCRIBE || 'na'
    },
    settings: {
        lastAccessResolution: 60,
        // Supported VG_DEV_RESPONSE_VALIDATION values: 
        // "logOnly" (logs failing response, but still sends them) 
        // "none"(no validation performed)
        responseValidation: process.env.VG_DEV_RESPONSE_VALIDATION || "none",
        dependencyRetries: process.env.VG_DEPENDENCY_RETRIES || 24
    },
    client: {
        clientId: process.env.VG_CLIENT_ID || "village-green",
        consoleMode: process.env.VG_CLIENT_CONSOLE_MODE || "production",
        displayAppManagers: process.env.VG_CLIENT_DISPLAY_APPMANAGERS || "true",
        idleTimeoutUser: (() => {
            const val = parseInt(process.env.VG_CLIENT_USER_TIMEOUT)
            if (isNaN(val) || val < 0) return 0
            return val
        })(),
        idleTimeoutAdmin: (() => {
            const val = parseInt(process.env.VG_CLIENT_ADMIN_TIMEOUT)
            if (isNaN(val) || val < 0) return 0
            return val
        })(),
        authority: process.env.VG_CLIENT_OIDC_PROVIDER || process.env.VG_OIDC_PROVIDER || "http://localhost:8080/realms/vg",
        apiBase: process.env.VG_CLIENT_API_BASE || "api",
        disabled: process.env.VG_CLIENT_DISABLED === "true",
        directory: process.env.VG_CLIENT_DIRECTORY || '../../client/dist',
        extraScopes: process.env.VG_CLIENT_EXTRA_SCOPES,
        scopePrefix: process.env.VG_CLIENT_SCOPE_PREFIX,
        responseMode: process.env.VG_CLIENT_RESPONSE_MODE || "query",
        reauthAction: process.env.VG_CLIENT_REAUTH_ACTION || "popup",
        strictPkce: process.env.VG_CLIENT_STRICT_PKCE !== 'false',
        stateEvents: process.env.VG_CLIENT_STATE_EVENTS !== 'false',
        welcome: {
            image: process.env.VG_CLIENT_WELCOME_IMAGE || "",
            message: process.env.VG_CLIENT_WELCOME_MESSAGE || "",
            title: process.env.VG_CLIENT_WELCOME_TITLE || "",
            link: process.env.VG_CLIENT_WELCOME_LINK || ""
        }
    },
    docs: {
        disabled: process.env.VG_DOCS_DISABLED  === "true",
        docsDirectory: process.env.VG_DOCS_DIRECTORY || '../../docs/_build/html',
    },    
    http: {
        address: process.env.VG_API_ADDRESS || "0.0.0.0",
        port: process.env.VG_API_PORT || 54000,
        maxJsonBody: process.env.VG_API_MAX_JSON_BODY || "31457280",
        maxUpload: process.env.VG_API_MAX_UPLOAD || "1073741824",
        tls: {
            key_file: process.env.VG_API_TLS_KEY_FILE,
            key_passphrase: process.env.VG_API_TLS_KEY_PASSPHRASE,
            cert_file: process.env.VG_API_TLS_CERT_FILE
        }
    },
    database: {
        host: process.env.VG_DB_HOST || "localhost",
        port: process.env.VG_DB_PORT || 3306,
        schema: process.env.VG_DB_SCHEMA || "vg",
        username: process.env.VG_DB_USER || "vg",
        password: process.env.VG_DB_PASSWORD,
        maxConnections: process.env.VG_DB_MAX_CONNECTIONS || 25,
        tls: {
            ca_file: process.env.VG_DB_TLS_CA_FILE,
            cert_file: process.env.VG_DB_TLS_CERT_FILE,
            key_file: process.env.VG_DB_TLS_KEY_FILE
        },
        revert: process.env.VG_DB_REVERT === "true",
        toJSON: function () {
            let {password, ...props} = this
            props.password = !!password
            return props          
        }
    },
    swaggerUi: {
        enabled: process.env.VG_SWAGGER_ENABLED === "true", 
        authority: process.env.VG_SWAGGER_OIDC_PROVIDER || process.env.VG_SWAGGER_AUTHORITY || process.env.VG_OIDC_PROVIDER || "http://localhost:8080/auth/realms/vg", 
        server: process.env.VG_SWAGGER_SERVER || "http://localhost:54000/api",
        oauth2RedirectUrl: process.env.VG_SWAGGER_REDIRECT || "http://localhost:54000/api-docs/oauth2-redirect.html"
    },
    oauth: {
        authority: process.env.VG_OIDC_PROVIDER || process.env.VG_API_AUTHORITY || "http://localhost:8080/realms/vg",
        audienceValue: process.env.VG_JWT_AUD_VALUE,
        allowInsecureTokens: process.env.VG_DEV_ALLOW_INSECURE_TOKENS === "true",
        caCerts: process.env.VG_OIDC_CA_CERTS,
        insecureKids,
        cacheMaxAge: Math.min(Math.max(process.env.VG_JWKS_CACHE_MAX_AGE, 1) || 10, 35791),
        claims: {
            scope: process.env.VG_JWT_SCOPE_CLAIM || "scope",
            username: process.env.VG_JWT_USERNAME_CLAIM || "preferred_username",
            servicename: process.env.VG_JWT_SERVICENAME_CLAIM,
            name: process.env.VG_JWT_NAME_CLAIM || process.env.VG_JWT_USERNAME_CLAIM || "name",
            privileges: formatMySqlJsonPath(process.env.VG_JWT_PRIVILEGES_CLAIM || "realm_access.roles"),
            privilegesChain: formatJsChain(process.env.VG_JWT_PRIVILEGES_CLAIM || "realm_access.roles"),
            privilegesRaw: process.env.VG_JWT_PRIVILEGES_CLAIM || "realm_access.roles",
            email: process.env.VG_JWT_EMAIL_CLAIM || "email",
            assertion: process.env.VG_JWT_ASSERTION_CLAIM || "jti"
        }
    },
    webhook: {
        key: process.env.VG_SYNC_WEBHOOK_KEY
    },
    log: {
        level: parseInt(process.env.VG_LOG_LEVEL) || 3,
        mode: process.env.VG_LOG_MODE || 'combined',
        optStats: process.env.VG_DEV_LOG_OPT_STATS === "true"
    },
    experimental: {
        appData: process.env.VG_EXPERIMENTAL_APPDATA === "true",
        logStream: process.env.VG_EXPERIMENTAL_LOGSTREAM !== "false"
    },
    google: {
        clientId: process.env.VG_GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.VG_GOOGLE_CLIENT_SECRET ?? '',
        redirectUri: process.env.VG_GOOGLE_REDIRECT_URI ?? '',
        mapsKey: process.env.VG_GOOGLE_MAPS_KEY ?? '',
    }
}

function formatJsChain(path) {
    const components = path?.split('.')
    if (components?.length === 1) return path
    for (let x=0; x < components.length; x++) {
      components[x] = `['${components[x]}']`
    }
    return components.join('?.')
}

function formatMySqlJsonPath(path) {
    return path?.split('.').map(p => `"${p}"`).join('.')
}
  
module.exports = config