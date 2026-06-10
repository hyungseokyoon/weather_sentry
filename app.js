// NimbusShield // Weather & Marine Agent Logic

// Global state
let state = {
    agents: [],
    logs: []
};

// Periodic checker interval (every 30 minutes)
let syncInterval = null;
const SYNC_FREQUENCY_MS = 1800000; // 30 minutes

// Leaflet Map state variables
let map = null;
let markersGroup = null;
let currentView = 'grid'; // 'grid' or 'map'

// Chart.js references tracker
let charts = {};

// Simulator state
let isSimulationMode = false;
let simTargetAgentId = 'all';
let simulatedWeather = {
    tempMin: 10.0,
    tempMax: 20.0,
    wind: 5.0,
    rain: 0.0,
    seaTemp: 15.0,
    waveHeight: 1.0
};

// Notifications & Webhook state
let isPushEnabled = false;
let webhookUrl = '';
let activeAlerts = {};

// Initialize the Application
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    setupEventListeners();
    setupSimulator();
    setupNotifications();
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
    const savedPush = localStorage.getItem('ns_push_enabled');
    const savedWebhook = localStorage.getItem('ns_webhook_url');
    
    if (savedAgents) {
        state.agents = JSON.parse(savedAgents);
    }
    if (savedLogs) {
        state.logs = JSON.parse(savedLogs);
    } else {
        state.logs = [`[SYSTEM] Terminal initialized. Waiting for agent deployment...`];
    }
    if (savedPush) {
        isPushEnabled = JSON.parse(savedPush);
    }
    if (savedWebhook) {
        webhookUrl = savedWebhook;
    }
}

// Save state to localStorage
function saveState() {
    localStorage.setItem('ns_agents', JSON.stringify(state.agents));
    localStorage.setItem('ns_logs', JSON.stringify(state.logs));
    localStorage.setItem('ns_push_enabled', JSON.stringify(isPushEnabled));
    localStorage.setItem('ns_webhook_url', webhookUrl);
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
    
    // Layout view switcher
    const viewGridBtn = document.getElementById('viewGridBtn');
    const viewMapBtn = document.getElementById('viewMapBtn');
    
    viewGridBtn.addEventListener('click', () => toggleView('grid'));
    viewMapBtn.addEventListener('click', () => toggleView('map'));
    
    // Filter Tabs
    const filterTabs = document.querySelectorAll('.filter-tab[data-filter]');
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
            weather: { tempMin: null, tempMax: null, wind: null, rain: null, seaTemp: null, waveHeight: null, wavePeriod: null, waveDirection: null, hourlyHours: [], hourlyTemp: [], hourlyWind: [], hourlyRain: [], hourlySeaTemp: [], hourlyWaveHeight: [] },
            lastChecked: null,
            isActive: true,
            isError: false,
            history: {}
        };
        state.agents.push(newAgent);
        addLog('SYSTEM', `Agent [${name}] deployed successfully to ${locationName}.`, 'system-line');
        syncAgentWeather(newAgent);
    }
    
    saveState();
    renderAll();
    document.getElementById('agentModal').classList.remove('active');
}

// Fetch daily forecast & marine SST/waves for a single agent
async function syncAgentWeather(agent) {
    if (!agent.isActive) return;
    
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${agent.latitude}&longitude=${agent.longitude}&daily=temperature_2m_max,temperature_2m_min,rain_sum,wind_speed_10m_max&hourly=temperature_2m,wind_speed_10m,precipitation&timezone=auto&forecast_days=16&wind_speed_unit=ms`;
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${agent.latitude}&longitude=${agent.longitude}&hourly=sea_surface_temperature,wave_height,wave_period,wave_direction&timezone=auto&forecast_days=16`;
    
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
        let avgWaveHeight = null;
        let avgWavePeriod = null;
        let avgWaveDirection = null;
        
        let hourlyTemp = [];
        let hourlyWind = [];
        let hourlyRain = [];
        let hourlyHours = [];
        let hourlySeaTemp = [];
        let hourlyWaveHeight = [];
        
        if (forecastData.daily && forecastData.daily.time) {
            const dateIndex = forecastData.daily.time.indexOf(agent.targetDate);
            if (dateIndex !== -1) {
                fcTempMax = forecastData.daily.temperature_2m_max[dateIndex];
                fcTempMin = forecastData.daily.temperature_2m_min[dateIndex];
                fcRain = forecastData.daily.rain_sum[dateIndex];
                fcWind = forecastData.daily.wind_speed_10m_max[dateIndex];
            }
        }
        
        if (forecastData.hourly && forecastData.hourly.time) {
            const targetDay = agent.targetDate;
            for (let i = 0; i < forecastData.hourly.time.length; i++) {
                if (forecastData.hourly.time[i].startsWith(targetDay)) {
                    hourlyHours.push(forecastData.hourly.time[i]);
                    if (forecastData.hourly.temperature_2m) {
                        hourlyTemp.push(forecastData.hourly.temperature_2m[i]);
                    }
                    if (forecastData.hourly.wind_speed_10m) {
                        hourlyWind.push(forecastData.hourly.wind_speed_10m[i]);
                    }
                    if (forecastData.hourly.precipitation) {
                        hourlyRain.push(forecastData.hourly.precipitation[i]);
                    }
                }
            }
        }
        
        if (marineData.hourly && marineData.hourly.time) {
            const targetDay = agent.targetDate;
            const hourlyTemps = [];
            const hourlyHeights = [];
            const hourlyPeriods = [];
            const hourlyDirections = [];
            
            for (let i = 0; i < marineData.hourly.time.length; i++) {
                if (marineData.hourly.time[i].startsWith(targetDay)) {
                    if (marineData.hourly.sea_surface_temperature) {
                        const temp = marineData.hourly.sea_surface_temperature[i];
                        if (temp !== null && temp !== undefined) {
                            hourlyTemps.push(temp);
                            hourlySeaTemp.push(temp);
                        } else {
                            hourlySeaTemp.push(null);
                        }
                    }
                    if (marineData.hourly.wave_height) {
                        const height = marineData.hourly.wave_height[i];
                        if (height !== null && height !== undefined) {
                            hourlyHeights.push(height);
                            hourlyWaveHeight.push(height);
                        } else {
                            hourlyWaveHeight.push(null);
                        }
                    }
                    if (marineData.hourly.wave_period) {
                        const period = marineData.hourly.wave_period[i];
                        if (period !== null && period !== undefined) hourlyPeriods.push(period);
                    }
                    if (marineData.hourly.wave_direction) {
                        const dir = marineData.hourly.wave_direction[i];
                        if (dir !== null && dir !== undefined) hourlyDirections.push(dir);
                    }
                }
            }
            
            if (hourlyTemps.length > 0) {
                const sum = hourlyTemps.reduce((a, b) => a + b, 0);
                avgSST = parseFloat((sum / hourlyTemps.length).toFixed(1));
            }
            if (hourlyHeights.length > 0) {
                const sum = hourlyHeights.reduce((a, b) => a + b, 0);
                avgWaveHeight = parseFloat((sum / hourlyHeights.length).toFixed(2));
            }
            if (hourlyPeriods.length > 0) {
                const sum = hourlyPeriods.reduce((a, b) => a + b, 0);
                avgWavePeriod = parseFloat((sum / hourlyPeriods.length).toFixed(1));
            }
            if (hourlyDirections.length > 0) {
                const sum = hourlyDirections.reduce((a, b) => a + b, 0);
                avgWaveDirection = Math.round(sum / hourlyDirections.length);
            }
        }
        
        const checkTime = new Date().toLocaleTimeString();
        agent.weather = {
            tempMax: fcTempMax,
            tempMin: fcTempMin,
            rain: fcRain,
            wind: fcWind,
            seaTemp: avgSST,
            waveHeight: avgWaveHeight,
            wavePeriod: avgWavePeriod,
            waveDirection: avgWaveDirection,
            
            hourlyHours: hourlyHours,
            hourlyTemp: hourlyTemp,
            hourlyWind: hourlyWind,
            hourlyRain: hourlyRain,
            hourlySeaTemp: hourlySeaTemp,
            hourlyWaveHeight: hourlyWaveHeight
        };
        agent.lastChecked = checkTime;
        agent.isError = false;
        
        addLog(agent.name, `Telemetry synced for ${agent.targetDate} (Temp: ${fcTempMin ?? '--'}~${fcTempMax ?? '--'}°C, Wind: ${fcWind ?? '--'}m/s, Rain: ${fcRain ?? '--'}mm, Sea Temp: ${avgSST ?? 'N/A'}°C, Wave Height: ${avgWaveHeight ?? 'N/A'}m).`, 'check-line');
        
        saveState();
        renderAll();
        checkWeatherAlerts(agent);
    } catch (error) {
        console.error(`Error syncing agent ${agent.name}:`, error);
        agent.isError = true;
        addLog(agent.name, `Telemetry sync failed: Service temporarily offline.`, 'error-line');
        saveState();
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

// Helper to retrieve display weather (with simulation override support)
function getAgentDisplayWeather(agent) {
    if (isSimulationMode && (simTargetAgentId === 'all' || simTargetAgentId === agent.id)) {
        // Generate simulated hourly trend (beautiful smooth curves)
        const hours = agent.weather?.hourlyHours?.length ? agent.weather.hourlyHours : Array.from({length: 24}, (_, i) => `T${String(i).padStart(2, '0')}:00`);
        const hourlyTemp = Array.from({length: 24}, (_, i) => {
            const t = Math.sin((i - 6) * Math.PI / 12); // peak temperature around 14:00
            const range = simulatedWeather.tempMax - simulatedWeather.tempMin;
            const avg = (simulatedWeather.tempMax + simulatedWeather.tempMin) / 2;
            return parseFloat((avg + (range / 2) * t).toFixed(1));
        });
        const hourlyWind = Array.from({length: 24}, (_, i) => {
            const t = Math.cos((i - 12) * Math.PI / 12);
            return parseFloat((simulatedWeather.wind * (0.8 + 0.4 * t)).toFixed(1));
        });
        const hourlyRain = Array.from({length: 24}, (_, i) => {
            if (simulatedWeather.rain <= 0) return 0;
            // rainy afternoon or scattered rain
            if (i >= 12 && i <= 18) {
                return parseFloat((simulatedWeather.rain / 7).toFixed(1));
            }
            return 0;
        });
        const hourlySeaTemp = Array.from({length: 24}, () => simulatedWeather.seaTemp);
        const hourlyWaveHeight = Array.from({length: 24}, (_, i) => {
            const t = Math.sin(i * Math.PI / 8);
            return parseFloat((simulatedWeather.waveHeight * (0.9 + 0.2 * t)).toFixed(2));
        });

        return {
            tempMin: simulatedWeather.tempMin,
            tempMax: simulatedWeather.tempMax,
            wind: simulatedWeather.wind,
            rain: simulatedWeather.rain,
            seaTemp: simulatedWeather.seaTemp,
            waveHeight: simulatedWeather.waveHeight,
            wavePeriod: agent.weather?.wavePeriod !== undefined && agent.weather?.wavePeriod !== null ? agent.weather.wavePeriod : 6.5,
            waveDirection: agent.weather?.waveDirection !== undefined && agent.weather?.waveDirection !== null ? agent.weather.waveDirection : 180,
            
            hourlyHours: hours,
            hourlyTemp: hourlyTemp,
            hourlyWind: hourlyWind,
            hourlyRain: hourlyRain,
            hourlySeaTemp: hourlySeaTemp,
            hourlyWaveHeight: hourlyWaveHeight
        };
    }
    return agent.weather || {};
}

// Setup Simulator controls and events
function setupSimulator() {
    const simToggle = document.getElementById('simToggle');
    const simTargetSelect = document.getElementById('simTargetSelect');
    const simSlidersContainer = document.getElementById('simSlidersContainer');
    const simModeStatus = document.getElementById('simModeStatus');
    const simResetBtn = document.getElementById('simResetBtn');
    
    const sliders = {
        tempMin: { input: document.getElementById('simTempMin'), val: document.getElementById('simTempMinVal'), unit: '°C' },
        tempMax: { input: document.getElementById('simTempMax'), val: document.getElementById('simTempMaxVal'), unit: '°C' },
        wind: { input: document.getElementById('simWind'), val: document.getElementById('simWindVal'), unit: ' m/s' },
        rain: { input: document.getElementById('simRain'), val: document.getElementById('simRainVal'), unit: ' mm' },
        seaTemp: { input: document.getElementById('simSeaTemp'), val: document.getElementById('simSeaTempVal'), unit: '°C' },
        waveHeight: { input: document.getElementById('simWaveHeight'), val: document.getElementById('simWaveHeightVal'), unit: ' m' }
    };
    
    // Sync slider values to state
    const updateSimValues = () => {
        simulatedWeather.tempMin = parseFloat(sliders.tempMin.input.value);
        simulatedWeather.tempMax = parseFloat(sliders.tempMax.input.value);
        simulatedWeather.wind = parseFloat(sliders.wind.input.value);
        simulatedWeather.rain = parseFloat(sliders.rain.input.value);
        simulatedWeather.seaTemp = parseFloat(sliders.seaTemp.input.value);
        simulatedWeather.waveHeight = parseFloat(sliders.waveHeight.input.value);
        
        // Update value labels
        Object.keys(sliders).forEach(key => {
            sliders[key].val.textContent = sliders[key].input.value;
        });
    };
    
    // Handle toggle simulation mode
    simToggle.addEventListener('change', (e) => {
        isSimulationMode = e.target.checked;
        if (isSimulationMode) {
            simSlidersContainer.style.opacity = '1';
            simSlidersContainer.style.pointerEvents = 'auto';
            simModeStatus.textContent = 'ON';
            simModeStatus.style.background = 'rgba(5, 255, 161, 0.1)';
            simModeStatus.style.borderColor = 'var(--accent-emerald)';
            simModeStatus.style.color = 'var(--accent-emerald)';
            addLog('SIMULATOR', 'Weather Sandbox Simulator ACTIVE. Overriding target agents.', 'system-line');
        } else {
            simSlidersContainer.style.opacity = '0.5';
            simSlidersContainer.style.pointerEvents = 'none';
            simModeStatus.textContent = 'OFF';
            simModeStatus.style.background = 'rgba(0, 210, 255, 0.1)';
            simModeStatus.style.borderColor = 'var(--accent-blue-glow)';
            simModeStatus.style.color = 'var(--accent-blue)';
            addLog('SIMULATOR', 'Weather Sandbox Simulator DEACTIVATED. Reverting to real-time data.', 'system-line');
        }
        renderAll();
        
        // Check alerts on state transition
        state.agents.forEach(a => checkWeatherAlerts(a));
        
        // Also refresh any open charts
        Object.keys(charts).forEach(agentId => {
            renderAgentChart(agentId);
        });
    });
    
    // Handle target select change
    simTargetSelect.addEventListener('change', (e) => {
        simTargetAgentId = e.target.value;
        if (isSimulationMode) {
            addLog('SIMULATOR', `Simulation target changed to: ${simTargetAgentId === 'all' ? 'All Deployed Agents' : 'Agent ' + state.agents.find(a => a.id === simTargetAgentId)?.name}`, 'system-line');
            renderAll();
            state.agents.forEach(a => checkWeatherAlerts(a));
            Object.keys(charts).forEach(agentId => {
                renderAgentChart(agentId);
            });
        }
    });
    
    // Sliders event listeners
    Object.keys(sliders).forEach(key => {
        sliders[key].input.addEventListener('input', () => {
            updateSimValues();
            if (isSimulationMode) {
                renderAll();
                // Check alerts for affected agents
                state.agents.forEach(a => {
                    if (simTargetAgentId === 'all' || simTargetAgentId === a.id) {
                        checkWeatherAlerts(a);
                    }
                });
                // If the target has an open chart, re-render the chart dynamically!
                Object.keys(charts).forEach(agentId => {
                    if (simTargetAgentId === 'all' || simTargetAgentId === agentId) {
                        renderAgentChart(agentId);
                    }
                });
            }
        });
    });
    
    // Reset button
    simResetBtn.addEventListener('click', () => {
        simToggle.checked = false;
        isSimulationMode = false;
        simSlidersContainer.style.opacity = '0.5';
        simSlidersContainer.style.pointerEvents = 'none';
        simModeStatus.textContent = 'OFF';
        simModeStatus.style.background = 'rgba(0, 210, 255, 0.1)';
        simModeStatus.style.borderColor = 'var(--accent-blue-glow)';
        simModeStatus.style.color = 'var(--accent-blue)';
        
        sliders.tempMin.input.value = 10.0;
        sliders.tempMax.input.value = 20.0;
        sliders.wind.input.value = 5.0;
        sliders.rain.input.value = 0.0;
        sliders.seaTemp.input.value = 15.0;
        sliders.waveHeight.input.value = 1.0;
        
        updateSimValues();
        addLog('SIMULATOR', 'Simulator settings reset to default values.', 'system-line');
        renderAll();
        
        // Re-evaluate alerts to resolve simulated alerts
        state.agents.forEach(a => checkWeatherAlerts(a));
        
        // Refresh charts
        Object.keys(charts).forEach(agentId => {
            renderAgentChart(agentId);
        });
    });
    
    // Initial setup
    updateSimValues();
    updateSimulatorTargets();
}

// Update target options in simulator select dropdown
function updateSimulatorTargets() {
    const simTargetSelect = document.getElementById('simTargetSelect');
    if (!simTargetSelect) return;
    
    const currentSel = simTargetSelect.value;
    
    simTargetSelect.innerHTML = '<option value="all">All Deployed Agents</option>';
    state.agents.forEach(agent => {
        const opt = document.createElement('option');
        opt.value = agent.id;
        opt.textContent = `${agent.name} (${agent.locationName})`;
        if (currentSel === agent.id) {
            opt.selected = true;
        }
        simTargetSelect.appendChild(opt);
    });
}

// Setup Browser Notifications and Webhook Controls
function setupNotifications() {
    const pushToggle = document.getElementById('pushToggle');
    const webhookUrlInput = document.getElementById('webhookUrlInput');
    const webhookTestBtn = document.getElementById('webhookTestBtn');
    
    // Set initial values
    if (pushToggle) {
        pushToggle.checked = isPushEnabled;
        updatePushStatusLabel();
    }
    if (webhookUrlInput) {
        webhookUrlInput.value = webhookUrl;
    }
    
    // Toggle push notifications
    if (pushToggle) {
        pushToggle.addEventListener('change', async (e) => {
            isPushEnabled = e.target.checked;
            if (isPushEnabled) {
                if (!("Notification" in window)) {
                    alert("이 브라우저는 웹 푸시 알림을 지원하지 않습니다.");
                    pushToggle.checked = false;
                    isPushEnabled = false;
                } else if (Notification.permission === "default") {
                    const permission = await Notification.requestPermission();
                    if (permission !== "granted") {
                        pushToggle.checked = false;
                        isPushEnabled = false;
                        addLog('SYSTEM', '웹 알림 권한이 거부되었습니다.', 'warning-line');
                    } else {
                        addLog('SYSTEM', '웹 알림 권한이 허용되었습니다.', 'system-line');
                        sendBrowserNotification("NimbusShield", "알림 서비스가 정상 활성화되었습니다.");
                    }
                } else if (Notification.permission === "denied") {
                    alert("알림 권한이 거부되어 있습니다. 브라우저 설정에서 알림 권한을 승인해주세요.");
                    pushToggle.checked = false;
                    isPushEnabled = false;
                } else {
                    addLog('SYSTEM', '웹 알림 서비스가 활성화되었습니다.', 'system-line');
                    sendBrowserNotification("NimbusShield", "알림 서비스가 정상 활성화되었습니다.");
                }
            } else {
                addLog('SYSTEM', '웹 알림 서비스가 비활성화되었습니다.', 'system-line');
            }
            updatePushStatusLabel();
            saveState();
        });
    }
    
    // Webhook URL input change
    if (webhookUrlInput) {
        webhookUrlInput.addEventListener('input', (e) => {
            webhookUrl = e.target.value.trim();
            saveState();
        });
    }
    
    // Webhook test send button
    if (webhookTestBtn) {
        webhookTestBtn.addEventListener('click', async () => {
            if (!webhookUrl) {
                alert("웹훅 수신 URL을 먼저 입력해주세요.");
                return;
            }
            
            webhookTestBtn.disabled = true;
            webhookTestBtn.textContent = "Sending...";
            
            const success = await sendWebhookNotification(`🚨 *[NimbusShield]* Webhook 테스트 전송 성공! (Location: Command Center)`);
            
            webhookTestBtn.disabled = false;
            webhookTestBtn.textContent = "Test Send";
            
            if (success) {
                addLog('SYSTEM', '테스트 웹훅 메시지를 성공적으로 발송했습니다.', 'system-line');
                alert("테스트 웹훅 메시지가 성공적으로 발송되었습니다!");
            } else {
                addLog('SYSTEM', '테스트 웹훅 발송 실패. URL을 확인해 주세요.', 'error-line');
                alert("테스트 웹훅 발송에 실패했습니다. 올바른 URL인지 확인해주세요.");
            }
        });
    }
}

// Update push permission status label text
function updatePushStatusLabel() {
    const pushStatus = document.getElementById('pushStatus');
    if (!pushStatus) return;
    
    if (!("Notification" in window)) {
        pushStatus.textContent = "Not Supported";
        pushStatus.style.color = "var(--accent-danger)";
    } else if (Notification.permission === "granted") {
        pushStatus.textContent = isPushEnabled ? "Active" : "Granted";
        pushStatus.style.color = isPushEnabled ? "var(--accent-emerald)" : "var(--text-secondary)";
    } else if (Notification.permission === "denied") {
        pushStatus.textContent = "Blocked";
        pushStatus.style.color = "var(--accent-danger)";
    } else {
        pushStatus.textContent = isPushEnabled ? "Active" : "Default";
        pushStatus.style.color = "var(--text-muted)";
    }
}

// Send browser HTML5 notification
function sendBrowserNotification(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        try {
            new Notification(title, {
                body: body,
                icon: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"
            });
        } catch (e) {
            console.error("Failed to trigger Notification", e);
        }
    }
}

// Send Slack/Discord compatible Webhook payload
async function sendWebhookNotification(message) {
    if (!webhookUrl) return false;
    try {
        const payload = {
            text: message,
            content: message
        };
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        return res.ok;
    } catch (e) {
        console.error("Webhook fetch failed", e);
        return false;
    }
}

// Evaluate warnings for a target agent
function checkWeatherAlerts(agent) {
    const weather = getAgentDisplayWeather(agent);
    if (!weather || weather.tempMin === null || weather.tempMin === undefined) return;
    
    // Only verify warnings for active agents
    if (!agent.isActive) return;
    
    const warnings = [];
    
    if (weather.tempMax >= 35.0) {
        warnings.push({ type: 'Heatwave', label: 'Heatwave (폭염 경보)', msg: `🌡️ Air Temperature reached ${weather.tempMax}°C` });
    }
    if (weather.tempMin <= -12.0) {
        warnings.push({ type: 'Coldwave', label: 'Coldwave (한파 경보)', msg: `🥶 Air Temperature fell to ${weather.tempMin}°C` });
    }
    if (weather.wind >= 12.0) {
        warnings.push({ type: 'StrongWind', label: 'Strong Wind (강풍 경보)', msg: `💨 Wind Speed reached ${weather.wind} m/s` });
    }
    if (weather.rain >= 20.0) {
        warnings.push({ type: 'HeavyRain', label: 'Heavy Rain (호우 경보)', msg: `🌧️ Daily Rain Sum reached ${weather.rain} mm` });
    }
    if (weather.waveHeight !== null && weather.waveHeight !== undefined && weather.waveHeight >= 3.0) {
        warnings.push({ type: 'HighWaves', label: 'High Waves (풍랑 경보)', msg: `🌊 Wave Height reached ${weather.waveHeight} m` });
    }
    
    const activeTypes = new Set(warnings.map(w => w.type));
    
    // Dispatch new alerts
    warnings.forEach(w => {
        const alertKey = `${agent.id}_${w.type}`;
        if (!activeAlerts[alertKey]) {
            activeAlerts[alertKey] = true;
            
            const logMsg = `[ALERT] ${agent.name}: ${w.label} - ${w.msg}`;
            addLog(agent.name, logMsg, 'error-line');
            
            if (isPushEnabled) {
                sendBrowserNotification(`🚨 NimbusShield: ${agent.name}`, `${w.label}\n${w.msg}`);
            }
            if (webhookUrl) {
                sendWebhookNotification(`🚨 *[NimbusShield Alert]* **${agent.name}** (${agent.locationName})\n**${w.label}**\n${w.msg}`);
            }
        }
    });
    
    // Clean up resolved alerts
    Object.keys(activeAlerts).forEach(alertKey => {
        if (alertKey.startsWith(agent.id + '_')) {
            const type = alertKey.replace(agent.id + '_', '');
            if (!activeTypes.has(type)) {
                delete activeAlerts[alertKey];
                
                let resolvedLabel = '';
                if (type === 'Heatwave') resolvedLabel = 'Heatwave (폭염 경보) 해제';
                if (type === 'Coldwave') resolvedLabel = 'Coldwave (한파 경보) 해제';
                if (type === 'StrongWind') resolvedLabel = 'Strong Wind (강풍 경보) 해제';
                if (type === 'HeavyRain') resolvedLabel = 'Heavy Rain (호우 경보) 해제';
                if (type === 'HighWaves') resolvedLabel = 'High Waves (풍랑 경보) 해제';
                
                const logMsg = `[RESOLVED] ${agent.name}: ${resolvedLabel}`;
                addLog(agent.name, logMsg, 'check-line');
                
                if (isPushEnabled) {
                    sendBrowserNotification(`🟢 NimbusShield: ${agent.name} Resolved`, resolvedLabel);
                }
                if (webhookUrl) {
                    sendWebhookNotification(`🟢 *[NimbusShield Resolved]* **${agent.name}**\n${resolvedLabel}`);
                }
            }
        }
    });
}

// Toggle historical comparison drawer inline in the agent card
function toggleAgentHistory(agentId) {
    const drawer = document.getElementById(`history_drawer_${agentId}`);
    if (!drawer) return;
    
    const isHidden = drawer.classList.contains('hidden');
    
    // Close other drawers to keep layout clean
    document.querySelectorAll('.history-drawer').forEach(el => {
        if (el.id !== `history_drawer_${agentId}`) {
            el.classList.add('hidden');
        }
    });
    
    // Also close chart drawers to avoid vertical clutter
    document.querySelectorAll('.chart-drawer').forEach(el => {
        el.classList.add('hidden');
        const chartId = el.id.replace('chart_drawer_', '');
        if (charts[chartId]) {
            charts[chartId].destroy();
            delete charts[chartId];
        }
    });
    
    if (isHidden) {
        drawer.classList.remove('hidden');
        renderAgentHistory(agentId);
    } else {
        drawer.classList.add('hidden');
    }
}

// Render historical comparison inside the card drawer
async function renderAgentHistory(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    
    const select = document.getElementById(`history_year_select_${agentId}`);
    const content = document.getElementById(`history_content_${agentId}`);
    if (!select || !content) return;
    
    const yearOffset = parseInt(select.value);
    
    // Calculate past date based on targetDate (YYYY-MM-DD)
    const targetDateStr = agent.targetDate; // e.g. "2026-06-15"
    const parts = targetDateStr.split('-');
    if (parts.length !== 3) {
        content.innerHTML = `<span style="color: var(--accent-danger);">Invalid target date format.</span>`;
        return;
    }
    
    const targetYear = parseInt(parts[0]);
    const month = parts[1];
    const day = parts[2];
    const pastYear = targetYear - yearOffset;
    const pastDateStr = `${pastYear}-${month}-${day}`;
    
    // Initialize history cache on agent if not present
    if (!agent.history) {
        agent.history = {};
    }
    
    // Check cache first
    if (agent.history[yearOffset] && agent.history[yearOffset].date === pastDateStr) {
        displayHistoryComparison(agent, yearOffset, pastYear);
        return;
    }
    
    // Loading State
    content.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 80px;">
            <svg class="icon-sync spinning" viewBox="0 0 24 24" fill="none" stroke="var(--accent-pink)" stroke-width="2" style="width: 20px; height: 20px;">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span style="color: var(--text-muted); font-size: 0.7rem;">Loading past actuals for ${pastDateStr}...</span>
        </div>
    `;
    
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${agent.latitude}&longitude=${agent.longitude}&start_date=${pastDateStr}&end_date=${pastDateStr}&daily=temperature_2m_max,temperature_2m_min,rain_sum,wind_speed_10m_max&timezone=auto&wind_speed_unit=ms`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        const data = await res.json();
        
        let tempMax = null;
        let tempMin = null;
        let wind = null;
        let rain = null;
        
        if (data.daily && data.daily.time && data.daily.time.length > 0) {
            tempMax = data.daily.temperature_2m_max[0];
            tempMin = data.daily.temperature_2m_min[0];
            wind = data.daily.wind_speed_10m_max[0];
            rain = data.daily.rain_sum[0];
        }
        
        // Cache it
        agent.history[yearOffset] = {
            date: pastDateStr,
            tempMax,
            tempMin,
            wind,
            rain
        };
        
        saveState();
        displayHistoryComparison(agent, yearOffset, pastYear);
        
    } catch (e) {
        console.error("Failed to load historical weather", e);
        content.innerHTML = `
            <div style="color: var(--accent-danger); font-size: 0.72rem; text-align: center; width: 100%;">
                ⚠️ Failed to load historical archive.<br>
                <span style="font-size: 0.65rem; color: var(--text-muted);">Data for ${pastDateStr} may not be available.</span>
            </div>
        `;
    }
}

// Draw comparison tables and delta badges
function displayHistoryComparison(agent, yearOffset, pastYear) {
    const content = document.getElementById(`history_content_${agent.id}`);
    if (!content) return;
    
    const past = agent.history[yearOffset];
    const current = getAgentDisplayWeather(agent);
    
    if (!past || past.tempMax === null || past.tempMin === null) {
        content.innerHTML = `<span style="color: var(--text-muted); font-size: 0.72rem;">No historical records found for this coordinate on ${past.date || 'past date'}.</span>`;
        return;
    }
    
    // Calculations & delta styling helper
    const getDeltaBadge = (currVal, pastVal, type) => {
        if (currVal === null || currVal === undefined || pastVal === null || pastVal === undefined) {
            return `<span class="delta-badge neutral">--</span>`;
        }
        const delta = currVal - pastVal;
        const sign = delta > 0 ? '+' : '';
        
        if (type === 'temp') {
            if (Math.abs(delta) < 0.2) return `<span class="delta-badge neutral">~0.0°C</span>`;
            if (delta > 0) return `<span class="delta-badge warmer">▲ ${sign}${delta.toFixed(1)}°C (Warmer)</span>`;
            return `<span class="delta-badge colder">▼ ${delta.toFixed(1)}°C (Colder)</span>`;
        } else if (type === 'wind') {
            if (Math.abs(delta) < 0.2) return `<span class="delta-badge neutral">~0.0 m/s</span>`;
            if (delta > 0) return `<span class="delta-badge warmer">▲ ${sign}${delta.toFixed(1)} m/s (Windier)</span>`;
            return `<span class="delta-badge colder">▼ ${delta.toFixed(1)} m/s (Calmer)</span>`;
        } else if (type === 'rain') {
            if (Math.abs(delta) < 0.1) return `<span class="delta-badge neutral">~0.0 mm</span>`;
            if (delta > 0) return `<span class="delta-badge warmer">▲ ${sign}${delta.toFixed(1)} mm (Wetter)</span>`;
            return `<span class="delta-badge colder">▼ ${delta.toFixed(1)} mm (Drier)</span>`;
        }
        return '';
    };
    
    const formatVal = (val, unit) => val !== null && val !== undefined ? `${val}${unit}` : '--';
    
    content.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
            <div style="font-size: 0.68rem; color: var(--text-muted); text-align: right; margin-bottom: 2px;">
                Historical Date: ${past.date}
            </div>
            <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.8fr; gap: 6px 12px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; font-weight: 500;">
                <div style="color: var(--text-muted); font-size: 0.68rem;">Metric</div>
                <div style="color: var(--text-muted); font-size: 0.68rem; text-align: right;">${pastYear} vs 2026</div>
                <div style="color: var(--text-muted); font-size: 0.68rem; text-align: right;">Comparison Delta</div>
            </div>
            <!-- Temp Max -->
            <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.8fr; gap: 6px 12px; align-items: center;">
                <div style="font-weight: 500;">🌡️ Temp Max</div>
                <div style="text-align: right; font-family: 'JetBrains Mono', monospace;">${formatVal(past.tempMax, '°')} / ${formatVal(current.tempMax, '°')}</div>
                <div style="text-align: right;">${getDeltaBadge(current.tempMax, past.tempMax, 'temp')}</div>
            </div>
            <!-- Temp Min -->
            <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.8fr; gap: 6px 12px; align-items: center;">
                <div style="font-weight: 500;">🌡️ Temp Min</div>
                <div style="text-align: right; font-family: 'JetBrains Mono', monospace;">${formatVal(past.tempMin, '°')} / ${formatVal(current.tempMin, '°')}</div>
                <div style="text-align: right;">${getDeltaBadge(current.tempMin, past.tempMin, 'temp')}</div>
            </div>
            <!-- Max Wind -->
            <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.8fr; gap: 6px 12px; align-items: center;">
                <div style="font-weight: 500;">💨 Max Wind</div>
                <div style="text-align: right; font-family: 'JetBrains Mono', monospace;">${formatVal(past.wind, '')} / ${formatVal(current.wind, '')}</div>
                <div style="text-align: right;">${getDeltaBadge(current.wind, past.wind, 'wind')}</div>
            </div>
            <!-- Rain Sum -->
            <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.8fr; gap: 6px 12px; align-items: center;">
                <div style="font-weight: 500;">🌧️ Rain Sum</div>
                <div style="text-align: right; font-family: 'JetBrains Mono', monospace;">${formatVal(past.rain, '')} / ${formatVal(current.rain, '')}</div>
                <div style="text-align: right;">${getDeltaBadge(current.rain, past.rain, 'rain')}</div>
            </div>
        </div>
    `;
}

// Convert degree angle to cardinal direction (N, NE, E, etc.)
function getCardinalDirection(angle) {
    if (angle === null || angle === undefined) return '--';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(angle / 22.5) % 16;
    return directions[index];
}

// Toggle hourly chart drawer inline in the agent card
function toggleAgentChart(agentId) {
    const drawer = document.getElementById(`chart_drawer_${agentId}`);
    if (!drawer) return;
    
    const isHidden = drawer.classList.contains('hidden');
    
    // Close other drawers to keep layout clean
    document.querySelectorAll('.chart-drawer').forEach(el => {
        if (el.id !== `chart_drawer_${agentId}`) {
            el.classList.add('hidden');
            const otherId = el.id.replace('chart_drawer_', '');
            if (charts[otherId]) {
                charts[otherId].destroy();
                delete charts[otherId];
            }
        }
    });
    
    if (isHidden) {
        drawer.classList.remove('hidden');
        renderAgentChart(agentId);
    } else {
        drawer.classList.add('hidden');
        if (charts[agentId]) {
            charts[agentId].destroy();
            delete charts[agentId];
        }
    }
}

// Render hourly trend using Chart.js on the canvas context
function renderAgentChart(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    
    const canvas = document.getElementById(`canvas_${agentId}`);
    if (!canvas) return;
    
    if (charts[agentId]) {
        charts[agentId].destroy();
    }
    
    const ctx = canvas.getContext('2d');
    
    const displayWeather = getAgentDisplayWeather(agent);
    const hours = displayWeather.hourlyHours || [];
    const temps = displayWeather.hourlyTemp || [];
    const winds = displayWeather.hourlyWind || [];
    const waves = displayWeather.hourlyWaveHeight || [];
    
    if (temps.length === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '12px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No hourly telemetry loaded. Sync required.', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Format hours label to HH:MM format
    const formattedLabels = hours.map(h => {
        const parts = h.split('T');
        return parts[1] || h;
    });
    
    const datasets = [
        {
            label: 'Temp (°C)',
            data: temps,
            borderColor: '#00d2ff',
            backgroundColor: 'rgba(0, 210, 255, 0.05)',
            borderWidth: 2,
            tension: 0.35,
            yAxisID: 'y'
        },
        {
            label: 'Wind (m/s)',
            data: winds,
            borderColor: '#ffb300',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [3, 3],
            tension: 0.35,
            yAxisID: 'y1'
        }
    ];
    
    const hasMarine = waves.some(w => w !== null && w !== undefined);
    if (hasMarine) {
        datasets.push({
            label: 'Wave (m)',
            data: waves,
            borderColor: '#05ffa1',
            backgroundColor: 'rgba(5, 255, 161, 0.05)',
            borderWidth: 2,
            tension: 0.35,
            yAxisID: 'y2'
        });
    }
    
    const yAxes = {
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: {
                color: 'rgba(255, 255, 255, 0.04)'
            },
            ticks: {
                color: 'rgba(255, 255, 255, 0.5)',
                font: { size: 8 }
            }
        },
        y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: {
                drawOnChartArea: false
            },
            ticks: {
                color: 'rgba(255, 255, 255, 0.5)',
                font: { size: 8 }
            }
        }
    };
    
    if (hasMarine) {
        yAxes.y2 = {
            type: 'linear',
            display: true,
            position: 'right',
            grid: {
                drawOnChartArea: false
            },
            ticks: {
                color: 'rgba(5, 255, 161, 0.6)',
                font: { size: 8 }
            }
        };
    }
    
    charts[agentId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        boxWidth: 6,
                        font: { size: 8 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(16, 20, 30, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: 'rgba(255, 255, 255, 0.8)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 4,
                    padding: 6,
                    titleFont: { size: 9 },
                    bodyFont: { size: 9 }
                }
            },
            scales: yAxes
        }
    });
}

// RENDER PROCEDURES

function renderAll() {
    // Note: there are two elements with filter-tab active class now because of the view switcher
    // We select the one with dataset.filter explicitly.
    const activeFilterTab = document.querySelector('.filter-tab.active[data-filter]');
    const activeFilter = activeFilterTab ? activeFilterTab.dataset.filter : 'all';
    
    renderAgentsGrid(activeFilter);
    updateMapMarkers(activeFilter);
    renderLogs();
    updateSimulatorTargets();
    
    document.getElementById('agentCount').textContent = state.agents.length;
}

// Toggle grid and map layouts
function toggleView(view) {
    if (view === currentView) return;
    currentView = view;
    
    const gridBtn = document.getElementById('viewGridBtn');
    const mapBtn = document.getElementById('viewMapBtn');
    const gridContainer = document.getElementById('agentsGrid');
    const mapContainer = document.getElementById('agentsMapContainer');
    
    if (view === 'grid') {
        gridBtn.classList.add('active');
        mapBtn.classList.remove('active');
        gridContainer.classList.remove('hidden');
        mapContainer.classList.add('hidden');
    } else {
        mapBtn.classList.add('active');
        gridBtn.classList.remove('active');
        gridContainer.classList.add('hidden');
        mapContainer.classList.remove('hidden');
        
        // Lazy initialize the map when toggled first time
        initMap();
        
        // Allow Leaflet to read the newly visible container dimensions
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
                fitMapBounds();
            }
        }, 50);
    }
    
    renderAll();
}

// Center of South Korea base map using CartoDB Dark Matter tiles
function initMap() {
    if (map) return;
    
    map = L.map('map', {
        zoomControl: true,
        attributionControl: true
    }).setView([36.2, 127.8], 7);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
    
    markersGroup = L.layerGroup().addTo(map);
}

// Zoom map to fit active/rendered agent boundary
function fitMapBounds() {
    if (!map || state.agents.length === 0) return;
    
    const activeFilterTab = document.querySelector('.filter-tab.active[data-filter]');
    const activeFilter = activeFilterTab ? activeFilterTab.dataset.filter : 'all';
    
    let filteredAgents = [...state.agents];
    if (activeFilter === 'active') {
        filteredAgents = filteredAgents.filter(a => a.isActive);
    } else if (activeFilter === 'paused') {
        filteredAgents = filteredAgents.filter(a => !a.isActive);
    }
    
    if (filteredAgents.length === 0) return;
    
    const bounds = L.latLngBounds(filteredAgents.map(a => [a.latitude, a.longitude]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
}

// Update Leaflet map circle markers based on current states
function updateMapMarkers(filter = 'all') {
    if (!map || !markersGroup) return;
    
    markersGroup.clearLayers();
    
    let filteredAgents = [...state.agents];
    if (filter === 'active') {
        filteredAgents = filteredAgents.filter(a => a.isActive);
    } else if (filter === 'paused') {
        filteredAgents = filteredAgents.filter(a => !a.isActive);
    }
    
    filteredAgents.forEach(agent => {
        const displayWeather = getAgentDisplayWeather(agent);
        const tempMinVal = displayWeather.tempMin !== null && displayWeather.tempMin !== undefined ? `${displayWeather.tempMin}°C` : '--';
        const tempMaxVal = displayWeather.tempMax !== null && displayWeather.tempMax !== undefined ? `${displayWeather.tempMax}°C` : '--';
        const tempVal = displayWeather.tempMin !== null && displayWeather.tempMax !== null ? `${tempMinVal} ~ ${tempMaxVal}` : '--';
        const windVal = displayWeather.wind !== null && displayWeather.wind !== undefined ? `${displayWeather.wind} m/s` : '--';
        const rainVal = displayWeather.rain !== null && displayWeather.rain !== undefined ? `${displayWeather.rain} mm` : '--';
        const seaTempVal = displayWeather.seaTemp !== null && displayWeather.seaTemp !== undefined ? `${displayWeather.seaTemp}°C` : '--';
        
        const waveHeightVal = displayWeather.waveHeight !== null && displayWeather.waveHeight !== undefined ? `${displayWeather.waveHeight}m` : '--';
        const wavePeriodVal = displayWeather.wavePeriod !== null && displayWeather.wavePeriod !== undefined ? `${displayWeather.wavePeriod}s` : '--';
        const waveDirVal = displayWeather.waveDirection !== null && displayWeather.waveDirection !== undefined ? `${getCardinalDirection(displayWeather.waveDirection)}` : '--';
        
        const hasMarineData = displayWeather.seaTemp !== null || displayWeather.waveHeight !== null || displayWeather.wavePeriod !== null;
        
        let marinePopupHtml = '';
        if (hasMarineData) {
            marinePopupHtml = `
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 0.72rem; color: var(--accent-emerald);">
                    <div style="font-weight: 600; margin-bottom: 4px;">🌊 Marine Telemetry</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        <div>SST: <span style="font-weight: 600; color: var(--text-primary);">${seaTempVal}</span></div>
                        <div>Wave: <span style="font-weight: 600; color: var(--text-primary);">${waveHeightVal}</span></div>
                        <div style="grid-column: span 2;">Wave Period/Dir: <span style="font-weight: 600; color: var(--text-primary);">${wavePeriodVal !== '--' && waveDirVal !== '--' ? `${wavePeriodVal} / ${waveDirVal}` : '--'}</span></div>
                    </div>
                </div>
            `;
        }
        
        let color = '#05ffa1'; // green
        let statusDotClass = 'green';
        if (!agent.isActive) {
            color = '#ff3366'; // red
            statusDotClass = 'red';
        } else if (agent.isError) {
            color = '#ffb300'; // yellow
            statusDotClass = 'yellow';
        }
        
        const marker = L.circleMarker([agent.latitude, agent.longitude], {
            radius: 8,
            fillColor: color,
            color: '#ffffff',
            weight: 1.5,
            opacity: 0.9,
            fillOpacity: 0.95
        });
        
        const popupHtml = `
            <div class="map-popup-card">
                <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; color: var(--text-primary);">
                    <span class="status-dot ${statusDotClass}" style="width: 8px; height: 8px; display: inline-block; border-radius: 50%;"></span>
                    ${agent.name}
                </div>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 8px;">
                    ${agent.locationName} (${agent.latitude.toFixed(3)}, ${agent.longitude.toFixed(3)})
                </div>
                <div style="font-size: 0.78rem; margin-bottom: 8px; font-weight: 500; color: var(--accent-blue);">
                    Target Date: ${agent.targetDate}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.75rem; color: var(--text-secondary);">
                    <div>🌡️ Air: <span style="font-weight: 600; color: var(--text-primary);">${tempVal}</span></div>
                    <div>🌧️ Rain: <span style="font-weight: 600; color: var(--text-primary);">${rainVal}</span></div>
                    <div style="grid-column: span 2;">💨 Wind: <span style="font-weight: 600; color: var(--text-primary);">${windVal}</span></div>
                </div>
                ${marinePopupHtml}
                <div style="display: flex; gap: 6px; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; margin-top: 8px;">
                    <button onclick="syncSingleAgentWeather('${agent.id}')" style="background: rgba(0, 210, 255, 0.1); border: 1px solid var(--accent-blue-glow); color: var(--accent-blue); padding: 3px 8px; border-radius: var(--radius-sm); font-size: 0.72rem; cursor: pointer; border: 1px solid var(--accent-blue-glow);">
                        Sync
                    </button>
                    <button onclick="toggleAgentActive('${agent.id}')" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); color: var(--text-primary); padding: 3px 8px; border-radius: var(--radius-sm); font-size: 0.72rem; cursor: pointer; border: 1px solid var(--border-color);">
                        ${agent.isActive ? 'Pause' : 'Resume'}
                    </button>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupHtml);
        markersGroup.addLayer(marker);
    });
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
        if (!agent.isActive) {
            statusBadgeHtml = `<span class="status-dot red" title="Paused"></span>`;
        } else if (agent.isError) {
            statusBadgeHtml = `<span class="status-dot yellow" title="Telemetry offline"></span>`;
        } else {
            statusBadgeHtml = `<span class="status-dot green pulse" title="Active"></span>`;
        }
        
        // Format daily forecast weather metrics
        const displayWeather = getAgentDisplayWeather(agent);
        const tempMinVal = displayWeather.tempMin !== null && displayWeather.tempMin !== undefined ? `${displayWeather.tempMin}°C` : '--';
        const tempMaxVal = displayWeather.tempMax !== null && displayWeather.tempMax !== undefined ? `${displayWeather.tempMax}°C` : '--';
        const tempVal = displayWeather.tempMin !== null && displayWeather.tempMax !== null ? `${tempMinVal} ~ ${tempMaxVal}` : '--';
        const windVal = displayWeather.wind !== null && displayWeather.wind !== undefined ? `${displayWeather.wind} m/s` : '--';
        const rainVal = displayWeather.rain !== null && displayWeather.rain !== undefined ? `${displayWeather.rain} mm` : '--';
        const seaTempVal = displayWeather.seaTemp !== null && displayWeather.seaTemp !== undefined ? `${displayWeather.seaTemp}°C` : '--';
        
        const waveHeightVal = displayWeather.waveHeight !== null && displayWeather.waveHeight !== undefined ? `${displayWeather.waveHeight} m` : '--';
        const wavePeriodVal = displayWeather.wavePeriod !== null && displayWeather.wavePeriod !== undefined ? `${displayWeather.wavePeriod} s` : '--';
        const waveDirVal = displayWeather.waveDirection !== null && displayWeather.waveDirection !== undefined ? `${getCardinalDirection(displayWeather.waveDirection)} (${displayWeather.waveDirection}°)` : '--';
        
        const hasMarineData = displayWeather.seaTemp !== null || displayWeather.waveHeight !== null || displayWeather.wavePeriod !== null;
        
        let marineSectionHtml = '';
        if (hasMarineData) {
            marineSectionHtml = `
                <div class="marine-telemetry-section" style="margin-top: 12px; border-top: 1px dashed rgba(255, 255, 255, 0.12); padding-top: 12px;">
                    <div style="font-size: 0.78rem; color: var(--accent-emerald); font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2" style="width: 14px; height: 14px;">
                            <path d="M2 12h20M2 16h20M2 8h20"/>
                        </svg>
                        Marine Telemetry
                    </div>
                    <div class="weather-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div class="stat-box" style="border-color: rgba(5, 255, 161, 0.25);">
                            <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                            </svg>
                            <div class="stat-value" style="color: var(--accent-emerald);">${seaTempVal}</div>
                            <div class="stat-label">Sea Temp</div>
                        </div>
                        <div class="stat-box" style="border-color: rgba(5, 255, 161, 0.25);">
                            <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2">
                                <path d="M12 3v18M12 3l-4 4M12 3l4 4M12 21l-4-4M12 21l4-4"/>
                            </svg>
                            <div class="stat-value" style="color: var(--accent-emerald);">${waveHeightVal}</div>
                            <div class="stat-label">Wave Height</div>
                        </div>
                        <div class="stat-box" style="border-color: rgba(5, 255, 161, 0.25); grid-column: span 2;">
                            <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polygon points="12 6 15 15 12 12 9 15 12 6"/>
                            </svg>
                            <div class="stat-value" style="color: var(--accent-emerald); font-size: 0.82rem;">${wavePeriodVal !== '--' && waveDirVal !== '--' ? `${wavePeriodVal} / ${waveDirVal}` : '--'}</div>
                            <div class="stat-label">Wave Period / Direction</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        const isSimulated = isSimulationMode && (simTargetAgentId === 'all' || simTargetAgentId === agent.id);
        const simBadgeHtml = isSimulated ? `<span style="font-size: 0.65rem; color: var(--accent-blue); border: 1px solid var(--accent-blue-glow); padding: 1px 4px; border-radius: 3px; font-weight: 500; text-transform: uppercase; margin-left: 4px; flex-shrink: 0; background: rgba(0, 210, 255, 0.05);">SIM</span>` : '';

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
                            ${simBadgeHtml}
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
                    
                    <div class="stat-box" style="grid-column: span 2;">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
                        </svg>
                        <div class="stat-value">${windVal}</div>
                        <div class="stat-label">Max Wind</div>
                    </div>
                </div>
                ${marineSectionHtml}
                
                <!-- Hourly Trend Chart Drawer -->
                <div id="chart_drawer_${agent.id}" class="chart-drawer hidden" style="margin-top: 14px; border-top: 1px dashed rgba(255, 255, 255, 0.12); padding-top: 12px; height: 180px; position: relative;">
                    <div style="font-size: 0.76rem; color: var(--accent-blue); font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" style="width: 14px; height: 14px;">
                                <path d="M3 3v18h18" />
                                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                            </svg>
                            Hourly Trend Chart
                        </span>
                        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 400;">24 Hours</span>
                    </div>
                    <div style="width: 100%; height: 140px;">
                        <canvas id="canvas_${agent.id}"></canvas>
                    </div>
                </div>

                <!-- Historical Comparison Drawer -->
                <div id="history_drawer_${agent.id}" class="history-drawer hidden" style="margin-top: 14px; border-top: 1px dashed rgba(255, 255, 255, 0.12); padding-top: 12px; position: relative;">
                    <div style="font-size: 0.76rem; color: var(--accent-pink); font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-pink)" stroke-width="2" style="width: 14px; height: 14px;">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                            </svg>
                            Historical Comparison
                        </span>
                        <select id="history_year_select_${agent.id}" onchange="renderAgentHistory('${agent.id}')" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--text-primary); font-size: 0.68rem; padding: 2px 4px; border-radius: var(--radius-sm); font-family: inherit; outline: none; border: 1px solid var(--border-color);">
                            <option value="1">1 Year Ago</option>
                            <option value="2">2 Years Ago</option>
                            <option value="3">3 Years Ago</option>
                        </select>
                    </div>
                    <div id="history_content_${agent.id}" style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; min-height: 80px; display: flex; align-items: center; justify-content: center; width: 100%;">
                        <span style="color: var(--text-muted); font-size: 0.72rem;">Click history button to compare with past years.</span>
                    </div>
                </div>
            </div>
            
            <div class="agent-card-footer">
                <span class="agent-last-check">Sync: ${agent.lastChecked || 'Never'}</span>
                <div class="card-actions">
                    <button class="action-btn btn-chart" title="View Hourly Chart" onclick="toggleAgentChart('${agent.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3v18h18" />
                            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                        </svg>
                    </button>
                    <button class="action-btn btn-history" title="Compare with History" onclick="toggleAgentHistory('${agent.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </button>
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
