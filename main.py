# =====================================================================================
# Gaggiuino Shot Compare - Backend Logic (main.py)
# =====================================================================================
# This file contains the Python backend for the application. It uses the 'eel'
# library to create a web-based GUI and the 'requests' library to communicate
# with the Gaggiuino coffee machine's API. All logic for fetching, caching,
# and processing shot data from the machine resides here.
# =====================================================================================

import eel
import requests
import threading
import json
import os
from datetime import datetime
from pathlib import Path

# --- Persistent Settings Management ---
def get_settings_path():
    """Return the path to the user settings JSON file."""
    if os.name == "nt":  # Windows
        base_dir = Path(os.getenv("APPDATA", Path.home()))
    else:  # Linux/Mac
        base_dir = Path.home() / ".config"
    settings_dir = base_dir / "GaggiuinoShotCompare"
    settings_dir.mkdir(parents=True, exist_ok=True)
    return settings_dir / "settings.json"

def load_settings():
    """Load settings JSON from disk."""
    path = get_settings_path()
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading settings file: {e}")
    return {}  # defaults if missing or invalid

def save_settings(data):
    """Save settings JSON to disk."""
    path = get_settings_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving settings file: {e}")
        return False

# --- Configuration & Setup ---

# Initialize Eel, pointing it to the 'web' directory where the HTML, CSS, and JS files are.
eel.init('web')

# A threshold for consecutive failed fetches to determine if all shots are loaded.
# This is a DATA AVAILABILITY check, not a network timeout. It prevents the app
# from endlessly trying to fetch non-existent shot IDs (e.g., after a machine reset).
CONSECUTIVE_FAILURE_THRESHOLD = 25
SHOTS_PER_PAGE = 12

# --- Global Cache and State Management ---
shot_cache = []
cache_lock = threading.Lock()
background_fetch_thread = None
all_shots_loaded_on_server = False


# --- Coffee Machine API Interaction Class ---
class CoffeeMachineAPI:
    """
    A dedicated class to handle all communication with the Gaggiuino API.
    This encapsulates API logic, keeping it organized and separate from the
    web server and application state logic.
    """
    def __init__(self, base_url="http://gaggiuino.local", timeout=5):
        """
        Initializes the API handler.
        Args:
            base_url (str): The base URL of the Gaggiuino machine.
            timeout (int): The network-level timeout in seconds for each request.
        """
        self.base_url = base_url
        # This is the NETWORK-LEVEL timeout. It ensures a single request to the
        # Gaggiuino itself doesn't hang the Python backend indefinitely.
        self.timeout = timeout
        self.session = requests.Session()

    def get_latest_shot_id(self):
        """
        Fetches the ID of the most recent shot from the Gaggiuino.
        Returns:
            int: The last shot ID.
        Raises:
            Exception: If the API request fails or the response is invalid.
        """
        try:
            response = self.session.get(f"{self.base_url}/api/shots/latest", timeout=self.timeout)
            response.raise_for_status()
            return int(response.json()[0]["lastShotId"])
        except (requests.exceptions.RequestException, ValueError, KeyError, IndexError) as e:
            raise Exception(f"Failed to get latest shot ID. Is Gaggiuino on and connected to WiFi? Error: {str(e)}")

    def get_shot_data(self, shot_id):
        """
        Fetches and processes the complete data for a single shot by its ID.
        Args:
            shot_id (int): The ID of the shot to retrieve.
        Returns:
            dict: A processed and formatted dictionary of the shot data.
        Raises:
            Exception: If the API request fails or the response is malformed.
        """
        try:
            response = self.session.get(f"{self.base_url}/api/shots/{shot_id}", timeout=self.timeout)
            response.raise_for_status()
            raw_data = response.json()

            # --- Data Processing and Formatting ---
            datapoints = raw_data.get("datapoints", {})
            shot_date = datetime.fromtimestamp(raw_data["timestamp"]).strftime('%b %d, %H:%M')

            # Gaggiuino stores duration and data points as integers (e.g., tenths of a second).
            # We convert them to standard units (seconds, bar, g, etc.).
            real_duration_sec = raw_data.get("duration", 0) / 10.0

            total_seconds_rounded = round(real_duration_sec)
            minutes = total_seconds_rounded // 60
            seconds = total_seconds_rounded % 60
            duration_formatted = f"{minutes:02d}m{seconds:02d}s"

            timeInShot_raw = datapoints.get("timeInShot", [])
            time_points_in_seconds = [t / 10.0 for t in timeInShot_raw]

            final_weight_raw = datapoints.get("shotWeight", [])
            final_weight = final_weight_raw[-1] / 10.0 if final_weight_raw else 0

            return {
                "id": raw_data.get("id"), "date": shot_date, "profile_name": raw_data.get("profile", {}).get("name", "Unknown Profile"),
                "real_duration": real_duration_sec, "duration_formatted": duration_formatted, "timePoints": time_points_in_seconds,
                "pressure": [p / 10.0 for p in datapoints.get("pressure", [])],
                "temperature": [t / 10.0 for t in datapoints.get("temperature", [])],
                "flow": [f / 10.0 for f in datapoints.get("pumpFlow", [])],
                "weight": [w / 10.0 for w in datapoints.get("shotWeight", [])],
                "weightFlow": [wf / 10.0 for wf in datapoints.get("weightFlow", [])],
                "targetTemp": raw_data.get("profile", {}).get("waterTemperature"), "final_weight": final_weight,
                "targetPressure": [p / 10.0 for p in datapoints.get("targetPressure", [])],
                "targetFlow": [f / 10.0 for f in datapoints.get("targetPumpFlow", [])]
            }
        except (requests.exceptions.RequestException, ValueError, KeyError) as e:
            raise Exception(f"Failed to fetch or parse shot {shot_id}: {str(e)}")

# Create a single, persistent instance of the API class.
coffee_api = CoffeeMachineAPI()


# --- Internal Helper for Fetching Logic ---
def _fetch_and_cache_shots(start_id, limit):
    """
    Internal helper to fetch a number of shots and add them to the cache.
    This consolidates the fetching logic used by both blocking and background fetches.
    Args:
        start_id (int): The shot ID to start fetching downwards from.
        limit (int): The maximum number of shots to fetch.
    Returns:
        bool: True if all shots are likely loaded (hit the failure threshold), False otherwise.
    """
    current_id = start_id
    shots_fetched = 0
    consecutive_failures = 0

    while current_id > 0 and shots_fetched < limit:
        try:
            shot_data = coffee_api.get_shot_data(current_id)
            consecutive_failures = 0
            with cache_lock:
                # Check for duplicates before appending to prevent inconsistencies.
                if not any(s['id'] == shot_data['id'] for s in shot_cache):
                    shot_cache.append({
                        "id": shot_data["id"], "profile_name": shot_data["profile_name"], "date": shot_data["date"],
                        "final_weight": shot_data["final_weight"], "duration_formatted": shot_data["duration_formatted"]
                    })
            shots_fetched += 1
        except Exception as e:
            print(f"Fetch helper skipping shot {current_id}: {e}")
            consecutive_failures += 1
            if consecutive_failures >= CONSECUTIVE_FAILURE_THRESHOLD:
                print(f"Fetch helper: Reached {CONSECUTIVE_FAILURE_THRESHOLD} consecutive failures. Assuming all shots loaded.")
                return True  # All shots are considered loaded

        # Yield control back to the Eel event loop for a fraction of a second.
        # This allows Eel to process pending WebSocket messages (like our keep-alive
        # ping) and prevents a series of blocking `requests` calls from starving
        # the connection and causing a timeout.
        eel.sleep(0.01)
        current_id -= 1

    # Return True if we've run out of IDs to check or hit the threshold.
    return current_id <= 0 or consecutive_failures >= CONSECUTIVE_FAILURE_THRESHOLD


# --- Background Worker Function ---
def _fetch_shots_worker(start_id, num_to_fetch):
    """
    This function runs in a background thread to pre-fetch shots, populating
    the cache ahead of user requests.
    Args:
        start_id (int): The shot ID to start fetching downwards from.
        num_to_fetch (int): The number of shots to attempt to fetch.
    """
    global all_shots_loaded_on_server

    # Use the consolidated fetch logic.
    hit_end_of_shots = _fetch_and_cache_shots(start_id, num_to_fetch)

    if hit_end_of_shots:
        all_shots_loaded_on_server = True

    print(f"Background fetch complete. Cache now has {len(shot_cache)} shots. All loaded: {all_shots_loaded_on_server}")


# --- Eel Exposed Functions ---
# These functions are callable directly from the JavaScript frontend.

@eel.expose
def load_user_settings():
    """Load application settings to persistent storage"""
    return load_settings()

@eel.expose
def save_user_settings(data):
    """Save application settings to persistent storage"""
    return save_settings(data)

@eel.expose
def ping():
    """
    A simple keep-alive function called periodically by the frontend. Its
    only purpose is to generate traffic on the WebSocket to prevent network
    intermediaries from closing the connection due to inactivity.
    Returns:
        str: A simple "pong" response to confirm the connection is live.
    """
    return "pong"

@eel.expose
def update_gaggiuino_url(new_url):
    """
    Updates the Gaggiuino base URL in the backend and clears all caches.
    This is called from the settings panel on the frontend.
    Args:
        new_url (str): The new URL or IP address for the Gaggiuino machine.
    """
    global shot_cache, background_fetch_thread, all_shots_loaded_on_server
    print(f"Gaggiuino URL updated to: {new_url}")
    coffee_api.base_url = new_url
    with cache_lock:
        shot_cache = []
    background_fetch_thread = None
    all_shots_loaded_on_server = False


@eel.expose
def get_shot_by_id(shot_id):
    """
    Fetches the full, processed data for a single shot by its ID.
    Args:
        shot_id (int): The ID of the shot to fetch.
    Returns:
        dict: A dictionary with a 'success' flag and either 'data' or 'error'.
    """
    try:
        shot_data = coffee_api.get_shot_data(shot_id)
        return {"success": True, "data": shot_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@eel.expose
def get_latest_shot_id():
    """
    Fetches the ID of the most recent shot. Used by the frontend to check for new shots.
    Returns:
        dict: A dictionary with a 'success' flag and either 'data' (the ID) or 'error'.
    """
    try:
        latest_id = coffee_api.get_latest_shot_id()
        return {"success": True, "data": latest_id}
    except Exception as e:
        return {"success": False, "error": str(e)}


@eel.expose
def get_recent_shots(limit=15, force_refresh=False):
    """
    Retrieves a list of recent shot summaries, using caching and background
    fetch-ahead to improve performance.
    Args:
        limit (int): The number of shots the frontend currently wants to display.
        force_refresh (bool): If True, clears the cache and fetches fresh data.
    Returns:
        dict: A dictionary containing 'success', 'data' (the list of shots),
              and 'all_loaded' (a boolean flag).
    """
    global shot_cache, background_fetch_thread, all_shots_loaded_on_server
    try:
        if force_refresh:
            print("Force refresh requested by client. Clearing backend cache.")
            with cache_lock:
                shot_cache = []
            all_shots_loaded_on_server = False

        # --- Blocking Fetch ---
        # Fulfills the immediate request if the cache is insufficient.
        with cache_lock:
            shots_needed = limit - len(shot_cache)

        if shots_needed > 0 and not all_shots_loaded_on_server:
            print(f"Cache has {len(shot_cache)} shots, need {limit}. Fetching more.")

            start_id = 0
            with cache_lock:
                if not shot_cache:
                    start_id = coffee_api.get_latest_shot_id()
                else:
                    # Sort to find the oldest shot currently in cache to continue from there.
                    shot_cache.sort(key=lambda s: s['id'])
                    start_id = shot_cache[0]['id'] - 1

            # Use the consolidated fetch logic for the blocking fetch.
            if start_id > 0:
                hit_end_of_shots = _fetch_and_cache_shots(start_id, shots_needed)
                if hit_end_of_shots:
                    all_shots_loaded_on_server = True

        # --- Prepare Data to Return ---
        with cache_lock:
            shot_cache.sort(key=lambda s: s['id'], reverse=True)
            shots_to_return = shot_cache[:limit]

        # --- Background Fetch-Ahead ---
        # Proactively fetches the next page of shots in a separate thread.
        if not all_shots_loaded_on_server:
            if background_fetch_thread is None or not background_fetch_thread.is_alive():
                try:
                    # Start fetching from the ID after the last one we just returned.
                    start_from_id = shots_to_return[-1]['id'] - 1 if shots_to_return else 0
                    if start_from_id > 0:
                        background_fetch_thread = threading.Thread(
                            target=_fetch_shots_worker,
                            args=(start_from_id, SHOTS_PER_PAGE),
                            daemon=True
                        )
                        background_fetch_thread.start()
                        print(f"Started background fetch from shot {start_from_id}")
                except Exception as thread_err:
                    print(f"Error launching background fetch thread: {thread_err}")
            else:
                print("Background fetch is already running.")
        else:
            print("All shots have been loaded. No background fetch needed.")

        return {"success": True, "data": shots_to_return, "all_loaded": all_shots_loaded_on_server}

    except Exception as e:
        return {"success": False, "error": str(e), "all_loaded": all_shots_loaded_on_server}

# --- Application Start ---

print("Starting Gaggiuino Shot Compare...")

# The block=False argument tells Eel to not block the main script here.
# The mode='default' (or any other mode) with disable_cache=True can also
# improve reliability in packaged apps. The most important part is that
# we will now manage the application lifecycle ourselves.
eel.start('index.html', size=(1200, 800), position=(100, 100), block=False)

# By setting block=False, the script continues. We now need to keep it
# alive manually. This loop will run as long as there are any open
# Eel connections (i.e., open browser windows).
try:
    while True:
        eel.sleep(1.0) # Sleep for 1 second to prevent high CPU usage.
except (SystemExit, MemoryError, KeyboardInterrupt):
    # This block allows the app to exit cleanly on normal close signals
    # or to be killed by the task manager.
    print("Application exiting...")
except Exception as e:
    # Best-effort crash catching: if any other unexpected error happens in
    # the underlying Eel/Gevent libs, log it and exit gracefully.
    print(f"An unexpected error occurred in the main event loop: {e}")