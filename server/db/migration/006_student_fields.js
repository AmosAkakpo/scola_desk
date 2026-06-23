function migration006(db) {
  db.exec(`
    ALTER TABLE students ADD COLUMN nationality TEXT DEFAULT 'Béninoise';
    ALTER TABLE students ADD COLUMN is_redoublant INTEGER DEFAULT 0;
  `)
}

module.exports = { migration006 }
