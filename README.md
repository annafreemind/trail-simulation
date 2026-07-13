# Trail Simulation

A single-page web application for drawing routes on an OpenStreetMap map and simulating movement along them with scheduled stops, speed changes, and time tracking.

Built with [Leaflet](https://leafletjs.com) and OpenStreetMap tiles.

## Features

- **Route building** — click on the map to add waypoints; undo, clear, and fit the map to the route
- **Animation** — move a marker along the route with configurable speed and time acceleration (1×–150×)
- **Scheduled stops** — place stop points on the route with a duration in MM:SS format; the marker pauses automatically when it arrives. Default label `Stopover N`, default duration `02:00`. Orange markers indicate stops; passed stops turn semi-transparent
- **Speed change points** — place speed points on the route; the speed changes when the marker reaches the point. Default label `Speed change N`, default speed 1.7 km/h. Green markers indicate speed points
- **Custom points** — place purple markers anywhere on the map with a custom label to mark locations you consider important
- **Speed units** — switch between km/h and mph; distance display and all speed labels convert automatically
- **Point labels** — toggle permanent labels on stop, speed change, and custom point markers from the sidebar
- **Map layers** — switch between OpenStreetMap and OpenTopoMap (shows elevation contours)
- **POI markers** — predefined points of interest (Kris shorts, Backpack) displayed as transparent circles with red outlines and permanent labels
- **Sun position widget** — a schematic in the bottom-right corner shows the sky horizon with the sun at its current elevation/azimuth, a mountain silhouette at 1500 m, elevation arcs (30°, 60°), and the current time. Sky color transitions from blue → golden → purple → dark as the sun sets, using data from `sun_data.js` (Boquete, Panama, April 1, 5‑minute intervals). Hideable via the toggle button.
- **Reverse direction** — toggle direction mid-animation
- **Follow mode** — automatically pan the map with the marker during animation
- **112 alarm** — configurable notification that triggers at 16:39; timer continues running, marker stops
- **Save / Load routes** — persist routes (including waypoints, stops, speed points, and custom points) to `localStorage` by name. The route list appears as items below the input — click a name to load, click `×` to delete. Routes are stored under the key `trail_routes` and are tied to the domain — clearing browser data or switching domains will remove them. Inspect via `JSON.parse(localStorage.getItem('trail_routes'))` in the browser console.
- **Export / Import** — download all routes plus settings (unit, map layer, toggles) as a `.json` file and load it on another machine to restore everything
- **Tabbed UI** — separate Route and Navigation panels
- **Resizable sidebar** — drag the right edge to resize (240–600 px)
- **Passed point tracking** — visited stops and activated speed points are marked with a green checkmark and strikethrough; the Navigation tab shows start and end times for completed stops and all points in a single combined scrollable list
- **Route-ordered lists** — stops and speed points are sorted by their position along the route, matching the order of traversal

## How to run

1. Make sure **Python 3** is installed:
   - **macOS**: `brew install python3` (install Homebrew from https://brew.sh first if needed)
   - **Ubuntu/Debian**: `sudo apt install python3`
   - **Fedora**: `sudo dnf install python3`
   - **Windows**: Download from https://python.org and check "Add Python to PATH" during installation

2. Open a terminal in this directory and run:

   ```bash
   python3 -m http.server 8000
   ```

3. Open [http://localhost:8000](http://localhost:8000) in a browser.

> Alternatively, use any other static server: `npx http-server`, VS Code Live Server, etc. Opening the HTML file directly (`file://`) may break some Leaflet features.

## Usage

The sidebar header contains controls always visible regardless of the active tab:
- **Map layer selector** — switch between OpenStreetMap and OpenTopoMap
- **Speed unit selector** — switch between km/h and mph
- **Show point labels** — toggle permanent labels on stop and speed point markers
- **Route / Navigation** tab switcher

### Route tab

1. Click the map to add waypoints (Route points mode, active by default)
2. Switch to **Stops** mode — inline fields appear for label (default `Stopover N`) and duration in `MM:SS` format (default `02:00`), then click on the route to place a stop
3. Switch to **Speed** mode — inline fields appear for label (default `Speed change N`) and speed in km/h (default `1.7`), then click on the route to place a speed point
4. Switch to **Custom** mode — enter a label and click anywhere on the map to place a purple marker (not snapped to route, not tracked during animation)
5. Use **Clear route**, **Fit map**, **Undo point** to manage the route
6. Enter a name and click **Save** to persist the route (includes all stops, speed points, and custom points); use the dropdown and **Load** to restore

### Navigation tab

1. Set the start time, speed and unit (km/h or mph), and time acceleration (1×–150×)
2. Click **Start** to begin animation
3. Use **Pause** / **Stop** to control movement; **Stop** resets speed to default
4. **Reverse direction** flips the route mid-animation
5. The lists at the bottom show all scheduled stops and speed points in a single scrollable list sorted by route position, with real-time status: unvisited points show their duration/speed, passed stops show their start and end times

## Sun data

Sun position (elevation, azimuth) for the widget is pre-computed with the [astral](https://astral.readthedocs.io/) library for **Boquete, Panama (8.84309°N, 82.42467°W)** on **April 1, 2014**, local time UTC−5, at 5‑minute intervals.

- **`sun_data.js`** — lookup table with 288 entries

## Requirements

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (for Leaflet CDN and map tiles)
