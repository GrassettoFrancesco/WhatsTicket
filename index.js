const { create, Client } = require('@open-wa/wa-automate');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');

// Database simulato degli eventi
const eventi = [
    {
        id: 1,
        titolo: "Concerto Rock Live",
        data: "2024-03-15",
        luogo: "Arena Milano",
        prezzo: "€35"
    },
    {
        id: 2,
        titolo: "Festival Jazz",
        data: "2024-03-22",
        luogo: "Teatro Romano",
        prezzo: "€28"
    },
    {
        id: 3,
        titolo: "Mostra d'Arte Moderna",
        data: "2024-03-30",
        luogo: "Palazzo delle Esposizioni",
        prezzo: "€15"
    }
];

// Database simulato dei biglietti
let biglietti = [];

// Stato utenti per tracciare il flusso conversazione
let userStates = {};

async function start(client) {
    console.log('🤖 Bot TicketSMS avviato con successo!');
    
    // Gestione messaggi in arrivo
    client.onMessage(async (message) => {
        const userId = message.from;
        const testo = message.body.toLowerCase().trim();
        
        console.log(`📱 Messaggio da ${userId}: ${message.body}`);
        
        try {
            // Comando amministratore per conferma pagamento
            if (message.body.startsWith('/conferma ')) {
                await gestisciConfermaPagamento(client, message);
                return;
            }
            
            // Inizializza stato utente se non esiste
            if (!userStates[userId]) {
                userStates[userId] = { step: 'idle' };
            }
            
            const userState = userStates[userId];
            
            // Flusso principale
            switch (userState.step) {
                case 'idle':
                    if (testo === 'biglietto') {
                        await mostraEventi(client, userId);
                        userState.step = 'selezione_evento';
                    } else {
                        await client.sendText(userId, 
                            '👋 Ciao! Scrivi "biglietto" per vedere gli eventi disponibili.');
                    }
                    break;
                    
                case 'selezione_evento':
                    await gestisciSelezioneEvento(client, userId, testo);
                    break;
                    
                case 'selezione_pagamento':
                    await gestisciSelezionePagamento(client, userId, testo);
                    break;
                    
                default:
                    userState.step = 'idle';
                    await client.sendText(userId, 
                        '❓ Comando non riconosciuto. Scrivi "biglietto" per iniziare.');
            }
            
        } catch (error) {
            console.error('❌ Errore nella gestione del messaggio:', error);
            await client.sendText(userId, 
                '🚫 Si è verificato un errore. Riprova più tardi.');
        }
    });
}

async function mostraEventi(client, userId) {
    let messaggio = '🎫 *EVENTI DISPONIBILI*\n\n';
    
    eventi.forEach((evento, index) => {
        messaggio += `*${index + 1}.* ${evento.titolo}\n`;
        messaggio += `📅 Data: ${evento.data}\n`;
        messaggio += `📍 Luogo: ${evento.luogo}\n`;
        messaggio += `💰 Prezzo: ${evento.prezzo}\n\n`;
    });
    
    messaggio += '✅ *Rispondi con il numero dell\'evento che vuoi prenotare*';
    
    await client.sendText(userId, messaggio);
}

async function gestisciSelezioneEvento(client, userId, scelta) {
    const numeroEvento = parseInt(scelta);
    
    if (isNaN(numeroEvento) || numeroEvento < 1 || numeroEvento > eventi.length) {
        await client.sendText(userId, 
            '❌ Selezione non valida. Scegli un numero da 1 a ' + eventi.length);
        return;
    }
    
    const eventoSelezionato = eventi[numeroEvento - 1];
    userStates[userId].eventoSelezionato = eventoSelezionato;
    userStates[userId].step = 'selezione_pagamento';
    
    const messaggio = `🎯 *EVENTO SELEZIONATO*\n\n` +
        `🎫 ${eventoSelezionato.titolo}\n` +
        `📅 ${eventoSelezionato.data}\n` +
        `📍 ${eventoSelezionato.luogo}\n` +
        `💰 ${eventoSelezionato.prezzo}\n\n` +
        `💳 *SCEGLI IL METODO DI PAGAMENTO:*\n\n` +
        `1️⃣ Stripe (Carta di credito)\n` +
        `2️⃣ PayPal\n` +
        `3️⃣ Pagamento in loco\n\n` +
        `✅ *Rispondi con 1, 2 o 3*`;
    
    await client.sendText(userId, messaggio);
}

async function gestisciSelezionePagamento(client, userId, scelta) {
    const metodiPagamento = {
        '1': 'Stripe',
        '2': 'PayPal', 
        '3': 'Pagamento in loco'
    };
    
    if (!metodiPagamento[scelta]) {
        await client.sendText(userId, 
            '❌ Selezione non valida. Scegli 1, 2 o 3');
        return;
    }
    
    const userState = userStates[userId];
    const evento = userState.eventoSelezionato;
    const metodo = metodiPagamento[scelta];
    
    // Crea prenotazione
    const numeroTicket = Date.now().toString();
    const prenotazione = {
        id: numeroTicket,
        userId: userId,
        evento: evento,
        metodoPagamento: metodo,
        stato: 'in_attesa_pagamento',
        dataPrenotazione: new Date().toISOString()
    };
    
    biglietti.push(prenotazione);
    
    let messaggio = `✅ *PRENOTAZIONE CONFERMATA*\n\n` +
        `🎫 Numero Ticket: ${numeroTicket}\n` +
        `🎭 Evento: ${evento.titolo}\n` +
        `💳 Metodo: ${metodo}\n` +
        `💰 Importo: ${evento.prezzo}\n\n`;
    
    if (scelta === '1') {
        messaggio += `💳 *Link Stripe:*\nhttps://buy.stripe.com/test_esempio\n\n`;
    } else if (scelta === '2') {
        messaggio += `💙 *Link PayPal:*\nhttps://paypal.me/ticketsms/${evento.prezzo.replace('€', '')}\n\n`;
    } else {
        messaggio += `🏪 *Pagamento in loco presso:*\n${evento.luogo}\n\n`;
    }
    
    messaggio += `⏳ Il tuo biglietto verrà inviato dopo la conferma del pagamento.\n\n` +
        `📞 *Il tuo numero:* ${userId.replace('@c.us', '')}\n` +
        `🆔 *Codice prenotazione:* ${numeroTicket}`;
    
    await client.sendText(userId, messaggio);
    
    // Reset stato utente
    userStates[userId] = { step: 'idle' };
}

async function gestisciConfermaPagamento(client, message) {
    const parti = message.body.split(' ');
    if (parti.length !== 2) {
        await client.sendText(message.from, 
            '❌ Formato: /conferma numero_telefono');
        return;
    }
    
    const numeroTelefono = parti[1] + '@c.us';
    
    // Trova prenotazione
    const prenotazione = biglietti.find(b => 
        b.userId === numeroTelefono && b.stato === 'in_attesa_pagamento');
    
    if (!prenotazione) {
        await client.sendText(message.from, 
            '❌ Nessuna prenotazione in attesa trovata per questo numero');
        return;
    }
    
    // Aggiorna stato
    prenotazione.stato = 'pagato';
    
    // Genera e invia biglietto PDF
    await generaEInviaBiglietto(client, prenotazione);
    
    await client.sendText(message.from, 
        `✅ Pagamento confermato e biglietto inviato a ${numeroTelefono.replace('@c.us', '')}`);
}

async function generaEInviaBiglietto(client, prenotazione) {
    try {
        // Genera QR Code
        const qrData = JSON.stringify({
            ticketId: prenotazione.id,
            evento: prenotazione.evento.titolo,
            data: prenotazione.evento.data,
            luogo: prenotazione.evento.luogo
        });
        
        const qrCodePath = `./temp_qr_${prenotazione.id}.png`;
        await QRCode.toFile(qrCodePath, qrData);
        
        // Genera PDF
        const pdfPath = `./biglietto_${prenotazione.id}.pdf`;
        const doc = new PDFDocument();
        
        doc.pipe(fs.createWriteStream(pdfPath));
        
        // Header
        doc.fontSize(24).font('Helvetica-Bold')
           .text('🎫 BIGLIETTO EVENTO', 50, 50);
        
        // Dettagli evento
        doc.fontSize(16).font('Helvetica')
           .text(`Evento: ${prenotazione.evento.titolo}`, 50, 120)
           .text(`Data: ${prenotazione.evento.data}`, 50, 150)
           .text(`Luogo: ${prenotazione.evento.luogo}`, 50, 180)
           .text(`Prezzo: ${prenotazione.evento.prezzo}`, 50, 210)
           .text(`Ticket ID: ${prenotazione.id}`, 50, 240);
        
        // QR Code
        doc.text('Scansiona il QR code per la verifica:', 50, 300);
        doc.image(qrCodePath, 50, 330, { width: 150 });
        
        // Footer
        doc.fontSize(10)
           .text('Questo biglietto è valido solo per l\'evento specificato', 50, 520)
           .text('Conserva questo biglietto fino alla fine dell\'evento', 50, 535);
        
        doc.end();
        
        // Aspetta che il PDF sia completato
        await new Promise((resolve) => {
            doc.on('end', resolve);
        });
        
        // Invia PDF
        await client.sendFile(
            prenotazione.userId,
            pdfPath,
            `biglietto_${prenotazione.evento.titolo.replace(/\s+/g, '_')}.pdf`,
            `🎫 Ecco il tuo biglietto per: *${prenotazione.evento.titolo}*\n\n` +
            `📅 Data: ${prenotazione.evento.data}\n` +
            `📍 Luogo: ${prenotazione.evento.luogo}\n\n` +
            `✅ Conserva questo biglietto e presentalo all'ingresso!`
        );
        
        // Pulizia file temporanei
        await fs.remove(qrCodePath);
        await fs.remove(pdfPath);
        
        console.log(`✅ Biglietto inviato a ${prenotazione.userId}`);
        
    } catch (error) {
        console.error('❌ Errore nella generazione del biglietto:', error);
    }
}

// Avvio del bot
create({
    sessionId: 'TICKET_SMS_BOT',
    multiDevice: true,
    authTimeout: 60,
    blockCrashLogs: true,
    disableSpins: true,
    headless: true,
    hostNotificationLang: 'PT_BR',
    logConsole: false,
    popup: true,
    qrTimeout: 0,
}).then(client => start(client));

console.log('🚀 Avvio bot TicketSMS...');
console.log('📱 Attendi il QR code per connettere WhatsApp Web');
