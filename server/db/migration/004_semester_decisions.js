function migration004(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semester_decisions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id            INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      classroom_id          INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE RESTRICT,
      academic_year_id      INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester              INTEGER NOT NULL CHECK(semester IN (1,2,3)),
      conduite_score        REAL,
      avertissement         INTEGER DEFAULT 0,
      blame                 INTEGER DEFAULT 0,
      exclusion_temporaire  INTEGER DEFAULT 0,
      felicitation          INTEGER DEFAULT 0,
      encouragement         INTEGER DEFAULT 0,
      tableau_honneur       INTEGER DEFAULT 0,
      conseil_decision      TEXT,
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, classroom_id, academic_year_id, semester)
    );
  `)
}

module.exports = { migration004 }
