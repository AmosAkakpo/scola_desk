function migration002(db) {
  db.exec(`
    -- Add is_active to levels (school activates the ones they teach)
    ALTER TABLE levels ADD COLUMN is_active INTEGER DEFAULT 0;

    -- Seed common subjects
    INSERT OR IGNORE INTO subjects (name, short_code) VALUES
      ('Français', 'FR'),
      ('Mathématiques', 'MATH'),
      ('Anglais', 'ANG'),
      ('Sciences de la Vie et de la Terre', 'SVT'),
      ('Physique-Chimie', 'PC'),
      ('Histoire-Géographie', 'HG'),
      ('Philosophie', 'PHILO'),
      ('Éducation Physique et Sportive', 'EPS'),
      ('Éducation Civique et Morale', 'ECM'),
      ('Économie', 'ECO'),
      ('Comptabilité', 'COMPTA'),
      ('Espagnol', 'ESP'),
      ('Allemand', 'ALL'),
      ('Informatique', 'INFO'),
      ('Dessin', 'DESSIN'),
      ('Musique', 'MUS'),
      ('Sciences Physiques', 'SP'),
      ('Sciences Naturelles', 'SN'),
      ('Lecture', 'LECT'),
      ('Écriture', 'ECRIT'),
      ('Calcul', 'CALC'),
      ('Récitation', 'RECIT'),
      ('Travaux Manuels', 'TM'),
      ('Expression Orale', 'EO'),
      ('Éveil Scientifique', 'ES');
  `)
}

module.exports = { migration002 }
