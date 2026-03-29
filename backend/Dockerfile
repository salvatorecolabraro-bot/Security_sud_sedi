# Usa un'immagine ufficiale di Node.js (leggera)
FROM node:18-alpine

# Crea e imposta la cartella di lavoro nel container
WORKDIR /usr/src/app

# Copia i file delle dipendenze e installale
COPY package*.json ./
RUN npm install

# Copia tutto il resto del codice sorgente
COPY . .

# Crea la cartella per i dati persistenti (se non esiste)
RUN mkdir -p /usr/src/app/data
RUN mkdir -p /usr/src/app/sedi

# Espone la porta che userà il server
EXPOSE 3001

# Comando per avviare il server
CMD ["node", "server.js"]
