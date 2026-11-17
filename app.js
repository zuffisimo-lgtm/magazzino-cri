/**
 * Gestione Magazzino Presidi Sanitari ed Emergenza
 * Architettura Client-Side con persistenza LocalStorage e sincronizzazione dati
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'MAGAZZINO_SANITARIO_DB_V1';
    const AUTH_STORAGE_KEY = 'MAGAZZINO_AUTH_SESSION_V1';
    const USERS_STORAGE_KEY = 'MAGAZZINO_USERS_LIST_V1';

    const DEFAULT_USERS = [
        {
            id: 'usr-admin',
            nome: 'Responsabile Magazzino',
            email: 'admin@magazzino.sanitario',
            password: 'admin123',
            ruolo: 'Responsabile (Admin)',
            note: 'Accesso completo a configurazioni, soglie e magazzino'
        },
        {
            id: 'usr-socc',
            nome: 'Soccorritore Turno Emergenza',
            email: 'soccorritore@magazzino.sanitario',
            password: 'soccorso123',
            ruolo: 'Soccorritore (Operatore)',
            note: 'Accesso scarichi sui mezzi, carichi e consultazione'
        }
    ];

    // Stato dell'applicazione
    const state = {
        currentUser: null,
        users: [],
        items: [],
        loads: [],
        discharges: [],
        destinations: [],
        filter: {
            search: '',
            category: 'ALL',
            status: 'ALL', // ALL, SOTTOSCORTA, ESAURITO, NORMALE, SCADENZA_VICINA
            movementType: 'ALL', // ALL, CARICO, SCARICO
            movementSearch: '',
            movementDateRange: 'ALL'
        },
        viewMode: 'table', // table, cards
        activeTab: 'dashboard', // dashboard, inventory, lots, movements, reorder, settings
        selectedItemForAction: null,
        pagination: {
            movementsPerPage: 25,
            currentMovementsPage: 1
        },
        orderCart: {} // id -> quantity to order
    };

    // Data di riferimento del sistema (16 Novembre 2026)
    const TODAY = new Date('2026-11-16');

    // Inizializzazione dati
    const DEFAULT_DESTINATIONS = [
        { id: "dest-1", nome: "Ambulanza Emergenza Bravo 1", tipo: "Ambulanza", codice: "AMB-01", targa: "CRI-101", note: "Mezzo soccorso avanzato MSA" },
        { id: "dest-2", nome: "Ambulanza Emergenza Bravo 2", tipo: "Ambulanza", codice: "AMB-02", targa: "CRI-102", note: "Mezzo soccorso base MSB" },
        { id: "dest-3", nome: "Automedica Alfa 1", tipo: "Automedica", codice: "AUT-01", targa: "CRI-103", note: "Automedica territoriale" },
        { id: "dest-4", nome: "Posto Primo Soccorso", tipo: "Postazione Fissa", codice: "PPS-01", targa: "-", note: "Ambulatorio sede centrale" },
        { id: "dest-5", nome: "Zaino Soccorso Territoriale", tipo: "Zaino / Borsa", codice: "ZAI-01", targa: "-", note: "Dotazione zaino emergenza" },
        { id: "dest-6", nome: "Reparto Degenza", tipo: "Reparto", codice: "REP-01", targa: "-", note: "Reparto degenza clinica" },
        { id: "dest-7", nome: "Ambulatorio Prelievi", tipo: "Ambulatorio", codice: "AMB-P", targa: "-", note: "Punto prelievi e medicazioni" },
        { id: "dest-8", nome: "Corso Formazione Soccorritori", tipo: "Formazione", codice: "FORM-01", targa: "-", note: "Materiale didattico soccorritori" }
    ];

    function initDatabase() {
        // Carica elenco utenti e verifica sessione
        const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
        if (storedUsers) {
            try {
                state.users = JSON.parse(storedUsers);
            } catch (e) {
                state.users = DEFAULT_USERS;
            }
        } else {
            state.users = DEFAULT_USERS;
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
        }

        const activeSession = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (activeSession) {
            try {
                const userObj = JSON.parse(activeSession);
                const validUser = state.users.find(u => u.email.toLowerCase() === userObj.email.toLowerCase());
                if (validUser) {
                    state.currentUser = validUser;
                }
            } catch (e) {
                console.warn('Sessione non valida');
            }
        }

        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                state.items = parsed.items || [];
                state.loads = parsed.loads || [];
                state.discharges = parsed.discharges || [];
                state.destinations = (parsed.destinations && parsed.destinations.length) ? parsed.destinations : DEFAULT_DESTINATIONS;
                console.log('Dati caricati da LocalStorage:', state.items.length, 'articoli,', state.destinations.length, 'mezzi');
                return;
            } catch (e) {
                console.error('Errore lettura LocalStorage, ricarico dataset iniziale', e);
            }
        }

        // Se non presente in LocalStorage, usa i dati iniziali da data.js
        if (window.INITIAL_WAREHOUSE_DATA) {
            state.items = JSON.parse(JSON.stringify(window.INITIAL_WAREHOUSE_DATA.items || []));
            state.loads = JSON.parse(JSON.stringify(window.INITIAL_WAREHOUSE_DATA.loads || []));
            state.discharges = JSON.parse(JSON.stringify(window.INITIAL_WAREHOUSE_DATA.discharges || []));
            state.destinations = (window.INITIAL_WAREHOUSE_DATA.destinations && window.INITIAL_WAREHOUSE_DATA.destinations.length) ? 
                JSON.parse(JSON.stringify(window.INITIAL_WAREHOUSE_DATA.destinations)) : DEFAULT_DESTINATIONS;
            saveToStorage();
            console.log('Dati inizializzati dal dataset originale:', state.items.length, 'articoli,', state.destinations.length, 'mezzi');
        } else {
            console.warn('Dataset iniziale window.INITIAL_WAREHOUSE_DATA non trovato!');
        }
    }

    function saveToStorage() {
        try {
            const dataToSave = {
                version: '1.0.0',
                lastSaved: new Date().toISOString(),
                items: state.items,
                loads: state.loads,
                discharges: state.discharges,
                destinations: state.destinations
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        } catch (e) {
            console.error('Errore salvataggio LocalStorage', e);
            showToast('Errore nel salvataggio dei dati nel browser', 'error');
        }
    }

    // Helper per calcolare lo stato della scorta
    function getItemStockStatus(item) {
        if (item.giacenza <= 0) return { status: 'ESAURITO', label: 'Esaurito', badgeClass: 'bg-red-100 text-red-700 border-red-300' };
        if (item.giacenza < item.quantitativoMinimo) return { status: 'SOTTOSCORTA', label: 'Sottoscorta', badgeClass: 'bg-amber-100 text-amber-700 border-amber-300' };
        if (item.giacenza === item.quantitativoMinimo) return { status: 'LIMITE', label: 'Soglia Minima', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
        return { status: 'NORMALE', label: 'Regolare', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300' };
    }

    // Calcolo giorni rimanenti scadenza
    function getDaysToExpiry(expiryDateStr) {
        if (!expiryDateStr || expiryDateStr === '2999-12-31' || expiryDateStr === '3000-01-01') return null;
        const exp = new Date(expiryDateStr);
        if (isNaN(exp.getTime())) return null;
        const diffTime = exp - TODAY;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Trova prossima scadenza per un articolo
    function getNextExpiryForItem(materialeName) {
        const matchingLoads = state.loads.filter(l => 
            l.materiale.trim().toUpperCase() === materialeName.trim().toUpperCase() &&
            l.scadenza && l.scadenza !== '2999-12-31' && l.scadenza !== '3000-01-01'
        );
        if (!matchingLoads.length) return null;

        // Ordina per data scadenza crescente
        matchingLoads.sort((a, b) => new Date(a.scadenza) - new Date(b.scadenza));
        const nearest = matchingLoads[0];
        const days = getDaysToExpiry(nearest.scadenza);
        return {
            date: nearest.scadenza,
            days: days,
            isExpired: days !== null && days < 0,
            isUrgent: days !== null && days >= 0 && days <= 90,
            isWarning: days !== null && days > 90 && days <= 180
        };
    }

    // Notifiche Toast
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        const colorClass = type === 'error' ? 'bg-red-600 text-white' :
                           type === 'warning' ? 'bg-amber-600 text-white' :
                           'bg-slate-900 text-white';

        const iconSvg = type === 'error' ? 
            `<svg class="w-5 h-5 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>` :
            `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;

        toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 transform translate-y-4 opacity-0 ${colorClass}`;
        toast.innerHTML = `
            ${iconSvg}
            <span class="text-sm font-medium">${message}</span>
        `;

        container.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-4', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-4');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // Formattazione data italiana
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        if (dateStr === '2999-12-31' || dateStr === '3000-01-01') return 'Nessuna Scadenza (Durevole)';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    // Render Dashboard
    let chartMovements = null;
    let chartTopItems = null;
    let chartCategories = null;

    function renderDashboard() {
        const totalItems = state.items.length;
        const totalUnits = state.items.reduce((sum, item) => sum + item.giacenza, 0);
        const sottoscortaItems = state.items.filter(item => item.giacenza < item.quantitativoMinimo);
        const esauritiItems = state.items.filter(item => item.giacenza <= 0);

        // Lotti in scadenza e scaduti
        const expiredLots = [];
        const expiringLots = [];
        state.loads.forEach(l => {
            const days = getDaysToExpiry(l.scadenza);
            if (days !== null) {
                if (days < 0) {
                    expiredLots.push({ ...l, days });
                } else if (days <= 180) {
                    expiringLots.push({ ...l, days });
                }
            }
        });
        expiredLots.sort((a, b) => a.days - b.days);
        expiringLots.sort((a, b) => a.days - b.days);

        // Update Global Expired Banner
        const globalBanner = document.getElementById('global-expired-banner');
        if (globalBanner) {
            if (expiredLots.length > 0) {
                globalBanner.classList.remove('hidden');
                const badgeText = document.getElementById('banner-expired-badge');
                if (badgeText) badgeText.textContent = `${expiredLots.length} lotti scaduti (${expiredLots.reduce((s, x) => s + x.quantita, 0)} pz)`;
            } else {
                globalBanner.classList.add('hidden');
            }
        }

        // Update Notification Bell Badge
        const badgeCount = document.getElementById('badge-alert-count');
        if (badgeCount) {
            const urgentCount = expiringLots.filter(l => l.days <= 90).length;
            const totalAlerts = expiredLots.length + urgentCount;
            if (totalAlerts > 0) {
                badgeCount.textContent = totalAlerts;
                badgeCount.classList.remove('hidden');
                if (expiredLots.length > 0) {
                    badgeCount.className = "absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-red-600 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse";
                } else {
                    badgeCount.className = "absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 bg-amber-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-md";
                }
            } else {
                badgeCount.classList.add('hidden');
            }
        }

        // Update KPI card DOM
        document.getElementById('kpi-total-items').textContent = totalItems;
        document.getElementById('kpi-total-units').textContent = totalUnits.toLocaleString('it-IT') + ' pz';
        document.getElementById('kpi-understock-count').textContent = sottoscortaItems.length;
        document.getElementById('kpi-out-of-stock').textContent = esauritiItems.length > 0 ? `${esauritiItems.length} a giacenza zero` : 'Nessun articolo a zero';
        
        // KPI Scadenze dinamico: se ci sono scaduti diventa allarme rosso
        const kpiExpiringEl = document.getElementById('kpi-expiring-count');
        if (kpiExpiringEl) {
            if (expiredLots.length > 0) {
                kpiExpiringEl.innerHTML = `<span class="text-red-600 animate-pulse">${expiredLots.length} SCADUTI!</span>`;
            } else {
                kpiExpiringEl.textContent = expiringLots.length;
            }
        }
        document.getElementById('kpi-total-movements').textContent = (state.loads.length + state.discharges.length).toLocaleString('it-IT');
        document.getElementById('kpi-movements-sub').textContent = `${state.loads.length} carichi • ${state.discharges.length} scarichi`;

        // Render Sottoscorta Alert Box
        const understockListEl = document.getElementById('dashboard-understock-list');
        if (understockListEl) {
            if (sottoscortaItems.length === 0) {
                understockListEl.innerHTML = `
                    <div class="p-6 text-center text-slate-500">
                        <svg class="w-12 h-12 mx-auto text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <p class="font-medium text-slate-700">Tutti i presidi sono al di sopra della soglia minima!</p>
                        <p class="text-xs text-slate-400 mt-1">Nessuna criticità di approvvigionamento al momento.</p>
                    </div>`;
            } else {
                understockListEl.innerHTML = sottoscortaItems.map(item => `
                    <div class="flex items-center justify-between p-3.5 bg-white rounded-xl border border-rose-100 hover:border-rose-300 transition-all shadow-sm">
                        <div class="flex items-center gap-3">
                            <span class="w-2.5 h-2.5 rounded-full ${item.giacenza === 0 ? 'bg-red-600 animate-ping' : 'bg-amber-500'}"></span>
                            <div>
                                <h4 class="font-semibold text-slate-800 text-sm leading-tight">${item.nomeDisplay || item.materiale}</h4>
                                <span class="text-xs text-slate-500 font-mono">${item.codice} • ${item.categoria}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right">
                                <span class="text-xs font-semibold text-rose-600">Giacenza: ${item.giacenza}</span>
                                <span class="text-xs text-slate-400 block">Minimo: ${item.quantitativoMinimo}</span>
                            </div>
                            <button onclick="window.WarehouseApp.openQuickLoadModal('${item.id}')" class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-medium border border-rose-200 transition-colors flex items-center gap-1">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                Carica
                            </button>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Render Expiry Alert Box
        const expiryListEl = document.getElementById('dashboard-expiry-list');
        if (expiryListEl) {
            if (expiringLots.length === 0) {
                expiryListEl.innerHTML = `
                    <div class="p-6 text-center text-slate-500">
                        <svg class="w-12 h-12 mx-auto text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        <p class="font-medium text-slate-700">Nessun lotto in scadenza nei prossimi 6 mesi</p>
                    </div>`;
            } else {
                expiryListEl.innerHTML = expiringLots.slice(0, 6).map(lot => `
                    <div class="flex items-center justify-between p-3.5 bg-white rounded-xl border border-amber-100 hover:border-amber-300 transition-all shadow-sm">
                        <div class="flex items-center gap-3">
                            <span class="p-2 rounded-lg ${lot.days < 90 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            </span>
                            <div>
                                <h4 class="font-semibold text-slate-800 text-sm leading-tight">${lot.materiale}</h4>
                                <span class="text-xs text-slate-500">Q.tà lotto: ${lot.quantita} pz</span>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${lot.days < 90 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}">
                                ${lot.days < 0 ? 'Scaduto!' : `Tra ${lot.days} giorni`}
                            </span>
                            <span class="text-xs text-slate-400 block mt-0.5 font-mono">${formatDate(lot.scadenza)}</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        renderDashboardCharts();
    }

    function renderDashboardCharts() {
        if (typeof Chart === 'undefined') return;

        // 1. Chart Movimentazioni Mensili (ultimi mesi dal dataset)
        const monthCounts = {};
        const allMovements = [
            ...state.loads.map(l => ({ date: l.data, type: 'CARICO', qty: l.quantita })),
            ...state.discharges.map(d => ({ date: d.data, type: 'SCARICO', qty: d.quantita }))
        ];

        allMovements.forEach(m => {
            if (!m.date || m.date.length < 7) return;
            const ym = m.date.substring(0, 7); // YYYY-MM
            if (!monthCounts[ym]) {
                monthCounts[ym] = { carichi: 0, scarichi: 0 };
            }
            if (m.type === 'CARICO') monthCounts[ym].carichi += m.qty;
            else monthCounts[ym].scarichi += m.qty;
        });

        const sortedMonths = Object.keys(monthCounts).sort().slice(-8);
        const labelsMonthly = sortedMonths.map(ym => {
            const parts = ym.split('-');
            const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
            return `${months[parseInt(parts[1], 10) - 1]} '${parts[0].slice(-2)}`;
        });

        const carichiData = sortedMonths.map(ym => monthCounts[ym].carichi);
        const scarichiData = sortedMonths.map(ym => monthCounts[ym].scarichi);

        const ctxMovements = document.getElementById('chart-movements');
        if (ctxMovements) {
            if (chartMovements) chartMovements.destroy();
            chartMovements = new Chart(ctxMovements, {
                type: 'bar',
                data: {
                    labels: labelsMonthly,
                    datasets: [
                        {
                            label: 'Scarichi (Consumo)',
                            data: scarichiData,
                            backgroundColor: 'rgba(239, 68, 68, 0.85)',
                            borderRadius: 6
                        },
                        {
                            label: 'Carichi (Nuovi Arrivi)',
                            data: carichiData,
                            backgroundColor: 'rgba(16, 185, 129, 0.85)',
                            borderRadius: 6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString('it-IT')} pz`
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.6)' } }
                    }
                }
            });
        }

        // 2. Chart Top 10 Presidi più utilizzati
        const itemUsage = {};
        state.discharges.forEach(d => {
            const mat = d.materiale.trim().toUpperCase();
            itemUsage[mat] = (itemUsage[mat] || 0) + d.quantita;
        });

        const sortedTop = Object.entries(itemUsage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        const ctxTop = document.getElementById('chart-top-items');
        if (ctxTop) {
            if (chartTopItems) chartTopItems.destroy();
            chartTopItems = new Chart(ctxTop, {
                type: 'bar',
                data: {
                    labels: sortedTop.map(item => item[0].length > 18 ? item[0].slice(0, 16) + '..' : item[0]),
                    datasets: [{
                        label: 'Totale Pezzi Scaricati',
                        data: sortedTop.map(item => item[1]),
                        backgroundColor: 'rgba(59, 130, 246, 0.85)',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` Consumati: ${ctx.raw.toLocaleString('it-IT')} pz`
                            }
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.6)' } },
                        y: { grid: { display: false } }
                    }
                }
            });
        }

        // 3. Chart Categorie
        const categoryGiacenze = {};
        state.items.forEach(it => {
            const cat = it.categoria || 'Altro';
            categoryGiacenze[cat] = (categoryGiacenze[cat] || 0) + it.giacenza;
        });

        const catLabels = Object.keys(categoryGiacenze);
        const catValues = Object.values(categoryGiacenze);
        const catColors = [
            '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#14b8a6', '#6366f1', '#f97316', '#64748b'
        ];

        const ctxCategories = document.getElementById('chart-categories');
        if (ctxCategories) {
            if (chartCategories) chartCategories.destroy();
            chartCategories = new Chart(ctxCategories, {
                type: 'doughnut',
                data: {
                    labels: catLabels,
                    datasets: [{
                        data: catValues,
                        backgroundColor: catColors.slice(0, catLabels.length),
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
                    },
                    cutout: '68%'
                }
            });
        }
    }

    // Render Tabella / Griglia Inventario
    function renderInventory() {
        const query = state.filter.search.toLowerCase().trim();
        const catFilter = state.filter.category;
        const statusFilter = state.filter.status;

        const filteredItems = state.items.filter(item => {
            // Ricerca testuale
            const matchQuery = !query || 
                item.materiale.toLowerCase().includes(query) ||
                (item.nomeDisplay && item.nomeDisplay.toLowerCase().includes(query)) ||
                item.codice.toLowerCase().includes(query) ||
                item.categoria.toLowerCase().includes(query);

            if (!matchQuery) return false;

            // Filtro Categoria
            if (catFilter !== 'ALL' && item.categoria !== catFilter) return false;

            // Filtro Stato
            const stockInfo = getItemStockStatus(item);
            if (statusFilter === 'SOTTOSCORTA' && stockInfo.status !== 'SOTTOSCORTA' && stockInfo.status !== 'ESAURITO') return false;
            if (statusFilter === 'ESAURITO' && stockInfo.status !== 'ESAURITO') return false;
            if (statusFilter === 'NORMALE' && stockInfo.status !== 'NORMALE') return false;
            if (statusFilter === 'SCADUTI') {
                const exp = getNextExpiryForItem(item.materiale);
                if (!exp || !exp.isExpired) return false;
            }
            if (statusFilter === 'SCADENZA_VICINA') {
                const exp = getNextExpiryForItem(item.materiale);
                if (!exp || exp.days === null || exp.days > 180) return false;
            }

            return true;
        });

        // Contatori nei tab / filtri
        const totalUnderstock = state.items.filter(i => i.giacenza < i.quantitativoMinimo).length;
        const totalOutOfStock = state.items.filter(i => i.giacenza <= 0).length;
        const countFilterUnderstock = document.getElementById('filter-count-understock');
        if (countFilterUnderstock) countFilterUnderstock.textContent = totalUnderstock;

        const container = document.getElementById('inventory-table-container');
        const countEl = document.getElementById('inventory-items-count');
        if (countEl) countEl.textContent = `${filteredItems.length} di ${state.items.length} articoli`;

        if (!container) return;

        if (filteredItems.length === 0) {
            container.innerHTML = `
                <div class="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                    <svg class="w-16 h-16 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <h3 class="text-lg font-semibold text-slate-700">Nessun presidio trovato</h3>
                    <p class="text-sm text-slate-400 mt-1">Prova a modificare i filtri di ricerca o la categoria selezionata.</p>
                    <button onclick="window.WarehouseApp.resetFilters()" class="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors">
                        Reimposta Filtri
                    </button>
                </div>
            `;
            return;
        }

        if (state.viewMode === 'cards') {
            container.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    ${filteredItems.map(item => {
                        const stockInfo = getItemStockStatus(item);
                        const expInfo = getNextExpiryForItem(item.materiale);
                        return `
                            <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                                <div>
                                    <div class="flex items-start justify-between gap-2 mb-2">
                                        <span class="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">${item.codice}</span>
                                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full border ${stockInfo.badgeClass}">${stockInfo.label}</span>
                                    </div>
                                    <h4 class="font-bold text-slate-800 text-base leading-tight mb-1">${item.nomeDisplay || item.materiale}</h4>
                                    <span class="text-xs text-slate-500 block mb-4">${item.categoria}</span>

                                    <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl mb-4 text-center">
                                        <div>
                                            <span class="text-xs text-slate-400 block">Giacenza</span>
                                            <span class="text-xl font-bold ${item.giacenza < item.quantitativoMinimo ? 'text-rose-600' : 'text-slate-800'}">${item.giacenza} <span class="text-xs font-normal text-slate-400">${item.unitaMisura}</span></span>
                                        </div>
                                        <div>
                                            <span class="text-xs text-slate-400 block">Scorta Min</span>
                                            <span class="text-lg font-semibold text-slate-600">${item.quantitativoMinimo} <span class="text-xs font-normal text-slate-400">${item.unitaMisura}</span></span>
                                        </div>
                                    </div>

                                    ${expInfo ? `
                                        <div class="flex items-center gap-1.5 text-xs text-slate-500 mb-4 bg-slate-50/50 p-2 rounded-lg">
                                            <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                            <span>Scad. lotto: <strong class="${expInfo.isUrgent ? 'text-red-600 font-bold' : ''}">${formatDate(expInfo.date)}</strong></span>
                                        </div>
                                    ` : `
                                        <div class="text-xs text-slate-400 mb-4 p-2">Nessuna scadenza critica</div>
                                    `}
                                </div>

                                <div class="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                                    <button onclick="window.WarehouseApp.openQuickLoadModal('${item.id}')" class="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                        Carica
                                    </button>
                                    <button onclick="window.WarehouseApp.openQuickDischargeModal('${item.id}')" ${item.giacenza <= 0 ? 'disabled' : ''} class="w-full py-2 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:pointer-events-none text-blue-700 text-xs font-semibold rounded-xl border border-blue-200 transition-colors flex items-center justify-center gap-1">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                                        Scarica
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            return;
        }

        // Vista Tabella Dettagliata
        container.innerHTML = `
            <div class="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
                <table class="w-full text-left text-sm text-slate-600">
                    <thead class="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                            <th scope="col" class="px-5 py-3.5">Codice</th>
                            <th scope="col" class="px-5 py-3.5">Materiale / Presidio</th>
                            <th scope="col" class="px-5 py-3.5">Categoria</th>
                            <th scope="col" class="px-5 py-3.5 text-center">Giacenza Attuale</th>
                            <th scope="col" class="px-5 py-3.5 text-center">Scorta Minima</th>
                            <th scope="col" class="px-5 py-3.5 text-center">Stato Scorta</th>
                            <th scope="col" class="px-5 py-3.5">Prossima Scadenza</th>
                            <th scope="col" class="px-5 py-3.5 text-right">Azioni Rapide</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${filteredItems.map(item => {
                            const stockInfo = getItemStockStatus(item);
                            const expInfo = getNextExpiryForItem(item.materiale);
                            const isZero = item.giacenza <= 0;
                            const isUnder = item.giacenza < item.quantitativoMinimo;

                            return `
                                <tr class="hover:bg-slate-50/80 transition-colors ${isZero ? 'bg-red-50/30' : isUnder ? 'bg-amber-50/20' : ''}">
                                    <td class="px-5 py-3.5 font-mono text-xs font-semibold text-slate-500 whitespace-nowrap">
                                        ${item.codice}
                                    </td>
                                    <td class="px-5 py-3.5">
                                        <div class="font-bold text-slate-800 text-sm">${item.nomeDisplay || item.materiale}</div>
                                        ${item.nomeDisplay !== item.materiale ? `<span class="text-xs text-slate-400 font-mono">orig: ${item.materiale}</span>` : ''}
                                    </td>
                                    <td class="px-5 py-3.5 whitespace-nowrap">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                            ${item.categoria}
                                        </span>
                                    </td>
                                    <td class="px-5 py-3.5 text-center whitespace-nowrap">
                                        <span class="text-base font-bold ${isZero ? 'text-rose-600' : isUnder ? 'text-amber-600' : 'text-emerald-700'}">
                                            ${item.giacenza}
                                        </span>
                                        <span class="text-xs text-slate-400 ml-0.5">${item.unitaMisura}</span>
                                    </td>
                                    <td class="px-5 py-3.5 text-center whitespace-nowrap text-slate-600 font-medium">
                                        ${item.quantitativoMinimo} ${item.unitaMisura}
                                    </td>
                                    <td class="px-5 py-3.5 text-center whitespace-nowrap">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stockInfo.badgeClass}">
                                            ${stockInfo.label}
                                        </span>
                                    </td>
                                    <td class="px-5 py-3.5 whitespace-nowrap">
                                        ${expInfo ? `
                                            <div class="flex items-center gap-1.5">
                                                <span class="w-2 h-2 rounded-full ${expInfo.isExpired ? 'bg-red-600' : expInfo.isUrgent ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
                                                <span class="text-xs font-medium ${expInfo.isUrgent ? 'text-rose-700 font-bold' : 'text-slate-600'}">
                                                    ${formatDate(expInfo.date)}
                                                </span>
                                                <span class="text-xs text-slate-400">(${expInfo.days < 0 ? 'Scaduto' : `${expInfo.days}gg`})</span>
                                            </div>
                                        ` : `
                                            <span class="text-xs text-slate-400 italic">-</span>
                                        `}
                                    </td>
                                    <td class="px-5 py-3.5 text-right whitespace-nowrap">
                                        <div class="flex items-center justify-end gap-1.5">
                                            <button onclick="window.WarehouseApp.openQuickLoadModal('${item.id}')" title="Carica Pezzi" class="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors border border-emerald-200">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                            </button>
                                            <button onclick="window.WarehouseApp.openQuickDischargeModal('${item.id}')" ${isZero ? 'disabled' : ''} title="Scarica Pezzi" class="p-1.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-30 disabled:pointer-events-none text-blue-700 rounded-lg transition-colors border border-blue-200">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                                            </button>
                                            <button onclick="window.WarehouseApp.openEditItemModal('${item.id}')" title="Modifica Soglia e Dettagli" class="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors border border-slate-200">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Render Registro Movimenti (Carichi & Scarichi combinati)
    function renderMovements() {
        const query = state.filter.movementSearch.toLowerCase().trim();
        const typeFilter = state.filter.movementType;
        const dateRange = state.filter.movementDateRange;

        // Combina e ordina tutti i movimenti per data decrescente
        let allMovements = [
            ...state.loads.map(l => ({ ...l, tipo: 'CARICO', color: 'emerald' })),
            ...state.discharges.map(d => ({ ...d, tipo: 'SCARICO', color: 'blue' }))
        ];

        // Filtri
        allMovements = allMovements.filter(m => {
            if (typeFilter !== 'ALL' && m.tipo !== typeFilter) return false;
            if (query) {
                const matchMat = m.materiale && m.materiale.toLowerCase().includes(query);
                const matchDest = m.destinazione && m.destinazione.toLowerCase().includes(query);
                const matchLot = m.lotto && m.lotto.toLowerCase().includes(query);
                if (!matchMat && !matchDest && !matchLot) return false;
            }
            if (dateRange === 'LAST_30') {
                const d = new Date(m.data);
                const diffDays = (TODAY - d) / (1000 * 60 * 60 * 24);
                if (diffDays > 30 || diffDays < 0) return false;
            } else if (dateRange === 'LAST_90') {
                const d = new Date(m.data);
                const diffDays = (TODAY - d) / (1000 * 60 * 60 * 24);
                if (diffDays > 90 || diffDays < 0) return false;
            }
            return true;
        });

        allMovements.sort((a, b) => new Date(b.data || '1970-01-01') - new Date(a.data || '1970-01-01'));

        const totalFiltered = allMovements.length;
        const perPage = state.pagination.movementsPerPage;
        const totalPages = Math.ceil(totalFiltered / perPage) || 1;
        if (state.pagination.currentMovementsPage > totalPages) state.pagination.currentMovementsPage = totalPages;
        const currentPage = state.pagination.currentMovementsPage;

        const startIdx = (currentPage - 1) * perPage;
        const paginatedMovements = allMovements.slice(startIdx, startIdx + perPage);

        const container = document.getElementById('movements-table-container');
        const countEl = document.getElementById('movements-count-label');
        if (countEl) countEl.textContent = `${totalFiltered.toLocaleString('it-IT')} movimenti trovati`;

        if (!container) return;

        if (totalFiltered === 0) {
            container.innerHTML = `
                <div class="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                    <p class="font-medium text-slate-700">Nessun movimento corrisponde ai criteri</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
                <table class="w-full text-left text-sm text-slate-600">
                    <thead class="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                            <th class="px-5 py-3.5">ID Movimento</th>
                            <th class="px-5 py-3.5">Data</th>
                            <th class="px-5 py-3.5">Tipo</th>
                            <th class="px-5 py-3.5">Presidio / Materiale</th>
                            <th class="px-5 py-3.5 text-center">Quantità</th>
                            <th class="px-5 py-3.5">Destinazione / Lotto</th>
                            <th class="px-5 py-3.5">Scadenza</th>
                            <th class="px-5 py-3.5">Note</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 font-sans">
                        ${paginatedMovements.map(m => {
                            const isCarico = m.tipo === 'CARICO';
                            return `
                                <tr class="hover:bg-slate-50/80 transition-colors">
                                    <td class="px-5 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">${m.id}</td>
                                    <td class="px-5 py-3 font-semibold text-slate-800 whitespace-nowrap">${formatDate(m.data)}</td>
                                    <td class="px-5 py-3 whitespace-nowrap">
                                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${isCarico ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}">
                                            ${isCarico ? '▲ CARICO' : '▼ SCARICO'}
                                        </span>
                                    </td>
                                    <td class="px-5 py-3 font-medium text-slate-900">${m.materiale}</td>
                                    <td class="px-5 py-3 text-center whitespace-nowrap">
                                        <span class="font-bold text-sm ${isCarico ? 'text-emerald-700' : 'text-blue-700'}">
                                            ${isCarico ? '+' : '-'}${m.quantita} pz
                                        </span>
                                    </td>
                                    <td class="px-5 py-3 text-xs text-slate-600">
                                        ${isCarico ? `<span class="font-mono text-slate-500">${m.lotto || 'Lotto Standard'}</span>` : `<span class="text-slate-700 font-medium">${m.destinazione || 'Reparto'}</span>`}
                                    </td>
                                    <td class="px-5 py-3 text-xs whitespace-nowrap">
                                        ${isCarico && m.scadenza ? formatDate(m.scadenza) : '<span class="text-slate-300">-</span>'}
                                    </td>
                                    <td class="px-5 py-3 text-xs text-slate-400 truncate max-w-xs">
                                        ${m.motivo || m.note || '-'}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Paginazione -->
            <div class="flex items-center justify-between mt-4 px-2">
                <span class="text-xs text-slate-500">
                    Pagina <strong>${currentPage}</strong> di <strong>${totalPages}</strong> (mostrati ${startIdx + 1}-${Math.min(startIdx + perPage, totalFiltered)} di ${totalFiltered})
                </span>
                <div class="flex items-center gap-2">
                    <button onclick="window.WarehouseApp.changeMovementsPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700">
                        Precedente
                    </button>
                    <button onclick="window.WarehouseApp.changeMovementsPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700">
                        Successiva
                    </button>
                </div>
            </div>
        `;
    }

    // Render Vista Lotti & Tracciamento Scadenze
    function renderLots() {
        const container = document.getElementById('lots-table-container');
        if (!container) return;

        const loadsWithExpiry = state.loads.filter(l => l.scadenza);
        loadsWithExpiry.sort((a, b) => new Date(a.scadenza) - new Date(b.scadenza));

        container.innerHTML = `
            <div class="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
                <table class="w-full text-left text-sm text-slate-600">
                    <thead class="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                            <th class="px-5 py-3.5">Lotto ID</th>
                            <th class="px-5 py-3.5">Presidio / Materiale</th>
                            <th class="px-5 py-3.5 text-center">Quantità Caricata</th>
                            <th class="px-5 py-3.5">Data Carico</th>
                            <th class="px-5 py-3.5">Data Scadenza</th>
                            <th class="px-5 py-3.5 text-center">Stato Scadenza (FEFO)</th>
                            <th class="px-5 py-3.5">Fornitore / Note</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${loadsWithExpiry.map(lot => {
                            const days = getDaysToExpiry(lot.scadenza);
                            const isDurable = lot.scadenza === '2999-12-31' || lot.scadenza === '3000-01-01';
                            const isExpired = days !== null && days < 0;
                            const isCritical = days !== null && days >= 0 && days <= 90;
                            const isWarning = days !== null && days > 90 && days <= 180;

                            let statusBadge = '';
                            if (isDurable) {
                                statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Durevole (No Scadenza)</span>`;
                            } else if (isExpired) {
                                statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">SCADUTO (${Math.abs(days)}gg fa)</span>`;
                            } else if (isCritical) {
                                statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">CRITICO: ${days} giorni</span>`;
                            } else if (isWarning) {
                                statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">In scadenza: ${days} giorni</span>`;
                            } else {
                                statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Regolare (> 6 mesi)</span>`;
                            }

                            return `
                                <tr class="hover:bg-slate-50/80 transition-colors ${isCritical ? 'bg-rose-50/20' : isWarning ? 'bg-amber-50/20' : ''}">
                                    <td class="px-5 py-3.5 font-mono text-xs text-slate-500 font-medium">${lot.lotto || lot.id}</td>
                                    <td class="px-5 py-3.5 font-bold text-slate-800">${lot.materiale}</td>
                                    <td class="px-5 py-3.5 text-center font-bold text-slate-700">${lot.quantita} pz</td>
                                    <td class="px-5 py-3.5 whitespace-nowrap text-xs text-slate-500">${formatDate(lot.data)}</td>
                                    <td class="px-5 py-3.5 whitespace-nowrap font-mono text-xs font-bold ${isCritical ? 'text-red-600' : 'text-slate-800'}">
                                        ${formatDate(lot.scadenza)}
                                    </td>
                                    <td class="px-5 py-3.5 text-center whitespace-nowrap">${statusBadge}</td>
                                    <td class="px-5 py-3.5 text-xs text-slate-500">${lot.fornitore || 'Fornitore Sanitario'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Render Riordino Automatico Sottoscorta
    function renderReorder() {
        const container = document.getElementById('reorder-table-container');
        if (!container) return;

        // Trova tutti gli articoli sottoscorta o esauriti
        const itemsToReorder = state.items.filter(i => i.giacenza < i.quantitativoMinimo);

        if (itemsToReorder.length === 0) {
            container.innerHTML = `
                <div class="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                    <svg class="w-16 h-16 mx-auto text-emerald-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <h3 class="text-lg font-bold text-slate-800">Magazzino Perfettamente Approvvigionato</h3>
                    <p class="text-sm text-slate-500 mt-1">Nessun presidio attualmente sotto la soglia minima di sicurezza.</p>
                </div>`;
            return;
        }

        // Calcola suggerimenti
        container.innerHTML = `
            <div class="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm mb-6">
                <table class="w-full text-left text-sm text-slate-600">
                    <thead class="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                            <th class="px-5 py-3.5">Codice</th>
                            <th class="px-5 py-3.5">Presidio</th>
                            <th class="px-5 py-3.5">Categoria</th>
                            <th class="px-5 py-3.5 text-center">Giacenza Attuale</th>
                            <th class="px-5 py-3.5 text-center">Soglia Minima</th>
                            <th class="px-5 py-3.5 text-center">Fabbisogno Netto</th>
                            <th class="px-5 py-3.5 text-center">Quantità da Ordinare</th>
                            <th class="px-5 py-3.5 text-right">Azione</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${itemsToReorder.map(item => {
                            const deficit = item.quantitativoMinimo - item.giacenza;
                            // Quantità suggerita = riportare a scorta di sicurezza + margine (doppio del minimo o deficit + scorta)
                            const suggested = Math.max(item.quantitativoMinimo * 2 - item.giacenza, deficit);
                            const currentOrderQty = state.orderCart[item.id] !== undefined ? state.orderCart[item.id] : suggested;

                            return `
                                <tr class="hover:bg-slate-50/80 transition-colors">
                                    <td class="px-5 py-3.5 font-mono text-xs text-slate-400 font-semibold">${item.codice}</td>
                                    <td class="px-5 py-3.5 font-bold text-slate-900">${item.nomeDisplay || item.materiale}</td>
                                    <td class="px-5 py-3.5 text-xs text-slate-500">${item.categoria}</td>
                                    <td class="px-5 py-3.5 text-center font-bold text-rose-600">${item.giacenza} ${item.unitaMisura}</td>
                                    <td class="px-5 py-3.5 text-center font-semibold text-slate-600">${item.quantitativoMinimo} ${item.unitaMisura}</td>
                                    <td class="px-5 py-3.5 text-center font-bold text-amber-700">-${deficit} pz</td>
                                    <td class="px-5 py-3.5 text-center">
                                        <div class="inline-flex items-center gap-1">
                                            <input type="number" min="1" value="${currentOrderQty}" 
                                                onchange="window.WarehouseApp.updateOrderCart('${item.id}', this.value)"
                                                class="w-20 px-2.5 py-1 text-center font-bold text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                                            <span class="text-xs text-slate-400">pz</span>
                                        </div>
                                    </td>
                                    <td class="px-5 py-3.5 text-right">
                                        <button onclick="window.WarehouseApp.executeQuickRestock('${item.id}', ${currentOrderQty})" 
                                            class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm flex items-center gap-1 ml-auto">
                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                            Registra Arrivo
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Box Riepilogo Ordine e Azioni Stampa/Export -->
            <div class="bg-white rounded-2xl border border-slate-200 p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h4 class="font-bold text-slate-800 text-base">Riepilogo Ordine di Riordino Fornitori</h4>
                    <p class="text-sm text-slate-500 mt-0.5">
                        Totale presidi da riordinare: <strong>${itemsToReorder.length}</strong> articoli
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="window.print()" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                        Stampa Modulo Ordine
                    </button>
                    <button onclick="window.WarehouseApp.exportReorderCSV()" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        Esporta Ordine (Excel/CSV)
                    </button>
                </div>
            </div>
        `;
    }

    // Modal Helpers
    function openModal(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('hidden');
            el.classList.add('flex');
            document.body.classList.add('overflow-hidden');
        }
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('flex');
            document.body.classList.remove('overflow-hidden');
        }
    }

    // Popola select dei materiali nei modali
    function populateItemSelects() {
        const selects = ['modal-load-item-select', 'modal-discharge-item-select'];
        selects.forEach(selectId => {
            const el = document.getElementById(selectId);
            if (!el) return;
            const sorted = [...state.items].sort((a, b) => a.materiale.localeCompare(b.materiale));
            el.innerHTML = '<option value="">-- Seleziona un presidio sanitario --</option>' + 
                sorted.map(i => `<option value="${i.id}">${i.nomeDisplay || i.materiale} (Giacenza: ${i.giacenza})</option>`).join('');
        });
        populateDestinationSelects();
    }

    // Popola select delle destinazioni / mezzi assegnatari
    function populateDestinationSelects() {
        const selects = document.querySelectorAll('select[name="destination"]');
        selects.forEach(select => {
            select.innerHTML = state.destinations.map(d => `<option value="${d.nome}">${d.nome} (${d.tipo})</option>`).join('');
        });
    }

    // Render Gestione Mezzi e Destinazioni
    function renderDestinations() {
        const container = document.getElementById('destinations-cards-container');
        if (!container) return;

        // Calcola statistiche per ogni mezzo
        const destStats = {};
        state.discharges.forEach(d => {
            const name = d.destinazione || 'Non specificato';
            destStats[name] = (destStats[name] || 0) + d.quantita;
        });

        const totalVehicles = state.destinations.length;
        const totalDischargedPieces = state.discharges.reduce((sum, d) => sum + d.quantita, 0);

        // Aggiorna KPI mezzi
        const kpiCountEl = document.getElementById('kpi-destinations-count');
        if (kpiCountEl) kpiCountEl.textContent = totalVehicles;
        const kpiPiecesEl = document.getElementById('kpi-destinations-pieces');
        if (kpiPiecesEl) kpiPiecesEl.textContent = totalDischargedPieces.toLocaleString('it-IT') + ' pz totali erogati';

        container.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                ${state.destinations.map(dest => {
                    const countPieces = destStats[dest.nome] || 0;
                    const icon = dest.tipo === 'Ambulanza' ? '🚑' :
                                 dest.tipo === 'Automedica' ? '🚗' :
                                 dest.tipo === 'Zaino / Borsa' ? '🎒' :
                                 dest.tipo === 'Reparto' ? '🏥' :
                                 dest.tipo === 'Formazione' ? '🎓' : '📍';

                    return `
                        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                            <div>
                                <div class="flex items-start justify-between gap-2 mb-3">
                                    <span class="text-3xl">${icon}</span>
                                    <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                        ${dest.tipo}
                                    </span>
                                </div>
                                <h4 class="font-black text-slate-900 text-base leading-snug mb-1">${dest.nome}</h4>
                                <div class="text-xs text-slate-400 font-mono mb-3">${dest.codice || ''} ${dest.targa && dest.targa !== '-' ? '• ' + dest.targa : ''}</div>
                                ${dest.note ? `<p class="text-xs text-slate-500 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">${dest.note}</p>` : ''}
                                
                                <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100 mb-4 flex items-center justify-between">
                                    <span class="text-xs font-medium text-emerald-900">Totale Ricevuto:</span>
                                    <span class="text-sm font-black text-emerald-800">${countPieces.toLocaleString('it-IT')} pz</span>
                                </div>
                            </div>

                            <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                <button onclick="window.WarehouseApp.openEditDestinationModal('${dest.id}')" class="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                    Rinomina
                                </button>
                                <button onclick="window.WarehouseApp.viewDischargesForDestination('${dest.nome}')" title="Visualizza Storico Scarichi" class="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                                </button>
                                <button onclick="window.WarehouseApp.handleDeleteDestination('${dest.id}')" title="Elimina Mezzo" class="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // Toggle menu per smartphone
    function toggleMobileMenu() {
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('mobile-sidebar-backdrop');
        if (!sidebar) return;
        const isClosed = sidebar.classList.contains('-translate-x-full');
        if (isClosed) {
            sidebar.classList.remove('-translate-x-full');
            backdrop?.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        } else {
            closeMobileMenu();
        }
    }

    function closeMobileMenu() {
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('mobile-sidebar-backdrop');
        sidebar?.classList.add('-translate-x-full');
        backdrop?.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }

    // Navigazione Tab
    function switchTab(tabName) {
        state.activeTab = tabName;
        closeMobileMenu();

        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`tab-${tabName}`);
        if (target) target.classList.remove('hidden');

        document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('bg-emerald-700', 'text-white', 'shadow-md');
                btn.classList.remove('text-emerald-100', 'hover:bg-emerald-800');
            } else {
                btn.classList.remove('bg-emerald-700', 'text-white', 'shadow-md');
                btn.classList.add('text-emerald-100', 'hover:bg-emerald-800');
            }
        });

        // Esegui render specifico
        if (tabName === 'dashboard') renderDashboard();
        else if (tabName === 'inventory') renderInventory();
        else if (tabName === 'movements') renderMovements();
        else if (tabName === 'lots') renderLots();
        else if (tabName === 'reorder') renderReorder();
        else if (tabName === 'destinations') renderDestinations();
    }

    // Operazione: Registra Carico
    function handleSaveLoad(event) {
        event.preventDefault();
        const form = event.target;
        const itemId = form.querySelector('[name="itemId"]').value;
        const qty = parseInt(form.querySelector('[name="quantity"]').value, 10);
        const dataCarico = form.querySelector('[name="loadDate"]').value || TODAY.toISOString().split('T')[0];
        const isNoExpiry = form.querySelector('[name="noExpiry"]').checked;
        const expiryDate = isNoExpiry ? '2999-12-31' : form.querySelector('[name="expiryDate"]').value;
        const lotNumber = form.querySelector('[name="lotNumber"]').value || `LOT-${dataCarico.replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
        const fornitore = form.querySelector('[name="supplier"]').value || 'Fornitore Sanitario';
        const notes = form.querySelector('[name="notes"]').value;

        if (!itemId || isNaN(qty) || qty <= 0) {
            showToast('Compila tutti i campi obbligatori correttamente', 'error');
            return;
        }

        const item = state.items.find(i => i.id === itemId);
        if (!item) {
            showToast('Articolo non trovato', 'error');
            return;
        }

        // Incrementa giacenza
        item.giacenza += qty;

        // Registra carico nei lotti
        const newLoad = {
            id: 'CAR-' + (state.loads.length + 1),
            tipo: 'CARICO',
            materiale: item.materiale,
            quantita: qty,
            data: dataCarico,
            scadenza: expiryDate || '2999-12-31',
            lotto: lotNumber,
            fornitore: fornitore,
            note: notes
        };
        state.loads.unshift(newLoad);

        saveToStorage();
        closeModal('modal-load');
        form.reset();
        showToast(`Carico registrato: +${qty} pz di ${item.nomeDisplay || item.materiale}`);

        if (state.activeTab === 'inventory') renderInventory();
        else if (state.activeTab === 'dashboard') renderDashboard();
        else if (state.activeTab === 'movements') renderMovements();
        else if (state.activeTab === 'lots') renderLots();
    }

    // Operazione: Registra Scarico
    function handleSaveDischarge(event) {
        event.preventDefault();
        const form = event.target;
        const itemId = form.querySelector('[name="itemId"]').value;
        const qty = parseInt(form.querySelector('[name="quantity"]').value, 10);
        const dataScarico = form.querySelector('[name="dischargeDate"]').value || TODAY.toISOString().split('T')[0];
        const destinazione = form.querySelector('[name="destination"]').value || 'Reparto Emergenza';
        const operatore = form.querySelector('[name="operator"]').value || 'Operatore Magazzino';
        const motivo = form.querySelector('[name="reason"]').value || 'Rifornimento dotazione standard';
        const notes = form.querySelector('[name="notes"]').value;

        if (!itemId || isNaN(qty) || qty <= 0) {
            showToast('Inserisci una quantità valida', 'error');
            return;
        }

        const item = state.items.find(i => i.id === itemId);
        if (!item) {
            showToast('Articolo non trovato', 'error');
            return;
        }

        if (item.giacenza < qty) {
            if (!confirm(`Attenzione: La giacenza attuale (${item.giacenza}) è inferiore alla quantità richiesta (${qty}). Vuoi forzare comunque lo scarico mandando l'articolo in negativo?`)) {
                return;
            }
        }

        // Controllo di sicurezza lotto scaduto
        const expCheck = getNextExpiryForItem(item.materiale);
        if (expCheck && expCheck.isExpired) {
            if (!confirm(`🚨 AVVISO DI SICUREZZA:\nIl presidio "${item.nomeDisplay || item.materiale}" ha un lotto già SCADUTO il ${formatDate(expCheck.date)}!\n\nConfermi di voler registrare comunque lo scarico (es. per smaltimento o quarantena)?`)) {
                return;
            }
        }

        // Decrementa giacenza
        item.giacenza -= qty;

        // Registra scarico
        const newDischarge = {
            id: 'SCA-' + (state.discharges.length + 1),
            tipo: 'SCARICO',
            materiale: item.materiale,
            quantita: qty,
            data: dataScarico,
            destinazione: destinazione,
            operatore: operatore,
            motivo: motivo,
            note: notes
        };
        state.discharges.unshift(newDischarge);

        saveToStorage();
        closeModal('modal-discharge');
        form.reset();
        showToast(`Scarico registrato: -${qty} pz di ${item.nomeDisplay || item.materiale}`);

        if (state.activeTab === 'inventory') renderInventory();
        else if (state.activeTab === 'dashboard') renderDashboard();
        else if (state.activeTab === 'movements') renderMovements();
    }

    // Esportazione in CSV
    function exportToCSV(type = 'inventory') {
        let csvContent = '\uFEFF'; // BOM per Excel

        if (type === 'inventory') {
            csvContent += 'CODICE;MATERIALE;CATEGORIA;GIACENZA;SCORTA_MINIMA;UNITA_MISURA;STATO;PROSSIMA_SCADENZA\r\n';
            state.items.forEach(item => {
                const stock = getItemStockStatus(item);
                const exp = getNextExpiryForItem(item.materiale);
                const expDate = exp ? exp.date : '';
                csvContent += `"${item.codice}";"${item.nomeDisplay || item.materiale}";"${item.categoria}";${item.giacenza};${item.quantitativoMinimo};"${item.unitaMisura}";"${stock.label}";"${expDate}"\r\n`;
            });
            downloadFile(csvContent, `inventario_magazzino_${TODAY.toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
        } else if (type === 'movements') {
            csvContent += 'ID;DATA;TIPO;MATERIALE;QUANTITA;DESTINAZIONE_LOTTO;SCADENZA;NOTE\r\n';
            const all = [
                ...state.loads.map(l => ({ id: l.id, data: l.data, tipo: 'CARICO', mat: l.materiale, qty: l.quantita, dest: l.lotto, exp: l.scadenza, notes: l.note })),
                ...state.discharges.map(d => ({ id: d.id, data: d.data, tipo: 'SCARICO', mat: d.materiale, qty: d.quantita, dest: d.destinazione, exp: '', notes: d.motivo }))
            ];
            all.sort((a, b) => new Date(b.data || '') - new Date(a.data || ''));
            all.forEach(m => {
                csvContent += `"${m.id}";"${m.data}";"${m.tipo}";"${m.mat}";${m.qty};"${m.dest || ''}";"${m.exp || ''}";"${m.notes || ''}"\r\n`;
            });
            downloadFile(csvContent, `registro_movimenti_${TODAY.toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
        }
        showToast('File CSV esportato con successo!');
    }

    // Esporta ordine riordino CSV
    function exportReorderCSV() {
        let csvContent = '\uFEFF';
        csvContent += 'CODICE;PRESIDIO;CATEGORIA;GIACENZA_ATTUALE;SOGLIA_MINIMA;DEFICIT;QUANTITA_ORDINATA\r\n';
        const itemsToReorder = state.items.filter(i => i.giacenza < i.quantitativoMinimo);
        itemsToReorder.forEach(item => {
            const deficit = item.quantitativoMinimo - item.giacenza;
            const suggested = Math.max(item.quantitativoMinimo * 2 - item.giacenza, deficit);
            const ordered = state.orderCart[item.id] !== undefined ? state.orderCart[item.id] : suggested;
            csvContent += `"${item.codice}";"${item.nomeDisplay || item.materiale}";"${item.categoria}";${item.giacenza};${item.quantitativoMinimo};${deficit};${ordered}\r\n`;
        });
        downloadFile(csvContent, `ordine_fornitori_sottoscorta_${TODAY.toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
        showToast('Lista riordino esportata in CSV!');
    }

    // Backup JSON
    function exportJSONBackup() {
        const fullBackup = {
            exportDate: new Date().toISOString(),
            version: '1.0.0',
            systemDate: '2026-11-16',
            items: state.items,
            loads: state.loads,
            discharges: state.discharges
        };
        const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `backup_magazzino_sanitario_${TODAY.toISOString().split('T')[0]}.json`);
        showToast('Backup JSON completo scaricato!');
    }

    // Ripristino dati iniziali
    function resetToFactoryData() {
        if (!confirm('Sei sicuro di voler ripristinare il magazzino allo stato originale del file? Tutte le modifiche locali non esportate andranno perse.')) {
            return;
        }
        localStorage.removeItem(STORAGE_KEY);
        initDatabase();
        switchTab(state.activeTab);
        showToast('Database ripristinato ai dati originali di fabbrica!');
    }

    function downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        downloadBlob(blob, fileName);
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Gestione Autenticazione & Utenti
    function updateAuthUI() {
        const loginView = document.getElementById('view-login');
        const appView = document.getElementById('view-app');
        if (!state.currentUser) {
            loginView?.classList.remove('hidden');
            loginView?.classList.add('flex');
            appView?.classList.add('hidden');
        } else {
            loginView?.classList.add('hidden');
            loginView?.classList.remove('flex');
            appView?.classList.remove('hidden');

            // Aggiorna profilo operatore nella top bar
            const userNameEl = document.getElementById('header-user-name');
            const userRoleEl = document.getElementById('header-user-role');
            const userAvatarEl = document.getElementById('header-user-avatar');
            if (userNameEl) userNameEl.textContent = state.currentUser.nome;
            if (userRoleEl) userRoleEl.textContent = state.currentUser.ruolo;
            if (userAvatarEl) {
                const parts = state.currentUser.nome.split(' ');
                const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
                userAvatarEl.textContent = initials;
            }

            // Aggiorna operatore predefinito nei form di carico e scarico
            const opLoad = document.querySelector('#form-add-load input[name="operator"]');
            if (opLoad) opLoad.value = state.currentUser.nome;
            const opDischarge = document.querySelector('#form-add-discharge input[name="operator"]');
            if (opDischarge) opDischarge.value = state.currentUser.nome;
        }
    }

    function handleLogin(e) {
        e.preventDefault();
        const form = e.target;
        const email = form.querySelector('[name="email"]').value.trim().toLowerCase();
        const pass = form.querySelector('[name="password"]').value;
        const remember = form.querySelector('[name="remember"]').checked;

        const user = state.users.find(u => u.email.toLowerCase() === email && u.password === pass);
        if (!user) {
            showToast('Email o password errati! Verifica le credenziali.', 'error');
            return;
        }

        state.currentUser = user;
        if (remember) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        } else {
            sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        }

        updateAuthUI();
        showToast(`Accesso effettuato! Benvenuto, ${user.nome}`);
        renderDashboard();
    }

    function handleLogout() {
        if (!confirm('Sei sicuro di voler effettuare la disconnessione?')) return;
        state.currentUser = null;
        localStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        updateAuthUI();
        showToast('Disconnessione effettuata con successo.');
    }

    function quickFillLogin(email, pass) {
        const emailInput = document.getElementById('login-email');
        const passInput = document.getElementById('login-password');
        if (emailInput) emailInput.value = email;
        if (passInput) passInput.value = pass;
        showToast(`Credenziali impostate: ${email}`);
    }

    // Aggiornamento allerta FEFO / Scadenza nel modulo di scarico
    function updateDischargeFEFOTip(itemId) {
        const tipEl = document.getElementById('discharge-fefo-tip');
        if (!tipEl) return;
        if (!itemId) {
            tipEl.classList.add('hidden');
            return;
        }
        const item = state.items.find(i => i.id === itemId);
        if (!item) {
            tipEl.classList.add('hidden');
            return;
        }
        const exp = getNextExpiryForItem(item.materiale);
        if (exp && exp.date) {
            if (exp.isExpired) {
                tipEl.innerHTML = `
                    <div class="flex items-start gap-2.5 text-red-800">
                        <span class="p-1 rounded-md bg-red-600 text-white shrink-0 mt-0.5 animate-pulse font-bold">🚨</span>
                        <div>
                            <strong class="font-bold block text-sm">ALLARME SICUREZZA: LOTTO SCADUTO!</strong>
                            <span>Questo presidio ha un lotto già <strong class="underline">SCADUTO il ${formatDate(exp.date)}</strong> (${Math.abs(exp.days)} giorni fa). Non utilizzarlo per interventi su pazienti/ambulanze!</span>
                        </div>
                    </div>
                `;
                tipEl.className = "mt-3 p-3.5 bg-red-50 border-2 border-red-400 rounded-xl text-xs";
                tipEl.classList.remove('hidden');
            } else if (exp.isUrgent) {
                tipEl.innerHTML = `
                    <div class="flex items-center gap-2 text-amber-900 font-semibold">
                        <span>⏳ Regola FEFO:</span>
                        <span>Consumare prioritariamente il lotto in scadenza ravvicinata: <strong>${formatDate(exp.date)}</strong> (${exp.days} giorni rimanenti).</span>
                    </div>
                `;
                tipEl.className = "mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs";
                tipEl.classList.remove('hidden');
            } else {
                tipEl.innerHTML = `
                    <span class="text-slate-600">Prossima scadenza lotto: <strong>${formatDate(exp.date)}</strong> (${exp.days}gg rimanenti).</span>
                `;
                tipEl.className = "mt-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs";
                tipEl.classList.remove('hidden');
            }
        } else {
            tipEl.classList.add('hidden');
        }
    }

    // Esposizione metodi pubblici
    window.WarehouseApp = {
        init() {
            initDatabase();
            populateItemSelects();
            renderDashboard();

            // Setup listeners filtri
            const searchInput = document.getElementById('inventory-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    state.filter.search = e.target.value;
                    renderInventory();
                });
            }

            const catSelect = document.getElementById('inventory-category-select');
            if (catSelect) {
                catSelect.addEventListener('change', (e) => {
                    state.filter.category = e.target.value;
                    renderInventory();
                });
            }

            const movSearchInput = document.getElementById('movement-search-input');
            if (movSearchInput) {
                movSearchInput.addEventListener('input', (e) => {
                    state.filter.movementSearch = e.target.value;
                    state.pagination.currentMovementsPage = 1;
                    renderMovements();
                });
            }

            // Listener cambio selezione nello scarico per allerta FEFO / Scadenza
            const dischargeItemSelect = document.getElementById('modal-discharge-item-select');
            if (dischargeItemSelect) {
                dischargeItemSelect.addEventListener('change', (e) => {
                    updateDischargeFEFOTip(e.target.value);
                });
            }

            // Form Carico
            const formLoad = document.getElementById('form-add-load');
            if (formLoad) formLoad.addEventListener('submit', handleSaveLoad);

            // Form Scarico
            const formDischarge = document.getElementById('form-add-discharge');
            if (formDischarge) formDischarge.addEventListener('submit', handleSaveDischarge);

            // Form Login
            const formLogin = document.getElementById('form-login');
            if (formLogin) formLogin.addEventListener('submit', handleLogin);

            // Form Nuovo Utente
            const formAddUser = document.getElementById('form-add-user');
            if (formAddUser) formAddUser.addEventListener('submit', (e) => window.WarehouseApp.handleSaveNewUser(e));

            updateAuthUI();
        },
        switchTab,
        openModal,
        closeModal,
        setViewMode(mode) {
            state.viewMode = mode;
            document.getElementById('btn-view-table')?.classList.toggle('bg-emerald-600', mode === 'table');
            document.getElementById('btn-view-table')?.classList.toggle('text-white', mode === 'table');
            document.getElementById('btn-view-cards')?.classList.toggle('bg-emerald-600', mode === 'cards');
            document.getElementById('btn-view-cards')?.classList.toggle('text-white', mode === 'cards');
            renderInventory();
        },
        setStatusFilter(status) {
            state.filter.status = status;
            document.querySelectorAll('.filter-pill-status').forEach(el => {
                const active = el.dataset.status === status;
                el.classList.toggle('bg-emerald-600', active);
                el.classList.toggle('text-white', active);
                el.classList.toggle('bg-slate-100', !active);
                el.classList.toggle('text-slate-600', !active);
            });
            renderInventory();
        },
        setMovementTypeFilter(type) {
            state.filter.movementType = type;
            state.pagination.currentMovementsPage = 1;
            renderMovements();
        },
        setMovementDateFilter(range) {
            state.filter.movementDateRange = range;
            state.pagination.currentMovementsPage = 1;
            renderMovements();
        },
        changeMovementsPage(page) {
            state.pagination.currentMovementsPage = Math.max(1, page);
            renderMovements();
        },
        openQuickLoadModal(itemId) {
            const select = document.getElementById('modal-load-item-select');
            if (select) select.value = itemId;
            openModal('modal-load');
        },
        openQuickDischargeModal(itemId) {
            const select = document.getElementById('modal-discharge-item-select');
            if (select) {
                select.value = itemId;
                updateDischargeFEFOTip(itemId);
            }
            openModal('modal-discharge');
        },
        openEditItemModal(itemId) {
            const item = state.items.find(i => i.id === itemId);
            if (!item) return;
            const form = document.getElementById('form-edit-item');
            if (!form) return;
            form.querySelector('[name="itemId"]').value = item.id;
            form.querySelector('[name="name"]').value = item.nomeDisplay || item.materiale;
            form.querySelector('[name="category"]').value = item.categoria;
            form.querySelector('[name="stock"]').value = item.giacenza;
            form.querySelector('[name="minStock"]').value = item.quantitativoMinimo;
            openModal('modal-edit-item');
        },
        handleSaveEditItem(e) {
            e.preventDefault();
            const form = e.target;
            const id = form.querySelector('[name="itemId"]').value;
            const item = state.items.find(i => i.id === id);
            if (!item) return;

            item.nomeDisplay = form.querySelector('[name="name"]').value.trim();
            item.categoria = form.querySelector('[name="category"]').value;
            item.giacenza = parseInt(form.querySelector('[name="stock"]').value, 10) || 0;
            item.quantitativoMinimo = parseInt(form.querySelector('[name="minStock"]').value, 10) || 0;

            saveToStorage();
            closeModal('modal-edit-item');
            showToast('Articolo aggiornato con successo!');
            renderInventory();
            renderDashboard();
        },
        handleAddNewItem(e) {
            e.preventDefault();
            const form = e.target;
            const name = form.querySelector('[name="newItemName"]').value.trim();
            const cat = form.querySelector('[name="newItemCategory"]').value;
            const stock = parseInt(form.querySelector('[name="newItemStock"]').value, 10) || 0;
            const minStock = parseInt(form.querySelector('[name="newItemMinStock"]').value, 10) || 0;

            if (!name) {
                showToast('Inserisci il nome del materiale', 'error');
                return;
            }

            const newItem = {
                id: 'custom-' + Date.now().toString(36),
                codice: 'MED-' + (state.items.length + 101),
                materiale: name.toUpperCase(),
                nomeDisplay: name.toUpperCase(),
                categoria: cat,
                giacenza: stock,
                quantitativoMinimo: minStock,
                unitaMisura: 'pz',
                note: ''
            };

            state.items.push(newItem);

            if (stock > 0) {
                state.loads.unshift({
                    id: 'CAR-' + (state.loads.length + 1),
                    tipo: 'CARICO',
                    materiale: newItem.materiale,
                    quantita: stock,
                    data: TODAY.toISOString().split('T')[0],
                    scadenza: '2999-12-31',
                    lotto: 'LOT-INIZIALE',
                    fornitore: 'Inventario Manuale',
                    note: 'Carico iniziale inserimento articolo'
                });
            }

            saveToStorage();
            populateItemSelects();
            closeModal('modal-add-item');
            form.reset();
            showToast(`Nuovo presidio "${newItem.nomeDisplay}" inserito a catalogo!`);
            renderInventory();
            renderDashboard();
        },
        updateOrderCart(itemId, qty) {
            state.orderCart[itemId] = parseInt(qty, 10) || 1;
        },
        executeQuickRestock(itemId, qty) {
            const item = state.items.find(i => i.id === itemId);
            if (!item) return;

            item.giacenza += qty;
            state.loads.unshift({
                id: 'CAR-' + (state.loads.length + 1),
                tipo: 'CARICO',
                materiale: item.materiale,
                quantita: qty,
                data: TODAY.toISOString().split('T')[0],
                scadenza: '2999-12-31',
                lotto: `LOT-RIORDINO-${TODAY.toISOString().split('T')[0].replace(/-/g, '')}`,
                fornitore: 'Ordine Fornitore Centrale',
                note: 'Carico da piano di riordino sottoscorta'
            });

            delete state.orderCart[itemId];
            saveToStorage();
            showToast(`Registrato arrivo di ${qty} pz per ${item.nomeDisplay || item.materiale}`);
            renderReorder();
            renderDashboard();
        },
        resetFilters() {
            state.filter.search = '';
            state.filter.category = 'ALL';
            state.filter.status = 'ALL';
            const sInput = document.getElementById('inventory-search-input');
            if (sInput) sInput.value = '';
            const cSelect = document.getElementById('inventory-category-select');
            if (cSelect) cSelect.value = 'ALL';
            window.WarehouseApp.setStatusFilter('ALL');
        },
        openExpiryModal() {
            const body = document.getElementById('expiry-center-body');
            if (!body) return;

            const expiredLots = [];
            const urgentLots = [];
            const warningLots = [];

            state.loads.forEach(l => {
                const days = getDaysToExpiry(l.scadenza);
                if (days !== null) {
                    if (days < 0) expiredLots.push({ ...l, days });
                    else if (days <= 90) urgentLots.push({ ...l, days });
                    else if (days <= 180) warningLots.push({ ...l, days });
                }
            });

            expiredLots.sort((a, b) => a.days - b.days);
            urgentLots.sort((a, b) => a.days - b.days);
            warningLots.sort((a, b) => a.days - b.days);

            let html = '';

            // Sezione Scaduti
            if (expiredLots.length > 0) {
                html += `
                    <div class="p-4 bg-red-50 border-2 border-red-300 rounded-2xl mb-4">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-2 text-red-800 font-black text-sm">
                                <span class="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
                                LOTTI ATTUALMENTE SCADUTI (${expiredLots.length})
                            </div>
                            <span class="text-xs bg-red-600 text-white font-bold px-2 py-0.5 rounded-full">DA ISOLARE</span>
                        </div>
                        <div class="space-y-2">
                            ${expiredLots.map(lot => `
                                <div class="p-3 bg-white rounded-xl border border-red-200 flex items-center justify-between shadow-sm">
                                    <div>
                                        <h4 class="font-bold text-slate-900 text-sm">${lot.materiale}</h4>
                                        <span class="text-xs text-slate-500 font-mono">${lot.lotto || lot.id} • Giacenza lotto: <strong>${lot.quantita} pz</strong></span>
                                    </div>
                                    <div class="text-right">
                                        <span class="px-2.5 py-1 bg-red-600 text-white font-black text-xs rounded-full">
                                            SCADUTO da ${Math.abs(lot.days)} giorni
                                        </span>
                                        <span class="text-xs text-red-600 block mt-1 font-mono font-bold">Scadenza: ${formatDate(lot.scadenza)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 mb-4">
                        <svg class="w-6 h-6 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        <div>
                            <span class="font-bold text-sm">Nessun lotto scaduto rilevato!</span>
                            <p class="text-xs text-emerald-700 mt-0.5">Tutti i dispositivi a magazzino sono all'interno del periodo di validità.</p>
                        </div>
                    </div>
                `;
            }

            // Sezione In Scadenza Urgente (< 90gg)
            if (urgentLots.length > 0) {
                html += `
                    <div class="p-3.5 bg-rose-50/60 border border-rose-200 rounded-2xl mb-4">
                        <div class="text-rose-800 font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <span>⚠️</span> In Scadenza Critica (&lt; 90 giorni) - ${urgentLots.length} lotti
                        </div>
                        <div class="space-y-2">
                            ${urgentLots.map(lot => `
                                <div class="p-2.5 bg-white rounded-xl border border-rose-100 flex items-center justify-between">
                                    <div>
                                        <h5 class="font-bold text-slate-800 text-xs">${lot.materiale}</h5>
                                        <span class="text-xs text-slate-400">Q.tà: ${lot.quantita} pz • ${lot.lotto || lot.id}</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-rose-600">Tra ${lot.days} giorni</span>
                                        <span class="text-xs text-slate-500 block font-mono">${formatDate(lot.scadenza)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Sezione In Scadenza a 90-180gg
            if (warningLots.length > 0) {
                html += `
                    <div class="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl">
                        <div class="text-amber-800 font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <span>⏳</span> Monitoraggio Semestrale (90 - 180 giorni) - ${warningLots.length} lotti
                        </div>
                        <div class="space-y-2">
                            ${warningLots.map(lot => `
                                <div class="p-2.5 bg-white rounded-xl border border-amber-100 flex items-center justify-between">
                                    <div>
                                        <h5 class="font-semibold text-slate-800 text-xs">${lot.materiale}</h5>
                                        <span class="text-xs text-slate-400">Q.tà: ${lot.quantita} pz</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xs font-semibold text-amber-700">Tra ${lot.days} giorni</span>
                                        <span class="text-xs text-slate-500 block font-mono">${formatDate(lot.scadenza)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            body.innerHTML = html;
            openModal('modal-expiry-center');
        },
        showExpiredLotsOnly() {
            switchTab('inventory');
            window.WarehouseApp.setStatusFilter('SCADUTI');
        },
        addTestExpiredLot() {
            const testLot = {
                id: 'CAR-TEST-EXP-' + Date.now().toString(36),
                tipo: 'CARICO',
                materiale: 'DISINFETTANTE PRESIDI',
                quantita: 5,
                data: '2026-01-10',
                scadenza: '2026-10-15', // Scaduto il 15 Ottobre 2026
                lotto: 'LOT-SIMULAZIONE-SCADUTO',
                fornitore: 'Fornitore Test Allerta',
                note: 'Lotto inserito per simulare la comparsa dell\'allarme rosso'
            };
            state.loads.unshift(testLot);
            saveToStorage();
            closeModal('modal-expiry-center');
            showToast('Lotto scaduto di simulazione inserito! Nota il banner rosso lampeggiante.', 'warning');
            renderDashboard();
            if (state.activeTab === 'inventory') renderInventory();
            else if (state.activeTab === 'lots') renderLots();
        },
        toggleMobileMenu,
        closeMobileMenu,
        openAddDestinationModal() {
            const form = document.getElementById('form-add-destination');
            form?.reset();
            openModal('modal-add-destination');
        },
        handleSaveDestination(e) {
            e.preventDefault();
            const form = e.target;
            const name = form.querySelector('[name="destName"]').value.trim();
            const tipo = form.querySelector('[name="destType"]').value;
            const codice = form.querySelector('[name="destCode"]').value.trim();
            const targa = form.querySelector('[name="destPlate"]').value.trim();
            const note = form.querySelector('[name="destNotes"]').value.trim();

            if (!name) {
                showToast('Inserisci il nome del mezzo o reparto', 'error');
                return;
            }

            const newDest = {
                id: 'dest-' + Date.now().toString(36),
                nome: name,
                tipo: tipo,
                codice: codice || 'MEZ-' + (state.destinations.length + 1),
                targa: targa || '-',
                note: note
            };

            state.destinations.push(newDest);
            saveToStorage();
            populateDestinationSelects();
            closeModal('modal-add-destination');
            form.reset();
            showToast(`Nuovo mezzo/assegnatario "${name}" registrato!`);
            renderDestinations();
        },
        openEditDestinationModal(id) {
            const dest = state.destinations.find(d => d.id === id);
            if (!dest) return;
            const form = document.getElementById('form-edit-destination');
            if (!form) return;
            form.querySelector('[name="destId"]').value = dest.id;
            form.querySelector('[name="destOldName"]').value = dest.nome;
            form.querySelector('[name="destName"]').value = dest.nome;
            form.querySelector('[name="destType"]').value = dest.tipo;
            form.querySelector('[name="destCode"]').value = dest.codice || '';
            form.querySelector('[name="destPlate"]').value = dest.targa && dest.targa !== '-' ? dest.targa : '';
            form.querySelector('[name="destNotes"]').value = dest.note || '';
            form.querySelector('[name="updateHistory"]').checked = true;
            openModal('modal-edit-destination');
        },
        handleSaveEditDestination(e) {
            e.preventDefault();
            const form = e.target;
            const id = form.querySelector('[name="destId"]').value;
            const oldName = form.querySelector('[name="destOldName"]').value;
            const newName = form.querySelector('[name="destName"]').value.trim();
            const tipo = form.querySelector('[name="destType"]').value;
            const codice = form.querySelector('[name="destCode"]').value.trim();
            const targa = form.querySelector('[name="destPlate"]').value.trim();
            const note = form.querySelector('[name="destNotes"]').value.trim();
            const updateHistory = form.querySelector('[name="updateHistory"]').checked;

            if (!newName) {
                showToast('Il nome del mezzo non può essere vuoto', 'error');
                return;
            }

            const dest = state.destinations.find(d => d.id === id);
            if (!dest) return;

            dest.nome = newName;
            dest.tipo = tipo;
            dest.codice = codice;
            dest.targa = targa || '-';
            dest.note = note;

            let updatedHistoryCount = 0;
            if (updateHistory && oldName !== newName) {
                state.discharges.forEach(d => {
                    if (d.destinazione === oldName) {
                        d.destinazione = newName;
                        updatedHistoryCount++;
                    }
                });
            }

            saveToStorage();
            populateDestinationSelects();
            closeModal('modal-edit-destination');
            showToast(`Mezzo rinominato in "${newName}"! ${updatedHistoryCount > 0 ? `(${updatedHistoryCount} scarichi storici aggiornati)` : ''}`);
            renderDestinations();
            if (state.activeTab === 'movements') renderMovements();
        },
        handleDeleteDestination(destId) {
            const dest = state.destinations.find(d => d.id === destId);
            if (!dest) return;

            const linkedDischarges = state.discharges.filter(d => d.destinazione === dest.nome).length;
            if (!confirm(`Sei sicuro di voler eliminare "${dest.nome}"? ${linkedDischarges > 0 ? `\nAttenzione: risultano ${linkedDischarges} scarichi registrati su questo mezzo.` : ''}`)) {
                return;
            }

            state.destinations = state.destinations.filter(d => d.id !== destId);
            saveToStorage();
            populateDestinationSelects();
            showToast(`Mezzo "${dest.nome}" rimosso`);
            renderDestinations();
        },
        viewDischargesForDestination(destName) {
            switchTab('movements');
            const searchInput = document.getElementById('movement-search-input');
            if (searchInput) {
                searchInput.value = destName;
                state.filter.movementSearch = destName;
                state.pagination.currentMovementsPage = 1;
                renderMovements();
            }
        },
        handleLogin,
        handleLogout,
        quickFillLogin,
        openUsersModal() {
            const body = document.getElementById('users-modal-body');
            if (!body) return;
            body.innerHTML = state.users.map(u => `
                <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                        <h5 class="font-bold text-slate-800 text-sm">${u.nome}</h5>
                        <span class="text-xs text-slate-500 font-mono">${u.email} • <strong>${u.ruolo}</strong></span>
                    </div>
                    <div class="flex items-center gap-2">
                        ${u.id !== 'usr-admin' && u.id !== state.currentUser?.id ? `
                            <button onclick="window.WarehouseApp.handleDeleteUser('${u.id}')" class="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-colors" title="Rimuovi Operatore">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        ` : '<span class="text-xs text-slate-400 italic">Principale</span>'}
                    </div>
                </div>
            `).join('');
            openModal('modal-manage-users');
        },
        handleSaveNewUser(e) {
            e.preventDefault();
            const form = e.target;
            const nome = form.querySelector('[name="userName"]').value.trim();
            const email = form.querySelector('[name="userEmail"]').value.trim().toLowerCase();
            const pass = form.querySelector('[name="userPassword"]').value;
            const ruolo = form.querySelector('[name="userRole"]').value;

            if (!nome || !email || !pass) {
                showToast('Tutti i campi sono obbligatori', 'error');
                return;
            }

            if (state.users.some(u => u.email.toLowerCase() === email)) {
                showToast('Esiste già un account con questa email', 'error');
                return;
            }

            const newUser = {
                id: 'usr-' + Date.now().toString(36),
                nome: nome,
                email: email,
                password: pass,
                ruolo: ruolo,
                note: 'Operatore aggiunto manualmente'
            };

            state.users.push(newUser);
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(state.users));
            closeModal('modal-add-user');
            form.reset();
            showToast(`Nuovo operatore "${nome}" registrato con successo!`);
            window.WarehouseApp.openUsersModal();
        },
        handleDeleteUser(userId) {
            const user = state.users.find(u => u.id === userId);
            if (!user) return;
            if (!confirm(`Sei sicuro di voler rimuovere l'operatore "${user.nome}"?`)) return;

            state.users = state.users.filter(u => u.id !== userId);
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(state.users));
            showToast(`Operatore "${user.nome}" rimosso`);
            window.WarehouseApp.openUsersModal();
        },
        exportToCSV,
        exportReorderCSV,
        exportJSONBackup,
        resetToFactoryData
    };

    // Auto-inizializzazione al caricamento del DOM
    document.addEventListener('DOMContentLoaded', () => {
        window.WarehouseApp.init();
    });

})();
