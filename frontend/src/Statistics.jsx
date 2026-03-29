import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#f24537', '#c91a1a', '#4caf50'];

const Statistics = ({ sites, onBack }) => {
  const stats = useMemo(() => {
    let totaleSiti = sites.length;
    let attivi = 0;
    let dismessi = 0;
    
    // Contatori per le card basati sui dati reali
    let edifici = 0;
    let terreni = 0;
    let altaPriorita = 0;
    let totVideosorveglianza = 0;
    let totControlloAccessi = 0;

    // Dati per i vecchi grafici
    const ownershipMap = {};
    const regionMap = {};
    const classMap = {};
    const controlloAccessiMap = {};
    const videosorveglianzaMap = {};

    sites.forEach(site => {
      const data = site.merged_data;
      
      // Stato Dismesso/Attivo
      const isDismesso = data.Dismesso === 'SI' || data['Stato SDF'] === 'Dismesso';
      if (isDismesso) dismessi++;
      else attivi++;

      // Edifici / Terreni
      const tipo = (data['Building or Terrain'] || data['Tipo struttura'] || '').toLowerCase();
      if (tipo.includes('building') || tipo.includes('edificio')) edifici++;
      else if (tipo.includes('terrain') || tipo.includes('terreno')) terreni++;

      // Alta priorità (Classe 2025: I o II)
      const valClasse = data['Classe 2025'] || data['CLASSE 2025'] || '';
      // Gestiamo sia la stringa esatta che eventuali spazi o testi che contengono il numero romano
      const upperClasse = valClasse.toUpperCase().trim();
      if (upperClasse === 'I' || upperClasse === 'II' || upperClasse.startsWith('CLASSE I ') || upperClasse.startsWith('CLASSE II ')) {
        altaPriorita++;
      }

      // Videosorveglianza (Conteggio per le card)
      const valVideosorv = data.Videosorveglianza || data['VIDEOSORVEGLIANZA'] || '';
      if (typeof valVideosorv === 'string' && valVideosorv.toUpperCase().trim() === 'SI') {
        totVideosorveglianza++;
      }

      // Controllo Accessi (Conteggio per le card e normalizzazione per grafico)
      let valCtrlAccessi = data['Controllo accessi'] || data['CONTROLLO ACCESSI'] || '';
      if (typeof valCtrlAccessi === 'string') {
        const checkStr = valCtrlAccessi.toUpperCase().trim();
        // Se è vuoto, o contiene "NO CONTR ACC" o contiene "SRB", lo consideriamo "NO"
        if (checkStr === '' || checkStr.includes('NO CONTR ACC') || checkStr.includes('SRB') || checkStr === 'NO' || checkStr === 'NON SPECIFICATO') {
          valCtrlAccessi = 'NO';
        } else {
          // Altrimenti lo consideriamo "SI"
          valCtrlAccessi = 'SI';
          totControlloAccessi++;
        }
      } else {
        valCtrlAccessi = 'NO';
      }

      // Popolamento mappe per i vecchi grafici
      const ownership = data.Ownership || data.SocietaImmobile || 'Non Specificato';
      if (!ownershipMap[ownership]) ownershipMap[ownership] = [];
      ownershipMap[ownership].push(site);

      const rawRegion = site.region || 'Sconosciuta';
      const region = rawRegion.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      if (!regionMap[region]) regionMap[region] = [];
      regionMap[region].push(site);

      const classe = data['Classe 2025'] || data['CLASSE 2025'] || 'Non Specificata';
      if (!classMap[classe]) classMap[classe] = [];
      classMap[classe].push(site);

      // Usiamo la variabile valCtrlAccessi già normalizzata sopra in "SI" o "NO"
      if (!controlloAccessiMap[valCtrlAccessi]) controlloAccessiMap[valCtrlAccessi] = [];
      controlloAccessiMap[valCtrlAccessi].push(site);

      let videosorv = data.Videosorveglianza || data['VIDEOSORVEGLIANZA'] || 'Non Specificato';
      if (typeof videosorv === 'string') videosorv = videosorv.trim() || 'Non Specificato';
      if (!videosorveglianzaMap[videosorv]) videosorveglianzaMap[videosorv] = [];
      videosorveglianzaMap[videosorv].push(site);
    });
    
    // Mappa siti per il grafico a torta principale (Edifici vs Terreni)
    let edificiSites = [];
    let terreniSites = [];
    sites.forEach(site => {
      const data = site.merged_data;
      const tipo = (data['Building or Terrain'] || data['Tipo struttura'] || '').toLowerCase();
      if (tipo.includes('building') || tipo.includes('edificio')) edificiSites.push(site);
      else if (tipo.includes('terrain') || tipo.includes('terreno')) terreniSites.push(site);
    });

    return {
      totale: totaleSiti,
      attivi,
      dismessi,
      altaPriorita,
      totVideosorveglianza,
      totControlloAccessi,
      edifici,
      terreni,
      
      chartData: [
        { name: 'Edifici', value: edifici, color: '#5bc0de', sites: edificiSites },
        { name: 'Terreni', value: terreni, color: '#f0ad4e', sites: terreniSites }
      ].filter(item => item.value > 0),
      
      // Dati per i vecchi grafici
      ownership: Object.keys(ownershipMap).map(k => ({ name: k, value: ownershipMap[k].length, sites: ownershipMap[k] })),
      regioni: Object.keys(regionMap).map(k => ({ name: k, value: regionMap[k].length, sites: regionMap[k] })).sort((a, b) => b.value - a.value),
      classi: Object.keys(classMap)
        .map(k => ({ name: k, value: classMap[k].length, sites: classMap[k] }))
        .sort((a, b) => {
          if (a.name === 'Non Specificata') return 1;
          if (b.name === 'Non Specificata') return -1;
          const numA = parseInt(a.name.replace(/\D/g, ''));
          const numB = parseInt(b.name.replace(/\D/g, ''));
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.name.localeCompare(b.name);
        }),
      controlloAccessi: Object.keys(controlloAccessiMap)
        .map(k => ({ name: k, value: controlloAccessiMap[k].length, sites: controlloAccessiMap[k] }))
        .sort((a, b) => b.value - a.value),
      videosorveglianza: Object.keys(videosorveglianzaMap)
        .map(k => ({ name: k, value: videosorveglianzaMap[k].length, sites: videosorveglianzaMap[k] }))
        .sort((a, b) => b.value - a.value)
    };
  }, [sites]);

  if (!sites || sites.length === 0) {
    return (
      <div style={{ padding: '30px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '20px', color: '#555', marginBottom: '15px' }}>Nessun dato disponibile</h2>
        <p style={{ color: '#888', marginBottom: '20px' }}>Importa i file CSV o usa la sincronizzazione per visualizzare le statistiche.</p>
        <button 
          onClick={onBack} 
          style={{ backgroundColor: '#337ab7', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer' }}
        >
          &larr; Torna alla Ricerca
        </button>
      </div>
    );
  }

  // Componente Card riutilizzabile
  const StatCard = ({ icon, color, count, label, badgeCount }) => (
    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: '1px solid #e7e7e7', padding: '15px', position: 'relative' }}>
      <div style={{ 
        width: '45px', height: '45px', borderRadius: '50%', backgroundColor: color, 
        display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: '20px', marginRight: '15px', flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '24px', color: color, lineHeight: '1' }}>{count}</div>
        <div style={{ fontSize: '13px', color: '#555', marginTop: '2px' }}>{label}</div>
      </div>
      {badgeCount !== undefined && (
        <div style={{ 
          position: 'absolute', top: '15px', right: '15px', backgroundColor: '#aab2bd', color: 'white', 
          fontSize: '11px', padding: '2px 6px', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '3px'
        }}>
          {badgeCount} <span style={{ fontSize: '10px' }}>👤</span>
        </div>
      )}
    </div>
  );

  // Componente per le box percentuali in basso
  const PercentBox = ({ percent, label, subLabel, bgColor }) => (
    <div style={{ backgroundColor: bgColor, color: 'white', padding: '15px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flex: 1 }}>
      <div style={{ 
        width: '40px', height: '40px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', 
        display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '13px', fontWeight: 'bold'
      }}>
        {percent}%
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{label}</span>
        <span style={{ fontSize: '11px', opacity: 0.9 }}>{subLabel}</span>
      </div>
    </div>
  );

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
    return percent > 0.05 ? (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="12">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  const ChartPanel = ({ title, icon, children, footer, style }) => (
    <div style={{ border: '1px solid #e7e7e7', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ backgroundColor: '#f9f9f9', padding: '10px 15px', borderBottom: '1px solid #e7e7e7', color: '#5bc0de', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px' }}>{icon}</span> {title}
      </div>
      <div style={{ height: '280px', display: 'flex', position: 'relative', padding: '10px' }}>
        {children}
      </div>
      {footer && (
        <div style={{ display: 'flex', borderTop: '1px solid #e7e7e7', padding: '15px 0' }}>
          {footer}
        </div>
      )}
    </div>
  );

  const handleChartClick = (data, categoryTitle) => {
    let payloadName = '';
    let payloadSites = [];

    if (data && data.activePayload && data.activePayload.length > 0) {
      payloadName = data.activePayload[0].payload.name;
      payloadSites = data.activePayload[0].payload.sites;
    } else if (data && data.payload && data.payload.sites) {
      payloadName = data.payload.name;
      payloadSites = data.payload.sites;
    } else if (data && data.name && data.sites) {
      payloadName = data.name;
      payloadSites = data.sites;
    }

    if (payloadSites && payloadSites.length > 0) {
      openNativePopup(categoryTitle, payloadName, payloadSites);
    }
  };

  const openNativePopup = (categoryTitle, payloadName, sites) => {
    const popupWidth = 1000;
    const popupHeight = 600;
    const left = window.screen.width / 2 - popupWidth / 2;
    const top = window.screen.height / 2 - popupHeight / 2;
    
    const popup = window.open(
      '', 
      `_blank_${Date.now()}`,
      `width=${popupWidth},height=${popupHeight},top=${top},left=${left},scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      alert("Il browser ha bloccato il pop-up. Per favore abilita i pop-up per questo sito.");
      return;
    }

    const tableRowsHtml = sites.map(site => {
      const data = site.merged_data;
      const isDismesso = data.Dismesso === 'SI' || data['Stato SDF'] === 'Dismesso';
      const badgeStyle = isDismesso 
        ? 'background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;'
        : 'background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;';
      
      return `
        <tr style="border-bottom: 1px solid #e5e7eb; transition: background-color 0.2s;">
          <td style="padding: 12px; font-weight: 600; color: #001b33;">${site.site_code}</td>
          <td style="padding: 12px; color: #4b5563;">${data.Denominazione || data.Nome || data.Descrizione || '---'}</td>
          <td style="padding: 12px; color: #4b5563;">${site.region}</td>
          <td style="padding: 12px; color: #4b5563;">${site.province}</td>
          <td style="padding: 12px;">
            <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; ${badgeStyle}">
              ${isDismesso ? 'Dismesso' : 'Attivo'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8">
        <title>Dettaglio Statistica - ${categoryTitle}: ${payloadName}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; margin: 0; background-color: #f9fafb; }
          .header { background: linear-gradient(to bottom, #f24537, #c91a1a); border-bottom: 4px solid #b31212; padding: 16px; color: white; position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; }
          .header h1 { margin: 0; font-size: 18px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; background: white; margin: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          th { background-color: #f3f4f6; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${categoryTitle} - ${payloadName} (${sites.length} risultati)</h1>
        </div>
        <table>
          <thead><tr><th>Codice</th><th>Nome / Denominazione</th><th>Regione</th><th>Provincia</th><th>Stato</th></tr></thead>
          <tbody>${tableRowsHtml}</tbody>
        </table>
      </body>
      </html>
    `;
    popup.document.open();
    popup.document.write(htmlContent);
    popup.document.close();
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#ffffff', minHeight: '100%', fontFamily: 'Arial, sans-serif' }}>
      
      {/* Header Titolo (simile all'immagine) */}
      <div style={{ borderBottom: '1px dotted #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', color: '#4a8bc2', margin: 0, fontWeight: 'normal' }}>
          Gestione Sedi <span style={{ fontSize: '16px', color: '#888' }}>&raquo; Dashboard Statistiche</span>
        </h1>
      </div>

      {/* SEZIONE SUPERIORE (Nuovo Layout) */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '40px' }}>
        
        {/* COLONNA SINISTRA: CARDS */}
        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* Griglia 2x3 per le card */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <StatCard icon="⭐" color="#d9534f" count={stats.altaPriorita} label="Alta Priorità (Cl. I e II)" />
            <StatCard icon="🏢" color="#5bc0de" count={stats.edifici} label="Edifici" badgeCount={0} />
            
            <StatCard icon="🌲" color="#f0ad4e" count={stats.terreni} label="Terreni" />
            <StatCard icon="📹" color="#8cc152" count={stats.totVideosorveglianza} label="Videosorveglianza" badgeCount={0} />
            
            <StatCard icon="🔐" color="#aab2bd" count={stats.totControlloAccessi} label="Controllo Accessi" badgeCount={0} />
            <StatCard icon="⚡" color="#8e959b" count={stats.dismessi} label="Dismessi" badgeCount={0} />
          </div>

          {/* Box percentuali in basso */}
          <div style={{ display: 'flex', gap: '2px', marginTop: '10px' }}>
            <PercentBox percent={Math.round((stats.totVideosorveglianza / stats.totale) * 100) || 0} label="Video" subLabel="sul totale" bgColor="#8cc152" />
            <PercentBox percent={Math.round((stats.altaPriorita / stats.totale) * 100) || 0} label="Priorità" subLabel="sul totale" bgColor="#d9534f" />
            <PercentBox percent={Math.round((stats.totControlloAccessi / stats.totale) * 100) || 0} label="Accessi" subLabel="sul totale" bgColor="#aab2bd" />
          </div>

        </div>

        {/* COLONNA DESTRA: GRAFICO E TABELLA */}
        <ChartPanel 
          title="Tipologia Struttura (Edifici / Terreni)" 
          icon="📊" 
          style={{ flex: '1 1 500px' }}
          footer={
            <>
              <div style={{ flex: 1, padding: '0 15px', borderRight: '1px solid #eee' }}>
                <div style={{ color: '#337ab7', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '15px' }}>
                  <span>🏢</span> Totale Edifici
                </div>
                <div style={{ textAlign: 'right', fontSize: '24px', color: '#5bc0de', fontWeight: 'bold' }}>
                  {stats.edifici}
                </div>
              </div>

              <div style={{ flex: 1, padding: '0 15px', borderRight: '1px solid #eee' }}>
                <div style={{ color: '#8cc152', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '15px' }}>
                  <span>🌲</span> Totale Terreni
                </div>
                <div style={{ textAlign: 'right', fontSize: '24px', color: '#f0ad4e', fontWeight: 'bold' }}>
                  {stats.terreni}
                </div>
              </div>

              <div style={{ flex: 1, padding: '0 15px' }}>
                <div style={{ color: '#d9534f', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '15px' }}>
                  <span>📊</span> Totale Siti Mappati
                </div>
                <div style={{ textAlign: 'right', fontSize: '24px', color: '#333', fontWeight: 'bold' }}>
                  {stats.edifici + stats.terreni}
                </div>
              </div>
            </>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.chartData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                stroke="none"
                onClick={(data) => handleChartClick(data, 'Tipologia Struttura')}
                style={{ cursor: 'pointer' }}
                label={renderCustomizedLabel}
                labelLine={false}
              >
                {stats.chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend layout="vertical" verticalAlign="middle" align="right" iconType="square" wrapperStyle={{ right: 20 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

      </div>
      
      {/* SEZIONE INFERIORE (Vecchi Grafici Reintrodotti) */}
      <div style={{ borderTop: '2px solid #e7e7e7', paddingTop: '20px' }}>
        <h2 style={{ fontSize: '20px', color: '#4a8bc2', marginBottom: '20px', fontWeight: 'normal' }}>Dettagli Avanzati</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          {/* Ownership */}
          <ChartPanel title="Proprietà (Ownership)" icon="🏢">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.ownership} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{fontSize: 11}} />
                <YAxis tick={{fontSize: 11}} />
                <Tooltip />
                <Bar dataKey="value" fill="#0088FE" onClick={(data) => handleChartClick(data, 'Proprietà')} style={{ cursor: 'pointer' }}>
                  {stats.ownership.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Distribuzione per Regione */}
          <ChartPanel title="Distribuzione per Regione" icon="🗺️">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.regioni} layout="vertical" margin={{ top: 5, right: 10, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{fontSize: 11}} />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11}} />
                <Tooltip />
                <Bar dataKey="value" fill="#00C49F" onClick={(data) => handleChartClick(data, 'Regione')} style={{ cursor: 'pointer' }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Classe 2025 */}
          <ChartPanel title="Distribuzione Classe 2025" icon="⭐" style={{ gridColumn: '1 / -1' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.classi} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{fontSize: 11}} />
                <YAxis tick={{fontSize: 11}} />
                <Tooltip />
                <Bar dataKey="value" fill="#FFBB28" onClick={(data) => handleChartClick(data, 'Classe 2025')} style={{ cursor: 'pointer' }}>
                  {stats.classi.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Controllo Accessi */}
          <ChartPanel title="Controllo Accessi" icon="🔐">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.controlloAccessi} cx="50%" cy="50%" outerRadius={100} dataKey="value" onClick={(data) => handleChartClick(data, 'Controllo Accessi')} style={{ cursor: 'pointer' }} label={renderCustomizedLabel} labelLine={false}>
                  {stats.controlloAccessi.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartPanel>

          {/* Videosorveglianza */}
          <ChartPanel title="Videosorveglianza" icon="📹">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.videosorveglianza} cx="50%" cy="50%" outerRadius={100} dataKey="value" onClick={(data) => handleChartClick(data, 'Videosorveglianza')} style={{ cursor: 'pointer' }} label={renderCustomizedLabel} labelLine={false}>
                  {stats.videosorveglianza.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartPanel>

        </div>
      </div>

    </div>
  );
};

export default Statistics;