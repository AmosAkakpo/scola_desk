const express = require('express')
const router = express.Router()
const axios = require('axios')
const crypto = require('crypto')
const { getDb } = require('../db/init')

const CAP_URL = process.env.CAP_API_URL || 'http://localhost:3001'
const PAYLOAD_SECRET = process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production'

function verifyPayload(encoded, signature) {
  const json = Buffer.from(encoded, 'base64').toString('utf8')
  const expected = crypto.createHmac('sha256', PAYLOAD_SECRET).update(json).digest('hex')
  if (expected !== signature) return null
  return JSON.parse(json)
}

function storeLicenseLocally(db, payload, fingerprint) {
  db.transaction(() => {
    const existing = db.prepare('SELECT id FROM license_state LIMIT 1').get()
    if (existing) {
      db.prepare(`
        UPDATE license_state SET
          school_id = ?, hardware_fingerprint = ?, license_tier = ?,
          license_expiry = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(payload.school_code, fingerprint, payload.tier, payload.expiry_date, payload.is_active ? 1 : 0, existing.id)
    } else {
      db.prepare(`
        INSERT INTO license_state (school_id, hardware_fingerprint, license_tier, license_expiry, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(payload.school_code, fingerprint, payload.tier, payload.expiry_date, payload.is_active ? 1 : 0)
    }

    const existingConfig = db.prepare('SELECT id FROM school_config LIMIT 1').get()
    if (existingConfig) {
      db.prepare(`
        UPDATE school_config SET
          school_name = ?, school_code = ?, director_name = ?,
          country = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(payload.school_name, payload.school_code, payload.director_name, payload.country || 'Bénin', existingConfig.id)
    } else {
      db.prepare(`
        INSERT INTO school_config (school_name, school_code, director_name, country)
        VALUES (?, ?, ?, ?)
      `).run(payload.school_name, payload.school_code, payload.director_name, payload.country || 'Bénin')
    }

    // Store grace period
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('grace_period_days', ?, datetime('now'))").run(String(payload.grace_period_days || 15))
  })()
}

// ─── GET /api/activation/status ─────────────────────────────
router.get('/status', (req, res) => {
  const db = getDb()
  const license = db.prepare('SELECT * FROM license_state LIMIT 1').get()
  const config = db.prepare('SELECT * FROM school_config LIMIT 1').get()

  if (license && license.hardware_fingerprint) {
    // Check expiry
    const graceDays = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'grace_period_days'").get()?.value || '15')
    const expiry = license.license_expiry ? new Date(license.license_expiry) : null
    const graceEnd = expiry ? new Date(expiry.getTime() + graceDays * 86400000) : null
    const now = new Date()

    let license_status = 'active'
    if (expiry && now > graceEnd) {
      license_status = 'locked'
    } else if (expiry && now > expiry) {
      license_status = 'grace'
    }

    // Check time tampering
    const lastBoot = db.prepare("SELECT value FROM app_settings WHERE key = 'last_boot_date'").get()?.value
    if (lastBoot && new Date(lastBoot) > now) {
      license_status = 'tampered'
    }

    // Update last boot
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('last_boot_date', ?, datetime('now'))").run(now.toISOString())

    return res.json({
      activated: true,
      configured: config?.is_configured === 1,
      school_name: config?.school_name || null,
      school_code: license?.school_id || null,
      tier: license?.license_tier || null,
      expiry: license?.license_expiry || null,
      license_status,
      grace_days_remaining: graceEnd ? Math.max(0, Math.ceil((graceEnd - now) / 86400000)) : null,
    })
  }

  return res.json({ activated: false, configured: false })
})

// ─── POST /api/activation/activate ──────────────────────────
// Single step: license_key + fingerprint → done
router.post('/activate', async (req, res) => {
  try {
    const { license_key, fingerprint } = req.body

    if (!license_key || !fingerprint) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Clé de licence et empreinte matérielle requises',
      })
    }

    const response = await axios.post(`${CAP_URL}/api/activate`, {
      action: 'activate',
      license_key: license_key.trim().toUpperCase(),
      fingerprint,
    })

    if (!response.data.success) {
      return res.status(400).json(response.data)
    }

    // Verify and decode license payload
    const payload = verifyPayload(response.data.payload, response.data.signature)
    if (!payload) {
      return res.status(400).json({
        error: 'PAYLOAD_INVALID',
        message: 'La signature de la licence est invalide',
      })
    }

    // Store locally
    const db = getDb()
    storeLicenseLocally(db, payload, fingerprint)

    return res.json({
      success: true,
      type: response.data.type,
      school: {
        school_name: payload.school_name,
        school_code: payload.school_code,
        director_name: payload.director_name,
        tier: payload.tier,
        size: payload.size,
        expiry_date: payload.expiry_date,
        grace_period_days: payload.grace_period_days,
        semesters_active: payload.semesters_active,
      },
    })
  } catch (err) {
    const data = err.response?.data
    console.error('[ACTIVATION]', err.message)
    return res.status(err.response?.status || 500).json(
      data || { error: 'CONNECTION_ERROR', message: 'Impossible de contacter le serveur central. Vérifiez votre connexion internet.' }
    )
  }
})

module.exports = router
