const { initializeDatabase, getDb } = require('./init');

try {
    console.log('[DB CLI] Starting database initialization...');
    initializeDatabase();

    const db = getDb();
    const tables = db
        .prepare(`SELECT name FROM sqlite_master 
                  WHERE type='table' 
                  ORDER BY name`)
        .all();

    console.log(`\n[DB CLI] Tables created: ${tables.length}`);
    tables.forEach(t => console.log(`  - ${t.name}`));

    const migrations = db
        .prepare('SELECT version, executed_at FROM schema_migrations')
        .all();

    console.log(`\n[DB CLI] Migrations applied: ${migrations.length}`);
    migrations.forEach(m => console.log(`  - ${m.version} at ${m.executed_at}`));

    console.log('\n[DB CLI] All good.');
    process.exit(0);
} catch (err) {
    console.error('[DB CLI] Error:', err);
    process.exit(1);
}