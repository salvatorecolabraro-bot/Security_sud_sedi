const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// Controlla se siamo su Render e se c'è un URL del database Postgres
const isPostgres = process.env.DATABASE_URL !== undefined;
let db;
let pgPool;

if (isPostgres) {
  console.log("Connessione a PostgreSQL...");
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Necessario per Render
    }
  });

  // Crea la tabella se non esiste in Postgres
  pgPool.query(`
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
  `).then(() => console.log("Tabella 'sites' su Postgres pronta."))
    .catch(err => console.error("Errore creazione tabella Postgres:", err));

} else {
  console.log("Connessione a SQLite locale...");
  const dataDir = process.env.DATA_DIR || __dirname;
  const dbPath = path.resolve(dataDir, 'database.sqlite');
  db = new sqlite3.Database(dbPath);

  // Crea la tabella se non esiste in SQLite
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
      if (err) console.error("Errore creazione tabella SQLite:", err.message);
      else console.log("Tabella 'sites' su SQLite pronta.");
    });
  });
}

// Interfaccia unificata per eseguire query (astrae le differenze tra sqlite e pg)
const query = async (text, params = []) => {
  if (isPostgres) {
    // Convertiamo i placeholder di sqlite (?) nei placeholder di postgres ($1, $2, ecc.)
    let pgText = text;
    let i = 1;
    while (pgText.includes('?')) {
      pgText = pgText.replace('?', `$${i}`);
      i++;
    }
    const res = await pgPool.query(pgText, params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      if (text.trim().toUpperCase().startsWith('SELECT')) {
        db.all(text, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        db.run(text, params, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      }
    });
  }
};

// Interfaccia unificata per transazioni (solo sqlite per ora, per semplicità nel bulk insert usiamo singole query)
const run = async (text, params = []) => {
  return query(text, params);
};

module.exports = {
  isPostgres,
  query,
  run,
  // Esportiamo db originale per compatibilità con il codice esistente se strettamente necessario
  originalDb: db 
};
