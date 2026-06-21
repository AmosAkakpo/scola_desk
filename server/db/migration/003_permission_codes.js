function migration003(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      code  TEXT NOT NULL UNIQUE,
      label TEXT
    );

    INSERT OR IGNORE INTO permissions (code, label) VALUES
      ('students.view', 'Voir les élèves'),
      ('students.edit', 'Modifier les élèves'),
      ('grades.view', 'Voir les notes'),
      ('grades.edit', 'Saisir les notes'),
      ('reports.view', 'Voir les bulletins'),
      ('reports.generate', 'Générer les bulletins'),
      ('finance.view', 'Voir les finances'),
      ('finance.edit', 'Modifier les finances'),
      ('payments.view', 'Voir les paiements'),
      ('payments.edit', 'Gérer les paiements');

    CREATE TABLE IF NOT EXISTS role_permissions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id       INTEGER NOT NULL REFERENCES roles(id),
      permission_id INTEGER NOT NULL REFERENCES permissions(id),
      UNIQUE(role_id, permission_id)
    );

    -- Secretary permissions
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'secretary' AND p.code IN (
      'students.view', 'students.edit',
      'grades.view', 'grades.edit',
      'reports.view', 'reports.generate'
    );

    -- Accountant permissions
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'accountant' AND p.code IN (
      'finance.view', 'finance.edit',
      'payments.view', 'payments.edit'
    );
  `)
}

module.exports = { migration003 }
