const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

// ─── GET /api/decisions/:classroomId/:semester — All decisions ─
router.get('/:classroomId/:semester', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const { classroomId, semester } = req.params
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  const students = db.prepare(`
    SELECT s.id AS student_id, s.full_name, s.matricule,
           ss.semester_average, ss.class_rank, ss.mention
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
    LEFT JOIN semester_summaries ss ON ss.student_id = s.id AND ss.classroom_id = ? AND ss.academic_year_id = ? AND ss.semester = ?
    WHERE s.is_deleted = 0
    ORDER BY s.full_name
  `).all(classroomId, classroomId, yearId, semester)

  const decisions = db.prepare(`
    SELECT * FROM semester_decisions
    WHERE classroom_id = ? AND academic_year_id = ? AND semester = ?
  `).all(classroomId, yearId, semester)

  const decMap = {}
  decisions.forEach(d => { decMap[d.student_id] = d })

  const rows = students.map(s => ({
    ...s,
    decision: decMap[s.student_id] || null,
  }))

  return res.json({ students: rows })
})

// ─── POST /api/decisions/:classroomId/:semester — Save decisions ─
router.post('/:classroomId/:semester', requirePermission('grades.edit'), (req, res) => {
  const db = getDb()
  const { classroomId, semester } = req.params
  const { decisions } = req.body
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  if (!decisions || !Array.isArray(decisions)) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const stmt = db.prepare(`
    INSERT INTO semester_decisions (student_id, classroom_id, academic_year_id, semester, conduite_score, avertissement, blame, exclusion_temporaire, felicitation, encouragement, tableau_honneur, conseil_decision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, classroom_id, academic_year_id, semester) DO UPDATE SET
      conduite_score = excluded.conduite_score, avertissement = excluded.avertissement,
      blame = excluded.blame, exclusion_temporaire = excluded.exclusion_temporaire,
      felicitation = excluded.felicitation, encouragement = excluded.encouragement,
      tableau_honneur = excluded.tableau_honneur, conseil_decision = excluded.conseil_decision,
      updated_at = datetime('now')
  `)

  let saved = 0
  db.transaction(() => {
    for (const d of decisions) {
      if (!d.student_id) continue
      stmt.run(d.student_id, classroomId, yearId, semester,
        d.conduite_score ?? null, d.avertissement ? 1 : 0, d.blame ? 1 : 0, d.exclusion_temporaire ? 1 : 0,
        d.felicitation ? 1 : 0, d.encouragement ? 1 : 0, d.tableau_honneur ? 1 : 0, d.conseil_decision || null)
      saved++
    }
  })()

  return res.json({ success: true, saved })
})

module.exports = router
