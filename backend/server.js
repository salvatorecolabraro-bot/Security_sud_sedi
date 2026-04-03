const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const Papa = require('papaparse');
const fs = require('fs');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Function to safely extract float
const parseFloatSafe = (val) => {
  if (!val) return null;
  const parsed = parseFloat(String(val).replace(',', '.'));
  return isNaN(parsed) ? null : parsed;
};

// Helper to parse file (reusable per importazione manuale e auto-sync)
const parseFile = (filePath, originalName) => {
  const isCsv = originalName.toLowerCase().endsWith('.csv');
  if (isCsv) {
    const content = fs.readFileSync(filePath, 'utf8');
    return Papa.parse(content, { 
      header: true, 
      skipEmptyLines: true, 
      dynamicTyping: true,
      transformHeader: function(header) {
        return header ? header.trim() : '';
      }
    }).data;
  } else {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet);
    
    return rawData.map(row => {
      const cleanRow = {};
      for (const key in row) {
        if (Object.hasOwnProperty.call(row, key) && key) {
          cleanRow[String(key).trim()] = row[key];
        }
      }
      return cleanRow;
    });
  }
};

// Funzione centrale per importare i dati dai file
const processImport = (data) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Svuotiamo la tabella prima di re-inserire i dati massivi
      db.run("DELETE FROM sites", (err) => {
        if (err) {
          console.error("Errore durante la pulizia del DB:", err);
          return reject(err);
        }
        
        db.run("BEGIN TRANSACTION");
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO sites (site_code, region, province, city, status, latitude, longitude, data_immobili, data_class_point, merged_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const records = data;
        
        const insertSequential = (index) => {
          if (index >= records.length) {
            insertStmt.finalize();
            db.run("COMMIT", (err) => {
              if (err) {
                console.error(err);
                reject(err);
              } else {
                resolve(records.length);
              }
            });
            return;
          }

          const record = records[index];
          
          // Estrapoliamo i campi. I nomi delle colonne potrebbero variare, cerchiamo i più comuni.
          const siteCode = String(record['SAP Code'] || record['CodiceImmobile'] || record['Site Code'] || index).trim();
          const region = record['Region'] || record['Regione'] || '';
          const province = record['Province'] || record['Provincia'] || '';
          const city = record['City'] || record['Comune'] || '';
          const status = record['Stato SDF'] || record['StatoImmobile'] || record['Status'] || '';
          const denominazione = record['Denominazione'] || record['Nome'] || record['Descrizione'] || '';
          
          const rawLat = record['Latitudine'] || record['latitudine'] || record['LATITUDINE'] || record['Lat'] || record['lat'];
          const rawLng = record['Longitudine'] || record['longitudine'] || record['LONGITUDINE'] || record['Lng'] || record['lng'] || record['Lon'] || record['lon'];

          const lat = parseFloatSafe(rawLat);
          const lng = parseFloatSafe(rawLng);

          // Poiché abbiamo un solo file, mettiamo tutto in merged_data
          // data_immobili e data_class_point possono contenere lo stesso record o essere nulli
          const stringifiedRecord = JSON.stringify(record);

          insertStmt.run([
            siteCode,
            region,
            province,
            city,
            status,
            lat,
            lng,
            stringifiedRecord, // Manteniamo la retrocompatibilità
            stringifiedRecord,
            stringifiedRecord
          ], (err) => {
            if (err) {
              console.error("Errore inserimento riga:", err);
              insertStmt.finalize();
              db.run("ROLLBACK");
              return reject(err);
            }
            setImmediate(() => insertSequential(index + 1));
          });
        };

        insertSequential(0);
      });
    });
  });
};

// API: Auto-Sync endpoint (Cerca file specifici nella cartella predefinita)
app.post('/api/sync', async (req, res) => {
  try {
    const defaultDir = 'c:\\Users\\Utente\\OneDrive\\Desktop\\sedi';
    
    // Cerchiamo il nuovo file unificato
    const possibleNames = ['ClassPointSUD_con_coordinate.csv', 'ClassPointSUD_con_coordinate.xlsx', 'classpoint.csv', 'classpoint.xlsx'];
    
    let filePath = null;

    // Cerca il file
    for (const name of possibleNames) {
      const p = path.join(defaultDir, name);
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      // Prova a cercarlo nella root del progetto
      const rootDir = path.resolve(__dirname, '..');
      for (const name of possibleNames) {
        const p = path.join(rootDir, name);
        if (fs.existsSync(p)) {
          filePath = p;
          break;
        }
      }
    }

    if (!filePath) {
      return res.status(404).json({ error: 'Nessun file ClassPointSUD_con_coordinate trovato.' });
    }

    console.log(`Trovato file unificato: ${filePath}`);
    const parsedData = parseFile(filePath, path.basename(filePath));

    const count = await processImport(parsedData);
    res.json({ message: 'Sincronizzazione automatica completata con successo', count: count });

  } catch (error) {
    console.error("Errore durante la sincronizzazione automatica:", error);
    res.status(500).json({ error: 'Errore durante la sincronizzazione automatica: ' + error.message });
  }
});

// Esegui la sincronizzazione automatica all'avvio del server
const autoSyncOnStartup = async () => {
  console.log("Esecuzione sincronizzazione automatica dei CSV all'avvio...");
  const defaultDir = 'c:\\Users\\Utente\\OneDrive\\Desktop\\sedi';
  
  const possibleNames = ['ClassPointSUD_con_coordinate.csv', 'ClassPointSUD_con_coordinate.xlsx', 'classpoint.csv', 'classpoint.xlsx'];
  
  let filePath = null;

  for (const name of possibleNames) {
    const p = path.join(defaultDir, name);
    if (fs.existsSync(p)) { filePath = p; break; }
  }

  if (!filePath) {
    const rootDir = path.resolve(__dirname, '..');
    for (const name of possibleNames) {
      const p = path.join(rootDir, name);
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
  }

  try {
    if (filePath) {
      const parsedData = parseFile(filePath, path.basename(filePath));
      if (parsedData.length > 0) {
        const count = await processImport(parsedData);
        console.log(`Auto-sync completato. Caricati/Aggiornati ${count} record dal disco.`);
      } else {
        console.log("Il file è vuoto.");
      }
    } else {
      console.log("Nessun file unificato trovato per la sincronizzazione iniziale.");
    }
  } catch (e) {
    console.error("Errore durante l'auto-sync all'avvio:", e);
  }
};
// Chiamata immediata all'avvio
autoSyncOnStartup();


// API: Import Excel Manuale
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }

    let parsedData = [];

    // Helper to parse file
    const parseFileLocal = (fileObj) => {
      const isCsv = fileObj.originalname.toLowerCase().endsWith('.csv');
      if (isCsv) {
        const content = fs.readFileSync(fileObj.path, 'utf8');
        return Papa.parse(content, { 
          header: true, 
          skipEmptyLines: true, 
          dynamicTyping: true,
          transformHeader: function(header) {
            return header ? header.trim() : '';
          }
        }).data;
      } else {
        const workbook = xlsx.readFile(fileObj.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(sheet);
        return rawData.map(row => {
          const cleanRow = {};
          for (const key in row) {
            if (Object.hasOwnProperty.call(row, key) && key) {
              cleanRow[String(key).trim()] = row[key];
            }
          }
          return cleanRow;
        });
      }
    };

    parsedData = parseFileLocal(file);

    const count = await processImport(parsedData);
    
    // Cleanup dei file temporanei
    fs.unlinkSync(file.path);

    res.json({ message: 'Dati importati con successo', count: count });

  } catch (error) {
    console.error("Errore durante l'importazione:", error);
    res.status(500).json({ error: 'Errore durante l\'importazione: ' + error.message });
  }
});

// API: Get all sites (with search/filter)
app.get('/api/sites', (req, res) => {
  const { search, region, province, city, denominazione } = req.query;
  
  let query = 'SELECT site_code, region, province, city, status, latitude, longitude, merged_data FROM sites WHERE 1=1';
  const params = [];

  if (region) {
    // case insensitive search for SQLite
    query += ' AND LOWER(region) = LOWER(?)';
    params.push(region);
  }
  if (province) {
    query += ' AND LOWER(province) = LOWER(?)';
    params.push(province);
  }
  if (city) {
    query += ' AND LOWER(city) = LOWER(?)';
    params.push(city);
  }
  if (denominazione) {
    query += ' AND merged_data LIKE ?';
    params.push(`%${denominazione}%`);
  }
  if (search) {
    query += ' AND (site_code LIKE ? OR merged_data LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // Remove hard limit of 1000 to allow statistics to calculate over all dataset
  // query += ' LIMIT 1000';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const formattedRows = rows.map(r => ({
      ...r,
      merged_data: JSON.parse(r.merged_data)
    }));
    res.json(formattedRows);
  });
});

// Helper to format string to Title Case (e.g. "CAMPANIA" -> "Campania")
const toTitleCase = (str) => {
  if (!str) return '';
  return str.toString().trim().toLowerCase().replace(/(?:^|\s)\w/g, function(match) {
    return match.toUpperCase();
  });
};

// API: Get filter options for cascading dropdowns
app.get('/api/filter-options', (req, res) => {
  db.all('SELECT region, province, city, merged_data FROM sites', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const options = rows.map(r => {
      let denominazione = '';
      let region = r.region;
      let province = r.province;
      let city = r.city;

      try {
        const data = JSON.parse(r.merged_data || '{}');
        denominazione = data.Denominazione || data.denominazione || data.Nome || data.Descrizione || '';
        
        // Fallback for region/province/city if they are empty in the root columns
        if (!region) region = data.Regione || data.Region || '';
        if (!province) province = data.Provincia || data.Province || '';
        if (!city) city = data.Comune || data.City || '';
      } catch(e) {}

      return {
        region: toTitleCase(region),
        province: toTitleCase(province),
        city: toTitleCase(city),
        denominazione: denominazione ? denominazione.toString().trim() : ''
      };
    });
    
    res.json(options);
  });
});

// API: Get single site
app.get('/api/sites/:site_code', (req, res) => {
  db.get('SELECT * FROM sites WHERE site_code = ?', [req.params.site_code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Sito non trovato' });
    
    row.data_immobili = JSON.parse(row.data_immobili);
    row.data_class_point = JSON.parse(row.data_class_point);
    row.merged_data = JSON.parse(row.merged_data);
    res.json(row);
  });
});

// API: Create new site
app.post('/api/sites', (req, res) => {
  const data = req.body;
  const site_code = data.site_code || data['CodiceImmobile'] || data['SAP Code'];
  
  if (!site_code) {
    return res.status(400).json({ error: 'Codice sito obbligatorio' });
  }

  const region = data['Regione'] || data['Region'] || '';
  const province = data['Provincia'] || data['Province'] || '';
  const city = data['Comune'] || data['City'] || '';
  const status = data['StatoImmobile'] || data['Stato SDF'] || '';
  const lat = parseFloatSafe(data['Latitudine']);
  const lng = parseFloatSafe(data['Longitudine']);

  db.run(`
    INSERT INTO sites (site_code, region, province, city, status, latitude, longitude, data_immobili, data_class_point, merged_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    site_code, region, province, city, status, lat, lng, 
    JSON.stringify(data), '{}', JSON.stringify(data)
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Sito creato', site_code });
  });
});

// API: Update or Insert site (Upsert)
app.put('/api/sites/:site_code', (req, res) => {
  const data = req.body;
  const site_code = req.params.site_code;
  
  const region = data['Regione'] || data['Region'] || '';
  const province = data['Provincia'] || data['Province'] || '';
  const city = data['Comune'] || data['City'] || '';
  const status = data['StatoImmobile'] || data['Stato SDF'] || '';
  const lat = parseFloatSafe(data['Latitudine']);
  const lng = parseFloatSafe(data['Longitudine']);

  // Prima controlliamo se esiste
  db.get('SELECT * FROM sites WHERE site_code = ?', [site_code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (row) {
      // Aggiornamento (merge dei dati esistenti con i nuovi)
      const existingMergedData = JSON.parse(row.merged_data || '{}');
      const newMergedData = { ...existingMergedData, ...data };
      
      db.run(`
        UPDATE sites 
        SET region=?, province=?, city=?, status=?, latitude=?, longitude=?, merged_data=?
        WHERE site_code=?
      `, [
        region, province, city, status, lat, lng, JSON.stringify(newMergedData), site_code
      ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Sito aggiornato' });
      });
    } else {
      // Inserimento nuovo
      db.run(`
        INSERT INTO sites (site_code, region, province, city, status, latitude, longitude, data_immobili, data_class_point, merged_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        site_code, region, province, city, status, lat, lng, 
        JSON.stringify(data), '{}', JSON.stringify(data)
      ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Sito creato', site_code });
      });
    }
  });
});

// API: Delete site
app.delete('/api/sites/:site_code', (req, res) => {
  db.run('DELETE FROM sites WHERE site_code=?', [req.params.site_code], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Sito eliminato' });
  });
});

// API: Dashboard stats
app.get('/api/stats', (req, res) => {
  const stats = {};
  
  db.all('SELECT region, COUNT(*) as count FROM sites GROUP BY region', [], (err, rows) => {
    if (!err) stats.regions = rows;
    
    db.all('SELECT status, COUNT(*) as count FROM sites GROUP BY status', [], (err2, rows2) => {
      if (!err2) stats.status = rows2;
      res.json(stats);
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server backend in ascolto sulla porta ${PORT}`);
});
