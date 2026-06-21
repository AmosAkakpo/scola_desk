const express = require('express')
const router = express.Router()
const XLSX = require('xlsx')
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

// ─── POST /api/onboarding/back — Go back one step ───────────
router.post('/back', (req, res) => {
  const current = getCurrentStep()
  if (current <= 1) {
    return res.status(400).json({ error: 'AT_START', message: 'Déjà à la première étape' })
  }
  setCurrentStep(current - 1)
  return res.json({ success: true, current_step: current - 1 })
})

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

// ─── GET /api/onboarding/academic-year — Existing year (for back-nav) ─
router.get('/academic-year', (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const periodeType = db.prepare("SELECT value FROM app_settings WHERE key = 'periode_type'").get()?.value || 'trimestre'
  if (!yearId) return res.json({ year: null, periode_type: periodeType })
  const year = db.prepare('SELECT label, start_date, end_date FROM academic_years WHERE id = ?').get(yearId)
  return res.json({ year, periode_type: periodeType })
})

// ─── POST /api/onboarding/step1 — Confirm school info ──────
// Read-only confirmation. Just advances the step.
router.post('/step1', requireStep(1), (req, res) => {
  setCurrentStep(2)
  return res.json({ success: true, message: 'Confirmation validée', next_step: 2 })
})

// ─── GET /api/onboarding/accounts — Existing accounts (no passwords) ─
router.get('/accounts', (req, res) => {
  const db = getDb()
  const users = db.prepare(`
    SELECT u.full_name, u.username, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.is_deleted = 0
    ORDER BY r.name
  `).all()
  return res.json({ accounts: users })
})

// ─── POST /api/onboarding/step2 — Create accounts ──────────
// Admin is mandatory. Idempotent: skips usernames that already exist,
// so going back and adding a missing role works without duplicates.
router.post('/step2', requireStep(2), async (req, res) => {
  try {
    const { admin, secretary, accountant } = req.body
    const db = getDb()

    const roles = {}
    db.prepare('SELECT id, name FROM roles').all().forEach(r => { roles[r.name] = r.id })

    const existingByRole = {}
    db.prepare(`
      SELECT r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.is_deleted = 0
    `).all().forEach(u => { existingByRole[u.role_name] = true })

    const usernameTaken = (username) => {
      if (!username) return false
      return !!db.prepare('SELECT id FROM users WHERE username = ? AND is_deleted = 0').get(username.trim().toLowerCase())
    }

    // Admin required only if no admin exists yet
    if (!existingByRole.admin) {
      if (!admin || !admin.full_name || !admin.username || !admin.password) {
        return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Les informations administrateur sont obligatoires' })
      }
      if (admin.password.length < 6) {
        return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Le mot de passe doit contenir au moins 6 caractères' })
      }
    }

    // Hash passwords for NEW accounts only (outside transaction)
    const toCreate = []

    if (admin && admin.full_name && admin.username && admin.password && !existingByRole.admin) {
      if (usernameTaken(admin.username)) return res.status(409).json({ error: 'USERNAME_TAKEN', message: `Nom d'utilisateur déjà pris: ${admin.username}` })
      toCreate.push({ role: 'admin', data: admin, hash: await hashPassword(admin.password) })
    }

    if (secretary && secretary.full_name && secretary.username && secretary.password && !existingByRole.secretary) {
      if (secretary.password.length < 6) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Mot de passe secrétaire trop court (min 6)' })
      if (usernameTaken(secretary.username)) return res.status(409).json({ error: 'USERNAME_TAKEN', message: `Nom d'utilisateur déjà pris: ${secretary.username}` })
      toCreate.push({ role: 'secretary', data: secretary, hash: await hashPassword(secretary.password) })
    }

    if (accountant && accountant.full_name && accountant.username && accountant.password && !existingByRole.accountant) {
      const license = db.prepare('SELECT license_tier FROM license_state LIMIT 1').get()
      if (license?.license_tier !== 'PRO') return res.status(400).json({ error: 'TIER_REQUIRED', message: 'Le rôle comptable nécessite une licence PRO' })
      if (accountant.password.length < 6) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Mot de passe comptable trop court (min 6)' })
      if (usernameTaken(accountant.username)) return res.status(409).json({ error: 'USERNAME_TAKEN', message: `Nom d'utilisateur déjà pris: ${accountant.username}` })
      toCreate.push({ role: 'accountant', data: accountant, hash: await hashPassword(accountant.password) })
    }

    const created = []
    db.transaction(() => {
      for (const item of toCreate) {
        db.prepare(`
          INSERT INTO users (user_uid, matricule, full_name, username, password_hash, role_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(generateUUID(), generateShortUID('U'), item.data.full_name.trim(), item.data.username.trim().toLowerCase(), item.hash, roles[item.role])
        created.push(item.role)
      }
    })()

    if (created.length > 0) {
      db.prepare(`
        INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
        VALUES ('ONBOARDING_ACCOUNTS', 'system', 'step2', ?)
      `).run(JSON.stringify({ created_roles: created }))
    }

    setCurrentStep(3)
    return res.json({
      success: true,
      message: created.length > 0 ? `${created.length} compte(s) créé(s)` : 'Comptes existants conservés',
      created_roles: created,
      next_step: 3,
    })
  } catch (err) {
    console.error('[ONBOARDING STEP2]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
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

    // If an academic year already exists (back-nav), update it in place
    // instead of creating a duplicate.
    const existingId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
    let yearId

    if (existingId) {
      db.prepare(`
        UPDATE academic_years SET label = ?, start_date = ?, end_date = ? WHERE id = ?
      `).run(label.trim(), start_date, end_date, existingId)
      yearId = existingId
    } else {
      const result = db.prepare(`
        INSERT INTO academic_years (label, start_date, end_date, is_active)
        VALUES (?, ?, ?, 1)
      `).run(label.trim(), start_date, end_date)
      yearId = result.lastInsertRowid
    }

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

// ─── POST /api/onboarding/reset — Dev only: reset onboarding ─
router.post('/reset', (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Dev only' })
  }
  const db = getDb()
  db.transaction(() => {
    db.prepare("DELETE FROM app_settings WHERE key = 'onboarding_step'").run()
    db.prepare("DELETE FROM users").run()
    db.prepare("DELETE FROM academic_years").run()
    db.prepare("UPDATE levels SET is_active = 0").run()
    db.prepare("DELETE FROM series").run()
    db.prepare("DELETE FROM level_subjects").run()
    db.prepare("DELETE FROM assessment_templates").run()
    db.prepare("DELETE FROM classrooms").run()
    db.prepare("DELETE FROM classroom_teachers").run()
    db.prepare("DELETE FROM app_settings WHERE key LIKE 'assessment_config_%'").run()
    db.prepare("DELETE FROM app_settings WHERE key = 'current_academic_year_id'").run()
    db.prepare("DELETE FROM app_settings WHERE key = 'periode_type'").run()
    db.prepare("DELETE FROM app_settings WHERE key = 'periode_count'").run()
    db.prepare("DELETE FROM app_settings WHERE key = 'total_rooms'").run()
  })()
  return res.json({ success: true, message: 'Onboarding reset' })
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

  // Saved assessment config per level (for back-nav)
  const savedConfig = {}
  for (const l of levels) {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(`assessment_config_${l.id}`)
    if (row) savedConfig[l.id] = JSON.parse(row.value)
  }

  return res.json({ levels, level_subjects: levelSubjects, academic_year_id: yearId, periode_count: periodeCount, saved_config: savedConfig })
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

      const existsStmt = db.prepare('SELECT id FROM classrooms WHERE label = ? AND academic_year_id = ? AND is_deleted = 0')

      for (const c of classrooms) {
        if (!c.label || !c.level_id) continue

        // Skip if a classroom with this label already exists for the year (back-nav re-submit)
        if (existsStmt.get(c.label.trim(), parseInt(yearId))) continue

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

// ─── GET /api/onboarding/teachers-data — Existing teachers + mode (back-nav) ─
router.get('/teachers-data', (req, res) => {
  const db = getDb()
  const mode = db.prepare("SELECT value FROM app_settings WHERE key = 'matricule_mode'").get()?.value || 'custom'
  const teachers = db.prepare('SELECT id, full_name, phone, email FROM teachers WHERE is_deleted = 0 ORDER BY full_name').all()
  return res.json({ matricule_mode: mode, teachers })
})

// ─── POST /api/onboarding/step9 — Matricule config + Teachers ─
router.post('/step9', requireStep(9), (req, res) => {
  try {
    const { matricule_mode, teachers } = req.body

    if (!matricule_mode || !['custom', 'educmaster', 'manual'].includes(matricule_mode)) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Mode de matricule requis (custom, educmaster, manual)' })
    }

    const db = getDb()
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('matricule_mode', ?, datetime('now'))").run(matricule_mode)

    if (teachers && Array.isArray(teachers) && teachers.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO teachers (teacher_uid, full_name, phone, email)
        VALUES (?, ?, ?, ?)
      `)
      // Skip teachers that already exist by name (back-nav re-submit dedup)
      const existsStmt = db.prepare('SELECT id FROM teachers WHERE full_name = ? AND is_deleted = 0')
      db.transaction(() => {
        for (const t of teachers) {
          if (!t.full_name?.trim()) continue
          if (existsStmt.get(t.full_name.trim())) continue
          stmt.run(generateUUID(), t.full_name.trim(), t.phone?.trim() || null, t.email?.trim() || null)
        }
      })()
    }

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_TEACHERS', 'system', 'step9', ?)
    `).run(JSON.stringify({ matricule_mode, teachers_count: teachers?.length || 0 }))

    setCurrentStep(10)
    return res.json({ success: true, message: 'Configuration enregistrée', next_step: 10 })
  } catch (err) {
    console.error('[ONBOARDING STEP9]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

// ─── GET /api/onboarding/student-template/:classroomId — Excel template ─
router.get('/student-template/:classroomId', (req, res) => {
  const db = getDb()
  const classroom = db.prepare(`
    SELECT c.*, l.name AS level_name FROM classrooms c
    JOIN levels l ON l.id = c.level_id
    WHERE c.id = ?
  `).get(req.params.classroomId)

  if (!classroom) return res.status(404).json({ error: 'NOT_FOUND' })

  const mode = db.prepare("SELECT value FROM app_settings WHERE key = 'matricule_mode'").get()?.value || 'custom'

  const headers = ['Nom complet', 'Sexe (M/F)']
  if (mode === 'educmaster') headers.push('Matricule Educmaster')
  else if (mode === 'manual') headers.push('Matricule (optionnel)')
  headers.push('Date de naissance', 'Lieu de naissance', 'Nom du tuteur', 'Téléphone tuteur')

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers])

  // Set column widths
  ws['!cols'] = headers.map(() => ({ wch: 22 }))

  XLSX.utils.book_append_sheet(wb, ws, classroom.label || 'Élèves')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${(classroom.label || 'eleves').replace(/\s/g, '_')}.xlsx"`)
  return res.send(buf)
})

// ─── GET /api/onboarding/student-data — Classrooms + existing students ─
router.get('/student-data', (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const mode = db.prepare("SELECT value FROM app_settings WHERE key = 'matricule_mode'").get()?.value || 'custom'
  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id, l.name AS level_name FROM classrooms c
    JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(yearId || 0)

  const counts = {}
  for (const c of classrooms) {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM enrollments WHERE classroom_id = ? AND is_deleted = 0').get(c.id)
    counts[c.id] = row?.cnt || 0
  }

  return res.json({ classrooms, student_counts: counts, matricule_mode: mode, academic_year_id: yearId })
})

// ─── POST /api/onboarding/upload-students/:classroomId — Import Excel ─
router.post('/upload-students/:classroomId', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  try {
    const db = getDb()
    const classroomId = parseInt(req.params.classroomId)
    const yearId = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value || '0')
    const mode = db.prepare("SELECT value FROM app_settings WHERE key = 'matricule_mode'").get()?.value || 'custom'
    const schoolCode = db.prepare('SELECT school_code FROM school_config LIMIT 1').get()?.school_code || 'SCH'

    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(classroomId)
    if (!classroom) return res.status(404).json({ error: 'NOT_FOUND', message: 'Classe introuvable' })

    const wb = XLSX.read(req.body)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws)

    if (rows.length === 0) return res.status(400).json({ error: 'EMPTY', message: 'Fichier vide' })

    const errors = []
    const valid = []

    // Get existing student count for auto-matricule
    let seqNum = db.prepare('SELECT COUNT(*) as cnt FROM students').get()?.cnt || 0

    rows.forEach((row, i) => {
      const name = (row['Nom complet'] || '').trim()
      const gender = (row['Sexe (M/F)'] || '').trim().toUpperCase()

      if (!name) { errors.push({ row: i + 2, message: 'Nom complet manquant' }); return }
      if (gender && !['M', 'F'].includes(gender)) { errors.push({ row: i + 2, message: `Sexe invalide: "${gender}" (M ou F)` }); return }

      let matricule = null
      if (mode === 'educmaster') {
        matricule = (row['Matricule Educmaster'] || '').toString().trim()
        if (!matricule) { errors.push({ row: i + 2, message: 'Matricule Educmaster manquant' }); return }
      } else if (mode === 'manual') {
        matricule = (row['Matricule (optionnel)'] || '').toString().trim() || null
      } else {
        seqNum++
        const year = new Date().getFullYear()
        matricule = `${schoolCode}/${year}/${String(seqNum).padStart(4, '0')}`
      }

      valid.push({
        full_name: name,
        gender: gender || null,
        matricule,
        birth_date: (row['Date de naissance'] || '').toString().trim() || null,
        birth_place: (row['Lieu de naissance'] || '').toString().trim() || null,
        guardian_name: (row['Nom du tuteur'] || '').toString().trim() || null,
        guardian_phone: (row['Téléphone tuteur'] || '').toString().trim() || null,
      })
    })

    if (valid.length === 0) {
      return res.status(400).json({ error: 'NO_VALID', message: 'Aucune ligne valide', errors })
    }

    // Insert students + enrollments + guardians
    const studentStmt = db.prepare(`
      INSERT INTO students (student_uid, matricule, full_name, birth_date, birth_place, gender)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const enrollStmt = db.prepare(`
      INSERT INTO enrollments (enrollment_uid, student_id, classroom_id, academic_year_id)
      VALUES (?, ?, ?, ?)
    `)
    const guardianStmt = db.prepare(`
      INSERT INTO guardians (student_id, full_name, phone, is_primary)
      VALUES (?, ?, ?, 1)
    `)

    let imported = 0
    db.transaction(() => {
      for (const s of valid) {
        const result = studentStmt.run(generateUUID(), s.matricule, s.full_name, s.birth_date, s.birth_place, s.gender)
        const studentId = result.lastInsertRowid
        enrollStmt.run(generateUUID(), studentId, classroomId, yearId)
        if (s.guardian_name) {
          guardianStmt.run(studentId, s.guardian_name, s.guardian_phone)
        }
        imported++
      }
    })()

    return res.json({
      success: true,
      imported,
      errors,
      message: `${imported} élève(s) importé(s)${errors.length > 0 ? `, ${errors.length} erreur(s)` : ''}`,
    })
  } catch (err) {
    console.error('[UPLOAD STUDENTS]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

// ─── POST /api/onboarding/step10 — Advance after student import ─
router.post('/step10', requireStep(10), (req, res) => {
  const db = getDb()
  const studentCount = db.prepare('SELECT COUNT(*) as cnt FROM students').get()?.cnt || 0
  if (studentCount === 0) {
    return res.status(400).json({ error: 'NO_STUDENTS', message: 'Importez au moins des élèves dans une classe' })
  }

  db.prepare(`
    INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
    VALUES ('ONBOARDING_STUDENTS', 'system', 'step10', ?)
  `).run(JSON.stringify({ student_count: studentCount }))

  setCurrentStep(11)
  return res.json({ success: true, message: `${studentCount} élève(s) importé(s) au total`, next_step: 11 })
})

// ─── GET /api/onboarding/assignment-data — For teacher assignments ─
router.get('/assignment-data', (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id, l.name AS level_name FROM classrooms c
    JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(yearId || 0)
  const teachers = db.prepare('SELECT id, full_name FROM teachers WHERE is_active = 1 AND is_deleted = 0 ORDER BY full_name').all()
  const levelSubjects = db.prepare(`
    SELECT ls.level_id, ls.subject_id, s.name AS subject_name, s.short_code
    FROM level_subjects ls
    JOIN subjects s ON s.id = ls.subject_id
    WHERE ls.is_active = 1
    ORDER BY s.name
  `).all()
  const existing = db.prepare(`
    SELECT * FROM teacher_schedule WHERE academic_year_id = ?
  `).all(yearId || 0)
  return res.json({ classrooms, teachers, level_subjects: levelSubjects, existing_assignments: existing, academic_year_id: yearId })
})

// ─── POST /api/onboarding/step11 — Teacher assignments ──────
router.post('/step11', requireStep(11), (req, res) => {
  try {
    const { assignments } = req.body
    const db = getDb()
    const yearId = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value || '0')

    if (assignments && Array.isArray(assignments) && assignments.length > 0) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO teacher_schedule (teacher_id, classroom_id, subject_id, academic_year_id)
        VALUES (?, ?, ?, ?)
      `)
      db.transaction(() => {
        for (const a of assignments) {
          if (a.teacher_id && a.classroom_id && a.subject_id) {
            stmt.run(a.teacher_id, a.classroom_id, a.subject_id, yearId)
          }
        }
      })()
    }

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_ASSIGNMENTS', 'system', 'step11', ?)
    `).run(JSON.stringify({ count: assignments?.length || 0 }))

    setCurrentStep(12)
    return res.json({ success: true, message: 'Affectations enregistrées', next_step: 12 })
  } catch (err) {
    console.error('[ONBOARDING STEP11]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

// ─── GET /api/onboarding/fee-data — Classrooms for fee setup ─
router.get('/fee-data', (req, res) => {
  const db = getDb()
  const license = db.prepare('SELECT license_tier FROM license_state LIMIT 1').get()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')
  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id, c.expected_tuition, l.name AS level_name FROM classrooms c
    JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(yearId || 0)
  const existing = db.prepare('SELECT * FROM fee_structures WHERE academic_year_id = ? AND is_active = 1').all(yearId || 0)
  return res.json({ is_pro: license?.license_tier === 'PRO', classrooms, existing_fees: existing, periode_count: periodeCount, academic_year_id: yearId })
})

// ─── POST /api/onboarding/step12 — Fee structures (PRO) ─────
router.post('/step12', requireStep(12), (req, res) => {
  try {
    const db = getDb()
    const license = db.prepare('SELECT license_tier FROM license_state LIMIT 1').get()

    if (license?.license_tier !== 'PRO') {
      setCurrentStep(13)
      return res.json({ success: true, message: 'Licence Standard — frais non applicables', next_step: 13 })
    }

    const { fees } = req.body
    const yearId = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value || '0')

    if (fees && Array.isArray(fees) && fees.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO fee_structures (classroom_id, academic_year_id, semester, label, amount, due_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      db.transaction(() => {
        for (const f of fees) {
          if (f.classroom_id && f.label?.trim() && f.amount > 0) {
            stmt.run(f.classroom_id, yearId, f.semester || null, f.label.trim(), f.amount, f.due_date || null)
          }
        }
      })()
    }

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_FEES', 'system', 'step12', ?)
    `).run(JSON.stringify({ fees_count: fees?.length || 0 }))

    setCurrentStep(13)
    return res.json({ success: true, message: 'Frais configurés', next_step: 13 })
  } catch (err) {
    console.error('[ONBOARDING STEP12]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

// ─── GET /api/onboarding/summary — Final check ──────────────
router.get('/summary', (req, res) => {
  const db = getDb()
  const config = db.prepare('SELECT * FROM school_config LIMIT 1').get()
  const license = db.prepare('SELECT * FROM license_state LIMIT 1').get()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const year = yearId ? db.prepare('SELECT label FROM academic_years WHERE id = ?').get(yearId) : null
  const levels = db.prepare('SELECT COUNT(*) as cnt FROM levels WHERE is_active = 1').get()?.cnt || 0
  const classrooms = db.prepare('SELECT COUNT(*) as cnt FROM classrooms WHERE academic_year_id = ? AND is_deleted = 0').all(yearId || 0)[0]?.cnt || 0
  const students = db.prepare('SELECT COUNT(*) as cnt FROM students WHERE is_deleted = 0').get()?.cnt || 0
  const teachers = db.prepare('SELECT COUNT(*) as cnt FROM teachers WHERE is_deleted = 0').get()?.cnt || 0
  const users = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_deleted = 0').get()?.cnt || 0
  const subjects = db.prepare('SELECT COUNT(*) as cnt FROM level_subjects WHERE is_active = 1').get()?.cnt || 0
  const assignments = db.prepare('SELECT COUNT(*) as cnt FROM teacher_schedule WHERE academic_year_id = ?').get(yearId || 0)?.cnt || 0

  return res.json({
    school_name: config?.school_name, school_code: config?.school_code,
    tier: license?.license_tier, academic_year: year?.label,
    checks: [
      { label: 'Année académique', ok: !!yearId, value: year?.label || '—' },
      { label: 'Comptes utilisateurs', ok: users > 0, value: `${users}` },
      { label: 'Niveaux actifs', ok: levels > 0, value: `${levels}` },
      { label: 'Matières assignées', ok: subjects > 0, value: `${subjects}` },
      { label: 'Classes créées', ok: classrooms > 0, value: `${classrooms}` },
      { label: 'Enseignants', ok: teachers > 0, value: `${teachers}` },
      { label: 'Élèves importés', ok: students > 0, value: `${students}` },
      { label: 'Affectations enseignants', ok: assignments > 0, value: `${assignments}` },
    ],
    all_ok: !!yearId && users > 0 && levels > 0 && classrooms > 0 && students > 0 && teachers > 0,
  })
})

// ─── POST /api/onboarding/step13 — Finalize ─────────────────
router.post('/step13', requireStep(13), (req, res) => {
  try {
    const db = getDb()
    db.prepare('UPDATE school_config SET is_configured = 1, updated_at = datetime(\'now\') WHERE id = (SELECT id FROM school_config LIMIT 1)').run()

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
      VALUES ('ONBOARDING_COMPLETE', 'system', 'step13', '{}')
    `).run()

    setCurrentStep(14)
    return res.json({ success: true, message: 'Configuration terminée' })
  } catch (err) {
    console.error('[ONBOARDING STEP13]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
  }
})

module.exports = router
