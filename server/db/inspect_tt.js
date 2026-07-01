'use strict'
const Database = require('better-sqlite3')
const path = require('path')
const db = new Database(path.join(__dirname, '../../data/scolaDesk.db'))

// Check level_subjects for 6ème
const rows = db.prepare(`
  SELECT l.name as level, s.name as subject, ls.coefficient
  FROM level_subjects ls
  JOIN levels l ON l.id = ls.level_id
  JOIN subjects s ON s.id = ls.subject_id
  WHERE ls.is_active = 1
  ORDER BY l.level_code, s.name
`).all()

let curLevel = ''
for (const r of rows) {
  if (r.level !== curLevel) { console.log(`\n${r.level}:`); curLevel = r.level }
  console.log(`  - ${r.subject} (coeff ${r.coefficient})`)
}
db.close()
