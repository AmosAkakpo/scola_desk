const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { hashPassword } = require('../utils/password')
const { generateUUID, generateShortUID } = require('../utils/uid')

const TOTAL_STEPS = 13

function getCurrentStep() {
  const db = getDb()
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'onboarding_step'").get()
  return row ? parseInt(row.value) : 1
}

function setCurrentStep(step) {
  const db = getDb()
  const existing = db.prepare("SELECT key FROM app_settings WHERE key = 'onboarding_step'").get()
  if (existing) {
    db.prepare("UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = 'onboarding_step'").run(String(step))
  } else {
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('onboarding_step', ?)").run(String(step))
  }
}

function requireStep(expected) {
  return (req, res, next) => {
    const current = getCurrentStep()
    if (current !== expected) {
      return res.status(400).json({
        error: 'WRONG_STEP',
        message: `Étape actuelle: ${current}. Cette action requiert l'étape ${expected}.`,
        current_step: current,
      })
    }
    next()
  }
}

// ─── GET /api/onboarding/status ─────────────────────────────
router.get('/status', (req, res) => {
  const db = getDb()
  const config = db.prepare('SELECT * FROM school_config LIMIT 1').get()
  const license = db.prepare('SELECT * FROM license_state LIMIT 1').get()
  const currentStep = getCurrentStep()

  return res.json({
    current_step: currentStep,
    total_steps: TOTAL_STEPS,
    is_configured: config?.is_configured === 1,
    school: config ? {
      school_name: config.school_name,
      school_code: config.school_code,
      director_name: config.director_name,
      city: config.city,
      country: config.country,
    } : null,
    license: license ? {
      tier: license.license_tier,
      expiry: license.license_expiry,
      is_active: license.is_active === 1,
    } : null,
  })
})

// ─── POST /api/onboarding/step1 — Confirm school info ──────
// Read-only confirmation. Just advances the step.
router.post('/step1', requireStep(1), (req, res) => {
  setCurrentStep(2)
  return res.json({ success: true, message: 'Confirmation validée', next_step: 2 })
})

// ─── POST /api/onboarding/step2 — Create accounts ──────────
// Admin is mandatory. Secretary optional (mandatory for STANDARD).
// Accountant optional (PRO only).
router.post('/step2', requireStep(2), async (req, res) => {
  try {
    const { admin, secretary, accountant } = req.body

    if (!admin || !admin.full_name || !admin.username || !admin.password) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Les informations administrateur sont obligatoires',
      })
    }

    if (admin.password.length < 6) {
      return res.status(400).json({
        error: 'PASSWORD_TOO_SHORT',
        message: 'Le mot de passe doit contenir au moins 6 caractères',
      })
    }

    const db = getDb()

    // Check if users already exist (idempotent)
    const existingUsers = db.prepare('SELECT id FROM users LIMIT 1').get()
    if (existingUsers) {
      setCurrentStep(3)
      return res.json({ success: true, message: 'Comptes déjà créés', next_step: 3 })
    }

    const roles = {}
    db.prepare('SELECT id, name FROM roles').all().forEach(r => { roles[r.name] = r.id })

    const createUser = db.transaction(async () => {
      const users = []

      // Admin (mandatory)
      const adminHash = await hashPassword(admin.password)
      db.prepare(`
        INSERT INTO users (user_uid, matricule, full_name, username, password_hash, role_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        generateUUID(), generateShortUID('U'),
        admin.full_name.trim(), admin.username.trim().toLowerCase(),
        adminHash, roles.admin
      )
      users.push('admin')

      // Secretary (optional)
      if (secretary && secretary.full_name && secretary.username && secretary.password) {
        if (secretary.password.length < 6) {
          throw new Error('Mot de passe secrétaire trop court (min 6)')
        }
        const secHash = await hashPassword(secretary.password)
        db.prepare(`
          INSERT INTO users (user_uid, matricule, full_name, username, password_hash, role_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          generateUUID(), generateShortUID('U'),
          secretary.full_name.trim(), secretary.username.trim().toLowerCase(),
          secHash, roles.secretary
        )
        users.push('secretary')
      }

      // Accountant (PRO only, optional)
      if (accountant && accountant.full_name && accountant.username && accountant.password) {
        const license = db.prepare('SELECT license_tier FROM license_state LIMIT 1').get()
        if (license?.license_tier !== 'PRO') {
          throw new Error('Le rôle comptable nécessite une licence PRO')
        }
        if (accountant.password.length < 6) {
          throw new Error('Mot de passe comptable trop court (min 6)')
        }
        const accHash = await hashPassword(accountant.password)
        db.prepare(`
          INSERT INTO users (user_uid, matricule, full_name, username, password_hash, role_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          generateUUID(), generateShortUID('U'),
          accountant.full_name.trim(), accountant.username.trim().toLowerCase(),
          accHash, roles.accountant
        )
        users.push('accountant')
      }

      return users
    })

    const created = await createUser()

    // Log
    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_ACCOUNTS', 'system', 'step2', ?)
    `).run(JSON.stringify({ created_roles: created }))

    setCurrentStep(3)
    return res.json({
      success: true,
      message: `${created.length} compte(s) créé(s)`,
      created_roles: created,
      next_step: 3,
    })
  } catch (err) {
    console.error('[ONBOARDING STEP2]', err)
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'Erreur serveur',
    })
  }
})

// ─── POST /api/onboarding/step3 — Academic year setup ───────
// Creates the academic year + generates period records in app_settings.
router.post('/step3', requireStep(3), (req, res) => {
  try {
    const { label, start_date, end_date, periode_type } = req.body

    if (!label || !start_date || !end_date || !periode_type) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Tous les champs sont requis',
      })
    }

    if (!['trimestre', 'semestre'].includes(periode_type)) {
      return res.status(400).json({
        error: 'INVALID_PERIODE',
        message: 'Type de période invalide (trimestre ou semestre)',
      })
    }

    const db = getDb()

    // Check if academic year already exists
    const existing = db.prepare('SELECT id FROM academic_years WHERE label = ?').get(label)
    if (existing) {
      // Update settings and advance
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_academic_year_id', ?, datetime('now'))").run(String(existing.id))
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('periode_type', ?, datetime('now'))").run(periode_type)
      setCurrentStep(4)
      return res.json({ success: true, message: 'Année académique déjà configurée', next_step: 4 })
    }

    const result = db.prepare(`
      INSERT INTO academic_years (label, start_date, end_date, is_active)
      VALUES (?, ?, ?, 1)
    `).run(label.trim(), start_date, end_date)

    const yearId = result.lastInsertRowid

    // Store settings
    const settings = {
      current_academic_year_id: String(yearId),
      periode_type: periode_type,
      periode_count: periode_type === 'trimestre' ? '3' : '2',
    }

    for (const [key, value] of Object.entries(settings)) {
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value)
    }

    // Log
    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_ACADEMIC_YEAR', 'academic_year', ?, ?)
    `).run(String(yearId), JSON.stringify({ label, start_date, end_date, periode_type }))

    setCurrentStep(4)
    return res.json({
      success: true,
      message: 'Année académique créée',
      academic_year_id: yearId,
      next_step: 4,
    })
  } catch (err) {
    console.error('[ONBOARDING STEP3]', err)
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'Erreur serveur',
    })
  }
})

module.exports = router
