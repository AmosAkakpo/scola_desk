const express = require('express')
const router = express.Router()
const axios = require('axios')
const crypto = require('crypto')
const { getDb } = require('../db/init')

const CAP_URL = (process.env.CAP_API_URL || 'http://localhost:3001').trim()
const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production').trim()

function verifySignature(payload) {
  const copy = { ...payload }
  delete copy.signature
  const expected = crypto.createHmac('sha256', PAYLOAD_SECRET).update(JSON.stringify(copy)).digest('hex')
  return expected === payload.signature
}

function storeLicenseLocally(db, payload, fingerprint) {
  db.transaction(() => {
    // Upsert license_state
    const existing = db.prepare('SELECT id FROM license_state LIMIT 1').get()
    if (existing) {
      db.prepare(`
        UPDATE license_state SET
          school_id = ?, hardware_fingerprint = ?, license_tier = ?,
          license_expiry = ?, is_active = 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(payload.school_id, fingerprint, payload.tier, payload.expiry_date, existing.id)
    } else {
      db.prepare(`
        INSERT INTO license_state (school_id, hardware_fingerprint, license_tier, license_expiry, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(payload.school_id, fingerprint, payload.tier, payload.expiry_date)
    }

    // Upsert school_config
    const existingConfig = db.prepare('SELECT id FROM school_config LIMIT 1').get()
    if (existingConfig) {
      db.prepare(`
        UPDATE school_config SET
          school_name = ?, school_code = ?, director_name = ?,
          city = ?, country = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(payload.school_name, payload.school_code, payload.director_name, payload.city || '', payload.country || 'Bénin', existingConfig.id)
    } else {
      db.prepare(`
        INSERT INTO school_config (school_name, school_code, director_name, city, country)
        VALUES (?, ?, ?, ?, ?)
      `).run(payload.school_name, payload.school_code, payload.director_name, payload.city || '', payload.country || 'Bénin')
    }

    // Store features, deadlines, signature in app_settings
    const settings = {
      license_features: JSON.stringify(payload.features || []),
      license_size: payload.size || '',
      license_semesters_active: String(payload.semesters_active || 3),
      semester_1_deadline: String(payload.semester_deadlines?.t1 || ''),
      semester_2_deadline: String(payload.semester_deadlines?.t2 || ''),
      semester_3_deadline: String(payload.semester_deadlines?.t3 || ''),
      license_signature: payload.signature || '',
      license_issued_at: payload.issued_at || '',
      last_boot_date: new Date().toISOString(),
    }

    for (const [key, value] of Object.entries(settings)) {
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value)
    }
  })()
}

// ─── GET /api/activation/status ─────────────────────────────
router.get('/status', (req, res) => {
  const db = getDb()
  const license = db.prepare('SELECT * FROM license_state LIMIT 1').get()
  const config = db.prepare('SELECT * FROM school_config LIMIT 1').get()

  if (!license || !license.hardware_fingerprint) {
    return res.json({ activated: false, configured: false, license_status: 'none' })
  }

  const now = new Date()
  const expiry = license.license_expiry ? new Date(license.license_expiry) : null

  // Time tampering check
  const lastBoot = db.prepare("SELECT value FROM app_settings WHERE key = 'last_boot_date'").get()?.value
  if (lastBoot && new Date(lastBoot) > now) {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('last_boot_date', ?, datetime('now'))").run(now.toISOString())
    return res.json({
      activated: true, configured: config?.is_configured === 1,
      license_status: 'tampered',
      school_name: config?.school_name, school_code: license?.school_id, tier: license?.license_tier,
    })
  }

  // Update last boot
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('last_boot_date', ?, datetime('now'))").run(now.toISOString())

  // Expiry check
  let licenseStatus = 'active'
  if (expiry && now > expiry) {
    licenseStatus = 'expired'
  }

  if (!license.is_active) {
    licenseStatus = 'suspended'
  }

  // Load features
  const featuresRaw = db.prepare("SELECT value FROM app_settings WHERE key = 'license_features'").get()?.value
  const features = featuresRaw ? JSON.parse(featuresRaw) : []

  return res.json({
    activated: true,
    configured: config?.is_configured === 1,
    license_status: licenseStatus,
    school_name: config?.school_name || null,
    school_code: license?.school_id || null,
    tier: license?.license_tier || null,
    expiry: license?.license_expiry || null,
    features,
  })
})

// ─── POST /api/activation/activate ──────────────────────────
router.post('/activate', async (req, res) => {
  try {
    const { school_code, license_key, fingerprint } = req.body

    if (!school_code || !license_key || !fingerprint) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Code école, clé de licence et empreinte matérielle requis',
      })
    }

    const response = await axios.post(`${CAP_URL}/api/activate`, {
      school_id: school_code.trim().toUpperCase(),
      license_key: license_key.trim().toUpperCase(),
      hardware_fingerprint: fingerprint,
    }, {
      headers: { 'X-ScolaDesk-Secret': PAYLOAD_SECRET },
    })

    const payload = response.data.payload
    if (!payload) {
      return res.status(400).json({ error: 'NO_PAYLOAD', message: 'Aucune licence retournée' })
    }

    // Verify signature
    if (!verifySignature(payload)) {
      return res.status(400).json({ error: 'SIGNATURE_INVALID', message: 'Signature de licence invalide — possible altération' })
    }

    // Store locally
    const db = getDb()
    storeLicenseLocally(db, payload, fingerprint)

    return res.json({
      success: true,
      school: {
        school_name: payload.school_name,
        school_code: payload.school_code,
        director_name: payload.director_name,
        tier: payload.tier,
        size: payload.size,
        expiry_date: payload.expiry_date,
        semesters_active: payload.semesters_active,
        features: payload.features,
      },
    })
  } catch (err) {
    const data = err.response?.data
    const status = err.response?.status || 500
    console.error('[ACTIVATION]', data?.error || err.message)
    return res.status(status).json(
      data || { error: 'CONNECTION_ERROR', message: 'Impossible de contacter le serveur central. Vérifiez votre connexion internet.' }
    )
  }
})

module.exports = router
