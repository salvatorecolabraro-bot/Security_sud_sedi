const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sites (
      site_code TEXT PRIMARY KEY,
      region TEXT,
      province TEXT,
      city TEXT,
      status TEXT,
      latitude REAL,
      longitude REAL,
      data_immobili TEXT,
      data_class_point TEXT,
      merged_data TEXT
    )
  `, (err) => {
    if (err) {
      console.error("Errore creazione tabella:", err.message);
    } else {
      console.log("Tabella 'sites' pronta.");
    }
  });
});

module.exports = db;
