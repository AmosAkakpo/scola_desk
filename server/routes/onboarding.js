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
    features: JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key = 'license_features'").get()?.value || '[]'),
    size: db.prepare("SELECT value FROM app_settings WHERE key = 'license_size'").get()?.value || null,
    semesters_active: parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'license_semesters_active'").get()?.value || '3'),
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

// ─── GET /api/onboarding/levels — List all levels ───────────
router.get('/levels', (req, res) => {
  const db = getDb()
  const levels = db.prepare('SELECT * FROM levels ORDER BY display_order').all()
  return res.json({ levels })
})

// ─── POST /api/onboarding/step4 — Activate levels ──────────
router.post('/step4', requireStep(4), (req, res) => {
  try {
    const { level_ids } = req.body

    if (!level_ids || !Array.isArray(level_ids) || level_ids.length === 0) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Sélectionnez au moins un niveau',
      })
    }

    const db = getDb()
    db.transaction(() => {
      db.prepare('UPDATE levels SET is_active = 0').run()
      const stmt = db.prepare('UPDATE levels SET is_active = 1 WHERE id = ?')
      for (const id of level_ids) { stmt.run(id) }
    })()

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_LEVELS', 'system', 'step4', ?)
    `).run(JSON.stringify({ active_levels: level_ids }))

    setCurrentStep(5)
    return res.json({ success: true, message: `${level_ids.length} niveau(x) activé(s)`, next_step: 5 })
  } catch (err) {
    console.error('[ONBOARDING STEP4]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

// ─── GET /api/onboarding/series-levels — Levels needing series ─
router.get('/series-levels', (req, res) => {
  const db = getDb()
  const levels = db.prepare('SELECT * FROM levels WHERE is_active = 1 AND has_serie = 1 ORDER BY display_order').all()
  const existing = db.prepare('SELECT * FROM series ORDER BY level_id, name').all()
  return res.json({ levels, existing_series: existing })
})

// ─── POST /api/onboarding/step5 — Configure series ─────────
router.post('/step5', requireStep(5), (req, res) => {
  try {
    const { series } = req.body
    const db = getDb()

    const activeLevelsWithSerie = db.prepare('SELECT id FROM levels WHERE is_active = 1 AND has_serie = 1').all()

    if (activeLevelsWithSerie.length === 0) {
      setCurrentStep(6)
      return res.json({ success: true, message: 'Aucun niveau avec séries', next_step: 6 })
    }

    if (!series || !Array.isArray(series) || series.length === 0) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Ajoutez au moins une série par niveau concerné',
      })
    }

    db.transaction(() => {
      const stmt = db.prepare('INSERT OR IGNORE INTO series (name, level_id) VALUES (?, ?)')
      for (const s of series) {
        if (s.name && s.level_id) stmt.run(s.name.trim().toUpperCase(), s.level_id)
      }
    })()

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_SERIES', 'system', 'step5', ?)
    `).run(JSON.stringify({ series_count: series.length }))

    setCurrentStep(6)
    return res.json({ success: true, message: `${series.length} série(s) configurée(s)`, next_step: 6 })
  } catch (err) {
    console.error('[ONBOARDING STEP5]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

// ─── GET /api/onboarding/subjects-data — Subjects + active levels ─
router.get('/subjects-data', (req, res) => {
  const db = getDb()
  const subjects = db.prepare('SELECT * FROM subjects WHERE is_active = 1 ORDER BY name').all()
  const levels = db.prepare('SELECT * FROM levels WHERE is_active = 1 ORDER BY display_order').all()
  const series = db.prepare(`
    SELECT s.* FROM series s
    JOIN levels l ON l.id = s.level_id
    WHERE l.is_active = 1
    ORDER BY s.level_id, s.name
  `).all()
  const existing = db.prepare(`
    SELECT ls.*, sub.name AS subject_name FROM level_subjects ls
    JOIN subjects sub ON sub.id = ls.subject_id
    ORDER BY ls.level_id, sub.name
  `).all()
  return res.json({ subjects, levels, series, existing_assignments: existing })
})

// ─── POST /api/onboarding/step6 — Assign subjects + coefficients ─
router.post('/step6', requireStep(6), (req, res) => {
  try {
    const { assignments } = req.body

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Assignez au moins une matière à un niveau',
      })
    }

    const db = getDb()

    db.transaction(() => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO level_subjects (level_id, serie_id, subject_id, coefficient, is_active)
        VALUES (?, ?, ?, ?, 1)
      `)
      for (const a of assignments) {
        stmt.run(a.level_id, a.serie_id || null, a.subject_id, a.coefficient || 1)
      }
    })()

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_SUBJECTS', 'system', 'step6', ?)
    `).run(JSON.stringify({ assignments_count: assignments.length }))

    setCurrentStep(7)
    return res.json({ success: true, message: `${assignments.length} assignation(s) créée(s)`, next_step: 7 })
  } catch (err) {
    console.error('[ONBOARDING STEP6]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

// ─── GET /api/onboarding/assessment-data — Levels + existing templates ─
router.get('/assessment-data', (req, res) => {
  const db = getDb()
  const levels = db.prepare('SELECT * FROM levels WHERE is_active = 1 ORDER BY display_order').all()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')
  const levelSubjects = db.prepare(`
    SELECT ls.*, s.name AS subject_name, s.short_code
    FROM level_subjects ls
    JOIN subjects s ON s.id = ls.subject_id
    WHERE ls.is_active = 1
    ORDER BY ls.level_id, s.name
  `).all()
  return res.json({ levels, level_subjects: levelSubjects, academic_year_id: yearId, periode_count: periodeCount })
})

// ─── POST /api/onboarding/step7 — Assessment configuration ──
router.post('/step7', requireStep(7), (req, res) => {
  try {
    const { config } = req.body

    if (!config || !Array.isArray(config) || config.length === 0) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Configuration des évaluations requise' })
    }

    const db = getDb()
    const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
    const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

    if (!yearId) {
      return res.status(400).json({ error: 'NO_YEAR', message: 'Année académique non configurée' })
    }

    // config = [{ level_id, interrogations, devoirs, compositions, max_score }]
    // We generate templates for each level × subject × semester
    const levelSubjects = db.prepare('SELECT * FROM level_subjects WHERE is_active = 1').all()

    db.transaction(() => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO assessment_templates
          (classroom_id, subject_id, academic_year_id, semester, assessment_type, sequence_number, max_score, weight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      // Store config as app_settings for future classroom template generation
      for (const c of config) {
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))")
          .run(`assessment_config_${c.level_id}`, JSON.stringify({
            interrogations: c.interrogations || 4,
            devoirs: c.devoirs || 1,
            compositions: c.compositions || 1,
            max_score: c.max_score || 20,
          }))
      }
    })()

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_ASSESSMENTS', 'system', 'step7', ?)
    `).run(JSON.stringify({ configs: config.length }))

    setCurrentStep(8)
    return res.json({ success: true, message: 'Configuration des évaluations enregistrée', next_step: 8 })
  } catch (err) {
    console.error('[ONBOARDING STEP7]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

// ─── GET /api/onboarding/classroom-data — For classroom creation ─
router.get('/classroom-data', (req, res) => {
  const db = getDb()
  const levels = db.prepare('SELECT * FROM levels WHERE is_active = 1 ORDER BY display_order').all()
  const series = db.prepare(`
    SELECT s.* FROM series s
    JOIN levels l ON l.id = s.level_id
    WHERE l.is_active = 1
    ORDER BY s.level_id, s.name
  `).all()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const teachers = db.prepare('SELECT id, full_name FROM teachers WHERE is_active = 1 AND is_deleted = 0 ORDER BY full_name').all()
  const existing = db.prepare(`
    SELECT c.*, l.name AS level_name FROM classrooms c
    JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(yearId || 0)
  const totalRooms = db.prepare("SELECT value FROM app_settings WHERE key = 'total_rooms'").get()?.value || ''
  return res.json({ levels, series, academic_year_id: yearId, teachers, existing_classrooms: existing, total_rooms: totalRooms })
})

// ─── POST /api/onboarding/step8 — Create classrooms ─────────
router.post('/step8', requireStep(8), (req, res) => {
  try {
    const { classrooms, total_rooms } = req.body

    if (!classrooms || !Array.isArray(classrooms) || classrooms.length === 0) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Créez au moins une classe' })
    }

    const db0 = getDb()
    if (total_rooms !== undefined) {
      db0.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('total_rooms', ?, datetime('now'))").run(String(total_rooms))
    }

    const db = getDb()
    const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

    if (!yearId) {
      return res.status(400).json({ error: 'NO_YEAR', message: 'Année académique non configurée' })
    }

    const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

    db.transaction(() => {
      const classStmt = db.prepare(`
        INSERT INTO classrooms (classroom_uid, label, level_id, serie_id, academic_year_id, capacity, expected_tuition)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      const templateStmt = db.prepare(`
        INSERT OR IGNORE INTO assessment_templates
          (classroom_id, subject_id, academic_year_id, semester, assessment_type, sequence_number, max_score, weight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const c of classrooms) {
        if (!c.label || !c.level_id) continue

        const uid = generateUUID()
        const result = classStmt.run(
          uid, c.label.trim(), c.level_id, c.serie_id || null,
          parseInt(yearId), c.capacity || 50, c.expected_tuition || 0
        )

        const classroomId = result.lastInsertRowid

        // Auto-generate assessment templates from level config
        const configRow = db.prepare("SELECT value FROM app_settings WHERE key = ?")
          .get(`assessment_config_${c.level_id}`)
        const assessConfig = configRow ? JSON.parse(configRow.value) : { interrogations: 4, devoirs: 1, compositions: 1, max_score: 20 }

        const subjects = db.prepare('SELECT subject_id FROM level_subjects WHERE level_id = ? AND is_active = 1').all(c.level_id)

        for (const sub of subjects) {
          for (let sem = 1; sem <= periodeCount; sem++) {
            for (let i = 1; i <= assessConfig.interrogations; i++) {
              templateStmt.run(classroomId, sub.subject_id, parseInt(yearId), sem, 'interrogation', i, assessConfig.max_score, 1)
            }
            for (let i = 1; i <= assessConfig.devoirs; i++) {
              templateStmt.run(classroomId, sub.subject_id, parseInt(yearId), sem, 'devoir', i, assessConfig.max_score, 1)
            }
            for (let i = 1; i <= assessConfig.compositions; i++) {
              templateStmt.run(classroomId, sub.subject_id, parseInt(yearId), sem, 'composition', i, assessConfig.max_score, 2)
            }
          }
        }
      }
    })()

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_CLASSROOMS', 'system', 'step8', ?)
    `).run(JSON.stringify({ classrooms_count: classrooms.length }))

    setCurrentStep(9)
    return res.json({ success: true, message: `${classrooms.length} classe(s) créée(s)`, next_step: 9 })
  } catch (err) {
    console.error('[ONBOARDING STEP8]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

module.exports = router
