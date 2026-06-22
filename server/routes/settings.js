const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

// ─── GET /api/settings — All settings ───────────────────────
router.get('/', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM app_settings').all()
  const settings = {}
  rows.forEach(r => { settings[r.key] = r.value })

  // Parse JSON settings
  let appreciationScale = []
  try { appreciationScale = JSON.parse(settings.appreciation_scale || '[]') } catch {}
  if (appreciationScale.length === 0) {
    appreciationScale = [
      { min: 16, max: 20, label: 'Très Bien' },
      { min: 14, max: 15.99, label: 'Bien' },
      { min: 12, max: 13.99, label: 'Assez Bien' },
      { min: 10, max: 11.99, label: 'Passable' },
      { min: 8, max: 9.99, label: 'Médiocre' },
      { min: 0, max: 7.99, label: 'Faible' },
    ]
  }

  let schoolSections = []
  try { schoolSections = JSON.parse(settings.school_section_config || '[]') } catch {}

  const logoPath = settings.school_logo_path || null
  let logoExists = false
  if (logoPath) {
    const fullPath = path.join(__dirname, '../../data', logoPath)
    logoExists = fs.existsSync(fullPath)
  }

  return res.json({
    appreciation_scale: appreciationScale,
    school_sections: schoolSections,
    school_logo_path: logoExists ? logoPath : null,
    total_rooms: settings.total_rooms || '',
    matricule_mode: settings.matricule_mode || 'custom',
  })
})

// ─── PUT /api/settings/appreciation-scale ────────────────────
router.put('/appreciation-scale', requirePermission('students.edit'), (req, res) => {
  const { scale } = req.body
  if (!Array.isArray(scale)) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('appreciation_scale', ?, datetime('now'))").run(JSON.stringify(scale))
  return res.json({ success: true })
})

// ─── PUT /api/settings/school-sections ───────────────────────
router.put('/school-sections', requirePermission('students.edit'), (req, res) => {
  const { sections } = req.body
  if (!Array.isArray(sections)) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('school_section_config', ?, datetime('now'))").run(JSON.stringify(sections))
  return res.json({ success: true })
})

// ─── POST /api/settings/school-logo — Upload logo ───────────
router.post('/school-logo', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  try {
    const logoDir = path.join(__dirname, '../../data/logos')
    if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true })

    const filename = 'school-logo.png'
    const filePath = path.join(logoDir, filename)
    fs.writeFileSync(filePath, req.body)

    const db = getDb()
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('school_logo_path', ?, datetime('now'))").run(`logos/${filename}`)

    return res.json({ success: true, path: `logos/${filename}` })
  } catch (err) {
    return res.status(500).json({ error: 'UPLOAD_FAILED', message: err.message })
  }
})

// ─── DELETE /api/settings/school-logo — Remove logo ─────────
router.delete('/school-logo', (req, res) => {
  const db = getDb()
  const logoPath = db.prepare("SELECT value FROM app_settings WHERE key = 'school_logo_path'").get()?.value
  if (logoPath) {
    const fullPath = path.join(__dirname, '../../data', logoPath)
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
  }
  db.prepare("DELETE FROM app_settings WHERE key = 'school_logo_path'").run()
  return res.json({ success: true })
})

// ─── Serve logo file ─────────────────────────────────────────
router.get('/school-logo', (req, res) => {
  const db = getDb()
  const logoPath = db.prepare("SELECT value FROM app_settings WHERE key = 'school_logo_path'").get()?.value
  if (!logoPath) return res.status(404).json({ error: 'NO_LOGO' })
  const fullPath = path.join(__dirname, '../../data', logoPath)
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'FILE_NOT_FOUND' })
  res.sendFile(fullPath)
})

// ─── GET /api/settings/academic — Academic settings ──────────
router.get('/academic', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const year = yearId ? db.prepare('SELECT * FROM academic_years WHERE id = ?').get(yearId) : null
  const periodeType = db.prepare("SELECT value FROM app_settings WHERE key = 'periode_type'").get()?.value || 'trimestre'
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

  const levels = db.prepare('SELECT * FROM levels WHERE is_active = 1 ORDER BY display_order').all()

  // Assessment configs per level
  const assessConfigs = {}
  for (const l of levels) {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(`assessment_config_${l.id}`)
    assessConfigs[l.id] = row ? JSON.parse(row.value) : { interrogations: 4, devoirs: 1, compositions: 1, max_score: 20 }
  }

  // Subject-level assignments
  const levelSubjects = db.prepare(`
    SELECT ls.id, ls.level_id, ls.subject_id, ls.coefficient, s.name AS subject_name
    FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id
    WHERE ls.is_active = 1 ORDER BY ls.level_id, s.name
  `).all()

  // Teacher assignments
  const assignments = db.prepare(`
    SELECT ts.id, ts.teacher_id, ts.classroom_id, ts.subject_id,
           t.full_name AS teacher_name, c.label AS classroom_label, sub.name AS subject_name
    FROM teacher_schedule ts
    JOIN teachers t ON t.id = ts.teacher_id
    JOIN classrooms c ON c.id = ts.classroom_id
    JOIN subjects sub ON sub.id = ts.subject_id
    WHERE ts.academic_year_id = ?
    ORDER BY c.label, sub.name
  `).all(yearId || 0)

  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id FROM classrooms c
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY c.label
  `).all(yearId || 0)

  const teachers = db.prepare('SELECT id, full_name FROM teachers WHERE is_active = 1 AND is_deleted = 0 ORDER BY full_name').all()
  const subjects = db.prepare('SELECT id, name FROM subjects WHERE is_active = 1 ORDER BY name').all()

  return res.json({
    academic_year: year, periode_type: periodeType, periode_count: periodeCount,
    levels, assess_configs: assessConfigs, level_subjects: levelSubjects,
    assignments, classrooms, teachers, subjects,
  })
})

// ─── PUT /api/settings/assessment-config — Update per level ──
router.put('/assessment-config', requirePermission('students.edit'), (req, res) => {
  const { configs } = req.body
  if (!configs || !Array.isArray(configs)) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  for (const c of configs) {
    if (!c.level_id) continue
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))")
      .run(`assessment_config_${c.level_id}`, JSON.stringify({ interrogations: c.interrogations || 0, devoirs: c.devoirs || 0, compositions: c.compositions || 0, max_score: c.max_score || 20 }))
  }
  return res.json({ success: true })
})

// ─── PUT /api/settings/level-subject — Update coefficient ────
router.put('/level-subject/:id', requirePermission('students.edit'), (req, res) => {
  const { coefficient } = req.body
  const db = getDb()
  db.prepare('UPDATE level_subjects SET coefficient = ? WHERE id = ?').run(coefficient || 1, req.params.id)
  return res.json({ success: true })
})

// ─── PUT /api/settings/teacher-assignment — Reassign teacher ─
router.put('/teacher-assignment/:id', requirePermission('students.edit'), (req, res) => {
  const { teacher_id } = req.body
  const db = getDb()
  db.prepare('UPDATE teacher_schedule SET teacher_id = ? WHERE id = ?').run(teacher_id, req.params.id)
  return res.json({ success: true })
})

// ─── POST /api/settings/teacher-assignment — New assignment ──
router.post('/teacher-assignment', requirePermission('students.edit'), (req, res) => {
  const { teacher_id, classroom_id, subject_id } = req.body
  if (!teacher_id || !classroom_id || !subject_id) return res.status(400).json({ error: 'MISSING_FIELDS' })
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  db.prepare('INSERT OR REPLACE INTO teacher_schedule (teacher_id, classroom_id, subject_id, academic_year_id) VALUES (?, ?, ?, ?)')
    .run(teacher_id, classroom_id, subject_id, yearId)
  return res.json({ success: true })
})

// ─── DELETE /api/settings/teacher-assignment/:id — Remove ────
router.delete('/teacher-assignment/:id', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM teacher_schedule WHERE id = ?').run(req.params.id)
  return res.json({ success: true })
})

module.exports = router
