exports.migration009 = function (db) {
  // ── New tables ──────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_types (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      name             TEXT NOT NULL,
      is_mandatory     INTEGER NOT NULL DEFAULT 0,
      is_system        INTEGER NOT NULL DEFAULT 0,
      is_active        INTEGER NOT NULL DEFAULT 1,
      display_order    INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(academic_year_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_fee_types_year
      ON fee_types(academic_year_id, is_active);

    CREATE TABLE IF NOT EXISTS fee_type_amounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fee_type_id INTEGER NOT NULL REFERENCES fee_types(id) ON DELETE CASCADE,
      level_id    INTEGER REFERENCES levels(id),
      amount      REAL NOT NULL,
      UNIQUE(fee_type_id, level_id)
    );

    CREATE INDEX IF NOT EXISTS idx_fee_amounts_type
      ON fee_type_amounts(fee_type_id, level_id);

    CREATE TABLE IF NOT EXISTS student_fee_selections (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      fee_type_id      INTEGER NOT NULL REFERENCES fee_types(id) ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      opted_in         INTEGER NOT NULL DEFAULT 1,
      opted_in_at      TEXT DEFAULT (datetime('now')),
      opted_in_by      INTEGER REFERENCES users(id),
      UNIQUE(student_id, fee_type_id, academic_year_id)
    );

    CREATE INDEX IF NOT EXISTS idx_fee_selections_student
      ON student_fee_selections(student_id, academic_year_id);

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id  INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      fee_type_id INTEGER NOT NULL REFERENCES fee_types(id) ON DELETE RESTRICT,
      amount      REAL NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_allocations_payment
      ON payment_allocations(payment_id);
    CREATE INDEX IF NOT EXISTS idx_allocations_fee
      ON payment_allocations(fee_type_id);

    CREATE TABLE IF NOT EXISTS receipt_sequences (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      prefix           TEXT NOT NULL,
      last_number      INTEGER NOT NULL DEFAULT 0,
      UNIQUE(academic_year_id, prefix)
    );
  `)

  // ── ALTER existing tables ───────────────────────────────────

  const paymentCols = db.prepare("PRAGMA table_info(payments)").all().map(c => c.name)
  if (!paymentCols.includes('payment_method')) {
    db.exec(`ALTER TABLE payments ADD COLUMN payment_method TEXT DEFAULT 'especes'`)
  }
  if (!paymentCols.includes('receipt_number')) {
    db.exec(`ALTER TABLE payments ADD COLUMN receipt_number TEXT`)
  }
  if (!paymentCols.includes('payer_name')) {
    db.exec(`ALTER TABLE payments ADD COLUMN payer_name TEXT`)
  }
  if (!paymentCols.includes('receiver_name')) {
    db.exec(`ALTER TABLE payments ADD COLUMN receiver_name TEXT`)
  }
  if (!paymentCols.includes('reference')) {
    db.exec(`ALTER TABLE payments ADD COLUMN reference TEXT`)
  }

  const salaryCols = db.prepare("PRAGMA table_info(salary_entries)").all().map(c => c.name)
  if (!salaryCols.includes('payment_method')) {
    db.exec(`ALTER TABLE salary_entries ADD COLUMN payment_method TEXT DEFAULT 'especes'`)
  }
  if (!salaryCols.includes('receipt_number')) {
    db.exec(`ALTER TABLE salary_entries ADD COLUMN receipt_number TEXT`)
  }
  if (!salaryCols.includes('payer_name')) {
    db.exec(`ALTER TABLE salary_entries ADD COLUMN payer_name TEXT`)
  }
  if (!salaryCols.includes('receiver_name')) {
    db.exec(`ALTER TABLE salary_entries ADD COLUMN receiver_name TEXT`)
  }
  if (!salaryCols.includes('reference')) {
    db.exec(`ALTER TABLE salary_entries ADD COLUMN reference TEXT`)
  }
  if (!salaryCols.includes('adjustment_reason')) {
    db.exec(`ALTER TABLE salary_entries ADD COLUMN adjustment_reason TEXT`)
  }

  const expenseCols = db.prepare("PRAGMA table_info(expenses)").all().map(c => c.name)
  if (!expenseCols.includes('receipt_ref')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN receipt_ref TEXT`)
  }

  const catCols = db.prepare("PRAGMA table_info(expense_categories)").all().map(c => c.name)
  if (!catCols.includes('is_system')) {
    db.exec(`ALTER TABLE expense_categories ADD COLUMN is_system INTEGER DEFAULT 0`)
  }
  if (!catCols.includes('is_active')) {
    db.exec(`ALTER TABLE expense_categories ADD COLUMN is_active INTEGER DEFAULT 1`)
  }

  // ── Teacher hourly_rate on teachers table ───────────────────

  const teacherCols = db.prepare("PRAGMA table_info(teachers)").all().map(c => c.name)
  if (!teacherCols.includes('hourly_rate')) {
    db.exec(`ALTER TABLE teachers ADD COLUMN hourly_rate REAL DEFAULT 0`)
  }

  // ── Rebuild teacher_daily_log — remove 'permission' status ──

  const hasPermission = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='teacher_daily_log'"
  ).get()
  if (hasPermission && hasPermission.sql.includes('permission')) {
    db.exec(`
      CREATE TABLE teacher_daily_log_new (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id       INTEGER NOT NULL
                           REFERENCES teachers(id) ON DELETE RESTRICT,
        log_date         TEXT NOT NULL,
        academic_year_id INTEGER NOT NULL
                           REFERENCES academic_years(id) ON DELETE RESTRICT,
        status           TEXT NOT NULL
                           CHECK(status IN ('present','absent')),
        hours_credited   REAL DEFAULT 0,
        notes            TEXT,
        recorded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at       TEXT DEFAULT (datetime('now')),
        UNIQUE(teacher_id, log_date)
      );

      INSERT INTO teacher_daily_log_new (id, teacher_id, log_date, academic_year_id, status, hours_credited, notes, recorded_by, created_at)
        SELECT id, teacher_id, log_date, academic_year_id,
          CASE WHEN status = 'permission' THEN 'absent' ELSE status END,
          hours_credited, notes, recorded_by, created_at
        FROM teacher_daily_log;

      DROP TABLE teacher_daily_log;

      ALTER TABLE teacher_daily_log_new RENAME TO teacher_daily_log;

      CREATE INDEX IF NOT EXISTS idx_daily_log_teacher
        ON teacher_daily_log(teacher_id, log_date);
    `)
  }

  // ── Seed system expense category ────────────────────────────

  db.prepare(`INSERT OR IGNORE INTO expense_categories (name, description, is_system) VALUES (?, ?, 1)`)
    .run('Abonnement ScolaDesk', "Frais d'abonnement au système ScolaDesk")

  // ── Attendance permission codes ─────────────────────────────

  db.exec(`
    INSERT OR IGNORE INTO permissions (code, label) VALUES
      ('attendance.view', 'Voir les présences'),
      ('attendance.edit', 'Enregistrer les présences');

    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'secretary' AND p.code IN ('attendance.view', 'attendance.edit');

    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'accountant' AND p.code IN ('attendance.view');
  `)
}
