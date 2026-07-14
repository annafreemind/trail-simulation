# Trail Simulation

A single-page web application for drawing routes on a map and simulating movement with time tracking, sun position, and elevation profile.

Built with [Leaflet](https://leafletjs.com).

## Features

- **Route building** — click the map to add waypoints; undo, clear, fit to route
- **Animation** — marker moves along the route with configurable speed (km/h or mph) and time acceleration (1×–150×)
- **Stop points** — place timed stops on the route; marker pauses and resumes automatically
- **Speed points** — place speed change points on the route; speed updates on arrival
- **Custom points** — place labeled purple markers anywhere on the map (not tracked during animation)
- **Sun widget** — sky horizon schematic with compass, heading arrow, sun position, elevation scale, and sky colors that transition from day → sunset → twilight → night
- **Elevation profile** — route elevation chart with current position marker; data fetched from Open-Elevation API, saved with routes
- **112 alarms** — configurable call notifications at 16:39 and 16:51 with red markers and timed banner
- **Save / Load / Export / Import** — persist routes and settings to `localStorage` or as `.json` files
- **Reverse direction** — flip direction mid-animation
- **Follow mode** — auto-pan the map with the marker
- **Map layers** — switch between OpenStreetMap and OpenTopoMap (with elevation contours)
- **Help modal** — opens README rendered with marked.js

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

The sidebar has two tabs: **Route** and **Navigation**. The header above the tabs contains the map layer selector, speed unit selector, and point labels toggle.

### Route tab

1. Click the map in **Route points** mode (active by default) to add waypoints — each click adds a point connected by a blue line
2. Switch to **Stop points** mode — enter a label and duration (MM:SS), then click on the route to place a stop. The marker will pause here during animation
3. Switch to **Speed points** mode — enter a label and speed value, then click on the route to place a speed point. Speed changes automatically when reached
4. Switch to **Custom points** mode — enter a label and click anywhere on the map to place a purple marker (not tracked during animation)
5. **Clear** removes everything, **Fit map** centers the view on the route, **Undo** removes the last waypoint
6. Enter a name and click **Save** to persist the route (waypoints, stops, speed points, custom points, and elevation data). Saved routes appear in the list below — click a name to load it, click `×` to delete.
7. Use **Export** to download all routes and settings as a `.json` file; **Import** restores them from a previously exported file

> Routes are stored in the browser's `localStorage` under the key `trail_routes`. Clearing browser data or using private/incognito mode will lose saved routes. Keep backups by exporting regularly.

### Navigation tab

1. Set the start time, speed (km/h or mph), and time acceleration (1×–150×) to control the simulation
2. Enable **112 call notifications** to trigger two alarm events at 16:39 and 16:51 with red route markers and a fading banner
3. Enable **Follow mode** to keep the map centered on the moving marker
4. Click **Start** to begin animation; use **Pause / Resume** and **Stop** to control playback
5. **Reverse direction** flips the route mid-animation, useful for round trips
6. The combined list at the bottom shows all stops and speed points sorted by route position, with checkmarks for completed items and timestamps for executed stops

## Widgets

### Sun widget (bottom-right)

A 400×300 canvas showing a first-person sky view:

- **Sky colors** — computed from a mathematical model based on sun elevation; transitions smoothly from blue (day) → warm (sunset) → dark purple (twilight) → dark blue (night)
- **Compass** — north-up circle with N/E/S/W labels, yellow heading arrow (smoothed rotation), sun icon at absolute azimuth
- **Elevation scale** — vertical scale on the left with marks at 30°, 60°, 90°; yellow triangle marks current sun elevation
- **Mountain silhouette** — centered on the horizon for depth reference
- **Ground** — darkens at night
- **Toggle** — ▼/▲ collapses the widget to a small button

### Elevation profile widget (left of sun widget)

An 800×180 canvas showing the route elevation profile:

- **Profile line** — route elevation plotted against distance
- **Labels** — Y-axis shows elevation (m), X-axis shows distance; current elevation shown in caption and sidebar
- **Current position** — yellow dot with dashed vertical line during animation
- **Toggle** — ▼/▲ collapses to a small button
- **Data** — elevation values are fetched for all waypoints from the free [Open-Elevation API](https://api.open-elevation.com) when building or loading a route. If the API is unavailable, the profile shows no data. Fetched data is saved alongside routes for offline use — loading a previously saved route does not re-fetch.

## Data

Sun position tables are pre-computed with the [astral](https://astral.readthedocs.io/) library for **Boquete, Panama (8.84309°N, 82.42467°W)** on **April 1, 2014**, local time UTC−5, at 5‑minute intervals.

- `sun_data.js` — 288-entry lookup table (elevation, azimuth)
- `gen_all.py` — regenerates the table

## Requirements

- A modern web browser
- Internet connection (for Leaflet CDN and map tiles)
