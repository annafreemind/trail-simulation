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
- **Elevation profile** — route elevation chart with high-resolution data (sampled every 2 meters); auto-switches between metric and imperial units; smooth profile line with moving-average filtering
- **112 alarms** — two call notifications at 16:39 and 16:51 with red markers on the route and a fading banner
- **Save / Load / Export / Import** — routes and settings persist in your browser's storage and can be backed up as `.json` files; export includes your speed unit, map layer, and other preferences
- **Follow mode** — map auto-pans to keep the moving marker centered
- **Map layers** — switch between OpenStreetMap and OpenTopoMap
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

Slope is computed from elevation data fetched from the [Open-Elevation API](https://api.open-elevation.com). Downhill sections are not affected — only uphill slopes slow you down. When elevation data is still loading, the current speed shows "Loading elevation…" and the movement runs at full base speed until data is ready.

Hover over the **`?`** icon next to the checkbox for a quick summary.

### 112 call notifications

Two alarm points are configured at **16:39** and **16:51**. When the simulated time crosses these timestamps, red markers appear on the route and a banner flashes at the top of the screen for 10 seconds. The checkbox in the Navigation tab enables or disables this feature.

## Widgets

### Sun widget (bottom-right)

A 400×300 canvas showing the sky as you would see it facing the current heading:

- **Sky** — colors change throughout the day based on sun elevation: bright blue during daylight, warm yellows and oranges at sunset, deep purple at twilight, dark blue at night
- **Sun in the sky** — a glowing sun icon moves across the sky from right (east, sunrise) to left (west, sunset); its height matches the actual sun elevation in degrees — low on the horizon at dawn, high overhead at noon
- **Sun trajectory** — a subtle dashed line traces the sun's full daily path through the sky, showing how it rises, climbs, and descends
- **Compass** — a circle with cardinal directions (N/E/S/W); a red arrow shows the current heading
- **Sun on the compass** — the sun icon sits inside the compass circle at a distance from center that reflects its elevation: near the center when overhead, near the edge when low; a dashed yellow path shows the sun's trajectory across the compass, curving toward the south at midday (true for the northern hemisphere)
- **Elevation scale** — vertical marks on the left side at 30°, 60°, and 90°; a yellow marker shows the current sun elevation
- **Mountain silhouette** — centered on the horizon for visual depth
- **Ground** — darkens at night for a realistic look
- Click **▼** to collapse the widget to a small button, **▲** to expand it

### Elevation profile widget (left of sun widget)

An 800×180 canvas showing the elevation along your route:

- **Profile line** — the route's elevation plotted against distance, smoothed with a moving average for a clean, readable curve
- **Y-axis** — elevation in **meters** or **feet** (switches automatically with the speed unit)
- **X-axis** — distance in **kilometers** or **miles** (switches with the speed unit; values under 1 mile show in feet)
- **Position marker** — a red dot with a dashed vertical line showing the current location during animation
- **Caption** — shows current, maximum, and minimum elevation with units
- **Sidebar info** — current elevation in the Navigation tab
- A small spinner appears while data is loading
- Click **▼** to collapse, **▲** to expand

Elevation data is fetched from the free [Open-Elevation API](https://api.open-elevation.com) every **2 meters** along the route — not just at waypoints. This gives a detailed, accurate profile even for routes with sparse waypoints. Because the API has a per-request limit, the data is fetched in batches with a small delay between them to be respectful to the service.

The data is saved with the route so loading is instant next time. If you load an older route saved before this feature was added (sparse elevation data), the app will automatically re-fetch at the higher resolution and update the saved route.

The profile line is gently smoothed to remove the natural stair-step pattern of the digital elevation model, while preserving actual terrain features like hills and valleys.

### Map markers guide

- 🔵 **Blue dots** — route waypoints (vertices)
- 🟠 **Orange circles** — stop points (pauses during animation)
- 🟢 **Green circles** — speed points (speed changes)
- 🟣 **Purple circles** — custom markers (visual only)
- 🔴 **Red circles** — 112 call alarm points
- 5️⃣0️⃣8️⃣ **Red teardrop** — reference point "508"
- 🔴 **Hollow red circles** — permanent landmarks (Kris shorts, Backpack)

## Data sources

- **Map tiles**: [OpenStreetMap](https://openstreetmap.org) and [OpenTopoMap](https://opentopomap.org)
- **Elevation**: [Open-Elevation API](https://api.open-elevation.com)
- **Sun position**: pre-computed with [astral](https://astral.readthedocs.io/) for Boquete, Panama (8.843°N, 82.425°W), April 1 2014, UTC−5, 5-minute intervals
