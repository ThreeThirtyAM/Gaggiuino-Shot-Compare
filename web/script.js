// =====================================================================================
// Gaggiuino Shot Compare - Frontend Logic (script.js)
// =====================================================================================
// This file contains all the JavaScript logic for the user interface.
// It handles user interactions, calls the Python backend (via Eel),
// fetches data, and renders the shot list and charts on the page.
// =====================================================================================

// --- SVG Icons ---
const settingsIconSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.44,0.17-0.48,0.41L9.22,5.22C8.63,5.46,8.1,5.78,7.6,6.16L5.22,5.2C5,5.12,4.75,5.19,4.63,5.41L2.71,8.73 c-0.12,0.2-0.07,0.47,0.12,0.61l2.03,1.58C4.8,11.36,4.78,11.68,4.78,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.38,2.41 c0.04,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.48-0.41l0.38-2.41c0.59-0.24,1.12-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0.01,0.59-0.22l1.92-3.32c0.12-0.2,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`;
const darkIconSVG =  `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M7 7C6.453125 7 6 7.421875 6 7.96875C5.996094 17.171875 9.894531 29.988281 11.90625 36L33.09375 36C33.386719 35.117188 33.738281 34.050781 34.09375 32.90625C34.769531 32.777344 37.65625 32.179688 40.71875 30.8125C42.457031 30.035156 44.242188 29.042969 45.625 27.6875C47.007813 26.332031 48 24.5625 48 22.46875C48 18.910156 45.089844 16 41.53125 16C40.300781 16 39.109375 16.34375 38.09375 16.9375C38.640625 13.804688 39 10.703125 39 7.96875C39 7.421875 38.546875 7 38 7 Z M 41.53125 18C44.011719 18 46 19.988281 46 22.46875C46 23.9375 45.339844 25.148438 44.21875 26.25C43.097656 27.351563 41.507813 28.285156 39.90625 29C37.894531 29.898438 35.976563 30.449219 34.75 30.75C35.652344 27.710938 36.589844 24.152344 37.375 20.5C37.378906 20.488281 37.402344 20.480469 37.40625 20.46875C37.40625 20.457031 37.40625 20.449219 37.40625 20.4375C38.125 19.027344 39.785156 18 41.53125 18 Z M 3 38C2.59375 38 2.21875 38.25 2.0625 38.625C1.90625 39 1.996094 39.433594 2.28125 39.71875L4.5625 41.96875C6.511719 43.917969 9.121094 45 11.875 45L33.125 45C35.882813 45 38.488281 43.917969 40.4375 41.96875L42.71875 39.71875C43.003906 39.433594 43.09375 39 42.9375 38.625C42.785156 38.25 42.402344 38 42 38Z" /></svg>`;

// --- Global State & Configuration ---
let gaggiuinoUrl;
let maxCharts;
const SHOTS_PER_PAGE = 12;
const DEBOUNCE_DELAY_MS = 250;

let shots = [];
let shotHistory = [];
let currentLimit = SHOTS_PER_PAGE;
let isLoading = false;
let charts = {};
let feedbackTimeout;
let debounceTimeout;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initializeTheme();
    setupEventListeners();
    loadShotHistory();
});


// --- Settings Management ---
function loadSettings() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    gaggiuinoUrl = localStorage.getItem('gaggiuinoUrl') || 'http://gaggiuino.local';
    maxCharts = parseInt(localStorage.getItem('maxCharts'), 10) || 3;

    // Inform the backend of the initial URL from localStorage.
    // This ensures the backend and frontend are in sync from the start.
    eel.update_gaggiuino_url(gaggiuinoUrl)();

    document.body.className = savedTheme === 'dark' ? 'dark-mode' : '';
}

function openSettings() {
    document.getElementById('theme-toggle-switch').checked = document.body.classList.contains('dark-mode');
    document.getElementById('gaggiuino-url-input').value = gaggiuinoUrl;
    document.getElementById('max-charts-input').value = maxCharts;
    document.getElementById('settings-feedback').textContent = '';
    document.getElementById('settings-overlay').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settings-overlay').classList.add('hidden');
}

// This function is now async to await the backend URL update.
async function saveSettings() {
    const oldUrl = gaggiuinoUrl;
    
    const newTheme = document.getElementById('theme-toggle-switch').checked ? 'dark' : 'light';
    gaggiuinoUrl = document.getElementById('gaggiuino-url-input').value.trim() || 'http://gaggiuino.local';
    maxCharts = parseInt(document.getElementById('max-charts-input').value, 10) || 3;

    localStorage.setItem('theme', newTheme);
    localStorage.setItem('gaggiuinoUrl', gaggiuinoUrl);
    localStorage.setItem('maxCharts', maxCharts);

    document.body.className = newTheme === 'dark' ? 'dark-mode' : '';
    renderCharts();

    const feedback = document.getElementById('settings-feedback');
    feedback.textContent = 'Settings Saved!';
    setTimeout(() => { 
        feedback.textContent = '';
        closeSettings();
    }, 1500);

    // If the URL changed, update the backend and then reload data.
    if (oldUrl !== gaggiuinoUrl) {
        // Await the call to ensure backend is updated before fetching new data.
        await eel.update_gaggiuino_url(gaggiuinoUrl)();
        
        shots = [];
        shotHistory = [];
        charts = {};
        document.getElementById('chart-area').innerHTML = '';
        currentLimit = SHOTS_PER_PAGE;
        loadShotHistory();
    }
}

// --- Theme Management ---
function initializeTheme() {
    document.getElementById('settings-btn').innerHTML = settingsIconSVG;
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const newTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    renderCharts();
}

// --- Event Listeners and UI Handlers ---
function setupEventListeners() {
    makeResizable();
    document.getElementById('profile-filter').addEventListener('keyup', handleFilterInput);
    document.getElementById('clear-filter-btn').addEventListener('click', handleClearFilter);
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('settings-close-btn').addEventListener('click', closeSettings);
    document.getElementById('settings-save-btn').addEventListener('click', saveSettings);
    document.getElementById('theme-toggle-switch').addEventListener('change', toggleTheme);
    document.getElementById('settings-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'settings-overlay') closeSettings();
    });
}
    
function makeResizable() {
    const resizer = document.getElementById('resizer');
    const sidebar = document.querySelector('.sidebar');
    const resize = (e) => {
        let newWidth = e.clientX;
        if (newWidth < 220) newWidth = 220;
        if (newWidth > 600) newWidth = 600;
        sidebar.style.width = newWidth + 'px';
    };
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', () => window.removeEventListener('mousemove', resize), { once: true });
    });
}

function handleClearFilter() {
    const filterInput = document.getElementById('profile-filter');
    filterInput.value = '';
    applyFilterAndRender();
    filterInput.nextElementSibling.style.display = 'none';
    filterInput.focus();
}

// --- Data Loading and Handling ---
async function loadShotHistory() {
    if (isLoading) return;
    isLoading = true;
    
    const loadButton = document.getElementById('load-more-btn');
    if (loadButton) { loadButton.disabled = true; loadButton.textContent = 'Loading...'; }
    const listContainer = document.getElementById('shot-list');
    if (shotHistory.length === 0) listContainer.innerHTML = '<div class="loading">Connecting to Gaggiuino...</div>';
  
    try {
        const result = await eel.get_recent_shots(currentLimit)();
        if (result.success) {
            shotHistory = result.data;
        } else {
            showError(result.error || "Failed to load shots");
        }
    } catch (error) {
        showError(error.message || "Connection error");
    } finally {
        isLoading = false;
        applyFilterAndRender();
        const finalLoadButton = document.getElementById('load-more-btn');
        if (finalLoadBUtton) { finalLoadButton.disabled = false; finalLoadButton.textContent = 'Load More'; }
    }
}

async function loadMoreShots() {
    currentLimit += SHOTS_PER_PAGE;
    await loadShotHistory();
}

// --- User Feedback Functions ---
function showFeedbackMessage(message) {
    const feedbackDiv = document.getElementById('feedback-area');
    feedbackDiv.textContent = message;
    clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => { feedbackDiv.textContent = ''; }, 3000);
}

function showError(error) {
    document.getElementById('chart-area').innerHTML = `<div class="error-box">Error: ${error} <br><small>Please check the Gaggiuino URL in settings and ensure it's connected to WiFi.</small></div>`;
    const errorBoxStyle = document.createElement('style');
    errorBoxStyle.innerHTML = `.error-box { color: #c0504d; padding: 15px; background: var(--card-background); border: 1px solid var(--danger-color); border-radius: 4px; margin: 20px; text-align: center; }`;
    document.head.appendChild(errorBoxStyle);
    document.getElementById('shot-list').innerHTML = '<div class="loading"></div>';
}

// --- Filtering and Rendering Shot List ---
function handleFilterInput() {
    const filterInput = document.getElementById('profile-filter');
    filterInput.nextElementSibling.style.display = filterInput.value.length > 0 ? 'block' : 'none';
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(applyFilterAndRender, DEBOUNCE_DELAY_MS);
}

function applyFilterAndRender() {
    const filterText = document.getElementById('profile-filter').value.toLowerCase();
    const listToRender = shotHistory.filter(shot => (shot.profile_name || '').toLowerCase().includes(filterText));
    renderShotList(listToRender);
}

function renderShotList(listToRender) {
    const container = document.getElementById('shot-list');
    container.innerHTML = ''; 

    if (!listToRender.length) {
        container.innerHTML = `<div class="loading">${shotHistory.length === 0 ? 'Gaggiuino not found or no shots.' : 'No shots match filter.'}</div>`;
    } else {
        listToRender.forEach(shot => {
            const isActive = shots.some(s => s.id === shot.id);
            const item = document.createElement('div');
            item.className = 'shot-item';
            
            item.onclick = (event) => {
                const checkbox = item.querySelector('.shot-checkbox');
                if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
                toggleShotDisplay(shot.id, checkbox.checked);
            };
            
            item.innerHTML = `
                <input type="checkbox" class="shot-checkbox" ${isActive ? 'checked' : ''}>
                <div class="shot-info">
                    <div class="shot-details-row shot-details-header">
                        <span class="shot-id">#${shot.id}</span>
                        <span class="shot-profile">${shot.profile_name || 'Unknown'}</span>
                    </div>
                    <div class="shot-details-row shot-details-meta">
                        <span>${shot.duration_formatted || '00:00'}</span>
                        <span>${(shot.final_weight || 0).toFixed(1)}g</span>
                        <span>${shot.date || 'No date'}</span>
                    </div>
                </div>`;
            container.appendChild(item);
        });
    }
    container.insertAdjacentHTML('beforeend', `<div class="load-more-container"><button id="load-more-btn" class="load-more" onclick="loadMoreShots()">Load More</button></div>`);
}

// --- Chart Management and Rendering ---
async function toggleShotDisplay(shotId, show) {
    if (show) {
        if (shots.length >= maxCharts) {
            showFeedbackMessage(`Maximum of ${maxCharts} shots can be selected.`);
            applyFilterAndRender();
            return;
        }
        try {
            const result = await eel.get_shot_by_id(shotId)();
            if (result.success) {
                shots.push(result.data);
                renderCharts();
            } else { throw new Error(result.error); }
        } catch (error) {
            showError(error.message || `Failed to load shot ${shotId}`);
            applyFilterAndRender();
        }
    } else {
        shots = shots.filter(s => s.id !== shotId);
        renderCharts();
    }
}

function clearShot(shotIdToClear) {
    shots = shots.filter(s => s.id !== shotIdToClear);
    renderCharts();
    applyFilterAndRender();
}

// This function now calculates a common X-axis scale for all charts.
function renderCharts() {
    const container = document.getElementById('chart-area');
    container.innerHTML = '';
    
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};

    //    Find the maximum real duration among all selected shots.
    //    Math.max returns -Infinity for an empty array, so we default to 0.
    const maxDuration = Math.max(0, ...shots.map(s => s.real_duration));

    //    Calculate a common, clean upper limit for the x-axis.
    //    We round up to the nearest 5 seconds for a tidy-looking graph.
    //    A default of 30s is used if there are no shots or duration is 0.
    const commonXMax = Math.ceil((maxDuration || 30) / 5) * 5;

    shots.forEach((shot) => {
        const chartId = `chart-${shot.id}`;
        container.insertAdjacentHTML('beforeend', `
            <div class="chart-card">
                <div class="chart-header">
                    <span class="shot-id">#${shot.id}</span>
                    <span class="profile-name">${shot.profile_name}</span>
                    <span class="shot-date">${shot.date}</span>
                    <button class="close-btn" onclick="clearShot(${shot.id})">×</button>
                </div>
                <div class="chart-container"><canvas id="${chartId}"></canvas></div>
            </div>`);
        
        // Pass the calculated common axis maximum to the chart rendering function.
        renderSingleChart(shot, chartId, commonXMax);
    });
}

// This function accepts the commonXMax argument to set the X-axis scale.
function renderSingleChart(shot, canvasId, commonXMax) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    

    const datasets = [
        { label: 'Pressure (bar)', data: shot.pressure, borderColor: '#4a6fa5', borderWidth: 1.5, tension: 0.1, pointRadius: 0, yAxisID: 'y' },
        { data: shot.targetPressure, borderColor: '#4a6fa5', borderWidth: 1, borderDash: [5, 5], pointRadius: 0, yAxisID: 'y' },
        { label: 'Flow (mL/s)', data: shot.flow, borderColor: '#d4ac0d', borderWidth: 1.5, tension: 0.1, pointRadius: 0, yAxisID: 'y' },
        { data: shot.targetFlow, borderColor: '#d4ac0d', borderWidth: 1, borderDash: [5, 5], pointRadius: 0, yAxisID: 'y' },
        { label: 'Temp (°C)', data: shot.temperature, borderColor: '#c0504d', borderWidth: 1.5, tension: 0.1, pointRadius: 0, yAxisID: 'y1' },
        { label: 'Weight (g)', data: shot.weight, borderColor: '#4caf50', borderWidth: 1.5, tension: 0.1, pointRadius: 0, yAxisID: 'y1' }
    ];

    if (shot.weightFlow && shot.weightFlow.length > 0 && shot.weightFlow.some(value => value > 0)) {
        datasets.push({
            label: 'Weight Flow (g/s)',
            data: shot.weightFlow,
            borderColor: '#e67e22',
            borderWidth: 1.5,
            tension: 0.1,
            pointRadius: 0,
            yAxisID: 'y'
        });
    }

    const isDarkMode = document.body.classList.contains('dark-mode');
    const axisColor = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
  
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: { labels: shot.timePoints, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'right', align: 'center',
                    labels: {
                        boxWidth: 0, font: { size: 13 },
                        generateLabels: function(chart) {
                            return chart.data.datasets
                                .map((dataset, i) => ({
                                    text: dataset.label,
                                    fontColor: dataset.borderColor,
                                    datasetIndex: i,
                                    hidden: !chart.isDatasetVisible(i),
                                    fillStyle: 'rgba(0,0,0,0)',
                                    strokeStyle: 'rgba(0,0,0,0)',
                                    lineWidth: 0
                                }))
                                .filter(item => item.text);
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: items => `Time (s): ${parseFloat(items[0]?.label).toFixed(1)}`,
                        label: item => item.dataset.label ? `${item.dataset.label}: ${item.formattedValue}` : null
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear', position: 'bottom',
                    title: { display: true, text: 'Time (seconds)', color: axisColor },
                    ticks: { stepSize: 5, callback: (v) => v + 's', color: axisColor },
                    grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' },
                    // Set the maximum value for the x-axis to the common value.
                    // This ensures all charts share the same time scale.
                    max: commonXMax,
                },
                y: {
                    type: 'linear', position: 'left',
                    title: { display: true, text: 'Pressure/Flow', color: axisColor },
                    ticks: { color: axisColor },
                    beginAtZero: true,
                    grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }
                },
                y1: {
                    type: 'linear', position: 'right',
                    title: { display: true, text: 'Temp/Weight', color: axisColor },
                    ticks: { color: axisColor },
                    beginAtZero: true, 
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}