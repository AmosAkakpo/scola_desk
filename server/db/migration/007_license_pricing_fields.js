function migration007(db) {
  db.exec(`
    ALTER TABLE school_config ADD COLUMN school_prefix TEXT;

    ALTER TABLE license_state ADD COLUMN rate_per_student INTEGER DEFAULT 0;
    ALTER TABLE license_state ADD COLUMN declared_student_count INTEGER DEFAULT 0;
    ALTER TABLE license_state ADD COLUMN paid_student_count INTEGER DEFAULT 0;
    ALTER TABLE license_state ADD COLUMN allowed_students INTEGER DEFAULT 0;
    ALTER TABLE license_state ADD COLUMN amount_paid INTEGER DEFAULT 0;
    ALTER TABLE license_state ADD COLUMN installation_fee INTEGER DEFAULT 0;
    ALTER TABLE license_state ADD COLUMN installation_fee_paid INTEGER DEFAULT 0;
    ALTER TABLE license_state ADD COLUMN semesters_active INTEGER DEFAULT 3;
  `)
}

module.exports = { migration007 }
