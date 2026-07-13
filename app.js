// ============================================================
//   CONFIG
// ============================================================
const CENTER = [8.836955, -82.423918];
const ZOOM = 17;
const EARTH_RADIUS_KM = 6371;

// ============================================================
//   DOM refs
// ============================================================
const elStartTime = document.getElementById('startTime');
const elSpeed = document.getElementById('speed');
const elSpeedUnit = document.getElementById('speedUnit');
const elTimeScale = document.getElementById('timeScale');
const elTimeScaleLabel = document.getElementById('timeScaleLabel');
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnStop = document.getElementById('btnStop');
const btnClear = document.getElementById('btnClear');
const btnFit = document.getElementById('btnFit');
const statusBar = document.getElementById('status-bar');
const infoPoints = document.getElementById('infoPoints');
const infoDistance = document.getElementById('infoDistance');
const infoTimer = document.getElementById('infoTimer');
const infoCurrentTime = document.getElementById('infoCurrentTime');
const infoCurrentSpeed = document.getElementById('infoCurrentSpeed');

// ============================================================
//   State
// ============================================================
let waypoints = [];
let polyline = null;
let markers = [];
let movingMarker = null;
let animationId = null;
let isPlaying = false;
let isPaused = false;
let lastFrameTimestamp = 0;
let totalDistanceKm = 0;
let traveledDistanceKm = 0;
let simElapsedSeconds = 0;
let completedAnimation = false;
let reversed = false;
let followMode = false;
let isAtEnd = false;
let first112CallShown = false;
let alarmTriggered = false;
const ALARM_TIME = { h: 16, m: 39 };
let scheduledStops = [];
let scheduledStopMarkers = [];
let isAddingStops = false;
let stopRemaining = 0;
let activeStopIndex = -1;
let speedPoints = [];
let speedPointMarkers = [];
let isAddingSpeedPoints = false;

// ============================================================
//   Map
// ============================================================
const map = L.map('map', {
    center: CENTER,
    zoom: ZOOM,
    zoomControl: true,
});

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
});

let currentLayer = osmLayer;

document.getElementById('mapLayer').addEventListener('change', function() {
    if (this.value === 'topo' && currentLayer !== topoLayer) {
        map.removeLayer(currentLayer);
        topoLayer.addTo(map);
        currentLayer = topoLayer;
    } else if (this.value === 'osm' && currentLayer !== osmLayer) {
        map.removeLayer(currentLayer);
        osmLayer.addTo(map);
        currentLayer = osmLayer;
    }
});

L.marker([8.842428, -82.425013], {
    icon: L.divIcon({
        className: '',
        html: '<div style="background:#e74c3c;color:#fff;border:2px solid #fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.4)">508</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    }),
    zIndexOffset: 500,
}).addTo(map);

L.circleMarker([8.878563, -82.408597], {
    radius: 14,
    color: '#e74c3c',
    weight: 2,
    fillColor: 'transparent',
    fillOpacity: 0,
    zIndexOffset: 500,
}).addTo(map).bindTooltip('Kris shorts', { permanent: true, direction: 'top', offset: [0, -4] });

L.circleMarker([8.91823, -82.41274], {
    radius: 14,
    color: '#e74c3c',
    weight: 2,
    fillColor: 'transparent',
    fillOpacity: 0,
    zIndexOffset: 500,
}).addTo(map).bindTooltip('Backpack', { permanent: true, direction: 'top', offset: [0, -4] });

// ============================================================
//   Helpers
// ============================================================
function haversineKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h =
        sinDLat * sinDLat +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
    return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pathLength(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += haversineKm(pts[i - 1], pts[i]);
    return total;
}

function formatDistance(km) {
    const isMph = speedUnit() === 'mph';
    const val = isMph ? km * 0.621371 : km;
    const unit = isMph ? ' mi' : ' km';
    if (km < 0.01) return '0 m';
    if (val < 1) return (val * (isMph ? 5280 : 1000)).toFixed(0) + (isMph ? ' ft' : ' m');
    if (val < 10) return val.toFixed(2) + unit;
    if (val < 100) return val.toFixed(1) + unit;
    return val.toFixed(0) + unit;
}

function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseDuration(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseInt(str) || 0;
}

function formatStopDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function maskDurationInput(el) {
    let val = el.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (val.length > 2) val = val.slice(0, 2) + ':' + val.slice(2);
    el.value = val;
}

document.getElementById('stopDuration').addEventListener('input', function () {
    maskDurationInput(this);
});

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// ============================================================
//   Interpolation: get position at distance along path
// ============================================================
function getPositionAtDistance(pts, distKm) {
    if (distKm <= 0 || pts.length < 2) return pts[0];
    let accumulated = 0;
    for (let i = 1; i < pts.length; i++) {
        const segLen = haversineKm(pts[i - 1], pts[i]);
        if (accumulated + segLen >= distKm || i === pts.length - 1) {
            const frac = (distKm - accumulated) / segLen;
            const lat = pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * frac;
            const lng = pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * frac;
            return L.latLng(lat, lng);
        }
        accumulated += segLen;
    }
    return pts[pts.length - 1];
}

// ============================================================
//   Render helpers
// ============================================================
function closestPointOnRoute(latlng) {
    if (!polyline || waypoints.length < 2) return latlng;
    let bestDist = Infinity;
    let bestPt = latlng;
    for (let i = 1; i < waypoints.length; i++) {
        const a = map.latLngToContainerPoint(waypoints[i - 1]);
        const b = map.latLngToContainerPoint(waypoints[i]);
        const p = map.latLngToContainerPoint(latlng);
        const cp = L.LineUtil.closestPointOnSegment(p, a, b);
        const pt = map.containerPointToLatLng(cp);
        const d = haversineKm(pt, latlng);
        if (d < bestDist) {
            bestDist = d;
            bestPt = pt;
        }
    }
    return bestPt;
}

function getRouteDistance(latlng) {
    if (!polyline || waypoints.length < 2) return 0;
    let bestDist = Infinity;
    let bestCumulativeKm = 0;
    let cumulativeKm = 0;
    for (let i = 1; i < waypoints.length; i++) {
        const a = map.latLngToContainerPoint(waypoints[i - 1]);
        const b = map.latLngToContainerPoint(waypoints[i]);
        const p = map.latLngToContainerPoint(latlng);
        const cp = L.LineUtil.closestPointOnSegment(p, a, b);
        const pt = map.containerPointToLatLng(cp);
        const d = haversineKm(pt, latlng);
        if (d < bestDist) {
            bestDist = d;
            const segKm = haversineKm(waypoints[i - 1], pt);
            bestCumulativeKm = cumulativeKm + segKm;
        }
        cumulativeKm += haversineKm(waypoints[i - 1], waypoints[i]);
    }
    return bestCumulativeKm;
}

function sortByRoute(arr) {
    return arr.sort((a, b) => getRouteDistance(a.latlng) - getRouteDistance(b.latlng));
}

function redrawPath() {
    if (polyline) {
        map.removeLayer(polyline);
        polyline = null;
    }
    markers.forEach((m) => map.removeLayer(m));
    markers = [];
    if (waypoints.length < 2) return;

    polyline = L.polyline(waypoints, {
        color: '#4a7cf7',
        weight: 4,
        opacity: 0.85,
        dashArray: null,
    }).addTo(map);

    waypoints.forEach((pt, i) => {
        const icon = L.divIcon({
            className: 'waypoint-marker',
            html: `${i + 1}`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
        });
        const m = L.marker(pt, { icon }).addTo(map);
        markers.push(m);
    });
}

function updateInfo() {
    infoPoints.textContent = waypoints.length;
    if (waypoints.length >= 2) {
        totalDistanceKm = pathLength(waypoints);
        infoDistance.textContent = formatDistance(totalDistanceKm);
    } else {
        totalDistanceKm = 0;
        infoDistance.textContent = '—';
    }
}

function setStatus(msg, type) {
    statusBar.textContent = msg;
    statusBar.className = type ? type : '';
}

// ============================================================
//   Map click — add waypoint
// ============================================================
map.on('click', (e) => {
    if (isPlaying) return;
    if (isAddingStops) {
        if (waypoints.length < 2) { setStatus('Draw a route first', 'error'); return; }
        const pt = closestPointOnRoute(e.latlng);
        const label = document.getElementById('stopLabel').value.trim() || 'Stopover ' + (scheduledStops.length + 1);
        const dur = parseDuration(document.getElementById('stopDuration').value) || 120;
        scheduledStops.push({ latlng: pt, label, duration: dur, visited: false, routeDist: getRouteDistance(pt) });
        sortByRoute(scheduledStops);
        renderScheduledStops();
        setStatus(`Scheduled stop "${label}" added (${dur}s)`, '');
        return;
    }
    if (isAddingSpeedPoints) {
        if (waypoints.length < 2) { setStatus('Draw a route first', 'error'); return; }
        const pt = closestPointOnRoute(e.latlng);
        const label = document.getElementById('speedLabel').value.trim() || 'Speed change ' + (speedPoints.length + 1);
        const speedIn = parseFloat(document.getElementById('speedValue').value) || 5;
        const speed = speedUnit() === 'mph' ? speedIn / 0.621371 : speedIn;
        speedPoints.push({ latlng: pt, label, speed, activated: false, routeDist: getRouteDistance(pt) });
        sortByRoute(speedPoints);
        renderSpeedPoints();
        setStatus(`Speed point "${label}" added (${formatSpeed(speed)})`, '');
        return;
    }
    waypoints.push(e.latlng);
    redrawPath();
    updateInfo();
    updateStartButton();
    setStatus(`Waypoint ${waypoints.length} added`, '');
});

// ============================================================
//   Buttons state
// ============================================================
function updateStartButton() {
    btnStart.disabled = waypoints.length < 2 || !parseFloat(elSpeed.value) || isPlaying;
    btnUndo.disabled = waypoints.length === 0 || isPlaying;
}

elSpeed.addEventListener('input', updateStartButton);
elSpeedUnit.addEventListener('change', () => {
    const isMph = speedUnit() === 'mph';
    const val = parseFloat(elSpeed.value);
    if (val === 1.7 && isMph) elSpeed.value = '1.0';
    else if (val === 1.0 && !isMph) elSpeed.value = '1.7';
    else if (val) elSpeed.value = isMph ? (val * 0.621371).toFixed(1) : (val / 0.621371).toFixed(1);

    const sv = document.getElementById('speedValue');
    const svVal = parseFloat(sv.value);
    if (svVal === 1.7 && isMph) sv.value = '1.0';
    else if (svVal === 1.0 && !isMph) sv.value = '1.7';
    else if (svVal) sv.value = isMph ? (svVal * 0.621371).toFixed(1) : (svVal / 0.621371).toFixed(1);

    infoCurrentSpeed.textContent = formatSpeed(getSpeedKmh());
    updateStartButton();
    updateInfo();
    renderSpeedPoints();
});

// ============================================================
//   Clear
// ============================================================
btnClear.addEventListener('click', () => {
    stopAnimation();
    waypoints = [];
    scheduledStops = [];
    speedPoints = [];
    renderScheduledStops();
    renderSpeedPoints();
    redrawPath();
    updateInfo();
    updateStartButton();
    resetTimerDisplay();
    infoCurrentTime.textContent = '—';
    infoCurrentSpeed.textContent = '—';
    setStatus('Route cleared. Click the map to start a new one', '');
});

const btnUndo = document.getElementById('btnUndo');
btnUndo.addEventListener('click', () => {
    if (waypoints.length === 0) return;
    waypoints.pop();
    if (waypoints.length < 2 && polyline) {
        map.removeLayer(polyline);
        polyline = null;
    }
    redrawPath();
    updateInfo();
    updateStartButton();
    setStatus(waypoints.length ? 'Last point removed' : 'All points removed', '');
});

const btnReverse = document.getElementById('btnReverse');
btnReverse.addEventListener('click', () => {
    reversed = !reversed;
    btnReverse.textContent = reversed ? 'Reverse direction ✓' : 'Reverse direction';
    btnReverse.style.borderColor = reversed ? '#4a7cf7' : '#2a3a5e';
    if (totalDistanceKm > 0) {
        traveledDistanceKm = totalDistanceKm - traveledDistanceKm;
        if (isAtEnd) {
            isAtEnd = false;
            setStatus('Reversed from end — heading back', '');
        }
    }
    setStatus(reversed ? 'Direction reversed' : 'Normal direction', '');
});

const chkFollow = document.getElementById('chkFollow');
const chkLabels = document.getElementById('chkLabels');
chkFollow.addEventListener('change', () => {
    followMode = chkFollow.checked;
    setStatus(followMode ? 'Follow mode on' : 'Follow mode off', '');
});
chkLabels.addEventListener('change', () => {
    renderScheduledStops();
    renderSpeedPoints();
});

const scheduledStopList = document.getElementById('scheduledStopList');
const speedPointList = document.getElementById('speedPointList');
const combinedNavList = document.getElementById('combinedNavList');

function renderNavList() {
    const stops = scheduledStops.map(s => ({ ...s, type: 'stop' }));
    const speeds = speedPoints.map(sp => ({ ...sp, type: 'speed' }));
    const all = [...stops, ...speeds].sort((a, b) => a.routeDist - b.routeDist);
    combinedNavList.innerHTML = all.map(item => {
        const passed = item.type === 'stop' ? item.visited : item.activated;
        const color = item.type === 'stop' ? '#f39c12' : '#2ecc71';
        const detail = item.type === 'stop' ? formatStopDuration(item.duration) : formatSpeed(item.speed);
        const timeStr = item.type === 'stop' && passed && item.startTime
            ? `${item.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}–${item.endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
            : detail;
        return `<div style="padding:2px 0;border-bottom:1px solid #1a2a4e;display:flex;align-items:center;gap:6px;opacity:${passed ? 0.5 : 1}">
            <span style="color:${color};flex-shrink:0">${passed ? '\u2713' : '\u25cf'}</span>
            <span style="text-decoration:${passed ? 'line-through' : 'none'};flex:1">${item.label}</span>
            <span style="color:#8899bb;flex-shrink:0;font-size:11px">${timeStr}</span>
        </div>`;
    }).join('');
}

function renderScheduledStops() {
    scheduledStopMarkers.forEach(m => map.removeLayer(m));
    scheduledStopMarkers = [];
    scheduledStopList.innerHTML = scheduledStops.map((s, i) => {
        const passed = s.visited;
        return `<div style="padding:2px 0;border-bottom:1px solid #1a2a4e;display:flex;justify-content:space-between;align-items:center;opacity:${passed ? 0.5 : 1}">
            <span><span style="color:${passed ? '#2ecc71' : '#f39c12'}">${passed ? '\u2713' : '\u25cf'}</span> <span style="text-decoration:${passed ? 'line-through' : 'none'}">${s.label}</span> <span style="color:#8899bb">${formatStopDuration(s.duration)}</span></span>
            <span class="del-stop" data-index="${i}" style="color:#e74c3c;cursor:pointer;font-size:14px;font-weight:700;line-height:1">\u00d7</span>
        </div>`;
    }).join('');
    scheduledStops.forEach((s, i) => {
        const m = L.circleMarker(s.latlng, {
            radius: 8,
            color: '#fff',
            weight: 2,
            fillColor: '#f39c12',
            fillOpacity: s.visited ? 0.4 : 1,
            zIndexOffset: 600,
        }).addTo(map);
        if (chkLabels.checked) {
            m.bindTooltip(`${s.label} (${formatStopDuration(s.duration)})`, { permanent: true, direction: 'top', offset: [0, -4] });
        }
        scheduledStopMarkers.push(m);
    });
    renderNavList();
}

scheduledStopList.addEventListener('click', (e) => {
    const del = e.target.closest('.del-stop');
    if (del) {
        const i = parseInt(del.dataset.index);
        scheduledStops.splice(i, 1);
        renderScheduledStops();
    }
});

function renderSpeedPoints() {
    speedPointMarkers.forEach(m => map.removeLayer(m));
    speedPointMarkers = [];
    speedPointList.innerHTML = speedPoints.map((s, i) => {
        const passed = s.activated;
        return `<div style="padding:2px 0;border-bottom:1px solid #1a2a4e;display:flex;justify-content:space-between;align-items:center;opacity:${passed ? 0.5 : 1}">
            <span><span style="color:${passed ? '#2ecc71' : '#2ecc71'}">${passed ? '\u2713' : '\u25cf'}</span> <span style="text-decoration:${passed ? 'line-through' : 'none'}">${s.label}</span> <span style="color:#8899bb">${formatSpeed(s.speed)}</span></span>
            <span class="del-speed" data-index="${i}" style="color:#e74c3c;cursor:pointer;font-size:14px;font-weight:700;line-height:1">\u00d7</span>
        </div>`;
    }).join('');
    speedPoints.forEach((s, i) => {
        const m = L.circleMarker(s.latlng, {
            radius: 8,
            color: '#fff',
            weight: 2,
            fillColor: s.activated ? '#2ecc71' : '#2ecc71',
            fillOpacity: s.activated ? 0.5 : 1,
            zIndexOffset: 600,
        }).addTo(map);
        if (chkLabels.checked) {
            m.bindTooltip(`${s.label} (${formatSpeed(s.speed)})`, { permanent: true, direction: 'top', offset: [0, -4] });
        }
        speedPointMarkers.push(m);
    });
    renderNavList();
}

speedPointList.addEventListener('click', (e) => {
    const del = e.target.closest('.del-speed');
    if (del) {
        const i = parseInt(del.dataset.index);
        speedPoints.splice(i, 1);
        renderSpeedPoints();
    }
});


// ============================================================
//   Fit map to path
// ============================================================
btnFit.addEventListener('click', () => {
    if (waypoints.length >= 2) {
        const bounds = L.latLngBounds(waypoints);
        map.fitBounds(bounds, { padding: [50, 50] });
    } else {
        map.setView(CENTER, ZOOM);
    }
});

function showAlarm() {
    const el = document.getElementById('alarm');
    el.style.display = 'block';
}

function hideAlarm() {
    const el = document.getElementById('alarm');
    el.style.display = 'none';
    first112CallShown = false;
}

// ============================================================
//   Animation core
// ============================================================
function stopAnimation() {
    hideAlarm();
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (movingMarker) {
        map.removeLayer(movingMarker);
        movingMarker = null;
    }
    isPlaying = false;
    isPaused = false;
    isAtEnd = false;
    completedAnimation = false;
    alarmTriggered = false;
    traveledDistanceKm = 0;
    simElapsedSeconds = 0;
    btnStart.disabled = waypoints.length < 2;
    btnStart.textContent = 'Start';
    btnPause.disabled = true;
    btnPause.textContent = 'Pause';
    btnStop.disabled = true;
    redrawPath();
    resetTimerDisplay();
}

function resetTimerDisplay() {
    infoTimer.textContent = '00:00:00';
    infoCurrentTime.textContent = '—';
    infoCurrentSpeed.textContent = '—';
}

function getSpeedKmh() {
    const val = parseFloat(elSpeed.value) || 0;
    return elSpeedUnit.value === 'mph' ? val / 0.621371 : val;
}
function speedUnit() { return elSpeedUnit.value; }
function formatSpeed(kmh) {
    const val = speedUnit() === 'mph' ? kmh * 0.621371 : kmh;
    return val.toFixed(1) + ' ' + speedUnit();
}
function formatSpeedVal(kmh) {
    return speedUnit() === 'mph' ? kmh * 0.621371 : kmh;
}

function startAnimation() {
    if (waypoints.length < 2) return;
    const speed = getSpeedKmh();
    if (speed <= 0) {
        setStatus('Speed must be greater than 0', 'error');
        return;
    }

    totalDistanceKm = pathLength(waypoints);

    if (completedAnimation || isAtEnd) {
        if (traveledDistanceKm >= totalDistanceKm) {
            setStatus('Add more waypoints to extend the route', 'error');
            return;
        }
    } else {
        traveledDistanceKm = 0;
        simElapsedSeconds = 0;

        scheduledStops.forEach(s => { s.visited = false; delete s.startTime; delete s.endTime; });
        speedPoints.forEach(sp => sp.activated = false);
        activeStopIndex = -1;
        stopRemaining = 0;
        renderScheduledStops();
        renderSpeedPoints();

        markers.forEach((m) => map.removeLayer(m));
        markers = [];

        if (movingMarker) {
            map.removeLayer(movingMarker);
            movingMarker = null;
        }

        const icon = L.divIcon({
            className: 'move-marker',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        });
        movingMarker = L.marker(reversed ? waypoints[waypoints.length - 1] : waypoints[0], { icon, zIndexOffset: 1000 }).addTo(map);
    }

    completedAnimation = false;
    isAtEnd = false;
    alarmTriggered = false;
    isPlaying = true;
    isPaused = false;
    btnStart.disabled = true;
    btnStart.textContent = 'Start';
    btnPause.disabled = false;
    btnPause.textContent = 'Pause';
    btnStop.disabled = false;

    lastFrameTimestamp = performance.now();

    setStatus('Movement started', 'active');
    updateStartTime();

    animationId = requestAnimationFrame(animationLoop);
}

function animationLoop(timestamp) {
    if (!isPlaying) return;

    const delta = (timestamp - lastFrameTimestamp) / 1000;
    lastFrameTimestamp = timestamp;
    const multiplier = parseFloat(elTimeScale.value) || 1;

    if (isPaused) {
        animationId = requestAnimationFrame(animationLoop);
        return;
    }

    simElapsedSeconds += delta * multiplier;

    // Check 112 alarm
    if (document.getElementById('chk112').checked && !alarmTriggered && !first112CallShown) {
        const st = getStartDateTime();
        if (st) {
            const current = new Date(st.getTime() + simElapsedSeconds * 1000);
            if (current.getHours() > ALARM_TIME.h || (current.getHours() === ALARM_TIME.h && current.getMinutes() >= ALARM_TIME.m)) {
                first112CallShown = true;
                alarmTriggered = true;
                showAlarm();
                infoCurrentSpeed.textContent = '0 ' + speedUnit();
                setStatus('112 call — movement stopped', 'error');
            }
        }
    }

    if (alarmTriggered) {
        updateTimerDisplay(simElapsedSeconds);
        updateCurrentTime(simElapsedSeconds);
        animationId = requestAnimationFrame(animationLoop);
        return;
    }

    // Scheduled stop wait — timer keeps running, marker stays
    if (activeStopIndex >= 0) {
        stopRemaining -= delta * multiplier;
        updateTimerDisplay(simElapsedSeconds);
        updateCurrentTime(simElapsedSeconds);
        setStatus(`Waiting at "${scheduledStops[activeStopIndex].label}" — ${Math.ceil(stopRemaining)}s`, '');
        if (stopRemaining <= 0) {
            activeStopIndex = -1;
            setStatus('Movement resumed', 'active');
        }
        animationId = requestAnimationFrame(animationLoop);
        return;
    }

    const speed = getSpeedKmh();
    const speedKmPerSec = speed / 3600;
    traveledDistanceKm += speedKmPerSec * delta * multiplier;

    const pts = reversed ? [...waypoints].reverse() : waypoints;
    const pos = getPositionAtDistance(pts, traveledDistanceKm);
    movingMarker.setLatLng(pos);
    if (document.getElementById('chkFollow').checked) map.panTo(pos, { animate: false });

    // Check scheduled stops
    if (activeStopIndex < 0 && traveledDistanceKm > 0) {
        for (let i = 0; i < scheduledStops.length; i++) {
            const s = scheduledStops[i];
            if (s.visited) continue;
            const triggerAt = reversed ? totalDistanceKm - s.routeDist : s.routeDist;
            if (traveledDistanceKm >= triggerAt) {
                s.visited = true;
                activeStopIndex = i;
                stopRemaining = s.duration;
                const st = getStartDateTime();
                s.startTime = st ? new Date(st.getTime() + simElapsedSeconds * 1000) : null;
                s.endTime = s.startTime ? new Date(s.startTime.getTime() + s.duration * 1000) : null;
                setStatus(`Arrived at "${s.label}" — stopping for ${formatStopDuration(s.duration)}`, '');
                infoCurrentSpeed.textContent = '0 ' + speedUnit();
                renderScheduledStops();
                break;
            }
        }
    }

    // Check speed change points
    for (let i = 0; i < speedPoints.length; i++) {
        const sp = speedPoints[i];
        if (sp.activated) continue;
        const triggerAt = reversed ? totalDistanceKm - sp.routeDist : sp.routeDist;
        if (traveledDistanceKm >= triggerAt) {
            sp.activated = true;
            elSpeed.value = formatSpeedVal(sp.speed);
            setStatus(`Speed changed to ${formatSpeed(sp.speed)} at "${sp.label}"`, '');
            renderSpeedPoints();
            break;
        }
    }

    if (traveledDistanceKm >= totalDistanceKm) {
        const finalPos = reversed ? waypoints[0] : waypoints[waypoints.length - 1];
        movingMarker.setLatLng(finalPos);
        traveledDistanceKm = totalDistanceKm;
        isAtEnd = true;
        infoCurrentSpeed.textContent = '0 ' + speedUnit();
        setStatus('Route completed — timer running', 'active');
    }

    infoCurrentSpeed.textContent = formatSpeed(getSpeedKmh());
    updateTimerDisplay(simElapsedSeconds);
    updateCurrentTime(simElapsedSeconds);

    if (isAtEnd) {
        animationId = requestAnimationFrame(animationLoop);
        return;
    }

    animationId = requestAnimationFrame(animationLoop);
}

function updateTimerDisplay(sec) {
    infoTimer.textContent = formatDuration(sec);
}

function getStartDateTime() {
    const val = elStartTime.value;
    if (!val) return null;
    const [h, m] = val.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}

function updateCurrentTime(elapsedSec) {
    const startDate = getStartDateTime();
    if (startDate) {
        const currentDate = new Date(startDate.getTime() + elapsedSec * 1000);
        infoCurrentTime.textContent = formatTime(currentDate);
    } else {
        infoCurrentTime.textContent = '—';
    }
}

function updateStartTime() {
    updateCurrentTime(0);
}

// ============================================================
//   Start / Pause / Stop
// ============================================================
btnStart.addEventListener('click', startAnimation);

btnPause.addEventListener('click', () => {
    if (!isPlaying) return;
    if (!isPaused) {
        isPaused = true;
        btnPause.textContent = 'Resume';
        setStatus('Paused', '');
        infoCurrentSpeed.textContent = '0 ' + speedUnit();
    } else {
        isPaused = false;
        btnPause.textContent = 'Pause';
        lastFrameTimestamp = performance.now();
        infoCurrentSpeed.textContent = formatSpeed(getSpeedKmh());
        setStatus('Movement resumed', 'active');
    }
});

btnStop.addEventListener('click', () => {
    stopAnimation();
    elSpeed.value = 1.7;
    setStatus('Movement stopped', '');
    updateStartButton();
});

// ============================================================
//   Init
// ============================================================
elTimeScaleLabel.textContent = elTimeScale.value;
elTimeScale.addEventListener('input', () => {
    elTimeScaleLabel.textContent = elTimeScale.value;
});

// ============================================================
//   Tabs
// ============================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
        btn.classList.add('active');
        document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).style.display = 'flex';
    });
});

// ============================================================
//   Mode buttons (route / stops / speed)
// ============================================================
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(74,124,247,.2)';
        isAddingStops = btn.dataset.mode === 'stop';
        isAddingSpeedPoints = btn.dataset.mode === 'speed';
        document.getElementById('stopInputs').style.display = btn.dataset.mode === 'stop' ? 'block' : 'none';
        document.getElementById('speedInputs').style.display = btn.dataset.mode === 'speed' ? 'block' : 'none';
        const msgs = { waypoint: 'Click to add waypoints', stop: 'Click on route to place a stop', speed: 'Click on route to place a speed point' };
        setStatus(msgs[btn.dataset.mode], '');
    });
});

setStatus('Click the map to start building a route');
updateStartButton();

elSpeed.addEventListener('input', () => {
    if (!isPlaying) updateStartButton();
});

// Sidebar resize handle
(function () {
    const resizer = document.getElementById('sidebar-resizer');
    const sidebar = document.getElementById('sidebar');
    let startX, startW;
    resizer.addEventListener('mousedown', function (e) {
        startX = e.clientX;
        startW = sidebar.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    function onMove(e) {
        const w = startW + e.clientX - startX;
        sidebar.style.width = Math.max(240, Math.min(600, w)) + 'px';
    }
    function onUp() {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    }
})();

// ============================================================
//   Save / Load
// ============================================================
const STORAGE_KEY = 'trail_routes';

function getSavedRoutes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

function populateRouteSelect() {
    const routes = getSavedRoutes();
    const sel = document.getElementById('routeSelect');
    sel.innerHTML = '<option value="">— Load route —</option>';
    Object.keys(routes).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });
}

document.getElementById('btnSave').addEventListener('click', () => {
    if (waypoints.length < 2) {
        setStatus('Add at least 2 waypoints first', 'error');
        return;
    }
    const name = document.getElementById('routeName').value.trim();
    if (!name) {
        setStatus('Enter a route name', 'error');
        return;
    }
    const routes = getSavedRoutes();
    routes[name] = {
        waypoints: waypoints.map(p => ({ lat: p.lat, lng: p.lng })),
        stops: scheduledStops.map(s => ({ lat: s.latlng.lat, lng: s.latlng.lng, label: s.label, duration: s.duration })),
        speedPoints: speedPoints.map(sp => ({ lat: sp.latlng.lat, lng: sp.latlng.lng, label: sp.label, speed: sp.speed }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
    populateRouteSelect();
    document.getElementById('routeName').value = '';
    setStatus(`Route "${name}" saved`, 'active');
});

document.getElementById('btnLoad').addEventListener('click', () => {
    const sel = document.getElementById('routeSelect');
    const name = sel.value;
    if (!name) {
        setStatus('Select a route to load', 'error');
        return;
    }
    const routes = getSavedRoutes();
    const data = routes[name];
    if (!data) {
        setStatus(`Route "${name}" not found`, 'error');
        return;
    }
    stopAnimation();
    waypoints = data.waypoints ? data.waypoints.map(p => L.latLng(p.lat, p.lng)) : data.map(p => L.latLng(p.lat, p.lng));
    redrawPath();
    scheduledStops = data.stops ? data.stops.map(s => {
        const pt = L.latLng(s.lat, s.lng);
        return { latlng: pt, label: s.label, duration: s.duration, visited: false, routeDist: getRouteDistance(pt) };
    }) : [];
    speedPoints = data.speedPoints ? data.speedPoints.map(sp => {
        const pt = L.latLng(sp.lat, sp.lng);
        return { latlng: pt, label: sp.label, speed: sp.speed, activated: false, routeDist: getRouteDistance(pt) };
    }) : [];
    sortByRoute(scheduledStops);
    sortByRoute(speedPoints);
    renderScheduledStops();
    renderSpeedPoints();
    updateInfo();
    updateStartButton();
    map.fitBounds(L.latLngBounds(waypoints), { padding: [50, 50] });
    setStatus(`Route "${name}" loaded`, 'active');
});

document.getElementById('routeSelect').addEventListener('change', () => {
    document.getElementById('btnLoad').click();
});

populateRouteSelect();

if (elSpeedUnit.value === 'mph') {
    elSpeed.value = '1.0';
    document.getElementById('speedValue').value = '1.0';
}

console.log('Trail Animator ready — click the map to start!');
