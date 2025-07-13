// =====================================================================================
// Gaggiuino Shot Compare - Frontend Logic (script.js)
// =====================================================================================
// This file contains all the JavaScript logic for the user interface.
// It handles user interactions, calls the Python backend (via Eel),
// fetches data, and renders the shot list and charts on the page.
// =====================================================================================

// --- Global Configuration ---
// Using a CONFIG object makes it easy to find and change key settings.
const CONFIG = {
  MAX_CHARTS: 3,          // The maximum number of charts that can be displayed at once.
  SHOTS_PER_PAGE: 12,     // How many shots to load each time the "Load More" button is clicked.
  DEBOUNCE_DELAY_MS: 250  // A small delay (in milliseconds) to wait after the user stops typing before filtering.
};

// --- SVG Icons for Theme Toggle ---
const lightIconSVG = `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M7 7C6.453125 7 6 7.421875 6 7.96875C5.996094 17.171875 9.894531 29.988281 11.90625 36L33.09375 36C33.386719 35.117188 33.738281 34.050781 34.09375 32.90625C34.769531 32.777344 37.65625 32.179688 40.71875 30.8125C42.457031 30.035156 44.242188 29.042969 45.625 27.6875C47.007813 26.332031 48 24.5625 48 22.46875C48 18.910156 45.089844 16 41.53125 16C40.300781 16 39.109375 16.34375 38.09375 16.9375C38.640625 13.804688 39 10.703125 39 7.96875C39 7.421875 38.546875 7 38 7 Z M 41.53125 18C44.011719 18 46 19.988281 46 22.46875C46 23.9375 45.339844 25.148438 44.21875 26.25C43.097656 27.351563 41.507813 28.285156 39.90625 29C37.894531 29.898438 35.976563 30.449219 34.75 30.75C35.652344 27.710938 36.589844 24.152344 37.375 20.5C37.378906 20.488281 37.402344 20.480469 37.40625 20.46875C37.40625 20.457031 37.40625 20.449219 37.40625 20.4375C38.125 19.027344 39.785156 18 41.53125 18 Z M 3 38C2.59375 38 2.21875 38.25 2.0625 38.625C1.90625 39 1.996094 39.433594 2.28125 39.71875L4.5625 41.96875C6.511719 43.917969 9.121094 45 11.875 45L33.125 45C35.882813 45 38.488281 43.917969 40.4375 41.96875L42.71875 39.71875C43.003906 39.433594 43.09375 39 42.9375 38.625C42.785156 38.25 42.402344 38 42 38Z" /></svg>`;
const darkIconSVG =  `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path d="M7 7C6.453125 7 6 7.421875 6 7.96875C5.996094 17.171875 9.894531 29.988281 11.90625 36L33.09375 36C33.386719 35.117188 33.738281 34.050781 34.09375 32.90625C34.769531 32.777344 37.65625 32.179688 40.71875 30.8125C42.457031 30.035156 44.242188 29.042969 45.625 27.6875C47.007813 26.332031 48 24.5625 48 22.46875C48 18.910156 45.089844 16 41.53125 16C40.300781 16 39.109375 16.34375 38.09375 16.9375C38.640625 13.804688 39 10.703125 39 7.96875C39 7.421875 38.546875 7 38 7 Z M 41.53125 18C44.011719 18 46 19.988281 46 22.46875C46 23.9375 45.339844 25.148438 44.21875 26.25C43.097656 27.351563 41.507813 28.285156 39.90625 29C37.894531 29.898438 35.976563 30.449219 34.75 30.75C35.652344 27.710938 36.589844 24.152344 37.375 20.5C37.378906 20.488281 37.402344 20.480469 37.40625 20.46875C37.40625 20.457031 37.40625 20.449219 37.40625 20.4375C38.125 19.027344 39.785156 18 41.53125 18 Z M 3 38C2.59375 38 2.21875 38.25 2.0625 38.625C1.90625 39 1.996094 39.433594 2.28125 39.71875L4.5625 41.96875C6.511719 43.917969 9.121094 45 11.875 45L33.125 45C35.882813 45 38.488281 43.917969 40.4375 41.96875L42.71875 39.71875C43.003906 39.433594 43.09375 39 42.9375 38.625C42.785156 38.25 42.402344 38 42 38Z" /></svg>`;

// --- Global State Variables ---
// These variables hold the application's state and are accessible by all functions.
let shots = Array(CONFIG.MAX_CHARTS).fill(null); // An array to hold the data for the currently displayed charts. `null` means the slot is empty.
let shotHistory = [];                            // An array to hold the summary of all shots fetched from the backend.
let currentLimit = CONFIG.SHOTS_PER_PAGE;        // The current number of shots to request from the backend.
let isLoading = false;                           // A flag to prevent multiple data loading requests at the same time.
let charts = {};                                 // An object to store the created Chart.js instances, so they can be destroyed later.
let feedbackTimeout;                             // A timeout ID for hiding feedback messages.
let debounceTimeout;                             // A timeout ID for the search filter debouncing.

// --- Initialization ---

// This event listener waits for the entire HTML document to be loaded and parsed before running the setup code.
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    setupEventListeners();
    loadShotHistory();
});

// --- Theme Management ---

function initializeTheme() {
    const themeIcon = document.getElementById('theme-toggle-icon');
    // Check localStorage for a saved theme preference. Default to 'light' if none is found.
    const savedTheme = localStorage.getItem('theme') || 'light';
    
    // Apply the saved theme.
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeIcon.innerHTML = darkIconSVG;
    } else {
        themeIcon.innerHTML = lightIconSVG;
    }
}

function toggleTheme() {
    const themeIcon = document.getElementById('theme-toggle-icon');
    // Add or remove the 'dark-mode' class from the body element.
    document.body.classList.toggle('dark-mode');
    
    // Save the new theme preference to localStorage and update the icon.
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
        themeIcon.innerHTML = darkIconSVG;
    } else {
        localStorage.setItem('theme', 'light');
        themeIcon.innerHTML = lightIconSVG;
    }
    // Re-render the charts to apply the new theme's colors.
    renderCharts();
}

// --- Event Listeners and UI Handlers ---

function setupEventListeners() {
    makeResizable();
    document.getElementById('profile-filter').addEventListener('keyup', handleFilterInput);
    document.getElementById('clear-filter-btn').addEventListener('click', handleClearFilter);
    document.getElementById('theme-toggle-icon').addEventListener('click', toggleTheme);
}
    
function makeResizable() {
    const resizer = document.getElementById('resizer');
    const sidebar = document.querySelector('.sidebar');
    
    // This function is called whenever the mouse moves while resizing.
    const resize = (e) => {
        let newWidth = e.clientX;
        // Enforce minimum and maximum width constraints for the sidebar.
        if (newWidth < 220) newWidth = 220;
        if (newWidth > 600) newWidth = 600;
        sidebar.style.width = newWidth + 'px';
    };
    
    // When the mouse button is pressed down on the resizer...
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevents text selection during drag.
        // ...start listening for mouse movement anywhere on the window.
        window.addEventListener('mousemove', resize);
        // When the mouse button is released, stop listening for movement. `{ once: true }` makes it self-destruct.
        window.addEventListener('mouseup', () => window.removeEventListener('mousemove', resize), { once: true });
    });
}

function handleClearFilter() {
    const filterInput = document.getElementById('profile-filter');
    const clearBtn = document.getElementById('clear-filter-btn');
    
    filterInput.value = '';        // Clear the input field.
    applyFilterAndRender();        // Re-render the list with no filter.
    clearBtn.style.display = 'none'; // Hide the 'x' button.
    filterInput.focus();           // Put the cursor back in the input field.
}

// --- Data Loading and Handling ---

async function loadShotHistory() {
    if (isLoading) return; // Prevent concurrent loading.
    isLoading = true;
    
    // Update the UI to show that data is being loaded.
    const loadButton = document.getElementById('load-more-btn');
    if (loadButton) { loadButton.disabled = true; loadButton.textContent = 'Loading...'; }
    const listContainer = document.getElementById('shot-list');
    if (shotHistory.length === 0) listContainer.innerHTML = '<div class="loading">Loading shots...</div>';
  
    try {
        // Call the Python function `get_recent_shots` using Eel. The `()` at the end executes the call.
        const result = await eel.get_recent_shots(currentLimit)();
        if (result.success) {
            shotHistory = result.data; // Store the fetched shot summaries.
        } else {
            // If the backend returned an error, display it.
            showError(result.error || "Failed to load shots");
        }
    } catch (error) {
        // This catches network errors if the Python backend is unreachable.
        showError(error.message || "Connection error");
    } finally {
        // This block runs whether the `try` succeeded or failed.
        isLoading = false;
        applyFilterAndRender(); // Update the displayed list.
        // Reset the "Load More" button's state.
        const finalLoadButton = document.getElementById('load-more-btn');
        if (finalLoadButton) { finalLoadButton.disabled = false; finalLoadButton.textContent = 'Load More'; }
    }
}

async function loadMoreShots() {
    // Increase the number of shots to fetch and then trigger a reload.
    currentLimit += CONFIG.SHOTS_PER_PAGE;
    await loadShotHistory();
}

// --- User Feedback Functions ---

function showFeedbackMessage(message) {
    const feedbackDiv = document.getElementById('feedback-area');
    feedbackDiv.textContent = message;
    // Clear any previous timeout to reset the timer.
    clearTimeout(feedbackTimeout);
    // Set a new timeout to clear the message after 3 seconds.
    feedbackTimeout = setTimeout(() => { feedbackDiv.textContent = ''; }, 3000);
}

function showError(error) {
    // Display a prominent error message in the main content area.
    document.getElementById('chart-area').innerHTML = `<div style="color: #c0504d; padding: 15px; background: #fff0f0; border-radius: 4px; margin: 20px;">Error: ${error}</div>`;
    // Clear the shot list.
    document.getElementById('shot-list').innerHTML = '<div class="loading"></div>';
}

// --- Filtering and Rendering Shot List ---

function handleFilterInput() {
    const filterInput = document.getElementById('profile-filter');
    const clearBtn = document.getElementById('clear-filter-btn');
    // Show the 'x' button only if there is text in the input field.
    clearBtn.style.display = filterInput.value.length > 0 ? 'block' : 'none';
    
    // Debounce the filtering function. This prevents it from running on every single keystroke.
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(applyFilterAndRender, CONFIG.DEBOUNCE_DELAY_MS);
}

function applyFilterAndRender() {
    const filterInput = document.getElementById('profile-filter');
    const filterText = filterInput.value.toLowerCase();
    // Create a new array containing only the shots that match the filter text.
    const listToRender = shotHistory.filter(shot => (shot.profile_name || '').toLowerCase().includes(filterText));
    // Render the filtered list.
    renderShotList(listToRender);
}

function renderShotList(listToRender) {
    const container = document.getElementById('shot-list');
    container.innerHTML = ''; // Clear the existing list.

    // If the list is empty, show a relevant message.
    if (!listToRender.length) {
        container.innerHTML = `<div class="loading">${shotHistory.length === 0 ? 'Gaggiuino not found or no shots.' : 'No shots match filter.'}</div>`;
    } else {
        // Loop through the shots and create an HTML element for each one.
        listToRender.forEach(shot => {
            // Check if this shot is currently being displayed in a chart.
            const isActive = shots.some(s => s && s.id === shot.id);
            const item = document.createElement('div');
            item.className = 'shot-item';
            
            // Clicking anywhere on the item (except the checkbox itself) will toggle the checkbox.
            item.onclick = (event) => {
                const checkbox = item.querySelector('.shot-checkbox');
                if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
                toggleShotDisplay(shot.id, checkbox.checked);
            };
            
            // Use a template literal to create the inner HTML for the shot item.
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
    // Add the "Load More" button at the end of the list.
    container.insertAdjacentHTML('beforeend', `<div class="load-more-container"><button id="load-more-btn" class="load-more" onclick="loadMoreShots()">Load More</button></div>`);
}

// --- Chart Management and Rendering ---

async function toggleShotDisplay(shotId, show) {
    if (show) { // If the checkbox was checked
        // Check if we have reached the maximum number of charts.
        if (shots.filter(s => s).length >= CONFIG.MAX_CHARTS) {
            showFeedbackMessage(`Maximum of ${CONFIG.MAX_CHARTS} shots can be selected.`);
            applyFilterAndRender(); // Re-render list to uncheck the box.
            return;
        }
        // Find the first empty slot in our `shots` array.
        let slot = shots.findIndex(s => s === null);
        try {
            // Fetch the full data for this shot from the Python backend.
            const result = await eel.get_shot_by_id(shotId)();
            if (result.success) {
                shots[slot] = result.data; // Place the data in the empty slot.
                renderCharts();             // Re-render all charts.
            } else { throw new Error(result.error); }
        } catch (error) {
            showError(error.message || `Failed to load shot ${shotId}`);
            applyFilterAndRender();
        }
    } else { // If the checkbox was unchecked
        // Find the slot containing the shot to be removed.
        const slot = shots.findIndex(s => s && s.id === shotId);
        if (slot !== -1) { 
            shots[slot] = null; // Remove the shot data by setting its slot to null.
            renderCharts();     // Re-render the charts.
        }
    }
}

function clearShot(shotIdToClear) {
    // This is called when the 'x' button on a chart card is clicked.
    const slot = shots.findIndex(s => s && s.id === shotIdToClear);
    if (slot !== -1) {
        shots[slot] = null;     // Remove the shot data.
        renderCharts();         // Re-render the charts.
        applyFilterAndRender(); // Re-render the list to update the checkbox state.
    }
}

function renderCharts() {
    const container = document.getElementById('chart-area');
    container.innerHTML = ''; // Clear the chart area completely.
    
    // It's important to destroy old Chart.js instances to prevent memory leaks.
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};

    // Iterate through the `shots` array and create a chart for each non-null entry.
    shots.forEach((shot) => {
        if (!shot) return; // Skip empty slots.
        const chartId = `chart-${shot.id}`;
        
        // Add the HTML structure for the chart card.
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
        
        // Now that the canvas element exists, render the chart on it.
        renderSingleChart(shot, chartId);
    });
}

function renderSingleChart(shot, canvasId) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    
    const chartMaxX = Math.ceil((shot.real_duration || 30) / 5) * 5;

    // Define all the data series (lines) to be plotted on the chart.
    const datasets = [
        { label: 'Pressure (bar)', data: shot.pressure, borderColor: '#4a6fa5', borderWidth: 1.5, tension: 0.1, pointRadius: 0, yAxisID: 'y' },
        { data: shot.targetPressure, borderColor: '#4a6fa5', borderWidth: 1, borderDash: [5, 5], pointRadius: 0, yAxisID: 'y' },
        { label: 'Flow (mL/s)', data: shot.flow, borderColor: '#d4ac0d', borderWidth: 1.5, tension: 0.1, pointRadius: 0, yAxisID: 'y' },
        { data: shot.targetFlow, borderColor: '#d4ac0d', borderWidth: 1, borderDash: [5, 5], pointRadius: 0, yAxisID: 'y' },
        { label: 'Temp (°C)', data: shot.temperature, borderColor: '#c0504d', borderWidth: 1.5, tension: 0.1, pointRadius: 0, yAxisID: 'y1' },
        { label: 'Weight (g)', data: shot.weight, borderColor: '#4caf50', borderWidth: 1.5, tension: 0.1, pointRadius: 0, yAxisID: 'y1' }
    ];

    // Conditionally add the 'Weight Flow' dataset only if it contains meaningful data.
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

    // Adjust colors based on the current theme.
    const isDarkMode = document.body.classList.contains('dark-mode');
    const axisColor = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
  
    // Create the new Chart.js instance with all the data and configuration options.
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: shot.timePoints, // X-axis labels (time).
            datasets: datasets
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'right', align: 'center',
                    onClick: (e, legendItem, legend) => {
                        // Keep the default click behavior (toggling dataset visibility).
                        Chart.defaults.plugins.legend.onClick.call(legend.chart, e, legendItem, legend);
                    },
                    labels: {
                        boxWidth: 0, // Hide the colored box next to the label text.
                        font: { size: 13 },
                        // This function creates custom legend items.
                        generateLabels: function(chart) {
                            return chart.data.datasets
                                .map((dataset, i) => ({
                                    text: dataset.label,
                                    fontColor: dataset.borderColor,
                                    datasetIndex: i,
                                    hidden: !chart.isDatasetVisible(i),
                                    // Make the legend items themselves transparent, as we only want the text.
                                    fillStyle: 'rgba(0,0,0,0)',
                                    strokeStyle: 'rgba(0,0,0,0)',
                                    lineWidth: 0
                                }))
                                .filter(item => item.text); // Filter out items with no label (like target lines).
                        }
                    }
                },
                tooltip: {
                    // Customize the tooltip that appears on hover.
                    callbacks: {
                        title: items => `Time (s): ${parseFloat(items[0]?.label).toFixed(1)}`,
                        label: item => item.dataset.label ? `${item.dataset.label}: ${item.formattedValue}` : null
                    }
                }
            },
            scales: {
                x: { // X-Axis (Time)
                    type: 'linear', position: 'bottom',
                    title: { display: true, text: 'Time (seconds)', color: axisColor },
                    ticks: { stepSize: 5, callback: (v) => v + 's', color: axisColor },
                    grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }
                },
                y: { // Left Y-Axis (Pressure/Flow)
                    type: 'linear', position: 'left',
                    title: { display: true, text: 'Pressure/Flow', color: axisColor },
                    ticks: { color: axisColor },
                    beginAtZero: true,
                    grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }
                },
                y1: { // Right Y-Axis (Temp/Weight)
                    type: 'linear', position: 'right',
                    title: { display: true, text: 'Temp/Weight', color: axisColor },
                    ticks: { color: axisColor },
                    beginAtZero: true, 
                    grid: { drawOnChartArea: false } // Prevent grid lines from this axis from cluttering the chart.
                }
            }
        }
    });
}