function migration010(db) {
  db.exec(`ALTER TABLE enrollments ADD COLUMN is_expelled INTEGER DEFAULT 0`)
  db.exec(`ALTER TABLE semester_decisions ADD COLUMN conseil_decision_pass INTEGER DEFAULT NULL`)
}

module.exports = { migration010 }
