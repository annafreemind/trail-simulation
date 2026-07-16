# Trail Simulation

A single-page web application for drawing routes on a map and simulating movement with time tracking, sun position, elevation profile, and terrain-aware speed adjustment.

Built with [Leaflet](https://leafletjs.com).

## Features

- **Route building** — click the map to add waypoints; undo, clear, fit to route
- **Animated movement** — marker moves along the route at configurable speed and time acceleration (1×–150×)
- **Stop points** — place timed stops anywhere on the route; the marker pauses automatically and resumes after the countdown
- **Speed points** — change speed mid-route at specific waypoints
- **Custom points** — place labeled purple markers anywhere on the map (not tracked during animation, useful for landmarks)
- **Uphill auto-slowdown** — speed decreases proportionally on uphill sections (up to 50% at 14° slope or steeper); slope is computed from elevation data
- **Sun widget** — first-person sky view with compass rose, heading arrow, sun position, and realistic sky colors; full-day sun trajectory on compass and sky; sun icon moves across the sky from sunrise to sunset; compass path shows how the sun arcs through the day
- **Elevation profile** — route elevation chart sampled every 30 meters (matches SRTM source resolution); auto-switches between metric and imperial units; smooth profile line with moving-average filtering
- **112 alarms** — two call notifications at 16:39 and 16:51 with red markers on the route and a fading banner
- **Save / Load / Export / Import** — routes and settings persist in your browser's storage and can be backed up as `.json` files; export includes your speed unit, map layer, and other preferences
- **Follow mode** — map auto-pans to keep the moving marker centered
- **Map layers** — switch between OpenStreetMap, OpenTopoMap, and Esri satellite imagery
- **Help modal** — opens this README in-app

## How to run

1. Download the latest release from the [Releases](https://github.com/annafreemind/trail-simulation/releases) page — grab the `Source code (zip)` from the Assets section of the most recent release. Unzip the archive.

2. Make sure **Python 3** is installed:
   - **macOS**: `brew install python3` (install Homebrew from https://brew.sh first if needed)
   - **Ubuntu/Debian**: `sudo apt install python3`
   - **Fedora**: `sudo dnf install python3`
   - **Windows**: Download from https://python.org and check "Add Python to PATH" during installation

3. Open a terminal in the unzipped directory and run:

   ```bash
   python3 -m http.server 8000
   ```

4. Open [http://localhost:8000](http://localhost:8000) in a browser.

> Alternatively, use any other static server: `npx http-server`, VS Code Live Server, etc. Opening the HTML file directly (`file://`) may break some Leaflet features.

## Getting started

The sidebar is split into two tabs: **Route** (for building and managing the route) and **Navigation** (for controlling the simulation). The top bar has a map layer picker, speed unit toggle (km/h ↔ mph), and a checkbox to show or hide point labels on the map.

### Building a route

1. Open the **Route** tab. By default you are in **Route points** mode.
2. Click on the map to add waypoints — each click adds a blue dot connected by a line.
3. Use **Undo** to remove the last waypoint, **Clear** to start over, or **Fit map** to center the view on your route.

### Adding stops

Use stop points to simulate rest breaks, checkpoints, or any pause along the route — the timer keeps running while the marker waits.

1. Switch to **Stop points** mode. A small form appears — enter a label and a duration (MM:SS, e.g. `05:00` for 5 minutes).
2. Click on the route line to place the stop. It appears as an orange circle on the route and in the list below.
3. During animation, the marker will pause at each stop for the specified duration, then continue automatically.
4. To remove a stop, click the `×` next to it in the list.

### Adding speed changes

Use speed points to simulate terrain changes, fatigue, or different paces in different segments — slower on steep climbs, faster on flat ground.

1. Switch to **Speed points** mode. Enter a label and a new speed value.
2. Click on the route line to place the speed point. It appears as a green circle.
3. When the moving marker reaches the speed point, the current speed changes to the specified value. Passed speed points are shown with a checkmark (✓).

### Adding custom markers

Use custom markers to mark any location on the map that seems important to you — landmarks, viewpoints, water sources, danger zones, or any point of interest. They appear on the map but don't affect the simulation.

1. Switch to **Custom points** mode. Enter a label.
2. Click **anywhere** on the map (not necessarily on the route) to place a purple marker.
3. Custom points are purely visual — they are not tracked during animation and do not affect movement.

### Saving and backing up

1. Enter a name in the **Route name** field and click **Save**. The route is stored in your browser and appears in the route list.
2. Click a saved route's name to load it. Click `×` to delete it.
3. Use **Export** to download all routes — together with your current settings — as a `.json` backup file. Settings include speed unit, map layer, label visibility, and follow mode.
4. Use **Import** to restore from a previously exported file. You will be asked to confirm before overwriting existing data. Imported settings (speed unit, map layer, etc.) are applied automatically.

> **Important**: Routes and settings are stored locally in your browser. Clearing browser data or using private/incognito mode will lose them. Export regularly to keep backups.

### Running the simulation

1. Open the **Navigation** tab.
2. Set the **Start time** (default 13:15) and **Base speed** (default 1.7 km/h).
3. Adjust the **Time acceleration** slider (1× to 150×) to speed up or slow down the simulation.
4. Click **Start** to begin. Use **Pause** to pause and **Stop** to end the simulation.

During animation you will see:
- The moving marker traveling along the route
- The **Timer** counting elapsed real time
- The **Current time** showing simulated clock time
- The **Current speed** — shows the effective speed including uphill slowdown if enabled (e.g. `1.2 km/h ↑8°`)
- Stops pausing the marker with a countdown
- Speed points updating the current speed when reached

### Uphill auto-slowdown

When enabled (checked by default in the Navigation tab), the simulation detects uphill slopes and reduces speed proportionally:

| Slope | Speed reduction |
|-------|----------------|
| 0°    | 100% (no change) |
| 7°    | ~75% of base speed |
| 14°   | 50% of base speed |
| 14°+  | 50% (minimum, clamped) |

The formula: `effective = base × max(0.5, 1 − slope°/28)`

Slope is computed from elevation data sourced from the SRTM1 digital elevation model (NASA, 30 m resolution) pre-packaged as a local grid for the Boquete area. No API calls are needed — elevation lookups are instantaneous.

Hover over the **`?`** icon next to the checkbox for a quick summary.

### 112 call notifications

Two alarm points are configured at **16:39** and **16:51**. When the simulated time crosses these timestamps, red markers appear on the route and a banner flashes at the top of the screen for 10 seconds. The checkbox in the Navigation tab enables or disables this feature.

## Widgets

### Sun widget (bottom-right)

A 400×300 canvas showing the sky as you would see it facing the current heading:

- **Sky** — colors driven by three data sources: (1) **sun elevation** — controls hue: bright blue by day, orange at sunset, dark blue at night; (2) **solar radiation** — historical ERA5 data (W/m²) for Boquete, April 1 2014, fetched from the [Open-Meteo Archive API](https://open-meteo.com/en/docs/historical-weather-api): brightness dims as radiation drops, not just by sun angle; (3) **sun azimuth** — a subtle dark shadow on the side opposite the sun, visible when the sun is below 30° elevation
- **Sun in the sky** — a glowing sun icon moves across the sky from right (east, sunrise) to left (west, sunset); its height matches the actual sun elevation in degrees — low on the horizon at dawn, high overhead at noon
- **Sun trajectory** — a subtle dashed line traces the sun's full daily path through the sky, showing how it rises, climbs, and descends
- **Compass** — a circle with cardinal directions (N/E/S/W); a red arrow shows the current heading
- **Sun on the compass** — the sun icon sits inside the compass circle at a distance from center that reflects its elevation: near the center when overhead, near the edge when low; a dashed yellow path shows the sun's trajectory across the compass, curving toward the south at midday (true for the northern hemisphere)
- **Elevation scale** — vertical marks on the left side at 30°, 60°, and 90°; a yellow marker shows the current sun elevation
- **Mountain silhouette** — centered on the horizon for visual depth
- Click **▼** to collapse the widget to a small button, **▲** to expand it

### Elevation profile widget (left of sun widget)

An 800×180 canvas showing the elevation along your route:

- **Profile line** — the route's elevation plotted against distance, smoothed with a moving average for a clean, readable curve
- **Y-axis** — elevation in **meters** or **feet** (switches automatically with the speed unit)
- **X-axis** — distance in **kilometers** or **miles** (switches with the speed unit; values under 1 mile show in feet)
- **Position marker** — a red dot with a dashed vertical line showing the current location during animation
- **Caption** — shows current, maximum, and minimum elevation with units
- **Sidebar info** — current elevation in the Navigation tab
- Click **▼** to collapse, **▲** to expand

Elevation data comes from the SRTM1 digital elevation model (NASA, 30 m resolution), pre-packaged as a local grid covering a 30×30 km area around Boquete (~1.8 MB). Lookups are instantaneous — no API calls, no loading spinners, no dependency on external services. Elevation for any sampled point is computed via bilinear interpolation from the grid.

Adding a new waypoint fetches elevation only for the new segment, not the entire route. Undoing a waypoint simply trims the existing elevation data — no API call at all. Full re-fetch only happens when loading a saved route or when elevation data is missing.

The data is saved with the route so loading is instant next time. If you load an older route saved before elevation data was included, or one with sparse data, the app will automatically re-fetch and update the saved route.

The profile line is gently smoothed to remove the natural stair-step pattern of the digital elevation model, while preserving actual terrain features like hills and valleys.

## Data sources

- **Map tiles**: [OpenStreetMap](https://openstreetmap.org), [OpenTopoMap](https://opentopomap.org), and [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)
- **Elevation**: SRTM1 (NASA) — pre-packaged local grid, no API dependency
- **Sun position**: pre-computed with [astral](https://astral.readthedocs.io/) for Boquete, Panama (8.843°N, 82.425°W), April 1 2014, UTC−5, 5-minute intervals
- **Weather**: [Open-Meteo Archive API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5 reanalysis) — historical temperature, wind, cloud cover, and solar radiation for Boquete (8.84°N, 82.42°W), April 1 2014, hourly; spatial resolution ~28×28 km (0.25° grid), temperature accuracy ±1–2°C, cloud cover lower accuracy in tropics
