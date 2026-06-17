function migration001(db) {
  db.exec(`

    -- ─────────────────────────────────────────────
    -- CONFIGURATION & SYSTEM
    -- ─────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS school_config (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      school_name     TEXT NOT NULL,
      school_code     TEXT NOT NULL UNIQUE,
      director_name   TEXT,
      phone           TEXT,
      address         TEXT,
      city            TEXT,
      country         TEXT,
      is_configured   INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS license_state (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id            TEXT UNIQUE,
      hardware_fingerprint TEXT,
      license_tier         TEXT DEFAULT 'STANDARD',
      license_expiry       TEXT,
      is_active            INTEGER DEFAULT 1,
      last_sync_at         TEXT,
      created_at           TEXT DEFAULT (datetime('now')),
      updated_at           TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO app_settings (key, value) VALUES
      ('matricule_mask_student',   'SCH/YEAR/SEQ'),
      ('matricule_mask_teacher',   'T-YYYYMM-XXXX'),
      ('matricule_mask_user',      'U-YYYYMM-XXXX'),
      ('report_card_header',       ''),
      ('report_card_footer',       ''),
      ('current_academic_year_id', ''),
      ('assessment_mode',          'standard'),
      ('school_motto',             ''),
      ('promotion_pass_average',   '10'),
      ('currency',                 'XOF'),
      ('school_year_start_month',  '9');

    -- ─────────────────────────────────────────────
    -- SYNC LOG
    -- ─────────────────────────────────────────────

    -- Immutable append-only record of every sync attempt.
    -- Never update rows. Insert a new row per attempt.
    CREATE TABLE IF NOT EXISTS sync_log (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_uid         TEXT NOT NULL UNIQUE,
      sync_type        TEXT NOT NULL
                         CHECK(sync_type IN (
                           'full','grades','financial',
                           'telemetry','license'
                         )),
      started_at       TEXT DEFAULT (datetime('now')),
      completed_at     TEXT,
      records_sent     INTEGER DEFAULT 0,
      records_received INTEGER DEFAULT 0,
      status           TEXT DEFAULT 'pending'
                         CHECK(status IN (
                           'pending','success','failed','partial'
                         )),
      error_message    TEXT,
      triggered_by     INTEGER REFERENCES users(id),
      created_at       TEXT DEFAULT (datetime('now'))
    );

    -- ─────────────────────────────────────────────
    -- ROLES & USERS
    -- ─────────────────────────────────────────────

    -- Soft-delete is the ONLY deletion path for users.
    -- ON DELETE RESTRICT on role_id is intentional —
    -- roles are system-defined and must never be deleted.
    CREATE TABLE IF NOT EXISTS roles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      label       TEXT NOT NULL,
      description TEXT
    );

    INSERT OR IGNORE INTO roles (name, label, description) VALUES
      ('admin',
       'Administrateur',
       'Accès complet selon la licence'),
      ('secretary',
       'Secrétaire',
       'Gestion académique uniquement'),
      ('accountant',
       'Comptable',
       'Gestion financière uniquement — PRO seulement');

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_uid      TEXT NOT NULL UNIQUE,
      matricule     TEXT UNIQUE,
      full_name     TEXT NOT NULL,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id       INTEGER NOT NULL
                      REFERENCES roles(id)
                      ON DELETE RESTRICT,
      is_active     INTEGER DEFAULT 1,
      is_deleted    INTEGER DEFAULT 0,
      deleted_at    TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    -- ─────────────────────────────────────────────
    -- AUDIT LOG
    -- ─────────────────────────────────────────────

    -- Append-only. Never update or delete rows here.
    -- user_id is nullable to support system-generated events.
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action      TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id   TEXT,
      old_values  TEXT,
      new_values  TEXT,
      ip_address  TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_entity
      ON audit_logs(entity_type, entity_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_audit_user
      ON audit_logs(user_id, created_at);

    -- ─────────────────────────────────────────────
    -- ACADEMIC YEARS
    -- ─────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS academic_years (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      label      TEXT NOT NULL UNIQUE,
      start_date TEXT,
      end_date   TEXT,
      is_active  INTEGER DEFAULT 0,
      is_locked  INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ─────────────────────────────────────────────
    -- LEVELS & SERIES
    -- ─────────────────────────────────────────────

    -- Levels are system-defined. Schools cannot add or remove
    -- levels — they only activate the ones they teach.
    -- ON DELETE RESTRICT everywhere: levels are master data.
    CREATE TABLE IF NOT EXISTS levels (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL UNIQUE,
      level_code     INTEGER NOT NULL UNIQUE,
      has_serie      INTEGER DEFAULT 0,
      is_exam_cohort INTEGER DEFAULT 0,
      exam_name      TEXT,
      display_order  INTEGER DEFAULT 0
    );

    INSERT OR IGNORE INTO levels
      (name, level_code, has_serie, is_exam_cohort, exam_name, display_order)
    VALUES
      ('Maternelle', 1,  0, 0, NULL,    1),
      ('CI',         2,  0, 0, NULL,    2),
      ('CP',         3,  0, 0, NULL,    3),
      ('CE1',        4,  0, 0, NULL,    4),
      ('CE2',        5,  0, 0, NULL,    5),
      ('CM1',        6,  0, 0, NULL,    6),
      ('CM2',        7,  0, 1, 'CEP',   7),
      ('6ème',       8,  0, 0, NULL,    8),
      ('5ème',       9,  0, 0, NULL,    9),
      ('4ème',       10, 0, 0, NULL,   10),
      ('3ème',       11, 0, 1, 'BEPC', 11),
      ('2nde',       12, 1, 0, NULL,   12),
      ('1ère',       13, 1, 0, NULL,   13),
      ('Terminale',  14, 1, 1, 'BAC',  14);

    CREATE TABLE IF NOT EXISTS series (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      level_id INTEGER NOT NULL
                 REFERENCES levels(id)
                 ON DELETE RESTRICT,
      UNIQUE(name, level_id)
    );

    -- ─────────────────────────────────────────────
    -- SUBJECTS
    -- ─────────────────────────────────────────────

    -- Master subject list. Each subject exists once.
    -- Assigned to levels via level_subjects junction.
    CREATE TABLE IF NOT EXISTS subjects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      short_code TEXT UNIQUE,
      is_active  INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- serie_id NULL  = applies to all series at that level.
    -- serie_id SET   = applies only to that specific serie.
    -- Coefficient can vary per level and per serie.
    -- Application must validate: if level has_serie=1,
    -- look for serie-specific row first, fall back to NULL serie row.
    CREATE TABLE IF NOT EXISTS level_subjects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level_id   INTEGER NOT NULL
                   REFERENCES levels(id)
                   ON DELETE RESTRICT,
      serie_id   INTEGER
                   REFERENCES series(id)
                   ON DELETE RESTRICT,
      subject_id INTEGER NOT NULL
                   REFERENCES subjects(id)
                   ON DELETE RESTRICT,
      coefficient INTEGER NOT NULL DEFAULT 1,
      is_active   INTEGER DEFAULT 1,
      UNIQUE(level_id, serie_id, subject_id)
    );

    CREATE INDEX IF NOT EXISTS idx_level_subjects_level
      ON level_subjects(level_id, serie_id);

    -- ─────────────────────────────────────────────
    -- TEACHERS
    -- ─────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS teachers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_uid TEXT NOT NULL UNIQUE,
      matricule   TEXT UNIQUE,
      full_name   TEXT NOT NULL,
      phone       TEXT,
      email       TEXT,
      is_active   INTEGER DEFAULT 1,
      is_deleted  INTEGER DEFAULT 0,
      deleted_at  TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
    -- ─────────────────────────────────────────────
    -- CLASSROOMS
    -- ─────────────────────────────────────────────

    -- Soft-delete only. ON DELETE RESTRICT on all foreign keys.
    -- UNIQUE(label, academic_year_id) prevents duplicate
    -- classroom names within the same year.
    CREATE TABLE IF NOT EXISTS classrooms (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_uid    TEXT NOT NULL UNIQUE,
      label            TEXT NOT NULL,
      level_id         INTEGER NOT NULL
                         REFERENCES levels(id)
                         ON DELETE RESTRICT,
      serie_id         INTEGER
                         REFERENCES series(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      capacity         INTEGER DEFAULT 50,
      expected_tuition REAL DEFAULT 0,
      is_deleted       INTEGER DEFAULT 0,
      deleted_at       TEXT,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(label, academic_year_id)
    );

    CREATE INDEX IF NOT EXISTS idx_classrooms_year
      ON classrooms(academic_year_id, level_id);

    -- Professeur principal per classroom per year.
    -- Signs report cards, handles discipline records.
    -- One teacher can be principal of only one class per year.
    CREATE TABLE IF NOT EXISTS classroom_teachers (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id     INTEGER NOT NULL
                         REFERENCES classrooms(id)
                         ON DELETE RESTRICT,
      teacher_id       INTEGER NOT NULL
                         REFERENCES teachers(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      is_principal     INTEGER DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(classroom_id, teacher_id, academic_year_id)
    );


    -- ─────────────────────────────────────────────
    -- STUDENTS
    -- ─────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS students (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      student_uid            TEXT NOT NULL UNIQUE,
      matricule              TEXT UNIQUE,
      national_student_number TEXT,
      full_name              TEXT NOT NULL,
      birth_date             TEXT,
      birth_place            TEXT,
      gender                 TEXT CHECK(gender IN ('M','F')),
      photo_path             TEXT,
      -- Lifecycle states:
      -- active      = currently enrolled
      -- graduated   = completed Terminale
      -- transferred = moved to another school
      -- excluded    = disciplinary removal
      -- deceased    = deceased
      status      TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN (
                      'active','graduated','transferred',
                      'excluded','deceased'
                    )),
      is_deleted  INTEGER DEFAULT 0,
      deleted_at  TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    -- phone is the deduplication key for guardians.
    -- Two guardians with same name but different phones are allowed.
    CREATE TABLE IF NOT EXISTS guardians (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id           INTEGER NOT NULL
                             REFERENCES students(id)
                             ON DELETE RESTRICT,
      full_name            TEXT NOT NULL,
      phone                TEXT,
      relationship         TEXT,
      is_primary           INTEGER DEFAULT 0,
      receives_report_card INTEGER DEFAULT 0,
      is_deleted           INTEGER DEFAULT 0,
      deleted_at           TEXT,
      created_at           TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, phone)
    );

    CREATE INDEX IF NOT EXISTS idx_students_status
      ON students(status, is_deleted);

    -- ─────────────────────────────────────────────
    -- ENROLLMENTS
    -- ─────────────────────────────────────────────

    -- UNIQUE(student_id, academic_year_id) enforces one
    -- active enrollment per student per year.
    -- Transfers are handled by soft-deleting the old enrollment
    -- and creating a new one, not by updating in place.
    CREATE TABLE IF NOT EXISTS enrollments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_uid   TEXT NOT NULL UNIQUE,
      student_id       INTEGER NOT NULL
                         REFERENCES students(id)
                         ON DELETE RESTRICT,
      classroom_id     INTEGER NOT NULL
                         REFERENCES classrooms(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      enrollment_date  TEXT DEFAULT (datetime('now')),
      is_active        INTEGER DEFAULT 1,
      is_deleted       INTEGER DEFAULT 0,
      deleted_at       TEXT,
      UNIQUE(student_id, academic_year_id)
    );

    CREATE INDEX IF NOT EXISTS idx_enrollments_student
      ON enrollments(student_id, academic_year_id);

    CREATE INDEX IF NOT EXISTS idx_enrollments_classroom
      ON enrollments(classroom_id, academic_year_id);

    -- ─────────────────────────────────────────────
    -- FEE STRUCTURES & STUDENT DUES (PRO)
    -- ─────────────────────────────────────────────

    -- Defines what is owed per classroom per year.
    -- expected_tuition on classrooms is the quick reference.
    -- fee_structures is the formal obligation definition.
    CREATE TABLE IF NOT EXISTS fee_structures (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id     INTEGER NOT NULL
                         REFERENCES classrooms(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      semester         INTEGER CHECK(semester IN (1,2,3,NULL)),
      label            TEXT NOT NULL,
      amount           REAL NOT NULL,
      due_date         TEXT,
      is_active        INTEGER DEFAULT 1,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(classroom_id, academic_year_id, semester, label)
    );

    -- Per-student obligation derived from fee_structures
    -- at enrollment time. Tracks what they owe vs paid.
    CREATE TABLE IF NOT EXISTS student_dues (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id       INTEGER NOT NULL
                         REFERENCES students(id)
                         ON DELETE RESTRICT,
      fee_structure_id INTEGER NOT NULL
                         REFERENCES fee_structures(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      amount_due       REAL NOT NULL,
      amount_paid      REAL DEFAULT 0,
      balance          REAL GENERATED ALWAYS AS
                         (amount_due - amount_paid) VIRTUAL,
      is_cleared       INTEGER DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, fee_structure_id)
    );

    CREATE INDEX IF NOT EXISTS idx_student_dues_student
      ON student_dues(student_id, academic_year_id);

    -- ─────────────────────────────────────────────
    -- GRADING SYSTEM
    -- ─────────────────────────────────────────────

    -- assessment_type = category (interrogation, devoir, etc.)
    -- sequence_number = which one (1st interrogation, 2nd, etc.)
    -- Default config: 4 interrogations + 1 devoir + 1 composition
    -- Application must validate subject is in level_subjects
    -- for this classroom before creating templates.
    CREATE TABLE IF NOT EXISTS assessment_templates (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id     INTEGER NOT NULL
                         REFERENCES classrooms(id)
                         ON DELETE RESTRICT,
      subject_id       INTEGER NOT NULL
                         REFERENCES subjects(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      semester         INTEGER NOT NULL CHECK(semester IN (1,2,3)),
      assessment_type  TEXT NOT NULL
                         CHECK(assessment_type IN (
                           'interrogation','devoir',
                           'composition','tp','oral'
                         )),
      sequence_number  INTEGER NOT NULL DEFAULT 1,
      label            TEXT,
      max_score        REAL NOT NULL DEFAULT 20,
      weight           REAL NOT NULL DEFAULT 1,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(
        classroom_id, subject_id, academic_year_id,
        semester, assessment_type, sequence_number
      )
    );

    CREATE INDEX IF NOT EXISTS idx_templates_classroom
      ON assessment_templates(classroom_id, semester, subject_id);

    -- score is nullable when is_absent = 1.
    -- Application invariant: if is_absent = 0, score must not be NULL.
    -- SQLite cannot enforce this natively — enforced in Express layer.
    CREATE TABLE IF NOT EXISTS assessment_scores (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL
                    REFERENCES assessment_templates(id)
                    ON DELETE RESTRICT,
      student_id  INTEGER NOT NULL
                    REFERENCES students(id)
                    ON DELETE RESTRICT,
      score       REAL,
      is_absent   INTEGER DEFAULT 0,
      entered_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      entered_at  TEXT DEFAULT (datetime('now')),
      is_deleted  INTEGER DEFAULT 0,
      deleted_at  TEXT,
      UNIQUE(template_id, student_id)
    );

    CREATE INDEX IF NOT EXISTS idx_scores_student
      ON assessment_scores(student_id, template_id);

    -- Computed at grade finalization. Stored for report card
    -- performance. Recomputed if grades are corrected before lock.
    -- class_highest_score = best raw average in class for subject.
    CREATE TABLE IF NOT EXISTS subject_averages (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id           INTEGER NOT NULL
                             REFERENCES students(id)
                             ON DELETE RESTRICT,
      classroom_id         INTEGER NOT NULL
                             REFERENCES classrooms(id)
                             ON DELETE RESTRICT,
      subject_id           INTEGER NOT NULL
                             REFERENCES subjects(id)
                             ON DELETE RESTRICT,
      academic_year_id     INTEGER NOT NULL
                             REFERENCES academic_years(id)
                             ON DELETE RESTRICT,
      semester             INTEGER NOT NULL CHECK(semester IN (1,2,3)),
      raw_average          REAL,
      coefficient          INTEGER DEFAULT 1,
      weighted_average     REAL,
      subject_rank         INTEGER,
      class_highest_score  REAL,
      class_lowest_score   REAL,
      class_subject_average REAL,
      computed_at          TEXT DEFAULT (datetime('now')),
      UNIQUE(
        student_id, classroom_id,
        subject_id, academic_year_id, semester
      )
    );

    CREATE INDEX IF NOT EXISTS idx_subject_averages_student
      ON subject_averages(student_id, academic_year_id, semester);

    -- class_size is denormalized from enrollments for performance.
    -- Must be recalculated if enrollment changes before finalization.
    CREATE TABLE IF NOT EXISTS semester_summaries (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id            INTEGER NOT NULL
                              REFERENCES students(id)
                              ON DELETE RESTRICT,
      classroom_id          INTEGER NOT NULL
                              REFERENCES classrooms(id)
                              ON DELETE RESTRICT,
      academic_year_id      INTEGER NOT NULL
                              REFERENCES academic_years(id)
                              ON DELETE RESTRICT,
      semester              INTEGER NOT NULL CHECK(semester IN (1,2,3)),
      total_weighted_points REAL,
      total_coefficients    INTEGER,
      semester_average      REAL,
      class_rank            INTEGER,
      class_size            INTEGER,
      class_highest_average REAL,
      class_lowest_average  REAL,
      class_overall_average REAL,
      mention               TEXT
                              CHECK(mention IN (
                                'Excellent','Très Bien','Bien',
                                'Assez Bien','Passable',
                                'Insuffisant',NULL
                              )),
      computed_at           TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, classroom_id, academic_year_id, semester)
    );

    CREATE INDEX IF NOT EXISTS idx_semester_summaries_student
      ON semester_summaries(student_id, academic_year_id);

    -- ─────────────────────────────────────────────
    -- NATIONAL EXAMS
    -- ─────────────────────────────────────────────

    -- serie is free-text here because national exam series
    -- (BAC A1, A2, B, C, D, E, F1...) don't map cleanly
    -- to internal series table. Intentional.
    CREATE TABLE IF NOT EXISTS national_exam_results (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id          INTEGER NOT NULL
                            REFERENCES students(id)
                            ON DELETE RESTRICT,
      academic_year_id    INTEGER NOT NULL
                            REFERENCES academic_years(id)
                            ON DELETE RESTRICT,
      exam_type           TEXT NOT NULL
                            CHECK(exam_type IN ('CEP','BEPC','BAC')),
      registration_number TEXT,
      result              TEXT
                            CHECK(result IN (
                              'admis','recalé','absent',NULL
                            )),
      score               REAL,
      serie               TEXT,
      notes               TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, academic_year_id, exam_type)
    );

    -- ─────────────────────────────────────────────
    -- PROMOTION ENGINE
    -- ─────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS promotion_runs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_uid     TEXT NOT NULL UNIQUE,
      academic_year_from INTEGER NOT NULL
                           REFERENCES academic_years(id)
                           ON DELETE RESTRICT,
      academic_year_to  INTEGER NOT NULL
                           REFERENCES academic_years(id)
                           ON DELETE RESTRICT,
      executed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      executed_at       TEXT DEFAULT (datetime('now')),
      is_rolled_back    INTEGER DEFAULT 0,
      rolled_back_at    TEXT,
      rolled_back_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes             TEXT
    );

    -- new_classroom_id is nullable:
    -- NULL for graduated (no next class) or excluded students.
    -- verdict drives the student status update on promotion.
    CREATE TABLE IF NOT EXISTS promotion_details (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_run_id       INTEGER NOT NULL
                               REFERENCES promotion_runs(id)
                               ON DELETE RESTRICT,
      student_id             INTEGER NOT NULL
                               REFERENCES students(id)
                               ON DELETE RESTRICT,
      old_classroom_id       INTEGER
                               REFERENCES classrooms(id)
                               ON DELETE RESTRICT,
      new_classroom_id       INTEGER
                               REFERENCES classrooms(id)
                               ON DELETE RESTRICT,
      final_average          REAL,
      verdict                TEXT NOT NULL
                               CHECK(verdict IN (
                                 'admis','doublant','exclu'
                               )),
      national_exam_cleared  INTEGER DEFAULT 0,
      override_reason        TEXT,
      created_at             TEXT DEFAULT (datetime('now'))
    );

    -- ─────────────────────────────────────────────
    -- TEACHER SCHEDULING & PAYROLL
    -- ─────────────────────────────────────────────

    -- Application must validate subject exists in level_subjects
    -- for this classroom's level before inserting here.
    CREATE TABLE IF NOT EXISTS teacher_schedule (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id       INTEGER NOT NULL
                         REFERENCES teachers(id)
                         ON DELETE RESTRICT,
      classroom_id     INTEGER NOT NULL
                         REFERENCES classrooms(id)
                         ON DELETE RESTRICT,
      subject_id       INTEGER NOT NULL
                         REFERENCES subjects(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      hours_per_week   REAL DEFAULT 0,
      hourly_rate      REAL DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(teacher_id, classroom_id, subject_id, academic_year_id)
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_teacher
      ON teacher_schedule(teacher_id, academic_year_id);

    CREATE TABLE IF NOT EXISTS teacher_daily_log (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id       INTEGER NOT NULL
                         REFERENCES teachers(id)
                         ON DELETE RESTRICT,
      log_date         TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      status           TEXT NOT NULL
                         CHECK(status IN (
                           'present','absent','permission'
                         )),
      hours_credited   REAL DEFAULT 0,
      notes            TEXT,
      recorded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(teacher_id, log_date)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_log_teacher
      ON teacher_daily_log(teacher_id, log_date);

    -- salary_type: hourly = calculated from hours * rate
    --              fixed  = flat monthly amount
    -- calculation_snapshot stores the JSON audit trail of
    -- exactly how the amount was derived at generation time.
    CREATE TABLE IF NOT EXISTS salary_entries (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      salary_uid             TEXT NOT NULL UNIQUE,
      teacher_id             INTEGER NOT NULL
                               REFERENCES teachers(id)
                               ON DELETE RESTRICT,
      academic_year_id       INTEGER NOT NULL
                               REFERENCES academic_years(id)
                               ON DELETE RESTRICT,
      month                  TEXT NOT NULL,
      salary_type            TEXT NOT NULL DEFAULT 'hourly'
                               CHECK(salary_type IN ('hourly','fixed')),
      total_hours            REAL DEFAULT 0,
      hourly_rate_snapshot   REAL DEFAULT 0,
      amount                 REAL DEFAULT 0,
      calculation_snapshot   TEXT,
      is_paid                INTEGER DEFAULT 0,
      paid_at                TEXT,
      recorded_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_deleted             INTEGER DEFAULT 0,
      deleted_at             TEXT,
      created_at             TEXT DEFAULT (datetime('now')),
      UNIQUE(teacher_id, academic_year_id, month)
    );

    -- ─────────────────────────────────────────────
    -- FINANCIAL LEDGER (PRO)
    -- ─────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS payments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_uid      TEXT NOT NULL UNIQUE,
      student_id       INTEGER NOT NULL
                         REFERENCES students(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      amount           REAL NOT NULL,
      payment_date     TEXT DEFAULT (datetime('now')),
      payment_type     TEXT CHECK(payment_type IN ('partial','complete')),
      semester         INTEGER CHECK(semester IN (1,2,3,NULL)),
      notes            TEXT,
      recorded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_deleted       INTEGER DEFAULT 0,
      deleted_at       TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payments_student
      ON payments(student_id, academic_year_id);

    CREATE TABLE IF NOT EXISTS expense_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT
    );

    INSERT OR IGNORE INTO expense_categories (name, description) VALUES
      ('Fournitures', 'Matériel scolaire et papeterie'),
      ('Maintenance',  'Entretien et réparations'),
      ('Services',     'Eau, électricité, internet'),
      ('Salaires',     'Rémunération du personnel'),
      ('Autre',        'Dépenses diverses');

    CREATE TABLE IF NOT EXISTS expenses (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_uid      TEXT NOT NULL UNIQUE,
      category_id      INTEGER
                         REFERENCES expense_categories(id)
                         ON DELETE RESTRICT,
      description      TEXT,
      amount           REAL NOT NULL,
      expense_date     TEXT DEFAULT (datetime('now')),
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      recorded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_deleted       INTEGER DEFAULT 0,
      deleted_at       TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    -- Unified financial ledger. Never delete entries.
    -- Corrections via reversal entries only.
    -- is_reversed = 1 means this entry was corrected.
    -- The correcting entry is a new row with opposite amount.
    CREATE TABLE IF NOT EXISTS ledger_transactions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_uid  TEXT NOT NULL UNIQUE,
      type             TEXT NOT NULL CHECK(type IN ('income','expense')),
      source_type      TEXT NOT NULL
                         CHECK(source_type IN (
                           'payment','expense','salary','manual'
                         )),
      source_id        INTEGER,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      amount           REAL NOT NULL,
      description      TEXT,
      transaction_date TEXT DEFAULT (datetime('now')),
      created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_reversed      INTEGER DEFAULT 0,
      reversed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reversed_at      TEXT,
      reversal_reason  TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_year
      ON ledger_transactions(academic_year_id, type, transaction_date);

    -- ─────────────────────────────────────────────
    -- REPORT CARD SNAPSHOTS
    -- ─────────────────────────────────────────────

    -- Immutable legal document snapshots.
    -- Generated at print time. Never modified after creation.
    -- snapshot_data = full JSON of the report card at that moment.
    CREATE TABLE IF NOT EXISTS report_card_snapshots (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_uid     TEXT NOT NULL UNIQUE,
      student_id       INTEGER NOT NULL
                         REFERENCES students(id)
                         ON DELETE RESTRICT,
      classroom_id     INTEGER NOT NULL
                         REFERENCES classrooms(id)
                         ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL
                         REFERENCES academic_years(id)
                         ON DELETE RESTRICT,
      semester         INTEGER NOT NULL CHECK(semester IN (1,2,3)),
      snapshot_data    TEXT NOT NULL,
      generated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      generated_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_student
      ON report_card_snapshots(student_id, academic_year_id, semester);

  `)
}

module.exports = { migration001 }