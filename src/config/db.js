const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/seguimiento.db');
const fs = require('fs');

const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

module.exports = db;
