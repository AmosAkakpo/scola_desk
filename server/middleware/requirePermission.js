function requirePermission(code) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'AUTH_REQUIRED',
                message: 'Non authentifié'
            })
        }

        const perms = req.user.permissions || []

        // Admin wildcard
        if (perms.includes('*')) return next()

        // Exact match
        if (perms.includes(code)) return next()

        // Domain wildcard: if user has 'finance.*' and code is 'finance.view'
        const domain = code.split('.')[0]
        if (perms.includes(`${domain}.*`)) return next()

        return res.status(403).json({
            error: 'PERMISSION_DENIED',
            message: `Permission requise: ${code}`
        })
    }
}

module.exports = { requirePermission }