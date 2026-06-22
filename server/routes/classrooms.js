const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

// ─── GET /api/classrooms — List for current year ────────────
router.get('/', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id, c.serie_id, c.capacity, c.expected_tuition,
           l.name AS level_name, l.display_order,
           (SELECT COUNT(*) FROM enrollments e WHERE e.classroom_id = c.id AND e.is_deleted = 0) AS student_count
    FROM classrooms c
    JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(yearId || 0)
  return res.json({ classrooms })
})

// ─── GET /api/classrooms/:id — Detail ───────────────────────
router.get('/:id', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const classroom = db.prepare(`
    SELECT c.*, l.name AS level_name FROM classrooms c
    JOIN levels l ON l.id = c.level_id WHERE c.id = ? AND c.is_deleted = 0
  `).get(req.params.id)
  if (!classroom) return res.status(404).json({ error: 'NOT_FOUND' })

  const students = db.prepare(`
    SELECT s.id, s.matricule, s.full_name, s.gender, s.status
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
    WHERE s.is_deleted = 0
    ORDER BY s.full_name
  `).all(req.params.id)

  const teachers = db.prepare(`
    SELECT ts.subject_id, sub.name AS subject_name, t.full_name AS teacher_name
    FROM teacher_schedule ts
    JOIN teachers t ON t.id = ts.teacher_id
    JOIN subjects sub ON sub.id = ts.subject_id
    WHERE ts.classroom_id = ? AND ts.academic_year_id = (SELECT value FROM app_settings WHERE key = 'current_academic_year_id')
  `).all(req.params.id)

  const totalRooms = db.prepare("SELECT value FROM app_settings WHERE key = 'total_rooms'").get()?.value || null

  return res.json({ classroom, students, teachers, total_rooms: totalRooms })
})

// ─── PUT /api/classrooms/:id — Update label, capacity ──────
router.put('/:id', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { label, capacity } = req.body
  const classroom = db.prepare('SELECT id FROM classrooms WHERE id = ? AND is_deleted = 0').get(req.params.id)
  if (!classroom) return res.status(404).json({ error: 'NOT_FOUND' })

  if (label) db.prepare('UPDATE classrooms SET label = ?, updated_at = datetime(\'now\') WHERE id = ?').run(label.trim(), req.params.id)
  if (capacity !== undefined) db.prepare('UPDATE classrooms SET capacity = ?, updated_at = datetime(\'now\') WHERE id = ?').run(capacity, req.params.id)

  return res.json({ success: true })
})

// ─── DELETE /api/classrooms/:id — Soft delete (no students) ─
router.delete('/:id', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const count = db.prepare('SELECT COUNT(*) as cnt FROM enrollments WHERE classroom_id = ? AND is_deleted = 0').get(req.params.id)?.cnt || 0
  if (count > 0) {
    return res.status(400).json({ error: 'HAS_STUDENTS', message: `Réaffectez les ${count} élève(s) avant de supprimer cette classe` })
  }
  db.prepare('UPDATE classrooms SET is_deleted = 1, deleted_at = datetime(\'now\') WHERE id = ?').run(req.params.id)
  return res.json({ success: true })
})

// ─── POST /api/classrooms/:id/bulk-transfer — Move multiple students ─
router.post('/:id/bulk-transfer', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { student_ids, target_classroom_id } = req.body
  if (!student_ids?.length || !target_classroom_id) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const stmt = db.prepare('UPDATE enrollments SET classroom_id = ? WHERE student_id = ? AND academic_year_id = ? AND is_deleted = 0')

  db.transaction(() => {
    for (const sid of student_ids) stmt.run(target_classroom_id, sid, yearId)
  })()

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
    VALUES (?, 'BULK_TRANSFER', 'classroom', ?, ?)
  `).run(req.user.id, req.params.id, JSON.stringify({ count: student_ids.length, target: target_classroom_id }))

  return res.json({ success: true, moved: student_ids.length })
})

module.exports = router
