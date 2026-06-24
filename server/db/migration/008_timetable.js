// Timetable (Emploi du temps)
// 30-min lattice; each entry spans a start_time..end_time range on a given day.
// Teacher is derived from teacher_schedule at save time and stored for fast
// teacher-view lookups and conflict checks. One subject per class per time range;
// a teacher cannot overlap two classes on the same day (enforced in code).
function migration008(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS timetable_entries (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      classroom_id     INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE RESTRICT,
      day_of_week      INTEGER NOT NULL,          -- 1=Lundi .. 7=Dimanche
      start_time       TEXT NOT NULL,             -- 'HH:MM' on a 30-min boundary
      end_time         TEXT NOT NULL,             -- 'HH:MM' on a 30-min boundary
      subject_id       INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      teacher_id       INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      room             TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_timetable_class
      ON timetable_entries(academic_year_id, classroom_id, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_timetable_teacher
      ON timetable_entries(academic_year_id, teacher_id, day_of_week);
  `)

  // Default grid window + working days (configurable in the timetable page)
  const defaults = {
    timetable_day_start: '07:00',
    timetable_day_end: '19:00',
    timetable_days: JSON.stringify([1, 2, 3, 4, 5, 6]), // Lundi..Samedi
  }
  const stmt = db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)")
  for (const [k, v] of Object.entries(defaults)) stmt.run(k, v)
}

module.exports = { migration008 }
