function migration005(db) {
  db.exec(`
    ALTER TABLE teachers ADD COLUMN gender TEXT;
    ALTER TABLE teachers ADD COLUMN qualification TEXT;
    ALTER TABLE teachers ADD COLUMN subject_specialty_id INTEGER REFERENCES subjects(id);
  `)
}

module.exports = { migration005 }
