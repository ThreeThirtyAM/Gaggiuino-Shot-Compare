# =====================================================================================
# Gaggiuino Shot Compare - Backend Logic (main.py)
# =====================================================================================
# This file contains the Python backend for the application.
# It uses the 'eel' library to create a web-based GUI and the 'requests'
# library to communicate with the Gaggiuino coffee machine's API.
# All logic for fetching and processing shot data from the machine resides here.
# =====================================================================================

import eel
import requests
from datetime import datetime

# --- Configuration & Setup ---

# All API logic is consolidated here.
# Assumes the Gaggiuino API returns certain values (pressure, temp, flow, weight)
# as integers that need to be divided by 10 to get the real value.

# Initialize Eel, pointing it to the 'web' directory where the HTML, CSS, and JS files are located.
eel.init('web')


# --- Coffee Machine API Interaction Class ---

class CoffeeMachineAPI:
    """
    A dedicated class to handle all communication with the Gaggiuino API.
    This keeps the API logic organized and separate from the web server logic.
    """
    def __init__(self, base_url="http://gaggiuino.local", timeout=5):
        """
        Initializes the API client.
        
        Args:
            base_url (str): The network address of the Gaggiuino machine.
            timeout (int): The number of seconds to wait for a response before giving up.
        """
        self.base_url = base_url
        self.timeout = timeout
        # Using a requests.Session() object is more efficient as it can reuse
        # the underlying TCP connection for multiple requests to the same host.
        self.session = requests.Session()

    def get_latest_shot_id(self):
        """
        Fetches the ID of the most recent shot from the Gaggiuino API.
        
        Returns:
            int: The ID of the latest shot.
            
        Raises:
            Exception: If the request fails or the response is not as expected.
        """
        try:
            # Make a GET request to the specific API endpoint for the latest shot.
            response = self.session.get(f"{self.base_url}/api/shots/latest", timeout=self.timeout)
            # This line will automatically raise an error for bad responses (like 404 Not Found or 500 Server Error).
            response.raise_for_status()
            # The API returns a JSON list, so we get the first item [0] and then access the "lastShotId" key.
            # We convert the result to an integer.
            return int(response.json()[0]["lastShotId"])
        except (requests.exceptions.RequestException, ValueError, KeyError, IndexError) as e:
            # This 'except' block is a robust way to handle multiple potential errors:
            # - RequestException: For network problems (e.g., WiFi is off).
            # - ValueError: If the response isn't valid JSON or the ID isn't a number.
            # - KeyError/IndexError: If the JSON structure is different than expected.
            raise Exception(f"Failed to get latest shot ID. Is Gaggiuino on and connected to WiFi? Error: {str(e)}")

    def get_shot_data(self, shot_id):
        """
        Fetches detailed data for a specific shot ID, processes it, and structures it.
        
        Args:
            shot_id (int): The ID of the shot to fetch.
            
        Returns:
            dict: A dictionary containing neatly formatted data for the shot.
            
        Raises:
            Exception: If fetching or parsing the data fails.
        """
        try:
            # Make a GET request for a specific shot by its ID.
            response = self.session.get(f"{self.base_url}/api/shots/{shot_id}", timeout=self.timeout)
            response.raise_for_status()
            raw_data = response.json()

            # --- Data Processing and Formatting ---
            
            datapoints = raw_data.get("datapoints", {})
            
            # Convert the Unix timestamp into a human-readable date string (e.g., "Oct 26, 14:30").
            shot_date = datetime.fromtimestamp(raw_data["timestamp"]).strftime('%b %d, %H:%M')
            
            # The API provides duration as an integer (e.g., 350 for 35.0s). We divide by 10.
            real_duration_sec = raw_data.get("duration", 0) / 10.0
            
            # Create a formatted duration string (e.g., "00m35s").
            total_seconds_rounded = round(real_duration_sec)
            minutes = total_seconds_rounded // 60
            seconds = total_seconds_rounded % 60
            duration_formatted = f"{minutes:02d}m{seconds:02d}s"

            # Get the list of time points and convert each from tenths of a second to seconds.
            timeInShot_raw = datapoints.get("timeInShot", [])
            time_points_in_seconds = [t / 10.0 for t in timeInShot_raw]

            # Get the final weight from the last entry in the shotWeight list.
            final_weight_raw = datapoints.get("shotWeight", [])
            final_weight = final_weight_raw[-1] / 10.0 if final_weight_raw else 0

            # Return a structured dictionary that the JavaScript frontend can easily use.
            return {
                "id": raw_data.get("id"),
                "date": shot_date,
                "profile_name": raw_data.get("profile", {}).get("name", "Unknown Profile"),
                "real_duration": real_duration_sec,
                "duration_formatted": duration_formatted,
                "timePoints": time_points_in_seconds,
                # These list comprehensions efficiently divide every number in the list by 10.0.
                "pressure": [p / 10.0 for p in datapoints.get("pressure", [])],
                "temperature": [t / 10.0 for t in datapoints.get("temperature", [])],
                "flow": [f / 10.0 for f in datapoints.get("pumpFlow", [])],
                "weight": [w / 10.0 for w in datapoints.get("shotWeight", [])],
                "weightFlow": [wf / 10.0 for wf in datapoints.get("weightFlow", [])],
                "targetTemp": raw_data.get("profile", {}).get("waterTemperature"),
                "final_weight": final_weight,
                "targetPressure": [p / 10.0 for p in datapoints.get("targetPressure", [])],
                "targetFlow": [f / 10.0 for f in datapoints.get("targetPumpFlow", [])]
            }
        except (requests.exceptions.RequestException, ValueError, KeyError) as e:
            raise Exception(f"Failed to fetch or parse shot {shot_id}: {str(e)}")

    def get_recent_shots(self, limit=15):
        """
        Gets a summary of recent shots by fetching them one by one, backwards from the latest.
        
        NOTE: This makes one request per shot, which can be slow. This is a limitation
              of the device's API if no bulk endpoint exists.
              
        Args:
            limit (int): The maximum number of recent shots to fetch.
        
        Returns:
            list: A list of dictionaries, where each dictionary is a shot summary.
        
        Raises:
            Exception: If getting the latest shot ID fails.
        """
        try:
            # First, find out where to start counting down from.
            latest_id = self.get_latest_shot_id()
            recent_shots = []
            current_id = latest_id
            
            # Loop backwards from the latest ID until we have enough shots or we reach ID 0.
            while current_id > 0 and len(recent_shots) < limit:
                try:
                    # For each ID, get the full shot data.
                    shot_data = self.get_shot_data(current_id)
                    # Create a smaller summary dictionary to send to the frontend for the list view.
                    recent_shots.append({
                        "id": shot_data["id"],
                        "profile_name": shot_data["profile_name"],
                        "date": shot_data["date"],
                        "final_weight": shot_data["final_weight"],
                        "duration_formatted": shot_data["duration_formatted"]
                    })
                except Exception as e:
                    # If a single shot fails to load, we print an error and continue to the next one.
                    print(f"Skipping shot {current_id}: {e}")
                current_id -= 1
            return recent_shots
        except Exception as e:
            # This catches errors from the initial get_latest_shot_id call.
            print(f"Error getting recent shots: {str(e)}")
            # Re-raise the exception so the frontend knows about the failure.
            raise e

# Create a single instance of our API class to be used by the Eel functions.
coffee_api = CoffeeMachineAPI()


# --- Eel Exposed Functions ---
# Functions decorated with '@eel.expose' can be called directly from JavaScript.

@eel.expose
def get_shot_by_id(shot_id):
    """
    Exposes the get_shot_data method to JavaScript.
    It wraps the result in a dictionary to indicate success or failure.
    """
    try:
        shot_data = coffee_api.get_shot_data(shot_id)
        return {"success": True, "data": shot_data}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def get_recent_shots(limit=15):
    """
    Exposes the get_recent_shots method to JavaScript.
    Also wraps the result in a dictionary to indicate success or failure.
    """
    try:
        shots = coffee_api.get_recent_shots(limit)
        return {"success": True, "data": shots}
    except Exception as e:
        return {"success": False, "error": str(e)}

# --- Application Start ---

print("Starting Gaggiuino Shot Compare...")
# Start the Eel application. This opens a window showing 'index.html'.
# The Python script will continue to run in the background, handling API calls.
eel.start('index.html', size=(1200, 800), position=(100, 100))