function autoAssignMandatoryFees(db, studentId, yearId) {
  const mandatoryFees = db.prepare(
    'SELECT id FROM fee_types WHERE academic_year_id = ? AND is_mandatory = 1 AND is_active = 1'
  ).all(yearId)

  if (mandatoryFees.length === 0) return

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO student_fee_selections (student_id, fee_type_id, academic_year_id, opted_in)
    VALUES (?, ?, ?, 1)
  `)

  for (const ft of mandatoryFees) {
    stmt.run(studentId, ft.id, yearId)
  }
}

module.exports = { autoAssignMandatoryFees }
