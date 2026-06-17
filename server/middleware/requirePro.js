const { getDb } = require('../db/init')

function requirePro(req, res, next) {
    try {
        const db = getDb()
        const license = db.prepare(`
      SELECT license_tier, is_active, license_expiry
      FROM license_state
      LIMIT 1
    `).get()

        if (!license) {
            return res.status(403).json({
                error: 'LICENSE_NOT_FOUND',
                message: 'Licence introuvable'
            })
        }

        if (!license.is_active) {
            return res.status(403).json({
                error: 'LICENSE_INACTIVE',
                message: 'Licence inactive'
            })
        }

        if (license.license_tier !== 'PRO') {
            return res.status(403).json({
                error: 'TIER_INSUFFICIENT',
                message: 'Cette fonctionnalité requiert une licence PRO'
            })
        }

        next()
    } catch (err) {
        console.error('[PRO CHECK]', err)
        return res.status(500).json({
            error: 'LICENSE_ERROR',
            message: 'Erreur de vérification de licence'
        })
    }
}

module.exports = { requirePro }