// =====================================================================================
// Gaggiuino Shot Compare - Frontend Logic
// =====================================================================================
// This file contains all JavaScript logic for the user interface including:
// - Connection management to Python backend (via Eel)
// - Data fetching and caching
// - UI rendering (shot list and charts)
// - User settings and preferences
// =====================================================================================

// --- SVG Icons ---
const settingsIconSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.44,0.17-0.48,0.41L9.22,5.22C8.63,5.46,8.1,5.78,7.6,6.16L5.22,5.2C5,5.12,4.75,5.19,4.63,5.41L2.71,8.73 c-0.12,0.2-0.07,0.47,0.12,0.61l2.03,1.58C4.8,11.36,4.78,11.68,4.78,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.38,2.41 c0.04,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.48,0.41l0.38-2.41c0.59-0.24,1.12-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0.01,0.59-0.22l1.92-3.32c0.12-0.2,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`;
const starOutlineSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12,17.27L18.18,21L17,14.64L22,9.73L15.36,8.82L12,3L8.64,8.82L2,9.73L7,14.64L5.82,21L12,17.27Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const starFilledSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12,17.27L18.18,21L17,14.64L22,9.73L15.36,8.82L12,3L8.64,8.82L2,9.73L7,14.64L5.82,21L12,17.27Z"/></svg>`;
const historyIconSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 13,3M12,8V13L16.28,15.54L17,14.33L13.5,12.25V8H12Z" /></svg>`;
const filterIconSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" /></svg>`;
const backIconSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" /></svg>`;


// --- Global Configuration ---
const SHOTS_PER_PAGE = 12;				// Number of shots to load per batch
const DEBOUNCE_DELAY_MS = 250;			// Delay for filter input debouncing
const LONG_API_TIMEOUT_MS = 30000;		// Timeout for data-fetching operations
const SHORT_PING_TIMEOUT_MS = 5000;		// Timeout for connection checks
const KEEP_ALIVE_INTERVAL_MS = 15000;	// Interval for connection keep-alive pings

// --- Global State ---
// App settings (loaded from localStorage)
let gaggiuinoUrl;                   	// URL of the Gaggiuino device
let maxCharts;                      	// Maximum number of charts to display
let autoloadRecentShots;            	// Number of recent shots to load on startup
// Data caches
let shots = []; 						// Holds full data for currently displayed charts.
let shotHistory = []; 					// Holds summary data for the "Recents" list.
let favoriteShots = []; 				// Holds summary data for favorite shots.
// UI and data loading state
let currentSidebarView = 'recents'; 	// Current sidebar view ('recents' or 'favorites')
let currentLimit = SHOTS_PER_PAGE;  	// Current pagination limit
let isLoading = false;              	// Loading state flag
let allShotsLoaded = false;         	// Flag indicating all shots are loaded
let isReconnecting = false;         	// Connection recovery state
// Objects and timers
let charts = {};                    	// Chart.js instances
let feedbackTimeout;                	// Timeout for feedback messages
let debounceTimeout;                	// Timeout for debounced operations

// --- Initialisation ---
/**
 * Main entry point, called when the DOM is fully loaded.
 * It sets up the UI, loads settings, and then fetches initial data.
 */
document.addEventListener('DOMContentLoaded', async () => {
    await initializeUi();
    // Await the autoload function to display charts first for faster perceived startup.
    await performAutoload();
    // Now load the sidebar list, which will correctly reflect any autoloaded shots.
    loadShotHistory();
});

/**
 * Sets up the initial state of the application UI and backend connection.
 */
async function initializeUi() {
    await loadSettings();   // make sure settings are loaded first
    await loadFavorites();  // favorites also need async
    initializeTheme();
    setupEventListeners();
    startKeepAlive(); // Start the heartbeat to prevent disconnection.

    // Perform an initial call to sync the backend with the loaded URL.
    try {
        await eelWithTimeout(eel.update_gaggiuino_url(gaggiuinoUrl)(), SHORT_PING_TIMEOUT_MS);
    } catch (error) {
        console.error("Initial connection to backend failed:", error);
        showError("Could not connect to the application backend. Please restart the app.");
    }
}


// --- Connection Management ---

/**
 * Wraps an Eel promise with a timeout. This prevents the UI from hanging
 * if the WebSocket connection to the Python backend is lost while the app is idle.
 * @param {Promise} eelPromise The promise returned by an eel call, e.g., `eel.my_function()()`.
 * @param {number} timeoutMs The duration in milliseconds to wait before timing out.
 * @returns {Promise} A new promise that either resolves with the eel call's result
 * or rejects with a timeout error.
 */
function eelWithTimeout(eelPromise, timeoutMs = LONG_API_TIMEOUT_MS) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(
            () => reject(new Error(`Backend call timed out after ${timeoutMs / 1000}s. The connection may be lost.`)),
            timeoutMs
        );
    });

    return Promise.race([
        eelPromise,
        timeoutPromise
    ]).finally(() => {
        // Important: clear the timeout to prevent it from running if the eel call completes first.
        clearTimeout(timeoutHandle);
    });
}

/**
 * Starts a periodic "ping" to the Python backend to keep the WebSocket
 * connection alive, preventing timeouts from network intermediaries.
 */
function startKeepAlive() {
    setInterval(async () => {
        if (isReconnecting) return; // Prevent multiple pings during a disconnect state.
        try {
            const result = await eelWithTimeout(eel.ping()(), SHORT_PING_TIMEOUT_MS);
            if (result !== "pong") throw new Error("Invalid pong response from backend.");
        } catch (error) {
            console.error(`[${new Date().toLocaleTimeString()}] Keep-alive ping FAILED. Assuming fatal disconnect.`, error.message);
            if (isReconnecting) return;
            isReconnecting = true; // Flag that terminal error state entered.

            // Display a permanent error message overlay.
            showFatalConnectionErrorOverlay();
        }
    }, KEEP_ALIVE_INTERVAL_MS);
}

/**
 * Displays a permanent overlay indicating a fatal connection error,
 * instructing the user to restart the application.
 */
function showFatalConnectionErrorOverlay() {
    // If the overlay already exists, do nothing.
    if (document.getElementById('fatal-error-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'fatal-error-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(26, 26, 26, 0.85); /* Darker overlay */
        color: white; display: flex;
        flex-direction: column; /* Allow stacking elements */
        align-items: center; justify-content: center; font-size: 1.3em;
        z-index: 9999; font-family: 'Segoe UI', Arial, sans-serif;
        text-align: center; line-height: 1.6; padding: 20px;
    `;

    const message = document.createElement('p');
    message.innerHTML = 'Fatal error encountered!<br>This can happen if the app is idle for some time, mostly after a (Windows) computer sleep/wake cycle.<br><br><strong>Please restart the application.</strong>';

    overlay.appendChild(message);
    document.body.appendChild(overlay);
}


// --- Settings & Theme Management ---

/**
 * Loads all user settings from localStorage into global variables.
 */
async function loadSettings() {
    try {
        const settings = await eel.load_user_settings()();
        const savedTheme = settings.theme || 'light';
        gaggiuinoUrl = settings.gaggiuinoUrl || 'http://gaggiuino.local';
        maxCharts = parseInt(settings.maxCharts, 10) || 3;
        autoloadRecentShots = parseInt(settings.autoloadRecentShots, 10) || 2;
        setTheme(savedTheme);
    } catch (e) {
        console.error("Failed to load user settings:", e);
        // fallback to defaults
        gaggiuinoUrl = 'http://gaggiuino.local';
        maxCharts = 3;
        autoloadRecentShots = 2;
        setTheme('light');
    }
}

/**
 * Populates the settings panel with current values and displays it.
 */
function openSettings() {
    document.getElementById('theme-toggle-switch').checked = document.body.classList.contains('dark-mode');
    document.getElementById('gaggiuino-url-input').value = gaggiuinoUrl;

    // Populate all settings inputs.
    const maxChartsInput = document.getElementById('max-charts-input');
    const autoloadInput = document.getElementById('autoload-shots-input');
    maxChartsInput.value = maxCharts;
    autoloadInput.value = autoloadRecentShots;
    // Dynamically set the max limit for autoload based on max charts.
    autoloadInput.max = maxChartsInput.value;

    document.getElementById('settings-feedback').textContent = '';
    document.getElementById('settings-overlay').classList.remove('hidden');
}

/**
 * Hides the settings panel.
 */
function closeSettings() {
    document.getElementById('settings-overlay').classList.add('hidden');
}

/**
 * Saves all settings from the panel to localStorage, updates the backend,
 * and refreshes the UI as needed.
 */
async function saveSettings() {
    const oldUrl = gaggiuinoUrl;

    const newTheme = document.getElementById('theme-toggle-switch').checked ? 'dark' : 'light';
    setTheme(newTheme);
    gaggiuinoUrl = document.getElementById('gaggiuino-url-input').value.trim() || 'http://gaggiuino.local';
    maxCharts = parseInt(document.getElementById('max-charts-input').value, 10) || 3;
    let newAutoload = parseInt(document.getElementById('autoload-shots-input').value, 10);

    // Validate and clamp autoload value.
    if (isNaN(newAutoload) || newAutoload < 0) newAutoload = 0;
    if (newAutoload > maxCharts) newAutoload = maxCharts;
    autoloadRecentShots = newAutoload;

    await eel.save_user_settings({
		theme: newTheme,
		gaggiuinoUrl: gaggiuinoUrl,
		maxCharts: maxCharts,
		autoloadRecentShots: autoloadRecentShots,
		favoriteShots: favoriteShots
	})();

    renderCharts(); // Re-render to respect new maxCharts limit.

    const feedback = document.getElementById('settings-feedback');
    try {
        // Update the backend with the new Gaggiuino URL, using a timeout for safety.
        await eelWithTimeout(eel.update_gaggiuino_url(gaggiuinoUrl)(), SHORT_PING_TIMEOUT_MS);

        feedback.textContent = 'Settings Saved!';
        feedback.style.color = 'var(--primary-color)';
        setTimeout(() => {
            feedback.textContent = '';
            closeSettings();
        }, 1500);

        // If the URL changed, clear all data and trigger a full refresh.
        if (oldUrl !== gaggiuinoUrl) {
            shots = [];
            shotHistory = [];
            charts = {};
            document.getElementById('chart-area').innerHTML = '';
            document.getElementById('shot-list').innerHTML = ''; // Clear list immediately.
            currentLimit = SHOTS_PER_PAGE;
            allShotsLoaded = false;
            loadShotHistory();
        }
    } catch (error) {
        console.error("Failed to update Gaggiuino URL:", error);
        feedback.textContent = 'Could not reach backend. Check connection.';
        feedback.style.color = 'var(--danger-color)';
        setTimeout(() => { feedback.textContent = ''; }, 4000);
    }
}

/**
 * Applies the selected theme (light/dark) to the application.
 * @param {string} theme - The theme to apply ('light' or 'dark').
 */
function setTheme(theme) {
    localStorage.setItem('theme', theme);
    document.body.className = theme === 'dark' ? 'dark-mode' : '';
}

/**
 * Toggles the theme between light and dark mode and re-renders charts.
 */
function toggleTheme() {
    const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setTheme(newTheme);
    renderCharts(); // Re-render charts to apply new theme colors.
}

/**
 * Automatically loads and displays the most recent shot charts on startup,
 * based on the 'autoloadRecentShots' setting.
 */
async function performAutoload() {
    if (autoloadRecentShots <= 0 || shots.length > 0) return;

    console.log(`Autoloading ${autoloadRecentShots} most recent shot(s)...`);
    const listContainer = document.getElementById('shot-list');
    listContainer.innerHTML = '<div class="loading">Loading most recent shots...</div>';

    try {
        const latestIdResult = await eelWithTimeout(eel.get_latest_shot_id()());
        if (!latestIdResult.success) throw new Error(latestIdResult.error);

        const latestId = latestIdResult.data;
        const shotIdsToLoad = Array.from({ length: autoloadRecentShots }, (_, i) => latestId - i).filter(id => id > 0);

        if (shotIdsToLoad.length === 0) return;

        // Fetch all required shots in parallel for speed.
        const shotPromises = shotIdsToLoad.map(id => eelWithTimeout(eel.get_shot_by_id(id)()));
        const results = await Promise.allSettled(shotPromises);

        // Process only the successfully fetched shots.
        const newShots = results
            .filter(result => result.status === 'fulfilled' && result.value.success)
            .map(result => result.value.data);

        newShots.forEach(newShot => {
            if (!shots.some(s => s.id === newShot.id)) shots.push(newShot);
        });

        if (shots.length > 0) renderCharts();

    } catch (error) {
        console.error("Autoload feature failed:", error.message);
        // Let the subsequent loadShotHistory call handle showing the final error.
        if (listContainer.innerHTML.includes("Loading most recent shot...")) {
            listContainer.innerHTML = '';
        }
    }
}


// --- Favorites Management ---

/**
 * Loads favorite shots from user local storage json into the `favoriteShots` array.
 */
async function loadFavorites() {
    try {
        const settings = await eel.load_user_settings()();
        if (settings.favoriteShots) {
            favoriteShots = settings.favoriteShots;
            // Sort favorites by ID descending to ensure a consistent order.
            favoriteShots.sort((a, b) => b.id - a.id);
        } else {
            favoriteShots = [];
        }
    } catch (e) {
        console.error("Could not load favorites:", e);
        favoriteShots = [];
    }
}

/**
 * Saves the current `favoriteShots` array to user local storage json.
 */
async function saveFavorites() {
    try {
        // Reload current settings first
        const settings = await eel.load_user_settings()();
        settings.favoriteShots = favoriteShots;
        await eel.save_user_settings(settings)();
    } catch (e) {
        console.error("Failed to save favorites:", e);
    }
}

/**
 * Toggles a shot's favorite status, updating the state, UI, and saving to disk.
 * @param {number} shotId - The ID of the shot to toggle.
 */
async function toggleFavoriteStatus(shotId) {
    const isCurrentlyFavorite = favoriteShots.some(fav => fav.id === shotId);

    if (isCurrentlyFavorite) {
        favoriteShots = favoriteShots.filter(fav => fav.id !== shotId);
    } else {
        // Find the shot's summary data from the main history or displayed charts.
        const shotSummary = shotHistory.find(s => s.id === shotId) || shots.find(s => s.id === shotId);
        if (shotSummary) {
            favoriteShots.push({
                id: shotSummary.id,
                profile_name: shotSummary.profile_name,
                date: shotSummary.date,
                final_weight: shotSummary.final_weight,
                duration_formatted: shotSummary.duration_formatted
            });
        } else {
            // As a fallback, check if we have the full shot data in `shots`.
            const shotData = shots.find(s => s.id === shotId);
            if (shotData) {
                favoriteShots.push({
                    id: shotData.id,
                    profile_name: shotData.profile_name,
                    date: shotData.date,
                    final_weight: shotData.final_weight,
                    duration_formatted: shotData.duration_formatted
                });
            } else {
                showFeedbackMessage("Could not favorite shot. Data not found.");
                console.error("Could not find shot data to add to favorites.");
                return;
            }
        }
        // Keep list sorted newest-first.
        favoriteShots.sort((a, b) => b.id - a.id);
    }

    // Persist updated favorites to disk
    await saveFavorites();

    renderCharts(); // Update the star icons
    if (currentSidebarView === 'favorites') {
        applyFilterAndRender(); // Refresh sidebar if in favorites view
    }
}


// --- UI Initialization & Event Listeners ---

/**
 * Inserts SVG icons into their respective buttons.
 */
function initializeTheme() {
    document.getElementById('settings-btn').innerHTML = settingsIconSVG;
    document.querySelector('#show-recents-btn').insertAdjacentHTML('afterbegin', historyIconSVG);
    document.querySelector('#show-favorites-btn').insertAdjacentHTML('afterbegin', starFilledSVG);
    document.getElementById('show-filter-btn').innerHTML = filterIconSVG;
    document.getElementById('hide-filter-btn').innerHTML = backIconSVG;
}

/**
 * Sets up all major event listeners for the application.
 */
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

    // Link the "Max Charts" and "Autoload" inputs in the settings.
    document.getElementById('max-charts-input').addEventListener('input', (e) => {
        const autoloadInput = document.getElementById('autoload-shots-input');
        const newMax = parseInt(e.target.value, 10);
        if (newMax > 0) {
            autoloadInput.max = newMax;
            if (parseInt(autoloadInput.value, 10) > newMax) {
                autoloadInput.value = newMax;
            }
        }
    });

    document.getElementById('show-recents-btn').addEventListener('click', handleRecentsButtonClick);
    document.getElementById('show-favorites-btn').addEventListener('click', () => switchSidebarView('favorites'));
    document.getElementById('show-filter-btn').addEventListener('click', showFilterView);
    document.getElementById('hide-filter-btn').addEventListener('click', hideFilterView);
}

/**
 * Enables the sidebar to be resized by dragging the resizer handle.
 */
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

/**
 * Handles clicks on the "Recents" button, checking for new shots on the machine.
 */
async function handleRecentsButtonClick() {
    const recentsButton = document.getElementById('show-recents-btn');
    if (recentsButton.classList.contains('is-loading') || isLoading) return;

    switchSidebarView('recents');
    recentsButton.classList.add('is-loading');

    try {
        const lastKnownId = shotHistory.length > 0 ? shotHistory[0].id : 0;
        const latestIdResult = await eelWithTimeout(eel.get_latest_shot_id()());
        if (!latestIdResult.success) throw new Error(latestIdResult.error);

        const latestIdOnMachine = latestIdResult.data;
        if (latestIdOnMachine > lastKnownId) {
            showFeedbackMessage('New shots found! Refreshing...');
            await loadShotHistory(true); // Force a refresh.
        } else {
            showFeedbackMessage('Shot list is up to date.');
        }
    } catch (error) {
        console.error("Error checking for recent shots:", error);
        showFeedbackMessage("Couldn't connect to Gaggiuino.");
    } finally {
        recentsButton.classList.remove('is-loading');
    }
}


// --- Data Loading and Handling ---

/**
 * Fetches recent shot summary data from the backend.
 * @param {boolean} [forceRefresh=false] - If true, tells the backend to clear its cache.
 */
async function loadShotHistory(forceRefresh = false) {
    if (isLoading || (allShotsLoaded && !forceRefresh)) return;
    isLoading = true;

    const loadButton = document.getElementById('load-more-btn');
    if (loadButton) { loadButton.disabled = true; loadButton.textContent = 'Loading...'; }
    const listContainer = document.getElementById('shot-list');

    if (forceRefresh) {
        currentLimit = SHOTS_PER_PAGE;
        allShotsLoaded = false;
    }

    // Show a "Connecting..." message only on the very first load attempt.
    if (shotHistory.length === 0 && shots.length === 0) {
        listContainer.innerHTML = '<div class="loading">Connecting to Gaggiuino...</div>';
    }

    try {
        const result = await eelWithTimeout(eel.get_recent_shots(currentLimit, forceRefresh)(), LONG_API_TIMEOUT_MS);
        if (result.success) {
            shotHistory = result.data;
            allShotsLoaded = result.all_loaded;
            if (allShotsLoaded) {
                console.log("Backend confirmed: all available shots have been loaded.");
            }
        } else {
            showError(result.error || "Failed to load shots");
        }
    } catch (error) {
        showError(error.message || "Connection to backend failed");
    } finally {
        isLoading = false;
        // Re-render the correct view after loading completes or fails.
        applyFilterAndRender();
    }
}

/**
 * Increments the page limit and loads more shots.
 */
async function loadMoreShots() {
    currentLimit += SHOTS_PER_PAGE;
    await loadShotHistory();
}

/**
 * Toggles the display of a shot's chart. Fetches full data if necessary.
 * @param {number} shotId - The ID of the shot to show or hide.
 * @param {boolean} show - True to display the chart, false to hide it.
 */
async function toggleShotDisplay(shotId, show) {
    if (show) {
        if (shots.length >= maxCharts) {
            showFeedbackMessage(`Maximum of ${maxCharts} shots can be selected.`);
            applyFilterAndRender(); // Re-render to uncheck the box.
            return;
        }
        try {
            // Fetch the full shot data.
            const result = await eelWithTimeout(eel.get_shot_by_id(shotId)());
            if (result.success) {
                shots.push(result.data);
                renderCharts();
            } else {
                showFeedbackMessage(`Error loading shot #${shotId}.`);
                applyFilterAndRender();
            }
        } catch (error) {
            showFeedbackMessage(`Error loading shot #${shotId}: Connection timed out.`);
            applyFilterAndRender();
        }
    } else {
        shots = shots.filter(s => s.id !== shotId);
        renderCharts();
        applyFilterAndRender(); // Also update list to reflect checkbox state change.
    }
}


// --- User Feedback Functions ---

/**
 * Displays a temporary message in the feedback area of the sidebar.
 * @param {string} message - The message to display.
 */
function showFeedbackMessage(message) {
    const feedbackDiv = document.getElementById('feedback-area');
    feedbackDiv.textContent = message;
    clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => { feedbackDiv.textContent = ''; }, 3000);
}

/**
 * Displays a prominent error message in the main content area.
 * @param {string} error - The error message text.
 */
function showError(error) {
    const chartArea = document.getElementById('chart-area');
    const listArea = document.getElementById('shot-list');
    const errorMessage = `<div class="error-box">Error: Please check the Gaggiuino URL in settings and ensure it's connected to WiFi. <br>If the problem persists, restart the application.<br><br><small> ${error} </small></div>`;


    if (chartArea) chartArea.innerHTML = errorMessage;
    if (listArea) listArea.innerHTML = ''; // Clear any loading messages.

    // Ensure the style for the error box exists.
    if (!document.getElementById('error-box-style')) {
        const errorBoxStyle = document.createElement('style');
        errorBoxStyle.id = 'error-box-style';
        errorBoxStyle.innerHTML = `.error-box { color: #c0504d; padding: 15px; background: var(--card-background); border: 1px solid var(--danger-color); border-radius: 4px; margin: 20px; text-align: center; }`;
        document.head.appendChild(errorBoxStyle);
    }
}


// --- Filtering and List Rendering ---

/**
 * Debounces the filter input to avoid excessive re-rendering while typing.
 */
function handleFilterInput() {
    const filterInput = document.getElementById('profile-filter');
    filterInput.nextElementSibling.style.display = filterInput.value.length > 0 ? 'block' : 'none';
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(applyFilterAndRender, DEBOUNCE_DELAY_MS);
}

/**
 * Clears the filter input and re-renders the list.
 */
function handleClearFilter() {
    const filterInput = document.getElementById('profile-filter');
    filterInput.value = '';
    applyFilterAndRender();
    filterInput.nextElementSibling.style.display = 'none';
    filterInput.focus();
}

/**
 * Toggles the "active" style on the filter button if text is present.
 */
function updateFilterButtonState() {
    const filterInput = document.getElementById('profile-filter');
    const filterButton = document.getElementById('show-filter-btn');
    const isFilterActive = filterInput.value.length > 0;
    filterButton.classList.toggle('filter-active', isFilterActive);
}

/**
 * Switches the sidebar view between the filter input and the main toolbar.
 */
function showFilterView() {
    document.getElementById('sidebar-toolbar').style.display = 'none';
    document.getElementById('filter-view').style.display = 'flex';
    document.getElementById('profile-filter').focus();
}

/**
 * Reverts the sidebar view from the filter input to the main toolbar.
 */
function hideFilterView() {
    document.getElementById('sidebar-toolbar').style.display = 'flex';
    document.getElementById('filter-view').style.display = 'none';
}

/**
 * Switches the main sidebar list between "Recents" and "Favorites".
 * @param {string} view - The view to switch to ('recents' or 'favorites').
 */
function switchSidebarView(view) {
    if (view === currentSidebarView && document.getElementById('sidebar-toolbar').style.display !== 'none') return;

    hideFilterView();

    currentSidebarView = view;
    document.getElementById('show-recents-btn').classList.toggle('active', view === 'recents');
    document.getElementById('show-favorites-btn').classList.toggle('active', view === 'favorites');

    applyFilterAndRender();
}

/**
 * Applies the current filter to the appropriate list (recents or favorites) and renders it.
 */
function applyFilterAndRender() {
    const filterText = document.getElementById('profile-filter').value.toLowerCase();
    const sourceList = (currentSidebarView === 'recents') ? shotHistory : favoriteShots;

    let listToRender;
    if (filterText.length >= 3) {
        listToRender = sourceList.filter(shot => (shot.profile_name || '').toLowerCase().includes(filterText));
    } else {
        listToRender = [...sourceList];
    }

    renderSidebarList(listToRender);
    updateFilterButtonState();
}

/**
 * Renders the provided list of shot summaries into the sidebar.
 * @param {Array<object>} listToRender - The array of shot summaries to display.
 */
function renderSidebarList(listToRender) {
    const container = document.getElementById('shot-list');
    container.innerHTML = '';

    if (listToRender.length === 0) {
        let message = '';
        const filterText = document.getElementById('profile-filter').value;
        if (currentSidebarView === 'recents') {
            message = filterText ? 'No shots match filter.' : (shotHistory.length === 0 ? 'Gaggiuino not found or no shots.' : 'No recent shots found.');
        } else {
            message = filterText ? 'No favorites match filter.' : (favoriteShots.length === 0 ? 'No favorites yet. Mark a shot with the star icon on its chart.' : 'No favorites found.');
        }
        container.innerHTML = `<div class="loading">${message}</div>`;
    } else {
        listToRender.forEach(shot => {
            const isActive = shots.some(s => s.id === shot.id);
            const item = document.createElement('div');
            item.className = 'shot-item';

            item.onclick = (event) => {
                const checkbox = item.querySelector('.shot-checkbox');
                // Allow clicking anywhere on the item to toggle the checkbox.
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

    // Add the "Load More" button only if we are in the 'recents' view.
    if (currentSidebarView === 'recents') {
        container.insertAdjacentHTML('beforeend', `<div class="load-more-container"><button id="load-more-btn" class="load-more" onclick="loadMoreShots()">Load More</button></div>`);
        const loadButton = document.getElementById('load-more-btn');
        if (loadButton) {
            if (allShotsLoaded) {
                loadButton.textContent = 'All Shots Loaded';
                loadButton.disabled = true;
            } else {
                loadButton.disabled = isLoading;
                loadButton.textContent = isLoading ? 'Loading...' : 'Load More';
            }
        }
    }
}


// --- Chart Management and Rendering ---

/**
 * Removes a specific shot's chart from the display.
 * @param {number} shotIdToClear - The ID of the shot to remove.
 */
function clearShot(shotIdToClear) {
    shots = shots.filter(s => s.id !== shotIdToClear);
    renderCharts();
    applyFilterAndRender(); // Re-render sidebar to update checkbox state.
}

/**
 * Renders all currently selected shots as charts in the main content area.
 */
function renderCharts() {
    const container = document.getElementById('chart-area');
    container.innerHTML = '';

    // Destroy any existing Chart.js instances to prevent memory leaks.
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};

    // Sort charts to show favorites first, then by newest shot ID.
    shots.sort((a, b) => {
        const aIsFav = favoriteShots.some(fav => fav.id === a.id);
        const bIsFav = favoriteShots.some(fav => fav.id === b.id);
        if (bIsFav !== aIsFav) return bIsFav - aIsFav;
        return b.id - a.id; // Secondary sort by ID, newest first.
    });

    // Find the longest shot duration to create a common x-axis scale.
    const maxDuration = Math.max(0, ...shots.map(s => s.real_duration));
    const commonXMax = Math.ceil((maxDuration || 30) / 5) * 5;

    shots.forEach((shot) => {
        const isFavorite = favoriteShots.some(fav => fav.id === shot.id);
        const starIcon = isFavorite ? starFilledSVG : starOutlineSVG;
        const chartId = `chart-${shot.id}`;

        container.insertAdjacentHTML('beforeend', `
            <div class="chart-card">
                <div class="chart-header">
                    <div class="chart-header-left">
                        <span class="shot-id">#${shot.id}</span>
                        <span class="profile-name">${shot.profile_name}</span>
                    </div>
                    <div class="chart-header-right">
                        <button class="favorite-btn ${isFavorite ? 'is-favorite' : ''}" onclick="toggleFavoriteStatus(${shot.id})" title="Toggle Favorite">${starIcon}</button>
                        <span class="shot-date">${shot.date}</span>
                        <button class="close-btn" onclick="clearShot(${shot.id})">×</button>
                    </div>
                </div>
                <div class="chart-container"><canvas id="${chartId}"></canvas></div>
            </div>`);

        renderSingleChart(shot, chartId, commonXMax);
    });
}

/**
 * Renders a single shot chart using Chart.js.
 * @param {object} shot - The full shot data object.
 * @param {string} canvasId - The ID of the canvas element for this chart.
 * @param {number} commonXMax - The maximum value for the x-axis.
 */
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

    // Conditionally add weight flow if data is available and meaningful.
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
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'right',
                    align: 'center',
                    labels: {
                        boxWidth: 0,
                        font: { size: 13 },
                        color: axisColor,
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
                                .filter(item => item.text); // Filter out items without a label (e.g., target lines).
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
                    type: 'linear',
                    position: 'bottom',
                    title: { display: true, text: 'Time (seconds)', color: axisColor },
                    ticks: { stepSize: 5, callback: (v) => v + 's', color: axisColor },
                    grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' },
                    max: commonXMax,
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Pressure/Flow', color: axisColor },
                    ticks: { color: axisColor },
                    beginAtZero: true,
                    grid: { color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Temp/Weight', color: axisColor },
                    ticks: { color: axisColor },
                    beginAtZero: true,
                    grid: { drawOnChartArea: false } // Avoid cluttering the chart with a third grid.
                }
            }
        }
    });
}