import { useState, useEffect } from 'react'
import axios from 'axios'
import Select from 'react-select'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import Statistics from './Statistics'

// Fix for default marker icon in react-leaflet
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
})
L.Marker.prototype.options.icon = DefaultIcon

// Componente helper per ricreare lo stile esatto della tabella aziendale (etichetta + casella grigia)
const FieldRow = ({ label, value, addon }) => (
  <div className="flex items-center py-[4px] border-b border-dotted border-[#cccccc]">
    <span className="w-[35%] text-[11px] font-bold text-[#333333] pr-3 text-right leading-tight uppercase tracking-tight">
      {label}
    </span>
    <div className="w-[65%] flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={value || ''}
        className="bg-[#f0f0f0] border border-[#a9a9a9] px-[6px] py-[3px] text-[12px] text-[#000000] w-full min-h-[22px] shadow-inner focus:outline-none focus:border-[#4d90fe] font-sans"
      />
      {addon && <div>{addon}</div>}
    </div>
  </div>
);

function App() {
  const [sites, setSites] = useState([])
  const [search, setSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [provinceFilter, setProvinceFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [denominazioneFilter, setDenominazioneFilter] = useState('')
  const [filterOptions, setFilterOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedSite, setSelectedSite] = useState(null)
  const [isImporting, setIsImporting] = useState(false)
  const [fileImmobili, setFileImmobili] = useState(null)
  const [fileClassPoint, setFileClassPoint] = useState(null)
  const [viewMode, setViewMode] = useState('table') // 'card' or 'table'
  const [activeTab, setActiveTab] = useState('anagrafica') // 'anagrafica', 'rete', 'classificazione', 'sicurezza'
  const [currentPage, setCurrentPage] = useState('home') // 'home' or 'stats'
  const [isSidebarOpen, setIsSidebarOpen] = useState(true) // Stato per aprire/chiudere la sidebar
  const [isAddModalOpen, setIsAddModalOpen] = useState(false) // Stato per la modale di aggiunta
  
  // Stato per i dati del nuovo immobile
  const [newSiteData, setNewSiteData] = useState({
    site_code: '',
    Nome: '',
    Indirizzo: '',
    Regione: '',
    Provincia: '',
    Comune: '',
    'Tipo struttura': '',
    Ownership: '',
    'Classe 2025': '',
    Latitudine: '',
    Longitudine: ''
  })

  const fetchSites = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (regionFilter) params.append('region', regionFilter)
      if (provinceFilter) params.append('province', provinceFilter)
      if (cityFilter) params.append('city', cityFilter)
      if (denominazioneFilter) params.append('denominazione', denominazioneFilter)
      
      const response = await axios.get(`https://security-sud-sedi.onrender.com/api/sites?${params.toString()}`)
      setSites(response.data)
    } catch (error) {
      console.error("Errore nel caricamento dei siti", error)
    }
    setLoading(false)
  }

  const fetchFilterOptions = async () => {
    try {
      const response = await axios.get('https://security-sud-sedi.onrender.com/api/filter-options')
      setFilterOptions(response.data)
    } catch (error) {
      console.error("Errore nel caricamento delle opzioni filtro", error)
    }
  }

  // Effect to handle navigation changes and fetching
  useEffect(() => {
    if (currentPage === 'home') {
      fetchSites()
      fetchFilterOptions()
    } else if (currentPage === 'stats') {
      // Quando vai alle statistiche, usa i filtri correnti
      fetchSites();
    }
  }, [currentPage])

  // Listener per aggiornamenti dai pop-up (es. quando si salva una modifica)
  useEffect(() => {
    const handleMessage = (event) => {
      // Per sicurezza controlliamo l'origine, in sviluppo è localhost
      if (event.data && event.data.type === 'REFRESH_SITES') {
        fetchSites();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Derived options for cascading dropdowns
  const availableRegions = [
    { value: '', label: 'Tutte le Regioni' },
    ...[...new Set(filterOptions.map(o => o.region).filter(Boolean))].sort().map(r => ({ value: r, label: r }))
  ];
  
  const availableProvinces = [
    { value: '', label: 'Tutte le Province' },
    ...[...new Set(filterOptions
      .filter(o => !regionFilter || o.region === regionFilter)
      .map(o => o.province).filter(Boolean))].sort().map(p => ({ value: p, label: p }))
  ];
  
  const availableCities = [
    { value: '', label: 'Tutti i Comuni' },
    ...[...new Set(filterOptions
      .filter(o => (!regionFilter || o.region === regionFilter) && (!provinceFilter || o.province === provinceFilter))
      .map(o => o.city).filter(Boolean))].sort().map(c => ({ value: c, label: c }))
  ];
  
  const availableDenominazioni = [
    { value: '', label: 'Tutte le Denominazioni' },
    ...[...new Set(filterOptions
      .filter(o => (!regionFilter || o.region === regionFilter) && (!provinceFilter || o.province === provinceFilter) && (!cityFilter || o.city === cityFilter))
      .map(o => o.denominazione).filter(Boolean))].sort().map(d => ({ value: d, label: d }))
  ];

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      borderColor: '#d1d5db',
      minHeight: '38px',
      fontSize: '0.875rem'
    }),
    menu: (base) => ({
      ...base,
      zIndex: 50,
      fontSize: '0.875rem'
    })
  };

  const handleSearch = (e) => {
    e.preventDefault()
    fetchSites()
  }

  const handleFileUpload = async (e) => {
    e.preventDefault()
    if (!fileImmobili && !fileClassPoint) {
      alert("Seleziona almeno un file da importare.");
      return;
    }

    const formData = new FormData()
    if (fileImmobili) formData.append('fileImmobili', fileImmobili)
    if (fileClassPoint) formData.append('fileClassPoint', fileClassPoint)

    setIsImporting(true)
    try {
      await axios.post('https://security-sud-sedi.onrender.com/api/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      alert("Importazione completata con successo!")
      setFileImmobili(null)
      setFileClassPoint(null)
      // reset file inputs se esistono
      const immobiliInput = document.getElementById('file-immobili');
      if (immobiliInput) immobiliInput.value = '';
      const classPointInput = document.getElementById('file-classpoint');
      if (classPointInput) classPointInput.value = '';
      
      // Resetta i filtri in modo da vedere tutti i dati appena importati
      setSearch('')
      setRegionFilter('')
      setProvinceFilter('')
      setCityFilter('')
      setDenominazioneFilter('')
      
      // Carica i nuovi dati (assicurati che questo parta senza filtri)
      await fetchSites()
      await fetchFilterOptions()
      
      // Se ti trovi nella pagina delle statistiche, ricarica per sicurezza
      if (currentPage === 'stats') {
        setCurrentPage('home');
      }
      
    } catch (error) {
      console.error("Errore durante l'importazione", error)
      alert("Errore durante l'importazione. Controlla la console per i dettagli.")
    }
    setIsImporting(false)
  }

  const handleAddSiteSubmit = async (e) => {
    e.preventDefault();
    if (!newSiteData.site_code) {
      alert("Il Codice Immobile è obbligatorio");
      return;
    }

    try {
      // Invia i dati al backend
      await axios.put(`https://security-sud-sedi.onrender.com/api/sites/${newSiteData.site_code}`, newSiteData);
      
      alert("Immobile aggiunto/aggiornato con successo!");
      setIsAddModalOpen(false);
      
      // Resetta il form
      setNewSiteData({
        site_code: '', Nome: '', Indirizzo: '', Regione: '', Provincia: '', Comune: '', 'Tipo struttura': '', Ownership: '', 'Classe 2025': '', Latitudine: '', Longitudine: ''
      });
      
      // Ricarica i dati
      fetchSites();
      fetchFilterOptions();
    } catch (error) {
      console.error("Errore salvataggio nuovo immobile:", error);
      alert("Errore durante il salvataggio.");
    }
  };

  const renderAddModal = () => {
    if (!isAddModalOpen) return null;

    const handleInputChange = (e) => {
      const { name, value } = e.target;
      setNewSiteData(prev => ({ ...prev, [name]: value }));
    };

    const inputStyle = { width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '13px', marginBottom: '10px' };
    const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#555', marginBottom: '3px' };

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
        <div style={{ backgroundColor: 'white', borderRadius: '5px', width: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' }}>
          
          <div style={{ padding: '15px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: '5px 5px 0 0' }}>
            <h2 style={{ margin: 0, fontSize: '16px', color: '#337ab7' }}>Aggiungi Nuovo Immobile</h2>
            <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#999' }}>✖</button>
          </div>
          
          <form onSubmit={handleAddSiteSubmit} style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 15px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Codice Immobile *</label>
                <input required type="text" name="site_code" value={newSiteData.site_code} onChange={handleInputChange} style={inputStyle} placeholder="Es. MI12345" />
              </div>
              
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nome / Denominazione</label>
                <input type="text" name="Nome" value={newSiteData.Nome} onChange={handleInputChange} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Regione</label>
                <input type="text" name="Regione" value={newSiteData.Regione} onChange={handleInputChange} style={inputStyle} />
              </div>
              
              <div>
                <label style={labelStyle}>Provincia (Sigla o Nome)</label>
                <input type="text" name="Provincia" value={newSiteData.Provincia} onChange={handleInputChange} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Comune</label>
                <input type="text" name="Comune" value={newSiteData.Comune} onChange={handleInputChange} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Indirizzo</label>
                <input type="text" name="Indirizzo" value={newSiteData.Indirizzo} onChange={handleInputChange} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Tipo Struttura</label>
                <select name="Tipo struttura" value={newSiteData['Tipo struttura']} onChange={handleInputChange} style={inputStyle}>
                  <option value="">Seleziona...</option>
                  <option value="Edificio">Edificio</option>
                  <option value="Terreno">Terreno</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Classe 2025</label>
                <input type="text" name="Classe 2025" value={newSiteData['Classe 2025']} onChange={handleInputChange} style={inputStyle} placeholder="Es. 1, 2, 3..." />
              </div>

              <div>
                <label style={labelStyle}>Latitudine</label>
                <input type="text" name="Latitudine" value={newSiteData.Latitudine} onChange={handleInputChange} style={inputStyle} placeholder="Es. 45.4642" />
              </div>

              <div>
                <label style={labelStyle}>Longitudine</label>
                <input type="text" name="Longitudine" value={newSiteData.Longitudine} onChange={handleInputChange} style={inputStyle} placeholder="Es. 9.1900" />
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
              <button type="button" onClick={() => setIsAddModalOpen(false)} style={{ padding: '8px 15px', backgroundColor: '#f4f4f4', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}>Annulla</button>
              <button type="submit" style={{ padding: '8px 15px', backgroundColor: '#5cb85c', color: 'white', border: '1px solid #4cae4c', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>Salva Immobile</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderTable = () => {
    return (
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #ddd', borderRadius: '4px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
              <tr>
                <th style={{ padding: '12px 15px', textAlign: 'left', color: '#337ab7', fontWeight: 'bold' }}>Codice / Protocollo</th>
                <th style={{ padding: '12px 15px', textAlign: 'left', color: '#337ab7', fontWeight: 'bold' }}>Nome / Denominazione</th>
                <th style={{ padding: '12px 15px', textAlign: 'left', color: '#337ab7', fontWeight: 'bold' }}>Regione</th>
                <th style={{ padding: '12px 15px', textAlign: 'left', color: '#337ab7', fontWeight: 'bold' }}>Provincia</th>
                <th style={{ padding: '12px 15px', textAlign: 'left', color: '#337ab7', fontWeight: 'bold' }}>Stato</th>
                <th style={{ padding: '12px 15px', textAlign: 'right', color: '#337ab7', fontWeight: 'bold' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site, index) => {
                const data = site.merged_data;
                const isDismesso = data.Dismesso === 'SI' || data['Stato SDF'] === 'Dismesso';
                const rowBg = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
                
                // Forza il maiuscolo per regione e provincia
                const displayRegion = (site.region || '').toUpperCase();
                const displayProvince = (site.province || '').toUpperCase();

                return (
                  <tr key={site.site_code} style={{ backgroundColor: rowBg, borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '12px 15px', color: '#555' }}>{site.site_code}</td>
                    <td style={{ padding: '12px 15px', color: '#555' }}>{data.Nome || data.Descrizione || '---'}</td>
                    <td style={{ padding: '12px 15px', color: '#555' }}>{displayRegion}</td>
                    <td style={{ padding: '12px 15px', color: '#555' }}>{displayProvince}</td>
                    <td style={{ padding: '12px 15px', color: '#555' }}>
                      {isDismesso ? 'Dismesso' : 'Attivo'}
                    </td>
                    <td style={{ padding: '8px 15px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2px' }}>
                        <button 
                          onClick={() => setSelectedSite(site)} 
                          style={{ backgroundColor: '#5bc0de', color: 'white', border: 'none', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: '2px' }}
                          title="Dettagli"
                        >
                          🔍
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCard = (site) => {
    const data = site.merged_data
    const isDismesso = data.Dismesso === 'SI' || data['Stato SDF'] === 'Dismesso';
    
    // Forza il maiuscolo per regione e provincia
    const displayRegion = (site.region || '').toUpperCase();
    const displayProvince = (site.province || '').toUpperCase();

    return (
      <div key={site.site_code} style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #ddd', padding: '15px', cursor: 'pointer' }} onClick={() => setSelectedSite(site)}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', fontWeight: 'bold', color: '#000' }}>
          [{site.site_code}]{data.Nome || data.Descrizione || 'Sito senza nome'}
        </h3>
        <div style={{ fontSize: '12px', color: '#555', marginBottom: '5px' }}>
          <span style={{ color: '#c91a1a', marginRight: '5px' }}>📍</span>
          {displayRegion} &rsaquo; {displayProvince} &rsaquo; {site.city}
        </div>
        <div style={{ fontSize: '12px', color: '#333' }}>
          <div>{isDismesso ? 'Dismesso' : 'Attivo'}</div>
          <div>Classe {data['Classe 2025'] || data['CLASSE 2025'] || '---'}</div>
          <div>Proprietà: {data.Ownership || data.SocietaImmobile || '---'}</div>
        </div>
      </div>
    )
  }

  const renderSiteDetail = () => {
    if (!selectedSite) return null
    const data = selectedSite.merged_data

    // Funzione helper per formattare correttamente le coordinate per Google Maps (deve usare il punto, non la virgola)
    const formatCoordForMaps = (coord) => {
      if (!coord) return '';
      return String(coord).replace(',', '.').trim();
    };

    const latToUse = data.Latitudine || data.latitudine || selectedSite.latitude;
    const lngToUse = data.Longitudine || data.longitudine || selectedSite.longitude;

    const mapsLat = formatCoordForMaps(latToUse);
    const mapsLng = formatCoordForMaps(lngToUse);

    // Costruzione delle righe per ciascuna scheda in formato HTML stringa
    const buildRow = (label, value, isLink = false, linkUrl = '', fieldKey = '') => {
      // Converte il valore in stringa sicura, gestendo i valori nulli
      const safeValue = value ? String(value).replace(/"/g, '&quot;') : '';
      
      return `
        <div style="display: flex; align-items: center; padding: 4px 0; border-bottom: 1px dotted #cccccc;">
          <span style="width: 35%; font-size: 11px; font-weight: bold; color: #333333; padding-right: 12px; text-align: right; text-transform: uppercase; letter-spacing: -0.5px;">
            ${label}
          </span>
          <div style="width: 65%; display: flex; align-items: center; gap: 8px;">
            <input type="text" 
              class="data-input" 
              data-key="${fieldKey}" 
              readonly 
              value="${safeValue}" 
              placeholder="---"
              style="background-color: #f0f0f0; border: 1px solid #a9a9a9; padding: 3px 6px; font-size: 12px; color: #000000; width: 100%; min-height: 22px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); outline: none; font-family: sans-serif; transition: all 0.2s;" />
            ${isLink && linkUrl ? `<a href="${linkUrl}" target="_blank" style="color: #2563eb; font-size: 12px; font-weight: bold; text-decoration: underline; white-space: nowrap;">Apri Mappa</a>` : ''}
          </div>
        </div>
      `;
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dettaglio Immobile: ${selectedSite.site_code}</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f9fafb;
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
          }
          .header-container {
            background: linear-gradient(to bottom, #f24537, #c91a1a);
            border-bottom: 4px solid #b31212;
            padding: 12px 16px 0 16px;
            flex-shrink: 0;
          }
          .header-title {
            color: white;
            font-size: 16px;
            font-weight: bold;
            margin: 0 0 12px 0;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
          }
          .tabs {
            display: flex;
            gap: 2px;
            margin-bottom: -4px; /* Per sovrapporsi al bordo del container principale */
          }
          .tab-btn {
            padding: 6px 16px;
            font-size: 12px;
            border: 1px solid #cccccc;
            border-bottom: none;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            background-color: #e5e5e5;
            color: #555555;
            transition: all 0.2s;
            margin-top: 3px;
            padding-bottom: 6px;
          }
          .tab-btn.active {
            background-color: #ffffff;
            color: #000000;
            border-top: 4px solid #c91a1a;
            font-weight: bold;
            z-index: 10;
            padding-bottom: 8px;
            margin-top: 0;
          }
          .tab-btn:hover:not(.active) {
            background-color: #d5d5d5;
          }
          .content-area {
            flex: 1;
            background-color: #f9fafb;
            padding: 16px;
            overflow-y: auto;
            border: 1px solid #cccccc;
            margin: 0 16px 16px 16px;
            border-top: none;
          }
          .sub-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #c91a1a;
            padding-bottom: 8px;
            margin-bottom: 16px;
          }
          .sub-title {
            font-size: 14px;
            font-weight: bold;
            color: #333333;
            text-transform: uppercase;
            margin: 0;
          }
          .badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .badge.dismesso { background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
          .badge.attivo { background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
          
          .tab-content { display: none; }
          .tab-content.active { display: block; }
          
          .grid-layout {
            display: grid;
            grid-template-columns: 1fr;
            row-gap: 0;
            column-gap: 40px;
          }
          @media (min-width: 768px) {
            .grid-layout { grid-template-columns: 1fr 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h1 class="header-title" style="margin: 0;">Dettaglio Immobile Sito: ${selectedSite.site_code}</h1>
            <div style="display: flex; align-items: center; gap: 16px;">
              <label style="color: white; font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer; font-weight: bold;">
                <input type="checkbox" id="edit-toggle" onchange="toggleEditMode(this)">
                Abilita Modifica
              </label>
              <button onclick="saveData()" id="save-btn" style="display: none; background: #4caf50; color: white; border: 1px solid #388e3c; padding: 4px 12px; font-size: 12px; font-weight: bold; border-radius: 4px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">Salva Modifiche</button>
              <button onclick="downloadCSV()" style="background: white; color: #c91a1a; border: 1px solid #cccccc; padding: 4px 12px; font-size: 12px; font-weight: bold; border-radius: 4px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">Scarica CSV</button>
            </div>
          </div>
          <div class="tabs" style="display: flex; flex-wrap: wrap;">
              <button class="tab-btn active" onclick="openTab('anagrafica', this)">Anagrafica Immobile</button>
              <button class="tab-btn" onclick="openTab('classificazione', this)">Classificazione & Decom.</button>
              <button class="tab-btn" onclick="openTab('sicurezza', this)">Ospitalità & Sicurezza</button>
              <button class="tab-btn" onclick="openTab('referenti', this)">Referenti</button>
              
              <button class="tab-btn" onclick="openTab('mezzi_sociali', this)">Mezzi Sociali</button>
              <button class="tab-btn" onclick="openTab('risorse_fcop', this)">Risorse-FCop</button>
              <button class="tab-btn" onclick="openTab('sale_sigra', this)">Sale Sigra</button>
              <button class="tab-btn" onclick="openTab('olo', this)">OLO</button>
              <button class="tab-btn" onclick="openTab('fotovoltaico', this)">Fotovoltaico</button>
              <button class="tab-btn" onclick="openTab('modello_sicurezza', this)">Modello Sicurezza</button>
              <button class="tab-btn" onclick="openTab('ermes', this)">Ermes</button>
              <button class="tab-btn" onclick="openTab('arl', this)">ARL</button>
              <button class="tab-btn" onclick="openTab('centrale_allarmi', this)">Centrale Allarmi</button>
              <button class="tab-btn" onclick="openTab('protezioni_passive', this)">Protezioni Passive</button>
              <button class="tab-btn" onclick="openTab('protezioni_attive', this)">Protezioni Attive</button>
            </div>
        </div>

        <div class="content-area">
          <div class="sub-header">
            <h2 class="sub-title">${data.Nome || data.Descrizione || 'Dettaglio Sito'}</h2>
            <span class="badge ${data.Dismesso === 'SI' ? 'dismesso' : 'attivo'}">
              ${data.Dismesso === 'SI' ? 'Dismesso' : 'Attivo'}
            </span>
          </div>

          <!-- TAB ANAGRAFICA -->
          <div id="anagrafica" class="tab-content active">
            <div class="grid-layout">
              ${buildRow('SAP Code:', data['SAP Code'], false, '', 'SAP Code')}
              ${buildRow('Site Code:', data['Site Code'], false, '', 'Site Code')}
              ${buildRow('CLLI:', data.CLLI, false, '', 'CLLI')}
              ${buildRow('Denominazione:', data.Denominazione || data.Nome || data.Descrizione, false, '', 'Denominazione')}
              ${buildRow('Indirizzo:', data.Address || data.Indirizzo, false, '', 'Indirizzo')}
              ${buildRow('Regione:', data.Region || data.Regione, false, '', 'Regione')}
              ${buildRow('Provincia:', data.Province || data.Provincia, false, '', 'Provincia')}
              ${buildRow('Comune:', data.City || data.Comune, false, '', 'Comune')}
              ${buildRow('Territorial Area:', data['Territorial Area'], false, '', 'Territorial Area')}
              ${buildRow('Building / Terrain:', data['Building or Terrain'] || data['Tipo struttura'], false, '', 'Tipo struttura')}
              ${buildRow('Ownership:', data.Ownership || data.SocietaImmobile, false, '', 'Ownership')}
              ${buildRow('CLASSE 2025:', data['Classe 2025'] || data['CLASSE 2025'], false, '', 'Classe 2025')}
              ${buildRow('POP/COLT?:', data['POP/COLT?'], false, '', 'POP/COLT?')}
              ${buildRow('Pipeline:', data.Pipeline, false, '', 'Pipeline')}
              ${buildRow('Latitudine:', latToUse, false, '', 'Latitudine')}
              ${buildRow('Longitudine:', lngToUse, Boolean(mapsLat && mapsLng), 'https://www.google.com/maps/search/?api=1&query=' + mapsLat + ',' + mapsLng, 'Longitudine')}
            </div>
          </div>

          <!-- TAB CLASSIFICAZIONE -->
          <div id="classificazione" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Lotto AGCOM esteso:', data['Lotto AGCOM esteso'], false, '', 'Lotto AGCOM esteso')}
              ${buildRow('PoP/Bypass/LT:', data['PoP/Bypass/LT'], false, '', 'PoP/Bypass/LT')}
              ${buildRow('Mese Switch Off:', data['Mese Switch Off'] || data['Mese switch off'], false, '', 'Mese Switch Off')}
              ${buildRow('Mese fine lavorazione:', data['Mese di fine lavorazione'] || data['Mese fine lavorazione'], false, '', 'Mese fine lavorazione')}
              ${buildRow('Anno di piano rel3:', data['Anno di piano rel3'] || data['Anno piano rel3'], false, '', 'Anno piano rel3')}
            </div>
          </div>

          <!-- TAB SICUREZZA -->
          <div id="sicurezza" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Videosorveglianza:', data.Videosorveglianza, false, '', 'Videosorveglianza')}
              ${buildRow('Ospitalità:', data['Ospitalità fisica/virtuale'], false, '', 'Ospitalità fisica/virtuale')}
              ${buildRow('Recinzioni:', data.Recinzioni, false, '', 'Recinzioni')}
              ${buildRow('Controllo accessi:', data['Controllo accessi'], false, '', 'Controllo accessi')}
            </div>
          </div>

          <!-- TAB REFERENTI -->
          <div id="referenti" class="tab-content">
            <div class="grid-layout">
              ${buildRow('FOL:', data.FOL, false, '', 'FOL')}
              ${buildRow('FF:', data.FF, false, '', 'FF')}
              ${buildRow('RESP FF:', data['RESP FF'], false, '', 'RESP FF')}
              ${buildRow('AOT:', data.AOT, false, '', 'AOT')}
              ${buildRow('COM:', data.COM, false, '', 'COM')}
            </div>
          </div>

          <!-- TAB MEZZI SOCIALI -->
          <div id="mezzi_sociali" class="tab-content">
            <div class="grid-layout">
              ${buildRow('N. Mezzi Sociali Ricoverati:', data['n. mezzi sociali ricoverati'] || data['N. mezzi sociali ricoverati'], false, '', 'n. mezzi sociali ricoverati')}
            </div>
          </div>

          <!-- TAB RISORSE FCOP -->
          <div id="risorse_fcop" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Num TOT Risorse FiberCop:', data['num TOT risorse FiberCop esclusi TOF'] || data['num TOT risorse FiberCop \n esclusi TOF'] || data['num TOT risorse FiberCop'], false, '', 'num TOT risorse FiberCop esclusi TOF')}
              ${buildRow('Num TOF:', data['num TOF'], false, '', 'num TOF')}
            </div>
          </div>

          <!-- TAB SALE SIGRA -->
          <div id="sale_sigra" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Numero Sale Sigra Wholesale:', data['Numero sale Sigra Wholesale'], false, '', 'Numero sale Sigra Wholesale')}
            </div>
          </div>

          <!-- TAB OLO -->
          <div id="olo" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Numero OLO:', data['Numero OLO'], false, '', 'Numero OLO')}
              ${buildRow('Numero Sale:', data['Numero Sale'] || data['Numero sale'], false, '', 'Numero Sale')}
              ${buildRow('Valore Economico Ospitalità:', data['VALORE ECONOMICO OSPITALITA\''] || data["VALORE ECONOMICO OSPITALITA'"], false, '', "VALORE ECONOMICO OSPITALITA'")}
            </div>
          </div>

          <!-- TAB FOTOVOLTAICO -->
          <div id="fotovoltaico" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Stato SDF:', data['Stato SDF'], false, '', 'Stato SDF')}
              ${buildRow('Stato PE:', data['Stato PE'], false, '', 'Stato PE')}
              ${buildRow('Potenza di Picco (Kwp):', data['Potenza di picco (Kwp)'], false, '', 'Potenza di picco (Kwp)')}
              ${buildRow('N. Inverter:', data['N.Inverter'] || data['N. Inverter'], false, '', 'N.Inverter')}
              ${buildRow('N. Moduli:', data['N.Moduli'] || data['N. Moduli'], false, '', 'N.Moduli')}
              ${buildRow('Costo Impianto:', data['Costo Impianto'], false, '', 'Costo Impianto')}
            </div>
          </div>

          <!-- TAB MODELLO SICUREZZA -->
          <div id="modello_sicurezza" class="tab-content">
            <div class="grid-layout">
              ${buildRow('MSS Stato:', data['MSS_Stato'], false, '', 'MSS_Stato')}
              ${buildRow('MSS Data Ultima Pubblicazione:', data['MSS_Data ultima pubblicazione'], false, '', 'MSS_Data ultima pubblicazione')}
              ${buildRow('MSS Note AT SEC:', data['MSS_Note AT SEC'], false, '', 'MSS_Note AT SEC')}
            </div>
          </div>

          <!-- TAB ERMES -->
          <div id="ermes" class="tab-content">
            <div class="grid-layout">
              ${buildRow('2025-Ermes Totali:', data['2025-Ermes totali:'], false, '', '2025-Ermes totali:')}
              ${buildRow('Di cui Furti:', data['di cui Furti'], false, '', 'di cui Furti')}
              ${buildRow('Di cui Danneggiamenti:', data['di cui Danneggiamenti'], false, '', 'di cui Danneggiamenti')}
              ${buildRow('Di cui Vandalismi:', data['di cui Vandalismi'], false, '', 'di cui Vandalismi')}
            </div>
          </div>

          <!-- TAB ARL -->
          <div id="arl" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Num. ONUCAB:', data['Num.ONUCAB'] || data['Num. ONUCAB'], false, '', 'Num.ONUCAB')}
            </div>
          </div>

          <!-- TAB CENTRALE ALLARMI E TLC -->
          <div id="centrale_allarmi" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Sensori:', data['sensori'], false, '', 'sensori')}
              ${buildRow('Telecamere:', data['telecamere'], false, '', 'telecamere')}
              ${buildRow('Teste:', data['teste'], false, '', 'teste')}
              ${buildRow('Uscita:', data['uscita'], false, '', 'uscita')}
            </div>
          </div>

          <!-- TAB PROTEZIONI PASSIVE -->
          <div id="protezioni_passive" class="tab-content">
            <div class="grid-layout">
              ${buildRow('Recinzione (si/no):', data['RECINZIONE (si/no)'], false, '', 'RECINZIONE (si/no)')}
              ${buildRow('Carrai Perimetrali:', data['CARRAI perimetrali (da 0 a N)'], false, '', 'CARRAI perimetrali (da 0 a N)')}
              ${buildRow('Pedonali Perimetrali:', data['PEDONALI perimetrali (da 0 a N)'], false, '', 'PEDONALI perimetrali (da 0 a N)')}
              ${buildRow('Ingressi:', data['INGRESSI (somma di ing.princ., ing.sec., U.S. - NO perimetrali)'], false, '', 'INGRESSI (somma di ing.princ., ing.sec., U.S. - NO perimetrali)')}
              ${buildRow('Vigilanza (tipo):', data['VIGILANZA (tipo)'], false, '', 'VIGILANZA (tipo)')}
              ${buildRow('Vigilanza da Rivalutare?:', data['VIGILANZA DA RIVALUTARE?  (si e come, oppure no)'] || data['VIGILANZA DA RIVALUTARE? (si e come, oppure no)'], false, '', 'VIGILANZA DA RIVALUTARE?  (si e come, oppure no)')}
              ${buildRow('Interventi Passivi:', data['INTERVENTI PASSIVI (si e quali, oppure no)'], false, '', 'INTERVENTI PASSIVI (si e quali, oppure no)')}
              ${buildRow('Interventi Attivi:', data['INTERVENTI ATTIVI (si e quali, oppure no)'], false, '', 'INTERVENTI ATTIVI (si e quali, oppure no)')}
              ${buildRow('Interventi Organizzativi:', data['INTERVENTI ORGANIZZATIVI (si e quali, oppure no)'], false, '', 'INTERVENTI ORGANIZZATIVI (si e quali, oppure no)')}
              ${buildRow('Piano a Breve:', data['PIANO A BREVE (interventi urgenti)'], false, '', 'PIANO A BREVE (interventi urgenti)')}
              ${buildRow('Piano a Medio:', data['PIANO A MEDIO'], false, '', 'PIANO A MEDIO')}
              ${buildRow('Piano a Lungo:', data['PIANO A LUNGO'], false, '', 'PIANO A LUNGO')}
            </div>
          </div>

          <!-- TAB PROTEZIONI ATTIVE -->
          <div id="protezioni_attive" class="tab-content">
            <div class="grid-layout">
              ${buildRow('BEEXACT:', data['BEEXACT'], false, '', 'BEEXACT')}
              ${buildRow('Ospitalità (Fisica e Virtuale):', data['Ospitalità (Fisica e Virtuale)'], false, '', 'Ospitalità (Fisica e Virtuale)')}
              ${buildRow('Protezioni Passive:', data['PROTEZIONI PASSIVE'], false, '', 'PROTEZIONI PASSIVE')}
              ${buildRow('Controllo Accessi:', data['CONTROLLO ACCESSI'], false, '', 'CONTROLLO ACCESSI')}
              ${buildRow('Sistema di Allarme:', data['SISTEMA DI ALLARME'], false, '', 'SISTEMA DI ALLARME')}
              ${buildRow('Videosorveglianza:', data['VIDEOSORVEGLIANZA'], false, '', 'VIDEOSORVEGLIANZA')}
              ${buildRow('Ispezioni VIM:', data['ISPEZIONI VIM'], false, '', 'ISPEZIONI VIM')}
            </div>
          </div>
        </div>

        <script>
          let isEditMode = false;
          let siteData = ${JSON.stringify(data)};
          const siteCode = "${selectedSite.site_code}";

          function openTab(tabName, btnElement) {
            // Nascondi tutti i contenuti
            const contents = document.getElementsByClassName('tab-content');
            for(let i=0; i<contents.length; i++) {
              contents[i].classList.remove('active');
            }
            // Rimuovi la classe active da tutti i bottoni
            const btns = document.getElementsByClassName('tab-btn');
            for(let i=0; i<btns.length; i++) {
              btns[i].classList.remove('active');
            }
            // Attiva il tab cliccato
            document.getElementById(tabName).classList.add('active');
            btnElement.classList.add('active');
          }

          function toggleEditMode(checkbox) {
            isEditMode = checkbox.checked;
            const inputs = document.querySelectorAll('.data-input');
            const saveBtn = document.getElementById('save-btn');
            
            saveBtn.style.display = isEditMode ? 'block' : 'none';
            
            inputs.forEach(input => {
              // Non permettere la modifica del codice primario per sicurezza
              if (input.getAttribute('data-key') === 'SAP Code' || input.getAttribute('data-key') === 'CodiceImmobile' || input.getAttribute('data-key') === 'Site Code') {
                return;
              }

              if (isEditMode) {
                input.removeAttribute('readonly');
                input.style.backgroundColor = '#ffffff';
                input.style.border = '1px solid #4d90fe';
                input.style.boxShadow = '0 0 3px rgba(77,144,254,0.5)';
              } else {
                input.setAttribute('readonly', 'true');
                input.style.backgroundColor = '#f0f0f0';
                input.style.border = '1px solid #a9a9a9';
                input.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.1)';
              }
            });
          }

          async function saveData() {
            const inputs = document.querySelectorAll('.data-input');
            inputs.forEach(input => {
              const key = input.getAttribute('data-key');
              if (key) {
                siteData[key] = input.value;
              }
            });

            // Mostra stato caricamento
            const saveBtn = document.getElementById('save-btn');
            const originalText = saveBtn.innerText;
            saveBtn.innerText = 'Salvataggio...';
            saveBtn.disabled = true;

            try {
              const response = await fetch('https://security-sud-sedi.onrender.com/api/sites/' + encodeURIComponent(siteCode), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(siteData)
              });
              
              if (response.ok) {
                alert('Dati aggiornati con successo!');
                // Ricarica la pagina principale per mostrare i dati aggiornati
                if (window.opener && !window.opener.closed) {
                  // Comunica con la finestra principale per ricaricare i dati
                  window.opener.postMessage({ type: 'REFRESH_SITES' }, '*');
                }
                // Disabilita modalità modifica
                document.getElementById('edit-toggle').click();
              } else {
                alert('Errore durante il salvataggio.');
              }
            } catch (err) {
              console.error(err);
              alert('Errore di connessione al server.');
            } finally {
              saveBtn.innerText = originalText;
              saveBtn.disabled = false;
            }
          }

          function downloadCSV() {
            // Raccoglie i dati correnti di questo sito e crea un CSV
            const keys = Object.keys(siteData);
            const values = keys.map(k => {
              let val = siteData[k];
              if (val === null || val === undefined) val = '';
              // Escape quotes e wrap in quotes
              return '"' + String(val).replace(/"/g, '""') + '"';
            });
            
            const csvContent = keys.map(k => '"' + k + '"').join(',') + '\\n' + values.join(',');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', 'Dettaglio_Sito_' + siteCode + '.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        </script>
      </body>
      </html>
    `;

    // Apri la nuova finestra
    const popupWidth = 900;
    const popupHeight = 650;
    const left = window.screen.width / 2 - popupWidth / 2;
    const top = window.screen.height / 2 - popupHeight / 2;
    
    const popup = window.open(
      '', 
      `_site_detail_${selectedSite.site_code}`,
      `width=${popupWidth},height=${popupHeight},top=${top},left=${left},scrollbars=yes,resizable=yes`
    );

    if (popup) {
      popup.document.open();
      popup.document.write(htmlContent);
      popup.document.close();
      
      // Resetta lo stato nel componente React principale in modo che 
      // si possa cliccare nuovamente sullo stesso elemento per riaprirlo
      setTimeout(() => setSelectedSite(null), 100);
    } else {
      alert("Il browser ha bloccato il pop-up. Per favore abilita i pop-up per questo sito.");
      setSelectedSite(null);
    }

    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
      
      {/* HEADER EXACT REPLICA */}
      <header style={{ backgroundColor: '#6c757d', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', height: '50px', flexShrink: 0 }}>
        
        {/* Logo Left */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Logo block */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 15px', height: '100%' }}>
            {/* Fake Hamburger/Lines */}
            <div 
              style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginRight: '10px', cursor: 'pointer' }}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <div style={{ width: '20px', height: '3px', backgroundColor: 'white' }}></div>
              <div style={{ width: '20px', height: '3px', backgroundColor: 'white' }}></div>
              <div style={{ width: '20px', height: '3px', backgroundColor: 'white' }}></div>
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '0.5px' }}>FiberCop</span>
          </div>
          
          {/* Divider & Subtitle */}
          <div style={{ borderLeft: '1px solid #8e959b', height: '100%', margin: '0 15px' }}></div>
          <span style={{ fontSize: '14px' }}>Gestione Sedi & Immobili</span>
        </div>

        {/* Right Info */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          
          {/* Anno */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 15px' }}>
            <span style={{ fontSize: '12px', marginRight: '5px' }}>Anno:</span>
            <span style={{ backgroundColor: '#5cb85c', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>2026</span>
          </div>

          {/* User Profile */}
          <div style={{ backgroundColor: '#2b3e50', display: 'flex', alignItems: 'center', padding: '0 15px', gap: '10px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#fff', overflow: 'hidden' }}>
              <img src="https://ui-avatars.com/api/?name=User&background=random" alt="user" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>Utente Corrente</span>
              <span style={{ fontSize: '10px', color: '#aab2bd' }}>ATS - FIBERCOP</span>
            </div>
            <span style={{ fontSize: '12px', marginLeft: '5px' }}>▼</span>
          </div>

        </div>
      </header>

      {/* Corpo principale contenente Sidebar e Contenuto Centrale */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* SIDEBAR SINISTRA EXACT REPLICA (Sempre visibile se isSidebarOpen === true) */}
        {isSidebarOpen && (
        <aside style={{ width: '220px', backgroundColor: '#f9f9f9', borderRight: '1px solid #e7e7e7', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          
          {/* Top 3 Buttons */}
          <div style={{ display: 'flex', height: '40px' }}>
            <button style={{ flex: 1, backgroundColor: '#5cb85c', border: 'none', borderRight: '1px solid #4cae4c', color: 'white', cursor: 'pointer' }} onClick={() => { if(currentPage === 'home') setViewMode('table'); }}>📋</button>
            <button style={{ flex: 1, backgroundColor: '#5bc0de', border: 'none', borderRight: '1px solid #46b8da', color: 'white', cursor: 'pointer' }} onClick={() => { if(currentPage === 'home') setViewMode('card'); }}>🌍</button>
            <button style={{ flex: 1, backgroundColor: '#d9534f', border: 'none', color: 'white', cursor: 'pointer' }} onClick={() => setCurrentPage(currentPage === 'home' ? 'stats' : 'home')}>📊</button>
          </div>

          {/* Menu items (Simulated) */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div 
              style={{ padding: '12px 15px', borderBottom: '1px solid #e7e7e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: currentPage === 'home' ? '#337ab7' : '#555', fontSize: '13px', backgroundColor: currentPage === 'home' ? '#eee' : 'transparent' }}
              onClick={() => setCurrentPage('home')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>⏱️</span>
                <span style={{ fontWeight: currentPage === 'home' ? 'bold' : 'normal' }}>Gestione Sedi</span>
              </div>
            </div>
            <div 
              style={{ padding: '12px 15px', borderBottom: '1px solid #e7e7e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: currentPage === 'stats' ? '#337ab7' : '#555', fontSize: '13px', backgroundColor: currentPage === 'stats' ? '#eee' : 'transparent' }}
              onClick={() => setCurrentPage('stats')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>📊</span>
                <span style={{ fontWeight: currentPage === 'stats' ? 'bold' : 'normal' }}>Statistiche</span>
              </div>
            </div>
            
            {/* Sezione Filtri personalizzata per noi, ma integrata nel design */}
            <div style={{ padding: '15px', borderBottom: '1px solid #e7e7e7', backgroundColor: '#fff' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '10px', textTransform: 'uppercase' }}>Filtri Ricerca</h3>
              
              <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Select
                  styles={customSelectStyles} placeholder="Regione" isClearable options={availableRegions}
                  value={availableRegions.find(r => r.value === regionFilter) || null}
                  onChange={(s) => { setRegionFilter(s ? s.value : ''); setProvinceFilter(''); setCityFilter(''); setDenominazioneFilter(''); }}
                />
                <Select
                  styles={customSelectStyles} placeholder="Provincia" isClearable options={availableProvinces}
                  value={availableProvinces.find(p => p.value === provinceFilter) || null}
                  onChange={(s) => { setProvinceFilter(s ? s.value : ''); setCityFilter(''); setDenominazioneFilter(''); }}
                />
                <Select
                  styles={customSelectStyles} placeholder="Città" isClearable options={availableCities}
                  value={availableCities.find(c => c.value === cityFilter) || null}
                  onChange={(s) => { setCityFilter(s ? s.value : ''); setDenominazioneFilter(''); }}
                />
                <Select
                  styles={customSelectStyles} placeholder="Sito/Denominazione" isClearable options={availableDenominazioni}
                  value={availableDenominazioni.find(d => d.value === denominazioneFilter) || null}
                  onChange={(s) => setDenominazioneFilter(s ? s.value : '')}
                />
                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                  <button type="submit" style={{ flex: 1, backgroundColor: '#337ab7', color: 'white', border: 'none', padding: '6px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer' }}>Applica</button>
                  <button type="button" onClick={() => { setRegionFilter(''); setProvinceFilter(''); setCityFilter(''); setDenominazioneFilter(''); setSearch(''); fetchSites(); }} style={{ flex: 1, backgroundColor: '#fff', color: '#333', border: '1px solid #ccc', padding: '6px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer' }}>Reset</button>
                </div>
              </form>
            </div>

            {/* Sezione Importa personalizzata */}
            <div style={{ padding: '15px', backgroundColor: '#fff' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '10px', textTransform: 'uppercase' }}>Importa Dati</h3>
              
              <button 
                onClick={async () => {
                  setIsImporting(true);
                  try {
                    const response = await axios.post('http://localhost:3001/api/sync');
                    alert("Sincronizzazione completata: " + response.data.message);
                    fetchSites();
                    fetchFilterOptions();
                  } catch (e) {
                    const errorMsg = e.response?.data?.error || e.message;
                    alert("Errore durante la sincronizzazione: " + errorMsg);
                    console.error(e);
                  }
                  setIsImporting(false);
                }} 
                disabled={isImporting} 
                style={{ backgroundColor: '#5bc0de', color: 'white', border: 'none', padding: '8px', fontSize: '12px', borderRadius: '3px', cursor: 'pointer', width: '100%', marginBottom: '15px', fontWeight: 'bold' }}
              >
                🔄 Sincronizza da Cartella
              </button>

              <form onSubmit={handleFileUpload} style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', color: '#777', fontWeight: 'bold', marginBottom: '5px' }}>Oppure carica manualmente:</div>
                <div>
                  <div style={{ fontSize: '10px', color: '#777', marginBottom: '2px' }}>1. Immobili (.csv)</div>
                  <input type="file" style={{ fontSize: '10px', width: '100%' }} onChange={(e) => setFileImmobili(e.target.files[0])} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#777', marginBottom: '2px' }}>2. Class Point (.csv)</div>
                  <input type="file" style={{ fontSize: '10px', width: '100%' }} onChange={(e) => setFileClassPoint(e.target.files[0])} />
                </div>
                <button type="submit" disabled={isImporting} style={{ backgroundColor: '#f0ad4e', color: 'white', border: 'none', padding: '6px', fontSize: '11px', borderRadius: '3px', cursor: 'pointer', marginTop: '5px' }}>
                  {isImporting ? 'Caricamento...' : 'Importa Manuale'}
                </button>
              </form>
            </div>

          </div>
        </aside>
        )}

        {/* CONTENUTO CENTRALE DINAMICO */}
        {currentPage === 'home' ? (
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', overflow: 'hidden' }}>
            
            {/* Breadcrumb & Search Bar */}
            <div style={{ height: '50px', borderBottom: '1px solid #e7e7e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', backgroundColor: '#ffffff', flexShrink: 0 }}>
              
              {/* Breadcrumb */}
              <div style={{ fontSize: '13px', color: '#337ab7', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span 
                  style={{ color: '#555', cursor: 'pointer' }} 
                  onClick={() => setCurrentPage('home')}
                >
                  🏠 Home
                </span>
                <span style={{ color: '#ccc' }}>&gt;</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ color: '#555' }}>⏱️</span> Ricerca Immobili
                </span>
              </div>

              {/* Actions Area (Search & Add) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button 
                  onClick={() => setIsAddModalOpen(true)}
                  style={{ backgroundColor: '#5cb85c', border: '1px solid #4cae4c', color: 'white', padding: '0 12px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 'bold', borderRadius: '3px' }}
                >
                  <span>+</span> Nuovo Immobile
                </button>
                
                <form onSubmit={handleSearch} style={{ display: 'flex', height: '30px' }}>
                  <input 
                    type="text" 
                    placeholder="Codice Immobile..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ border: '1px solid #ccc', borderRight: 'none', padding: '0 10px', fontSize: '13px', width: '250px', outline: 'none' }}
                  />
                  <button type="submit" style={{ backgroundColor: '#5bc0de', border: '1px solid #46b8da', color: 'white', width: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    🔍
                  </button>
                </form>
              </div>

            </div>

            {/* Tabella Content */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#777' }}>Caricamento in corso...</div>
              ) : sites.length > 0 ? (
                viewMode === 'table' ? renderTable() : (
                   <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', height: '100%' }}>
                     <div style={{ width: '33%', height: '100%', overflowY: 'auto', paddingRight: '10px' }}>
                       {sites.map(renderCard)}
                     </div>
                     <div style={{ width: '66%', height: '100%', backgroundColor: '#eee', border: '1px solid #ddd' }}>
                       <MapContainer center={[40.85, 14.26]} zoom={6} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                         <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                         {sites.map(site => {
                           if (site.latitude && site.longitude) {
                             return (
                               <Marker key={site.site_code} position={[site.latitude, site.longitude]}>
                                 <Popup>
                                   <strong>[{site.site_code}]</strong><br/>{site.merged_data?.Nome || 'Sito'}<br/>
                                   <button onClick={() => setSelectedSite(site)} style={{ color: '#337ab7', textDecoration: 'underline', border: 'none', background: 'none', cursor: 'pointer', marginTop: '5px' }}>Vedi dettagli</button>
                                 </Popup>
                               </Marker>
                             )
                           }
                           return null;
                         })}
                       </MapContainer>
                     </div>
                   </div>
                )
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#777', border: '1px solid #ddd', backgroundColor: '#f9f9f9' }}>
                  Nessun immobile trovato. Modifica i filtri o importa i dati.
                </div>
              )}
            </div>

          </main>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', overflow: 'hidden' }}>
            {/* Top Bar for Statistics Page to match main layout */}
            <div style={{ height: '50px', borderBottom: '1px solid #e7e7e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', backgroundColor: '#ffffff', flexShrink: 0 }}>
              {/* Breadcrumb */}
              <div style={{ fontSize: '13px', color: '#337ab7', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span 
                  style={{ color: '#555', cursor: 'pointer', textDecoration: 'underline' }} 
                  onClick={() => setCurrentPage('home')}
                >
                  🏠 Home
                </span>
                <span style={{ color: '#ccc' }}>&gt;</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ color: '#555' }}>📊</span> Statistiche
                </span>
              </div>
              
              <button 
                onClick={() => setCurrentPage('home')}
                style={{ backgroundColor: '#5bc0de', color: 'white', border: '1px solid #46b8da', padding: '6px 12px', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                Torna alla Ricerca
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <Statistics sites={sites} onBack={() => setCurrentPage('home')} />
            </div>
          </div>
        )}
      </div>

      {/* Modale Dettaglio Nativo */}
      {renderSiteDetail()}

      {/* Modale Aggiunta Nuovo Immobile */}
      {renderAddModal()}
    </div>
  )
}

export default App
