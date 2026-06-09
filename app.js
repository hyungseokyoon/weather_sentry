// NimbusShield // Weather & Marine Agent Logic

// Global state
let state = {
    agents: [],
    logs: []
};

// Periodic checker interval (every 30 minutes)
let syncInterval = null;
const SYNC_FREQUENCY_MS = 1800000; // 30 minutes

// Initialize the Application
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    setupEventListeners();
    renderAll();
    
    addLog('SYSTEM', 'NimbusShield core telemetry online. Fetching weather systems...', 'system-line');
    
    // Start periodic background checks
    startMonitoringLoop();
    
    if (state.agents.length > 0) {
        syncAllAgents();
    }
});

// Load state from localStorage
function loadState() {
    const savedAgents = localStorage.getItem('ns_agents');
    const savedLogs = localStorage.getItem('ns_logs');
    
    if (savedAgents) {
        state.agents = JSON.parse(savedAgents);
    }
    if (savedLogs) {
        state.logs = JSON.parse(savedLogs);
    } else {
        state.logs = [`[SYSTEM] Terminal initialized. Waiting for agent deployment...`];
    }
}

// Save state to localStorage
function saveState() {
    localStorage.setItem('ns_agents', JSON.stringify(state.agents));
    localStorage.setItem('ns_logs', JSON.stringify(state.logs));
}

// Setup all DOM event listeners
function setupEventListeners() {
    // Modal controls
    const createBtn = document.getElementById('createAgentBtn');
    const deployFirstBtn = document.getElementById('deployFirstAgentBtn');
    const cancelBtn = document.getElementById('cancelModalBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const modal = document.getElementById('agentModal');
    
    const openModal = () => {
        resetModalForm();
        generateDateChoices();
        modal.classList.add('active');
        document.getElementById('locationQuery').focus();
    };
    
    const closeModal = () => {
        modal.classList.remove('active');
    };
    
    createBtn.addEventListener('click', openModal);
    deployFirstBtn.addEventListener('click', openModal);
    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    
    // Form submission
    const form = document.getElementById('agentForm');
    form.addEventListener('submit', handleFormSubmit);
    
    // Location Search
    const searchBtn = document.getElementById('searchLocationBtn');
    const locationInput = document.getElementById('locationQuery');
    
    searchBtn.addEventListener('click', performLocationSearch);
    locationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performLocationSearch();
        }
    });
    
    // Global Actions
    document.getElementById('globalSyncBtn').addEventListener('click', syncAllAgents);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
    
    // Filter Tabs
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            filterTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            renderAll();
        });
    });

    // Manual Coordinates event handlers
    const toggleManualBtn = document.getElementById('toggleManualCoordsBtn');
    const manualForm = document.getElementById('manualCoordsForm');
    const applyManualBtn = document.getElementById('applyManualCoordsBtn');
    
    toggleManualBtn.addEventListener('click', () => {
        manualForm.classList.toggle('hidden');
        if (!manualForm.classList.contains('hidden')) {
            document.getElementById('manualCoordsInput').focus();
        }
    });
    
    applyManualBtn.addEventListener('click', () => {
        const coordsStr = document.getElementById('manualCoordsInput').value.trim();
        const name = document.getElementById('manualLocName').value.trim() || 'Custom Location';
        
        const parts = coordsStr.split(',');
        if (parts.length !== 2) {
            alert('위도와 경도를 쉼표(,)로 구분하여 정확히 입력해주세요. (예: 37.217, 126.275)');
            return;
        }
        
        const lat = parseFloat(parts[0].trim());
        const lng = parseFloat(parts[1].trim());
        
        if (isNaN(lat) || isNaN(lng)) {
            alert('위도와 경도 수치가 올바르지 않습니다. (예: 37.217, 126.275)');
            return;
        }
        
        if (lat < 33 || lat > 39 || lng < 124 || lng > 132) {
            if (!confirm('입력하신 좌표가 대한민국 경계(위도 33~39, 경도 124~132)를 벗어납니다. 그대로 진행하시겠습니까?')) {
                return;
            }
        }
        
        selectLocation({
            latitude: lat,
            longitude: lng,
            name: name,
            country: 'South Korea'
        }, `${name} (수동 좌표: ${lat}, ${lng})`);
        
        manualForm.classList.add('hidden');
    });
}

// Reset/Clear Create Modal Form
function resetModalForm() {
    document.getElementById('agentForm').reset();
    document.getElementById('agentId').value = '';
    document.getElementById('modalTitle').textContent = 'Deploy New Weather Agent';
    document.getElementById('submitAgentBtn').textContent = 'Deploy Agent';
    
    // Reset geocoding selection
    document.getElementById('selectedLat').value = '';
    document.getElementById('selectedLng').value = '';
    document.getElementById('selectedName').value = '';
    document.getElementById('selectedCountry').value = '';
    
    const badge = document.getElementById('selectedLocationBadge');
    badge.classList.add('hidden');
    document.getElementById('selectedNameText').textContent = 'None';
    
    document.getElementById('locationResults').classList.add('hidden');
    document.getElementById('locationResults').innerHTML = '';
    document.getElementById('submitAgentBtn').disabled = true;
    
    // Clear manual coordinate fields
    document.getElementById('manualCoordsInput').value = '';
    document.getElementById('manualLocName').value = '';
    document.getElementById('manualCoordsForm').classList.add('hidden');
}

// Start periodic monitoring
function startMonitoringLoop() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
        addLog('SYSTEM', 'Executing scheduled agent telemetry sweep...', 'system-line');
        syncAllAgents();
    }, SYNC_FREQUENCY_MS);
}

// Search Open-Meteo Geocoding API
async function performLocationSearch() {
    const query = document.getElementById('locationQuery').value.trim();
    const resultsContainer = document.getElementById('locationResults');
    const searchBtn = document.getElementById('searchLocationBtn');
    
    if (query.length < 2) {
        alert('Please enter at least 2 characters to search.');
        return;
    }
    
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
    
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error('Geocoding server responded with error');
        
        const data = await response.json();
        
        // Filter South Korea (KR)
        let krResults = (data.results || []).filter(loc => 
            loc.country_code === 'KR' || 
            (loc.country && loc.country.toLowerCase().includes('korea'))
        );
        
        // Goheung query patch
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes('goheung') || lowerQuery.includes('koheung') || lowerQuery.includes('고흥')) {
            const goheungExists = krResults.some(r => r.name.toLowerCase().includes('goheung') || r.name.includes('고흥'));
            if (!goheungExists) {
                krResults.unshift({
                    id: 1842884,
                    name: "Goheung (전라남도 고흥군)",
                    latitude: 34.6111,
                    longitude: 127.2844,
                    elevation: 15.0,
                    feature_code: "ADM2",
                    country_code: "KR",
                    timezone: "Asia/Seoul",
                    country: "South Korea",
                    admin1: "Jeollanam-do"
                });
            }
        }
        
        if (krResults.length === 0) {
            resultsContainer.innerHTML = '<div class="location-result-item">대한민국 내 검색 결과가 없습니다. (No South Korea locations found)</div>';
            resultsContainer.classList.remove('hidden');
            searchBtn.disabled = false;
            searchBtn.textContent = 'Search';
            return;
        }
        
        krResults.forEach(loc => {
            const countryStr = loc.country ? `, ${loc.country}` : '';
            const regionStr = loc.admin1 ? `, ${loc.admin1}` : '';
            const label = `${loc.name}${regionStr}${countryStr}`;
            
            const div = document.createElement('div');
            div.className = 'location-result-item';
            div.textContent = label;
            div.addEventListener('click', () => selectLocation(loc, label));
            resultsContainer.appendChild(div);
        });
        
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Geocoding error:', error);
        resultsContainer.innerHTML = '<div class="location-result-item error-line">Failed to connect to location API.</div>';
        resultsContainer.classList.remove('hidden');
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
    }
}

// Select a location from the search list
function selectLocation(loc, fullLabel) {
    document.getElementById('selectedLat').value = loc.latitude;
    document.getElementById('selectedLng').value = loc.longitude;
    document.getElementById('selectedName').value = loc.name;
    document.getElementById('selectedCountry').value = loc.country || '';
    
    document.getElementById('selectedNameText').textContent = fullLabel;
    document.getElementById('selectedLocationBadge').classList.remove('hidden');
    document.getElementById('locationResults').classList.add('hidden');
    
    const nameInput = document.getElementById('agentName');
    if (!nameInput.value) {
        nameInput.value = `${loc.name} Weather Agent`;
    }
    
    document.getElementById('submitAgentBtn').disabled = false;
}

// Submit agent creation/editing form
function handleFormSubmit(e) {
    e.preventDefault();
    
    const idInput = document.getElementById('agentId').value;
    const name = document.getElementById('agentName').value.trim();
    
    // Auto-parse manual coordinates if visible and filled
    const manualForm = document.getElementById('manualCoordsForm');
    const coordsInputVal = document.getElementById('manualCoordsInput').value.trim();
    if (!manualForm.classList.contains('hidden') && coordsInputVal) {
        const parts = coordsInputVal.split(',');
        if (parts.length === 2) {
            const latVal = parseFloat(parts[0].trim());
            const lngVal = parseFloat(parts[1].trim());
            if (!isNaN(latVal) && !isNaN(lngVal)) {
                const nameVal = document.getElementById('manualLocName').value.trim() || 'Custom Location';
                document.getElementById('selectedLat').value = latVal;
                document.getElementById('selectedLng').value = lngVal;
                document.getElementById('selectedName').value = nameVal;
                document.getElementById('selectedCountry').value = 'South Korea';
            }
        }
    }
    
    const lat = parseFloat(document.getElementById('selectedLat').value);
    const lng = parseFloat(document.getElementById('selectedLng').value);
    const locationName = document.getElementById('selectedName').value;
    const country = document.getElementById('selectedCountry').value;
    const targetDate = document.getElementById('targetDateSelect').value;
    
    if (isNaN(lat) || isNaN(lng)) {
        alert('위도와 경도 좌표 정보를 선택하거나 입력해주세요.');
        return;
    }
    
    if (idInput) {
        // Edit Mode
        const agentIndex = state.agents.findIndex(a => a.id === idInput);
        if (agentIndex !== -1) {
            const original = state.agents[agentIndex];
            state.agents[agentIndex] = {
                ...original,
                name,
                latitude: lat,
                longitude: lng,
                locationName,
                country,
                targetDate
            };
            addLog('SYSTEM', `Agent [${name}] configuration updated.`, 'system-line');
            syncAgentWeather(state.agents[agentIndex]);
        }
    } else {
        // Create Mode
        const newAgent = {
            id: 'agent_' + Date.now().toString(36),
            name,
            locationName,
            country,
            latitude: lat,
            longitude: lng,
            targetDate,
            weather: { tempMin: null, tempMax: null, wind: null, rain: null, seaTemp: null },
            lastChecked: null,
            isActive: true
        };
        state.agents.push(newAgent);
        addLog('SYSTEM', `Agent [${name}] deployed successfully to ${locationName}.`, 'system-line');
        syncAgentWeather(newAgent);
    }
    
    saveState();
    renderAll();
    document.getElementById('agentModal').classList.remove('active');
}

// Fetch daily forecast & marine SST for a single agent
async function syncAgentWeather(agent) {
    if (!agent.isActive) return;
    
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${agent.latitude}&longitude=${agent.longitude}&daily=temperature_2m_max,temperature_2m_min,rain_sum,wind_speed_10m_max&timezone=auto&forecast_days=16&wind_speed_unit=ms`;
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${agent.latitude}&longitude=${agent.longitude}&hourly=sea_surface_temperature&timezone=auto&forecast_days=16`;
    
    try {
        const [forecastRes, marineRes] = await Promise.all([
            fetch(forecastUrl),
            fetch(marineUrl)
        ]);
        
        if (!forecastRes.ok || !marineRes.ok) throw new Error('API request failed');
        
        const [forecastData, marineData] = await Promise.all([
            forecastRes.json(),
            marineRes.json()
        ]);
        
        let fcTempMax = null;
        let fcTempMin = null;
        let fcRain = null;
        let fcWind = null;
        let avgSST = null;
        
        if (forecastData.daily && forecastData.daily.time) {
            const dateIndex = forecastData.daily.time.indexOf(agent.targetDate);
            if (dateIndex !== -1) {
                fcTempMax = forecastData.daily.temperature_2m_max[dateIndex];
                fcTempMin = forecastData.daily.temperature_2m_min[dateIndex];
                fcRain = forecastData.daily.rain_sum[dateIndex];
                fcWind = forecastData.daily.wind_speed_10m_max[dateIndex];
            }
        }
        
        if (marineData.hourly && marineData.hourly.time && marineData.hourly.sea_surface_temperature) {
            const targetDay = agent.targetDate;
            const hourlyTemps = [];
            
            for (let i = 0; i < marineData.hourly.time.length; i++) {
                if (marineData.hourly.time[i].startsWith(targetDay)) {
                    const temp = marineData.hourly.sea_surface_temperature[i];
                    if (temp !== null && temp !== undefined) {
                        hourlyTemps.push(temp);
                    }
                }
            }
            
            if (hourlyTemps.length > 0) {
                const sum = hourlyTemps.reduce((a, b) => a + b, 0);
                avgSST = parseFloat((sum / hourlyTemps.length).toFixed(1));
            }
        }
        
        const checkTime = new Date().toLocaleTimeString();
        agent.weather = {
            tempMax: fcTempMax,
            tempMin: fcTempMin,
            rain: fcRain,
            wind: fcWind,
            seaTemp: avgSST
        };
        agent.lastChecked = checkTime;
        
        addLog(agent.name, `Telemetry synced for ${agent.targetDate} (Temp: ${fcTempMin ?? '--'}~${fcTempMax ?? '--'}°C, Wind: ${fcWind ?? '--'}m/s, Rain: ${fcRain ?? '--'}mm, Sea Temp: ${avgSST ?? 'N/A'}°C).`, 'check-line');
        
        saveState();
        renderAll();
    } catch (error) {
        console.error(`Error syncing agent ${agent.name}:`, error);
        addLog(agent.name, `Telemetry sync failed: Service temporarily offline.`, 'error-line');
        renderAll();
    }
}

// Sync all active agents
async function syncAllAgents() {
    const syncBtn = document.getElementById('globalSyncBtn');
    const syncIcon = syncBtn.querySelector('svg');
    
    syncIcon.classList.add('spinning');
    syncBtn.disabled = true;
    
    const activeAgents = state.agents.filter(a => a.isActive);
    
    if (activeAgents.length === 0) {
        addLog('SYSTEM', 'Telemetry sync requested but no active agents found.', 'warning-line');
        setTimeout(() => {
            syncIcon.classList.remove('spinning');
            syncBtn.disabled = false;
        }, 500);
        return;
    }
    
    addLog('SYSTEM', `Syncing forecast data for ${activeAgents.length} agents...`, 'system-line');
    
    const promises = activeAgents.map(agent => syncAgentWeather(agent));
    await Promise.all(promises);
    
    syncIcon.classList.remove('spinning');
    syncBtn.disabled = false;
}

// Toggle an agent between active (monitoring) and paused
function toggleAgentActive(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    
    agent.isActive = !agent.isActive;
    
    if (!agent.isActive) {
        addLog(agent.name, 'Monitoring paused. Shield deactivated.', 'warning-line');
    } else {
        addLog(agent.name, 'Shield activated. Gathering initial telemetry...', 'system-line');
        syncAgentWeather(agent);
    }
    
    saveState();
    renderAll();
}

// Manually sync forecast data for a single agent
async function syncSingleAgentWeather(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    if (!agent.isActive) {
        alert('에이전트가 비활성화 상태입니다. 동기화하려면 먼저 활성화해주세요. (Agent is paused. Please activate it first to sync.)');
        return;
    }
    
    const cardEl = document.getElementById(`card_${agentId}`);
    const syncBtn = cardEl ? cardEl.querySelector('.btn-sync-trigger') : null;
    const syncIcon = syncBtn ? syncBtn.querySelector('.icon-sync') : null;
    
    if (syncIcon) syncIcon.classList.add('spinning');
    if (syncBtn) syncBtn.disabled = true;
    
    addLog(agent.name, '수동 동기화를 시작합니다... (Initiating manual telemetry sync...)', 'system-line');
    await syncAgentWeather(agent);
}

// Delete an agent
function deleteAgent(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    
    if (confirm(`Are you sure you want to permanently decommission agent [${agent.name}]?`)) {
        state.agents = state.agents.filter(a => a.id !== agentId);
        addLog('SYSTEM', `Agent [${agent.name}] decommissioned and deleted.`, 'warning-line');
        
        saveState();
        renderAll();
    }
}

// Open agent edit modal
function editAgent(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    
    resetModalForm();
    generateDateChoices();
    
    document.getElementById('modalTitle').textContent = `Reconfigure [${agent.name}]`;
    document.getElementById('agentId').value = agent.id;
    document.getElementById('agentName').value = agent.name;
    
    document.getElementById('selectedLat').value = agent.latitude;
    document.getElementById('selectedLng').value = agent.longitude;
    document.getElementById('selectedName').value = agent.locationName;
    document.getElementById('selectedCountry').value = agent.country || '';
    
    const countryStr = agent.country ? `, ${agent.country}` : '';
    document.getElementById('selectedNameText').textContent = `${agent.locationName}${countryStr}`;
    document.getElementById('selectedLocationBadge').classList.remove('hidden');
    document.getElementById('locationQuery').value = agent.locationName;
    
    document.getElementById('targetDateSelect').value = agent.targetDate;
    
    document.getElementById('submitAgentBtn').disabled = false;
    document.getElementById('submitAgentBtn').textContent = 'Apply Configurations';
    
    document.getElementById('agentModal').classList.add('active');
}

// Rename an agent directly from the card
function renameAgent(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    
    const newName = prompt('에이전트의 새 코네임을 입력하세요 (Enter new name for agent):', agent.name);
    if (newName && newName.trim()) {
        const oldName = agent.name;
        agent.name = newName.trim();
        addLog('SYSTEM', `Agent [${oldName}] renamed to [${agent.name}].`, 'system-line');
        saveState();
        renderAll();
    }
}

// Log utility for terminal console
function addLog(source, message, styleClass = '') {
    const time = new Date().toLocaleTimeString();
    const formatted = `[${time}] [${source}] ${message}`;
    
    state.logs.push({ text: formatted, styleClass });
    
    if (state.logs.length > 100) {
        state.logs.shift();
    }
    
    saveState();
    renderLogs();
}

// Clear all terminal logs
function clearLogs() {
    state.logs = [`[${new Date().toLocaleTimeString()}] [SYSTEM] Operations console log cleared.`];
    saveState();
    renderLogs();
}

// RENDER PROCEDURES

function renderAll() {
    const activeFilter = document.querySelector('.filter-tab.active').dataset.filter;
    renderAgentsGrid(activeFilter);
    renderLogs();
    
    document.getElementById('agentCount').textContent = state.agents.length;
}

// Render active agent cards grid
function renderAgentsGrid(filter = 'all') {
    const grid = document.getElementById('agentsGrid');
    const emptyState = document.getElementById('emptyState');
    
    const cards = grid.querySelectorAll('.agent-card');
    cards.forEach(c => c.remove());
    
    let filteredAgents = [...state.agents];
    
    if (filter === 'active') {
        filteredAgents = filteredAgents.filter(a => a.isActive);
    } else if (filter === 'paused') {
        filteredAgents = filteredAgents.filter(a => !a.isActive);
    }
    
    if (filteredAgents.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    filteredAgents.forEach(agent => {
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.id = `card_${agent.id}`;
        
        // Simplified status dots
        let statusBadgeHtml = '';
        if (agent.isActive) {
            statusBadgeHtml = `<span class="status-dot green pulse" title="Active"></span>`;
        } else {
            statusBadgeHtml = `<span class="status-dot red" title="Paused"></span>`;
        }
        
        // Format daily forecast weather metrics
        const tempMinVal = agent.weather.tempMin !== null && agent.weather.tempMin !== undefined ? `${agent.weather.tempMin}°C` : '--';
        const tempMaxVal = agent.weather.tempMax !== null && agent.weather.tempMax !== undefined ? `${agent.weather.tempMax}°C` : '--';
        const tempVal = agent.weather.tempMin !== null && agent.weather.tempMax !== null ? `${tempMinVal} ~ ${tempMaxVal}` : '--';
        const windVal = agent.weather.wind !== null && agent.weather.wind !== undefined ? `${agent.weather.wind} m/s` : '--';
        const rainVal = agent.weather.rain !== null && agent.weather.rain !== undefined ? `${agent.weather.rain} mm` : '--';
        const seaTempVal = agent.weather.seaTemp !== null && agent.weather.seaTemp !== undefined ? `${agent.weather.seaTemp}°C` : '--';
        
        card.innerHTML = `
            <div class="agent-card-header">
                <div class="agent-meta">
                    <div class="agent-avatar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                    </div>
                    <div class="agent-identifiers" style="max-width: 85%;">
                        <div class="agent-codename-container" style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                            <h4 class="agent-codename" title="${agent.name}" style="flex-grow: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${agent.name}</h4>
                            <button class="btn-rename" onclick="renameAgent('${agent.id}')" title="이름 변경" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; display: inline-flex; align-items: center; justify-content: center; transition: color var(--transition-fast); flex-shrink: 0;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 13px; height: 13px;">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        </div>
                        <span class="agent-location" title="${agent.locationName}, ${agent.country}">${agent.locationName}${agent.country ? ', ' + agent.country : ''}</span>
                    </div>
                </div>
                ${statusBadgeHtml}
            </div>
            
            <div class="agent-card-body">
                <div style="font-size: 0.82rem; color: var(--accent-blue); font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; color: var(--accent-blue);">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    Forecast Target: ${agent.targetDate}
                </div>
                <div class="weather-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div class="stat-box">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                        </svg>
                        <div class="stat-value" style="font-size: 0.88rem; white-space: nowrap;">${tempVal}</div>
                        <div class="stat-label">Air Temp</div>
                    </div>
                    
                    <div class="stat-box">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 14.89c0-2.86 2.2-5.07 4.9-5.07 1-.03 1.9.22 2.7.7A6.47 6.47 0 0 1 22 13.9c0 3.3-2.5 5.9-5.7 6H8.2c-2.3 0-4.2-2.1-4.2-5.11z"/>
                            <path d="M16 13v8"/>
                            <path d="M8 15v6"/>
                            <path d="M12 15v6"/>
                        </svg>
                        <div class="stat-value">${rainVal}</div>
                        <div class="stat-label">Rain Sum</div>
                    </div>
                    
                    <div class="stat-box">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
                        </svg>
                        <div class="stat-value">${windVal}</div>
                        <div class="stat-label">Max Wind</div>
                    </div>

                    <div class="stat-box" style="border-color: rgba(5, 255, 161, 0.25);">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2">
                            <path d="M2 12h20M2 16h20M2 8h20"/>
                        </svg>
                        <div class="stat-value" style="color: var(--accent-emerald);">${seaTempVal}</div>
                        <div class="stat-label">Sea Temp</div>
                    </div>
                </div>
            </div>
            
            <div class="agent-card-footer">
                <span class="agent-last-check">Sync: ${agent.lastChecked || 'Never'}</span>
                <div class="card-actions">
                    <button class="action-btn btn-sync-trigger" title="Manual Sync" onclick="syncSingleAgentWeather('${agent.id}')">
                        <svg class="icon-sync" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                    </button>
                    <button class="action-btn btn-toggle-state" title="${agent.isActive ? 'Pause monitoring' : 'Resume monitoring'}" onclick="toggleAgentActive('${agent.id}')">
                        ${agent.isActive ? `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="6" y="4" width="4" height="16"></rect>
                                <rect x="14" y="4" width="4" height="16"></rect>
                            </svg>
                        ` : `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        `}
                    </button>
                    <button class="action-btn btn-configure" title="Configure Agent" onclick="editAgent('${agent.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    </button>
                    <button class="action-btn btn-delete" title="Decommission Agent" onclick="deleteAgent('${agent.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

// Render the terminal telemetry log
function renderLogs() {
    const container = document.getElementById('terminalLogs');
    container.innerHTML = '';
    
    state.logs.forEach(log => {
        const span = document.createElement('span');
        span.className = `log-line ${log.styleClass || ''}`;
        span.textContent = typeof log === 'string' ? log : log.text;
        container.appendChild(span);
    });
    
    container.scrollTop = container.scrollHeight;
}

// Generate the 16 available forecast date options dynamically
function generateDateChoices() {
    const select = document.getElementById('targetDateSelect');
    if (!select) return;
    select.innerHTML = '';
    
    const baseDate = new Date();
    
    for (let i = 0; i < 16; i++) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + i);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const dateString = `${yyyy}-${mm}-${dd}`;
        
        const option = document.createElement('option');
        option.value = dateString;
        option.textContent = i === 0 ? `${dateString} (오늘 - Today)` : dateString;
        select.appendChild(option);
    }
}
