'use strict'
// Cleans up level_subjects:
//  1. Removes Philosophie from 6ème (was added by mistake during onboarding)
//  2. Deduplicates entries that share the same (level_id, serie_id, subject_id)
const Database = require('better-sqlite3')
const path = require('path')
const db = new Database(path.join(__dirname, '../../data/scolaDesk.db'))
db.pragma('foreign_keys = ON')

const fix = db.transaction(() => {
  // 1. Remove Philosophie from 6ème (level_code 8)
  const philo = db.prepare("SELECT id FROM subjects WHERE name = 'Philosophie'").get()
  const sixieme = db.prepare("SELECT id FROM levels WHERE level_code = 8").get()
  if (philo && sixieme) {
    const del = db.prepare('DELETE FROM level_subjects WHERE level_id = ? AND subject_id = ?').run(sixieme.id, philo.id)
    console.log(`Removed ${del.changes} Philosophie row(s) from 6ème`)
  }

  // 2. Deduplicate: for each (level_id, serie_id, subject_id) group keep only the row with the lowest id
  const dupes = db.prepare(`
    SELECT level_id, serie_id, subject_id, COUNT(*) as cnt, MIN(id) as keep_id
    FROM level_subjects
    GROUP BY level_id, serie_id, subject_id
    HAVING cnt > 1
  `).all()

  let totalRemoved = 0
  for (const d of dupes) {
    const del = db.prepare(`
      DELETE FROM level_subjects
      WHERE level_id = ? AND subject_id = ?
        AND (serie_id IS NULL AND ? IS NULL OR serie_id = ?)
        AND id != ?
    `).run(d.level_id, d.subject_id, d.serie_id, d.serie_id, d.keep_id)
    totalRemoved += del.changes
  }
  console.log(`Removed ${totalRemoved} duplicate level_subjects row(s)`)
})

fix()
db.close()
console.log('Done.')
