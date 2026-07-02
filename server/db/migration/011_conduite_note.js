function migration011(db) {
  db.exec(`ALTER TABLE semester_decisions ADD COLUMN conduite_note TEXT`)
}

module.exports = { migration011 }
