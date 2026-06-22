const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

function getAppreciationScale(db) {
  const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'appreciation_scale'").get()?.value
  try { return JSON.parse(raw) } catch { return [] }
}

function getAppreciation(avg, scale) {
  if (avg === null || avg === undefined) return ''
  for (const s of scale) {
    if (avg >= s.min && avg <= s.max) return s.label
  }
  return ''
}

function computeRanking(items) {
  const sorted = [...items].filter(i => i.average !== null).sort((a, b) => b.average - a.average)
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].average < sorted[i - 1].average) rank = i + 1
    sorted[i].rank = rank
    sorted[i].rank_suffix = (i > 0 && sorted[i].average === sorted[i - 1].average) ? 'ex' : ''
  }
  const rankMap = {}
  sorted.forEach(s => { rankMap[s.student_id] = { rank: s.rank, suffix: s.rank_suffix } })
  return rankMap
}

// ─── GET /api/grades/selectors — Classrooms + subjects for picker ─
router.get('/selectors', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id, l.name AS level_name
    FROM classrooms c JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(yearId || 0)

  return res.json({ classrooms, periode_count: periodeCount, academic_year_id: yearId })
})

// ─── GET /api/grades/subjects/:classroomId — Subjects for a classroom ─
router.get('/subjects/:classroomId', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const classroom = db.prepare('SELECT level_id FROM classrooms WHERE id = ?').get(req.params.classroomId)
  if (!classroom) return res.status(404).json({ error: 'NOT_FOUND' })

  const subjects = db.prepare(`
    SELECT ls.subject_id, s.name AS subject_name, s.short_code, ls.coefficient
    FROM level_subjects ls
    JOIN subjects s ON s.id = ls.subject_id
    WHERE ls.level_id = ? AND ls.is_active = 1
    ORDER BY s.name
  `).all(classroom.level_id)

  return res.json({ subjects })
})

// ─── GET /api/grades/:classroomId/:subjectId/:semester — Full grade table ─
router.get('/:classroomId/:subjectId/:semester', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const { classroomId, subjectId, semester } = req.params
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const scale = getAppreciationScale(db)

  // Get students in this classroom
  const students = db.prepare(`
    SELECT s.id AS student_id, s.full_name, s.matricule
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
    WHERE s.is_deleted = 0
    ORDER BY s.full_name
  `).all(classroomId)

  // Get assessment templates for this class+subject+semester
  const templates = db.prepare(`
    SELECT id, assessment_type, sequence_number, max_score, weight, label
    FROM assessment_templates
    WHERE classroom_id = ? AND subject_id = ? AND academic_year_id = ? AND semester = ?
    ORDER BY
      CASE assessment_type WHEN 'interrogation' THEN 1 WHEN 'devoir' THEN 2 WHEN 'composition' THEN 3 WHEN 'tp' THEN 4 WHEN 'oral' THEN 5 END,
      sequence_number
  `).all(classroomId, subjectId, yearId, semester)

  // Get all existing scores
  const scoreRows = db.prepare(`
    SELECT template_id, student_id, score, is_absent
    FROM assessment_scores
    WHERE template_id IN (${templates.map(() => '?').join(',')}) AND is_deleted = 0
  `).all(...templates.map(t => t.id))

  const scoreMap = {}
  scoreRows.forEach(s => { scoreMap[`${s.template_id}_${s.student_id}`] = s })

  // Get coefficient
  const classroom = db.prepare('SELECT level_id FROM classrooms WHERE id = ?').get(classroomId)
  const levelSubject = db.prepare('SELECT coefficient FROM level_subjects WHERE level_id = ? AND subject_id = ? AND is_active = 1').get(classroom?.level_id, subjectId)
  const coefficient = levelSubject?.coefficient || 1

  // Build rows with computed columns
  const rows = students.map(student => {
    const scores = {}
    let totalGraded = 0

    templates.forEach(t => {
      const key = `${t.id}_${student.student_id}`
      const existing = scoreMap[key]
      scores[t.id] = {
        template_id: t.id,
        score: existing?.score ?? null,
        is_absent: existing?.is_absent === 1,
      }
      if (existing && (existing.score !== null || existing.is_absent === 1)) totalGraded++
    })

    // Compute averages
    const byType = {}
    templates.forEach(t => {
      if (!byType[t.assessment_type]) byType[t.assessment_type] = { total: 0, count: 0, weight: t.weight, max: t.max_score }
      const s = scores[t.id]
      if (s.score !== null && !s.is_absent) {
        byType[t.assessment_type].total += s.score
        byType[t.assessment_type].count++
      }
    })

    const typeAverages = {}
    let weightedSum = 0, weightTotal = 0
    for (const [type, data] of Object.entries(byType)) {
      if (data.count > 0) {
        const avg = (data.total / data.count) * (data.max === 20 ? 1 : 20 / data.max)
        typeAverages[type] = parseFloat(avg.toFixed(2))
        weightedSum += avg * data.weight
        weightTotal += data.weight
      } else {
        typeAverages[type] = null
      }
    }

    const average = weightTotal > 0 ? parseFloat((weightedSum / weightTotal).toFixed(2)) : null
    const moyCoef = average !== null ? parseFloat((average * coefficient).toFixed(2)) : null

    return {
      student_id: student.student_id,
      full_name: student.full_name,
      matricule: student.matricule,
      scores,
      type_averages: typeAverages,
      average,
      coefficient,
      moy_coef: moyCoef,
      appreciation: getAppreciation(average, scale),
      graded: totalGraded,
      total_assessments: templates.length,
    }
  })

  // Compute ranking
  const rankMap = computeRanking(rows)
  rows.forEach(r => {
    const rk = rankMap[r.student_id]
    r.rank = rk?.rank || null
    r.rank_suffix = rk?.suffix || ''
  })

  // Class stats
  const validAverages = rows.filter(r => r.average !== null).map(r => r.average)
  const classStats = {
    class_average: validAverages.length > 0 ? parseFloat((validAverages.reduce((a, b) => a + b, 0) / validAverages.length).toFixed(2)) : null,
    highest: validAverages.length > 0 ? Math.max(...validAverages) : null,
    lowest: validAverages.length > 0 ? Math.min(...validAverages) : null,
    graded_count: rows.filter(r => r.graded > 0).length,
    total_count: rows.length,
  }

  return res.json({ templates, rows, class_stats: classStats, coefficient })
})

// ─── POST /api/grades/batch — Save scores ───────────────────
router.post('/batch', requirePermission('grades.edit'), (req, res) => {
  const { scores } = req.body
  if (!scores || !Array.isArray(scores)) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const db = getDb()
  const upsert = db.prepare(`
    INSERT INTO assessment_scores (template_id, student_id, score, is_absent, entered_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(template_id, student_id) DO UPDATE SET
      score = excluded.score, is_absent = excluded.is_absent,
      entered_by = excluded.entered_by, entered_at = datetime('now'), is_deleted = 0
  `)

  let saved = 0
  db.transaction(() => {
    for (const s of scores) {
      if (!s.template_id || !s.student_id) continue
      upsert.run(s.template_id, s.student_id, s.score ?? null, s.is_absent ? 1 : 0, req.user.id)
      saved++
    }
  })()

  return res.json({ success: true, saved })
})

// ─── POST /api/grades/compute/:classroomId/:semester — Compute averages ─
router.post('/compute/:classroomId/:semester', requirePermission('grades.edit'), (req, res) => {
  const db = getDb()
  const { classroomId, semester } = req.params
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const scale = getAppreciationScale(db)

  const classroom = db.prepare('SELECT level_id FROM classrooms WHERE id = ? AND is_deleted = 0').get(classroomId)
  if (!classroom) return res.status(404).json({ error: 'NOT_FOUND' })

  const students = db.prepare(`
    SELECT s.id AS student_id FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
    WHERE s.is_deleted = 0
  `).all(classroomId)

  const levelSubjects = db.prepare('SELECT subject_id, coefficient FROM level_subjects WHERE level_id = ? AND is_active = 1').all(classroom.level_id)

  const classSize = students.length

  // Compute subject averages per student
  const studentResults = students.map(student => {
    let totalWeightedPoints = 0
    let totalCoefficients = 0
    const subjectAvgs = []

    for (const ls of levelSubjects) {
      const templates = db.prepare(`
        SELECT id, assessment_type, max_score, weight FROM assessment_templates
        WHERE classroom_id = ? AND subject_id = ? AND academic_year_id = ? AND semester = ?
      `).all(classroomId, ls.subject_id, yearId, semester)

      const byType = {}
      for (const t of templates) {
        const score = db.prepare('SELECT score, is_absent FROM assessment_scores WHERE template_id = ? AND student_id = ? AND is_deleted = 0').get(t.id, student.student_id)
        if (!byType[t.assessment_type]) byType[t.assessment_type] = { total: 0, count: 0, weight: t.weight, max: t.max_score }
        if (score && score.score !== null && score.is_absent !== 1) {
          byType[t.assessment_type].total += score.score
          byType[t.assessment_type].count++
        }
      }

      let weightedSum = 0, weightTotal = 0
      for (const data of Object.values(byType)) {
        if (data.count > 0) {
          const avg = (data.total / data.count) * (data.max === 20 ? 1 : 20 / data.max)
          weightedSum += avg * data.weight
          weightTotal += data.weight
        }
      }

      const rawAverage = weightTotal > 0 ? parseFloat((weightedSum / weightTotal).toFixed(2)) : null
      const weightedAverage = rawAverage !== null ? parseFloat((rawAverage * ls.coefficient).toFixed(2)) : null

      if (rawAverage !== null) {
        totalWeightedPoints += weightedAverage
        totalCoefficients += ls.coefficient
      }

      subjectAvgs.push({
        student_id: student.student_id,
        subject_id: ls.subject_id,
        coefficient: ls.coefficient,
        raw_average: rawAverage,
        weighted_average: weightedAverage,
      })
    }

    const semesterAverage = totalCoefficients > 0 ? parseFloat((totalWeightedPoints / totalCoefficients).toFixed(2)) : null

    return {
      student_id: student.student_id,
      subject_averages: subjectAvgs,
      semester_average: semesterAverage,
      total_weighted_points: totalWeightedPoints,
      total_coefficients: totalCoefficients,
    }
  })

  // Compute semester rankings (1224)
  const semesterRankMap = computeRanking(studentResults.map(r => ({ student_id: r.student_id, average: r.semester_average })))

  // Compute per-subject rankings
  const subjectRankMaps = {}
  for (const ls of levelSubjects) {
    const items = studentResults.map(r => {
      const sa = r.subject_averages.find(a => a.subject_id === ls.subject_id)
      return { student_id: r.student_id, average: sa?.raw_average ?? null }
    })
    subjectRankMaps[ls.subject_id] = computeRanking(items)
  }

  // Compute class-level stats per subject
  const subjectClassStats = {}
  for (const ls of levelSubjects) {
    const avgs = studentResults.map(r => r.subject_averages.find(a => a.subject_id === ls.subject_id)?.raw_average).filter(a => a !== null)
    subjectClassStats[ls.subject_id] = {
      highest: avgs.length > 0 ? Math.max(...avgs) : null,
      lowest: avgs.length > 0 ? Math.min(...avgs) : null,
      class_average: avgs.length > 0 ? parseFloat((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2)) : null,
    }
  }

  // Semester class stats
  const semAvgs = studentResults.map(r => r.semester_average).filter(a => a !== null)
  const classHighest = semAvgs.length > 0 ? Math.max(...semAvgs) : null
  const classLowest = semAvgs.length > 0 ? Math.min(...semAvgs) : null
  const classOverall = semAvgs.length > 0 ? parseFloat((semAvgs.reduce((a, b) => a + b, 0) / semAvgs.length).toFixed(2)) : null

  // Store everything in DB
  db.transaction(() => {
    // Clear old data for this classroom+semester
    db.prepare('DELETE FROM subject_averages WHERE classroom_id = ? AND academic_year_id = ? AND semester = ?').run(classroomId, yearId, semester)
    db.prepare('DELETE FROM semester_summaries WHERE classroom_id = ? AND academic_year_id = ? AND semester = ?').run(classroomId, yearId, semester)

    const saStmt = db.prepare(`
      INSERT INTO subject_averages (student_id, classroom_id, subject_id, academic_year_id, semester, raw_average, coefficient, weighted_average, subject_rank, class_highest_score, class_lowest_score, class_subject_average)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const ssStmt = db.prepare(`
      INSERT INTO semester_summaries (student_id, classroom_id, academic_year_id, semester, total_weighted_points, total_coefficients, semester_average, class_rank, class_size, class_highest_average, class_lowest_average, class_overall_average, mention)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const r of studentResults) {
      for (const sa of r.subject_averages) {
        const subjRank = subjectRankMaps[sa.subject_id]?.[r.student_id]?.rank || null
        const cs = subjectClassStats[sa.subject_id]
        saStmt.run(r.student_id, classroomId, sa.subject_id, yearId, semester, sa.raw_average, sa.coefficient, sa.weighted_average, subjRank, cs.highest, cs.lowest, cs.class_average)
      }

      const semRank = semesterRankMap[r.student_id]?.rank || null
      const mention = getAppreciation(r.semester_average, scale)
      ssStmt.run(r.student_id, classroomId, yearId, semester, r.total_weighted_points, r.total_coefficients, r.semester_average, semRank, classSize, classHighest, classLowest, classOverall, mention || null)
    }
  })()

  return res.json({ success: true, computed: studentResults.length })
})

// ─── GET /api/grades/summary/:classroomId/:semester — Computed summaries ─
router.get('/summary/:classroomId/:semester', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  const summaries = db.prepare(`
    SELECT ss.*, s.full_name, s.matricule
    FROM semester_summaries ss
    JOIN students s ON s.id = ss.student_id
    WHERE ss.classroom_id = ? AND ss.academic_year_id = ? AND ss.semester = ?
    ORDER BY ss.class_rank, s.full_name
  `).all(req.params.classroomId, yearId, req.params.semester)

  return res.json({ summaries })
})

// ─── GET /api/grades/dashboard — Dashboard stats ────────────
router.get('/dashboard/stats', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const year = db.prepare('SELECT label FROM academic_years WHERE id = ?').get(yearId)
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

  const totalStudents = db.prepare('SELECT COUNT(*) as cnt FROM enrollments WHERE academic_year_id = ? AND is_deleted = 0').get(yearId || 0)?.cnt || 0
  const totalClassrooms = db.prepare('SELECT COUNT(*) as cnt FROM classrooms WHERE academic_year_id = ? AND is_deleted = 0').get(yearId || 0)?.cnt || 0
  const totalTeachers = db.prepare('SELECT COUNT(*) as cnt FROM teachers WHERE is_active = 1 AND is_deleted = 0').get()?.cnt || 0

  // Grade entry progress per semester
  const semesters = []
  for (let s = 1; s <= periodeCount; s++) {
    const totalTemplates = db.prepare(`
      SELECT COUNT(*) as cnt FROM assessment_templates WHERE academic_year_id = ? AND semester = ?
    `).get(yearId || 0, s)?.cnt || 0

    const totalScores = db.prepare(`
      SELECT COUNT(*) as cnt FROM assessment_scores sc
      JOIN assessment_templates t ON t.id = sc.template_id
      WHERE t.academic_year_id = ? AND t.semester = ? AND sc.is_deleted = 0 AND (sc.score IS NOT NULL OR sc.is_absent = 1)
    `).get(yearId || 0, s)?.cnt || 0

    const totalExpected = totalTemplates * totalStudents
    const pct = totalExpected > 0 ? Math.round((totalScores / totalExpected) * 100) : 0

    const computed = db.prepare('SELECT COUNT(DISTINCT classroom_id) as cnt FROM semester_summaries WHERE academic_year_id = ? AND semester = ?').get(yearId || 0, s)?.cnt || 0
    const bulletins = db.prepare('SELECT COUNT(*) as cnt FROM report_card_snapshots WHERE academic_year_id = ? AND semester = ?').get(yearId || 0, s)?.cnt || 0

    semesters.push({
      semester: s,
      grades_entered_pct: pct,
      classrooms_computed: computed,
      bulletins_generated: bulletins,
    })
  }

  // Recent report cards
  const recentBulletins = db.prepare(`
    SELECT rc.id, rc.semester, rc.generated_at, s.full_name, c.label AS classroom_label
    FROM report_card_snapshots rc
    JOIN students s ON s.id = rc.student_id
    JOIN classrooms c ON c.id = rc.classroom_id
    WHERE rc.academic_year_id = ?
    ORDER BY rc.generated_at DESC LIMIT 5
  `).all(yearId || 0)

  return res.json({
    academic_year: year?.label,
    total_students: totalStudents,
    total_classrooms: totalClassrooms,
    total_teachers: totalTeachers,
    semesters,
    recent_bulletins: recentBulletins,
  })
})

module.exports = router
