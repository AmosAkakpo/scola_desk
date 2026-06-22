const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { generateUUID } = require('../utils/uid')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

// ─── GET /api/teachers — List with search + filters ─────────
router.get('/', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const { search, status } = req.query
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  let query = `
    SELECT t.id, t.teacher_uid, t.matricule, t.full_name, t.phone, t.email, t.is_active
    FROM teachers t
    WHERE t.is_deleted = 0
  `
  const params = []

  if (search) { query += ` AND (t.full_name LIKE ? OR t.matricule LIKE ?)`; params.push(`%${search}%`, `%${search}%`) }
  if (status === 'active') { query += ` AND t.is_active = 1` }
  else if (status === 'inactive') { query += ` AND t.is_active = 0` }

  query += ` ORDER BY t.full_name`
  const teachers = db.prepare(query).all(...params)

  // Attach assignments count per teacher
  const assignStmt = db.prepare('SELECT COUNT(*) as cnt FROM teacher_schedule WHERE teacher_id = ? AND academic_year_id = ?')
  const classStmt = db.prepare(`
    SELECT DISTINCT c.label FROM teacher_schedule ts
    JOIN classrooms c ON c.id = ts.classroom_id
    WHERE ts.teacher_id = ? AND ts.academic_year_id = ?
  `)

  for (const t of teachers) {
    t.assignment_count = assignStmt.get(t.id, yearId || 0)?.cnt || 0
    t.classrooms = classStmt.all(t.id, yearId || 0).map(r => r.label)
  }

  return res.json({ teachers })
})

// ─── GET /api/teachers/:id — Full profile ───────────────────
router.get('/:id', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ? AND is_deleted = 0').get(req.params.id)
  if (!teacher) return res.status(404).json({ error: 'NOT_FOUND', message: 'Enseignant introuvable' })

  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  const assignments = db.prepare(`
    SELECT ts.classroom_id, ts.subject_id, c.label AS classroom_label, sub.name AS subject_name, l.name AS level_name
    FROM teacher_schedule ts
    JOIN classrooms c ON c.id = ts.classroom_id
    JOIN subjects sub ON sub.id = ts.subject_id
    JOIN levels l ON l.id = c.level_id
    WHERE ts.teacher_id = ? AND ts.academic_year_id = ?
    ORDER BY l.display_order, c.label, sub.name
  `).all(req.params.id, yearId || 0)

  const history = db.prepare(`
    SELECT ts.academic_year_id, ay.label AS year_label, c.label AS classroom_label, sub.name AS subject_name
    FROM teacher_schedule ts
    JOIN academic_years ay ON ay.id = ts.academic_year_id
    JOIN classrooms c ON c.id = ts.classroom_id
    JOIN subjects sub ON sub.id = ts.subject_id
    WHERE ts.teacher_id = ?
    ORDER BY ay.label DESC, c.label
  `).all(req.params.id)

  // Group history by year
  const yearMap = {}
  for (const row of history) {
    if (!yearMap[row.year_label]) yearMap[row.year_label] = []
    yearMap[row.year_label].push({ classroom: row.classroom_label, subject: row.subject_name })
  }

  return res.json({ teacher, assignments, history: Object.entries(yearMap).map(([year, items]) => ({ year, items })) })
})

// ─── PUT /api/teachers/:id — Update info ────────────────────
router.put('/:id', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { full_name, phone, email } = req.body
  const teacher = db.prepare('SELECT id FROM teachers WHERE id = ? AND is_deleted = 0').get(req.params.id)
  if (!teacher) return res.status(404).json({ error: 'NOT_FOUND' })

  db.prepare('UPDATE teachers SET full_name = ?, phone = ?, email = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(full_name?.trim(), phone || null, email || null, req.params.id)

  return res.json({ success: true })
})

// ─── POST /api/teachers — Add new teacher ───────────────────
router.post('/', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { full_name, phone, email } = req.body
  if (!full_name?.trim()) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Nom requis' })

  const result = db.prepare('INSERT INTO teachers (teacher_uid, full_name, phone, email) VALUES (?, ?, ?, ?)')
    .run(generateUUID(), full_name.trim(), phone || null, email || null)

  return res.status(201).json({ success: true, teacher_id: result.lastInsertRowid })
})

module.exports = router
