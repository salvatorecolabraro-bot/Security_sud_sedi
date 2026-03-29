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
const processImport = async (immobiliData, classPointData) => {
  const unifiedMap = new Map();

  if (immobiliData) {
    immobiliData.forEach(item => {
      const pk = item['CodiceImmobile'];
      if (pk) {
        unifiedMap.set(String(pk).trim(), {
          site_code: String(pk).trim(),
          data_immobili: item,
          data_class_point: null
        });
      }
    });
  }

  if (classPointData) {
    classPointData.forEach(item => {
      const pk = item['SAP Code'];
      if (pk) {
        const key = String(pk).trim();
        if (unifiedMap.has(key)) {
          unifiedMap.get(key).data_class_point = item;
        } else {
          unifiedMap.set(key, {
            site_code: key,
            data_immobili: null,
            data_class_point: item
          });
        }
      }
    });
  }

  try {
    // Svuotiamo la tabella prima di re-inserire i dati massivi
    await db.run("DELETE FROM sites");

    // In SQLite possiamo usare le transazioni per velocizzare, in Postgres non è strettamente necessario ma male non fa
    if (!db.isPostgres) {
      await db.run("BEGIN TRANSACTION");
    }

    const records = Array.from(unifiedMap.values());
    let errorOccurred = false;

    // Inserimento sequenziale asincrono
    for (const record of records) {
      const imm = record.data_immobili || {};
      const cp = record.data_class_point || {};
      const merged = { ...imm, ...cp };
      
      const region = imm['Regione'] || cp['Region'] || '';
      const province = imm['Provincia'] || cp['Province'] || '';
      const city = imm['Comune'] || cp['City'] || '';
      const status = imm['StatoImmobile'] || cp['Stato SDF'] || '';
      
      const rawLat = imm['Latitudine'] || imm['latitudine'] || imm['LATITUDINE'];
      const rawLng = imm['Longitudine'] || imm['longitudine'] || imm['LONGITUDINE'];

      const lat = parseFloatSafe(rawLat);
      const lng = parseFloatSafe(rawLng);

      try {
        await db.run(`
          INSERT INTO sites (site_code, region, province, city, status, latitude, longitude, data_immobili, data_class_point, merged_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.site_code,
          region,
          province,
          city,
          status,
          lat,
          lng,
          JSON.stringify(imm),
          JSON.stringify(cp),
          JSON.stringify(merged)
        ]);
      } catch (err) {
        console.error("Errore inserimento riga:", err);
        errorOccurred = true;
        break;
      }
    }

    if (!db.isPostgres) {
      if (errorOccurred) {
        await db.run("ROLLBACK");
        throw new Error("Errore durante l'inserimento dei record");
      } else {
        await db.run("COMMIT");
      }
    } else if (errorOccurred) {
        throw new Error("Errore durante l'inserimento dei record in Postgres");
    }

    return records.length;
  } catch (err) {
    console.error("Errore durante il processImport:", err);
    throw err;
  }
};

// API: Auto-Sync endpoint (Cerca file specifici nella cartella predefinita)
app.post('/api/sync', async (req, res) => {
  try {
    // Se stiamo girando su Render (NODE_ENV=production) cerca nella cartella corrente, altrimenti usa il percorso locale
    const defaultDir = process.env.NODE_ENV === 'production' ? __dirname : (process.env.DATA_DIR || 'c:\\Users\\Utente\\OneDrive\\Desktop\\sedi');
    
    // Proviamo diverse varianti di nome per essere più flessibili
    const possibleImmobiliNames = ['immobili.csv', 'Immobili.csv', 'immobili.xlsx', 'Immobili.xlsx'];
    const possibleClassPointNames = ['class_point.csv', 'Class Point.csv', 'Class Point SUD.csv', 'class point.csv'];
    
    let immobiliPath = null;
    let classPointPath = null;

    // Cerca il file immobili
    for (const name of possibleImmobiliNames) {
      const p = path.join(defaultDir, name);
      if (fs.existsSync(p)) {
        immobiliPath = p;
        break;
      }
    }

    // Cerca il file class point
    for (const name of possibleClassPointNames) {
      const p = path.join(defaultDir, name);
      if (fs.existsSync(p)) {
        classPointPath = p;
        break;
      }
    }

    let immobiliData = [];
    let classPointData = [];
    let filesFound = 0;

    if (immobiliPath) {
      console.log(`Trovato file immobili: ${immobiliPath}`);
      immobiliData = parseFile(immobiliPath, path.basename(immobiliPath));
      filesFound++;
    }
    if (classPointPath) {
      console.log(`Trovato file class point: ${classPointPath}`);
      classPointData = parseFile(classPointPath, path.basename(classPointPath));
      filesFound++;
    }

    if (filesFound === 0) {
      return res.status(404).json({ error: 'Nessun file immobili o class point trovato nella directory specificata.' });
    }

    const count = await processImport(immobiliData, classPointData);
    res.json({ message: 'Sincronizzazione automatica completata con successo', count: count });

  } catch (error) {
    console.error("Errore durante la sincronizzazione automatica:", error);
    res.status(500).json({ error: 'Errore durante la sincronizzazione automatica: ' + error.message });
  }
});

// Esegui la sincronizzazione automatica all'avvio del server
const autoSyncOnStartup = async () => {
  console.log("Esecuzione sincronizzazione automatica dei CSV all'avvio...");
  // Se stiamo girando su Render (NODE_ENV=production) cerca nella cartella corrente, altrimenti usa il percorso locale
  const defaultDir = process.env.NODE_ENV === 'production' ? __dirname : (process.env.DATA_DIR || 'c:\\Users\\Utente\\OneDrive\\Desktop\\sedi');
  
  const possibleImmobiliNames = ['immobili.csv', 'Immobili.csv', 'immobili.xlsx', 'Immobili.xlsx'];
  const possibleClassPointNames = ['class_point.csv', 'Class Point.csv', 'Class Point SUD.csv', 'class point.csv'];
  
  let immobiliPath = null;
  let classPointPath = null;

  for (const name of possibleImmobiliNames) {
    const p = path.join(defaultDir, name);
    if (fs.existsSync(p)) { immobiliPath = p; break; }
  }

  for (const name of possibleClassPointNames) {
    const p = path.join(defaultDir, name);
    if (fs.existsSync(p)) { classPointPath = p; break; }
  }

  let immobiliData = [];
  let classPointData = [];

  try {
    if (immobiliPath) immobiliData = parseFile(immobiliPath, path.basename(immobiliPath));
    if (classPointPath) classPointData = parseFile(classPointPath, path.basename(classPointPath));
    
    if (immobiliData.length > 0 || classPointData.length > 0) {
      const count = await processImport(immobiliData, classPointData);
      console.log(`Auto-sync completato. Caricati/Aggiornati ${count} record dal disco.`);
    } else {
      console.log("Nessun file CSV trovato per la sincronizzazione iniziale in " + defaultDir);
    }
  } catch (e) {
    console.error("Errore durante l'auto-sync all'avvio:", e);
  }
};
// Chiamata immediata all'avvio
autoSyncOnStartup();


// API: Import Excel Manuale (vecchio metodo)
app.post('/api/import', (req, res, next) => {
  // Assicurati che la cartella uploads esista prima di usare multer
  const dir = './uploads';
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }
  next();
}, upload.fields([
  { name: 'fileImmobili', maxCount: 1 },
  { name: 'fileClassPoint', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files;
    if (!files || (!files.fileImmobili && !files.fileClassPoint)) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }

    let immobiliData = [];
    let classPointData = [];

    // Helper to parse file
    const parseFileLocal = (fileObj) => {
      const isCsv = fileObj.originalname.toLowerCase().endsWith('.csv');
      if (isCsv) {
        const content = fs.readFileSync(fileObj.path, 'utf8');
        // PapaParse automatically detects standard separators including ';'
        // transformHeader: (h) => h.trim() removes leading/trailing spaces from column names!
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
        
        // Applica il trim sulle chiavi anche per i file Excel per sicurezza
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

    if (files.fileImmobili) {
      immobiliData = parseFileLocal(files.fileImmobili[0]);
    }

    if (files.fileClassPoint) {
      classPointData = parseFileLocal(files.fileClassPoint[0]);
    }

    const count = await processImport(immobiliData, classPointData);
    res.json({ message: 'Importazione completata con successo', count: count });

  } catch (error) {
    console.error("Errore importazione manuale:", error);
    res.status(500).json({ error: error.message || 'Errore durante l\'importazione' });
  }
});

// API: Get all sites (with search/filter)
app.get('/api/sites', async (req, res) => {
  const { search, region, province, city, denominazione } = req.query;
  
  let query = 'SELECT site_code, region, province, city, status, latitude, longitude, merged_data FROM sites WHERE 1=1';
  const params = [];

  if (region) {
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

  // Add limit for performance on large datasets
  query += ' LIMIT 1000';

  try {
    const rows = await db.query(query, params);
    const formattedRows = rows.map(r => ({
      ...r,
      merged_data: typeof r.merged_data === 'string' ? JSON.parse(r.merged_data) : r.merged_data
    }));
    res.json(formattedRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to format string to Title Case (e.g. "CAMPANIA" -> "Campania")
const toTitleCase = (str) => {
  if (!str) return '';
  return str.toString().trim().toLowerCase().replace(/(?:^|\s)\w/g, function(match) {
    return match.toUpperCase();
  });
};

// API: Get filter options for cascading dropdowns
app.get('/api/filter-options', async (req, res) => {
  try {
    const rows = await db.query('SELECT region, province, city, merged_data FROM sites');
    const options = rows.map(r => {
      let denominazione = '';
      let region = r.region;
      let province = r.province;
      let city = r.city;

      try {
        const data = typeof r.merged_data === 'string' ? JSON.parse(r.merged_data || '{}') : r.merged_data;
        denominazione = data.Denominazione || data.Nome || data.Descrizione || '';
        
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get single site
app.get('/api/sites/:site_code', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM sites WHERE site_code = ?', [req.params.site_code]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sito non trovato' });
    
    const row = rows[0];
    row.data_immobili = typeof row.data_immobili === 'string' ? JSON.parse(row.data_immobili) : row.data_immobili;
    row.data_class_point = typeof row.data_class_point === 'string' ? JSON.parse(row.data_class_point) : row.data_class_point;
    row.merged_data = typeof row.merged_data === 'string' ? JSON.parse(row.merged_data) : row.merged_data;
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Create new site
app.post('/api/sites', async (req, res) => {
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

  try {
    await db.run(`
      INSERT INTO sites (site_code, region, province, city, status, latitude, longitude, data_immobili, data_class_point, merged_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      site_code, region, province, city, status, lat, lng, 
      JSON.stringify(data), '{}', JSON.stringify(data)
    ]);
    res.status(201).json({ message: 'Sito creato', site_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update or Insert site (Upsert)
app.put('/api/sites/:site_code', async (req, res) => {
  const data = req.body;
  const site_code = req.params.site_code;
  
  const region = data['Regione'] || data['Region'] || '';
  const province = data['Provincia'] || data['Province'] || '';
  const city = data['Comune'] || data['City'] || '';
  const status = data['StatoImmobile'] || data['Stato SDF'] || '';
  const lat = parseFloatSafe(data['Latitudine']);
  const lng = parseFloatSafe(data['Longitudine']);

  try {
    // Prima controlliamo se esiste
    const rows = await db.query('SELECT * FROM sites WHERE site_code = ?', [site_code]);
    
    if (rows.length > 0) {
      const row = rows[0];
      // Aggiornamento (merge dei dati esistenti con i nuovi)
      const existingMergedData = typeof row.merged_data === 'string' ? JSON.parse(row.merged_data || '{}') : row.merged_data;
      const newMergedData = { ...existingMergedData, ...data };
      
      await db.run(`
        UPDATE sites 
        SET region=?, province=?, city=?, status=?, latitude=?, longitude=?, merged_data=?
        WHERE site_code=?
      `, [
        region, province, city, status, lat, lng, JSON.stringify(newMergedData), site_code
      ]);
      res.json({ message: 'Sito aggiornato' });
    } else {
      // Inserimento nuovo
      await db.run(`
        INSERT INTO sites (site_code, region, province, city, status, latitude, longitude, data_immobili, data_class_point, merged_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        site_code, region, province, city, status, lat, lng, 
        JSON.stringify(data), '{}', JSON.stringify(data)
      ]);
      res.status(201).json({ message: 'Sito creato', site_code });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete site
app.delete('/api/sites/:site_code', async (req, res) => {
  try {
    await db.run('DELETE FROM sites WHERE site_code=?', [req.params.site_code]);
    res.json({ message: 'Sito eliminato' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Dashboard stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {};
    stats.regions = await db.query('SELECT region, COUNT(*) as count FROM sites GROUP BY region');
    stats.status = await db.query('SELECT status, COUNT(*) as count FROM sites GROUP BY status');
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server backend in ascolto sulla porta ${PORT}`);
});
