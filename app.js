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
const ALARM_TIMES = [
    { h: 16, m: 39, label: 'First 112 call' },
    { h: 16, m: 51, label: 'Second 112 call' },
];
let _112Fired = {};
let _112Points = [];
let _112PointMarkers = [];
let _prevSimSec = -1;
let _smoothViewDir = 0;
let _slopeDeg = 0;
let _elevWaiting = false;
let scheduledStops = [];
let scheduledStopMarkers = [];
let isAddingStops = false;
let stopRemaining = 0;
let activeStopIndex = -1;
let speedPoints = [];
let speedPointMarkers = [];
let isAddingSpeedPoints = false;
let customPoints = [];
let customPointMarkers = [];
let isAddingCustomPoints = false;

// ============================================================
//   Elevation state
// ============================================================
let routeElevationData = [];
let elevationHistory = [];
let _lastRecordedMinute = -1;
let _elevTimer = null;

// ============================================================
//   Map
// ============================================================
const map = L.map('map', {
    center: CENTER,
    zoom: ZOOM,
    zoomControl: true,
});
map.createPane('route');
map.getPane('route').style.zIndex = 350;
const routeRenderer = L.svg({ pane: 'route' });

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
});
topoLayer.on('tileerror', (e) => {
    // retry failed tiles once
    if (!e.tile._retried) {
        e.tile._retried = true;
        setTimeout(() => e.tile.src = e.tile.src, 500);
    }
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
    if (waypoints.length >= 2) {
        map.fitBounds(L.latLngBounds(waypoints), { padding: [50, 50] });
    }
    localStorage.setItem('trail_settings', JSON.stringify({ mapLayer: this.value }));
});

L.marker([8.842428, -82.425013], {
    icon: L.divIcon({
        className: 'marker-508',
        html: '<div class="marker-508-shape"><span>508</span></div>',
        iconSize: [44, 46],
        iconAnchor: [22, 43],
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

function getBearingAtDistance(pts, distKm) {
    if (distKm <= 0 || pts.length < 2) return 0;
    let accumulated = 0;
    for (let i = 1; i < pts.length; i++) {
        const segLen = haversineKm(pts[i - 1], pts[i]);
        if (accumulated + segLen >= distKm || i === pts.length - 1) {
            const lat1 = pts[i - 1].lat * Math.PI / 180;
            const lat2 = pts[i].lat * Math.PI / 180;
            const dLon = (pts[i].lng - pts[i - 1].lng) * Math.PI / 180;
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        }
        accumulated += segLen;
    }
    return 0;
}

function snapToCardinal(bearing) {
    if (bearing >= 315 || bearing < 45) return 0;
    if (bearing >= 45 && bearing < 135) return 90;
    if (bearing >= 135 && bearing < 225) return 180;
    return 270;
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

    if (waypoints.length >= 2) {
        polyline = L.polyline(waypoints, {
            color: '#4a7cf7',
            weight: 4,
            opacity: 0.85,
            dashArray: null,
            renderer: routeRenderer,
        }).addTo(map);
    }

    waypoints.forEach((pt, i) => {
        const m = L.circleMarker(pt, {
            radius: 6,
            color: '#fff',
            weight: 2,
            fillColor: '#4a7cf7',
            fillOpacity: 1,
            zIndexOffset: 400,
        }).addTo(map);
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
    if (isAddingCustomPoints) {
        const label = document.getElementById('customLabel').value.trim() || 'Custom point';
        customPoints.push({ latlng: e.latlng, label });
        renderCustomPoints();
        setStatus(`Custom point "${label}" added`, '');
        return;
    }
    waypoints.push(e.latlng);
    redrawPath();
    updateInfo();
    updateStartButton();
    setStatus(`Waypoint ${waypoints.length} added`, '');
    deferElevRefresh();
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
    drawElevProfile();
});

// ============================================================
//   Clear
// ============================================================
btnClear.addEventListener('click', () => {
    stopAnimation();
    waypoints = [];
    scheduledStops = [];
    speedPoints = [];
    customPoints = [];
    routeElevationData = [];
    elevationHistory = [];
    _lastRecordedMinute = -1;
    renderScheduledStops();
    renderSpeedPoints();
    renderCustomPoints();
    redrawPath();
    updateInfo();
    updateStartButton();
    resetTimerDisplay();
    infoCurrentTime.textContent = '—';
    infoCurrentSpeed.textContent = '—';
    drawElevProfile();
    document.getElementById('infoElevation').textContent = '—';
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
    deferElevRefresh();
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
    renderCustomPoints();
});

const scheduledStopList = document.getElementById('scheduledStopList');
const speedPointList = document.getElementById('speedPointList');
const customPointList = document.getElementById('customPointList');
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

function renderCustomPoints() {
    customPointMarkers.forEach(m => map.removeLayer(m));
    customPointMarkers = [];
    customPointList.innerHTML = customPoints.map((s, i) => {
        return `<div style="padding:2px 0;border-bottom:1px solid #1a2a4e;display:flex;justify-content:space-between;align-items:center">
            <span><span style="color:#9b59b6">\u25cf</span> ${s.label}</span>
            <span class="del-custom" data-index="${i}" style="color:#e74c3c;cursor:pointer;font-size:14px;font-weight:700;line-height:1">\u00d7</span>
        </div>`;
    }).join('');
    customPoints.forEach(s => {
        const m = L.circleMarker(s.latlng, {
            radius: 8,
            color: '#fff',
            weight: 2,
            fillColor: '#9b59b6',
            fillOpacity: 1,
            zIndexOffset: 600,
        }).addTo(map);
        if (chkLabels.checked) {
            m.bindTooltip(s.label, { permanent: true, direction: 'top', offset: [0, -4] });
        }
        customPointMarkers.push(m);
    });
}

customPointList.addEventListener('click', (e) => {
    const del = e.target.closest('.del-custom');
    if (del) {
        const i = parseInt(del.dataset.index);
        customPoints.splice(i, 1);
        renderCustomPoints();
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

function showAlarm(text) {
    const el = document.getElementById('alarm');
    el.textContent = text;
    el.style.opacity = '1';
    el.style.display = 'block';
    setTimeout(() => { el.style.opacity = '0'; }, 10000);
    setTimeout(() => { el.style.display = 'none'; }, 11000);
}

function hideAlarm() {
    const el = document.getElementById('alarm');
    el.style.display = 'none';
    first112CallShown = false;
}

function render112Points() {
    _112PointMarkers.forEach(m => map.removeLayer(m));
    _112PointMarkers = [];
    const chkLabels = document.getElementById('chkLabels');
    _112Points.forEach(p => {
        const m = L.circleMarker(p.latlng, {
            radius: 8,
            color: '#fff',
            weight: 2,
            fillColor: '#e74c3c',
            fillOpacity: 1,
            zIndexOffset: 900,
        }).addTo(map);
        if (chkLabels.checked) {
            m.bindTooltip(p.label, { permanent: true, direction: 'top', offset: [0, -6] });
        }
        _112PointMarkers.push(m);
    });
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
    _112Fired = {};
    _112PointMarkers.forEach(m => map.removeLayer(m));
    _112Points = [];
    _112PointMarkers = [];
    first112CallShown = false;
    traveledDistanceKm = 0;
    simElapsedSeconds = 0;
    _prevSimSec = -1;
    _smoothViewDir = 0;
    _lastRecordedMinute = -1;
    elevationHistory = [];
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
    _prevSimSec = -1;
    _smoothViewDir = 0;
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
    let effectiveSpeed = speed;
    _slopeDeg = 0;
    _elevWaiting = false;
    if (document.getElementById('chkUphill').checked) {
        if (routeElevationData.length >= 2) {
            _slopeDeg = computeSlope(traveledDistanceKm, totalDistanceKm);
            if (_slopeDeg > 0) {
                effectiveSpeed = speed * Math.max(0.5, 1 - _slopeDeg / 28);
            }
            if (Math.floor(traveledDistanceKm * 100) % 50 === 0) {
                console.log('uphill:', {elevCount: routeElevationData.length, slope: _slopeDeg.toFixed(1), dist: traveledDistanceKm.toFixed(3), totalDist: totalDistanceKm.toFixed(3), effSpeed: effectiveSpeed.toFixed(2), baseSpeed: speed.toFixed(2)});
            }
        } else {
            _elevWaiting = true;
        }
    }
    const speedKmPerSec = effectiveSpeed / 3600;
    traveledDistanceKm += speedKmPerSec * delta * multiplier;

    const pts = reversed ? [...waypoints].reverse() : waypoints;
    const pos = getPositionAtDistance(pts, traveledDistanceKm);
    movingMarker.setLatLng(pos);
    if (document.getElementById('chkFollow').checked) map.panTo(pos, { animate: false });

    // Check 112 alarms
    if (document.getElementById('chk112').checked) {
        const st = getStartDateTime();
        if (st && _prevSimSec >= 0) {
            const prev = new Date(st.getTime() + _prevSimSec * 1000);
            const current = new Date(st.getTime() + simElapsedSeconds * 1000);
            for (const at of ALARM_TIMES) {
                if (_112Fired[at.label]) continue;
                const alarmMin = at.h * 60 + at.m;
                const prevMin = prev.getHours() * 60 + prev.getMinutes();
                const curMin = current.getHours() * 60 + current.getMinutes();
                if (prevMin < alarmMin && curMin >= alarmMin) {
                    _112Fired[at.label] = true;
                    _112Points.push({ latlng: pos, label: at.label });
                    render112Points();
                    showAlarm(at.label);
                    setStatus(`${at.label} triggered`, 'error');
                }
            }
        }
    }
    _prevSimSec = simElapsedSeconds;

    // Record elevation every simulated minute
    if (traveledDistanceKm > 0) {
        const curMin = Math.floor(simElapsedSeconds / 60);
        if (curMin > _lastRecordedMinute) {
            _lastRecordedMinute = curMin;
            elevationHistory.push({ dist: traveledDistanceKm, ele: getElevation(traveledDistanceKm), time: simElapsedSeconds });
        }
    }

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

    if (_elevWaiting) {
        infoCurrentSpeed.textContent = 'Loading elevation\u2026';
    } else if (_slopeDeg > 0) {
        infoCurrentSpeed.textContent = formatSpeed(effectiveSpeed) + '  \u2191' + _slopeDeg.toFixed(0) + '\u00b0';
    } else {
        infoCurrentSpeed.textContent = formatSpeed(getSpeedKmh());
    }
    updateTimerDisplay(simElapsedSeconds);
    updateCurrentTime(simElapsedSeconds);
    drawElevProfile();

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
        updateSunView(currentDate);
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
    elSpeed.value = speedUnit() === 'mph' ? 1.0 : 1.7;
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
        isAddingCustomPoints = btn.dataset.mode === 'custom';
        document.getElementById('stopInputs').style.display = btn.dataset.mode === 'stop' ? 'block' : 'none';
        document.getElementById('speedInputs').style.display = btn.dataset.mode === 'speed' ? 'block' : 'none';
        document.getElementById('customInputs').style.display = btn.dataset.mode === 'custom' ? 'block' : 'none';
        const msgs = { waypoint: 'Click to add waypoints', stop: 'Click on route to place a stop', speed: 'Click on route to place a speed point', custom: 'Click on the map to place a custom point' };
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

function loadRoute(name) {
    const routes = getSavedRoutes();
    const data = routes[name];
    if (!data) { setStatus(`Route "${name}" not found`, 'error'); return; }
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
    customPoints = data.customPoints ? data.customPoints.map(cp => {
        return { latlng: L.latLng(cp.lat, cp.lng), label: cp.label };
    }) : [];
    sortByRoute(scheduledStops);
    sortByRoute(speedPoints);
    renderScheduledStops();
    renderSpeedPoints();
    renderCustomPoints();
    updateInfo();
    updateStartButton();
    map.fitBounds(L.latLngBounds(waypoints), { padding: [50, 50] });
    setStatus(`Route "${name}" loaded`, 'active');
    if (data.elevationData && data.elevationData.length >= 2) {
        routeElevationData = data.elevationData.map(d => ({ dist: d.dist, ele: d.ele }));
        drawElevProfile();
    } else {
        refreshElevations();
    }
}

function populateRouteList() {
    const routes = getSavedRoutes();
    const el = document.getElementById('routeList');
    const names = Object.keys(routes);
    if (!names.length) { el.innerHTML = ''; return; }
    el.innerHTML = names.map(name => `
        <div style="display:flex;align-items:center;padding:3px 0;border-bottom:1px solid #1a2a4e">
            <span class="route-name" data-name="${name}" style="flex:1;cursor:pointer;color:#aabbdd;font-size:13px">${name}</span>
            <span class="del-route" data-name="${name}" style="color:#e74c3c;cursor:pointer;font-size:15px;font-weight:700;line-height:1;padding:0 4px">×</span>
        </div>
    `).join('');
}

document.getElementById('routeList').addEventListener('click', (e) => {
    const nameEl = e.target.closest('.route-name');
    if (nameEl) {
        document.getElementById('routeName').value = nameEl.dataset.name;
        loadRoute(nameEl.dataset.name);
        return;
    }
    const del = e.target.closest('.del-route');
    if (del) {
        const name = del.dataset.name;
        if (!confirm(`Delete route "${name}"?`)) return;
        const routes = getSavedRoutes();
        delete routes[name];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
        populateRouteList();
        document.getElementById('routeName').value = '';
        setStatus(`Route "${name}" deleted`, '');
    }
});

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
        speedPoints: speedPoints.map(sp => ({ lat: sp.latlng.lat, lng: sp.latlng.lng, label: sp.label, speed: sp.speed })),
        customPoints: customPoints.map(cp => ({ lat: cp.latlng.lat, lng: cp.latlng.lng, label: cp.label })),
        elevationData: routeElevationData.map(d => ({ dist: d.dist, ele: d.ele }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
    populateRouteList();
    document.getElementById('routeName').value = '';
    setStatus(`Route "${name}" saved`, 'active');
});

populateRouteList();

if (elSpeedUnit.value === 'mph') {
    elSpeed.value = '1.0';
    document.getElementById('speedValue').value = '1.0';
}

// Restore map layer preference
try {
    const saved = JSON.parse(localStorage.getItem('trail_settings'));
    if (saved && saved.mapLayer) {
        document.getElementById('mapLayer').value = saved.mapLayer;
        document.getElementById('mapLayer').dispatchEvent(new Event('change'));
    }
} catch {}

console.log('Trail Animator ready — click the map to start!');

// ============================================================
//   Sun view — horizon schematic with sun position
//   Sun data: Boquete, Panama, April 1 2014 (sun_data.js)
//   Sky colors: hand-tuned keyframes based on real sky references
// ============================================================
const sunCanvas = document.getElementById('sunView');
const sunCtx = sunCanvas.getContext('2d');

function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function skyColorAt(elev) {
    const clamped = Math.max(-12, Math.min(50, elev));
    const dayFactor = Math.max(0, Math.min(1, (clamped + 3) / 20));
    const warmFactor = smoothstep(0, 12, Math.max(0, 12 - Math.abs(clamped)));
    const warmth = warmFactor * (1 - dayFactor * 0.7);

    const nightTop = [2, 2, 18];
    const nightHor = [1, 1, 14];
    const dayTop = [40, 110, 235];
    const dayHor = [190, 210, 238];
    const warmTop = [60, 40, 90];
    const warmHor = [120, 60, 40];

    let top = lerp3(nightTop, dayTop, dayFactor);
    let hor = lerp3(nightHor, dayHor, dayFactor);

    top = lerp3(top, warmTop, warmth * 0.5);
    hor = lerp3(hor, warmHor, warmth);

    return { top, hor };
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function getSunAt(date) {
    const totalMin = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    const idx = Math.floor(totalMin / 5);
    const t = (totalMin / 5) - idx;
    const row = sunData.table[idx];
    const next = sunData.table[Math.min(idx + 1, sunData.table.length - 1)];
    if (!row) return null;
    if (!next) return { elev: row[2], azim: row[3] };
    return {
        elev: row[2] + (next[2] - row[2]) * t,
        azim: row[3] + (next[3] - row[3]) * t
    };
}

function lerpColor(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function rgb(c) {
    return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

function drawSunView(date) {
    try {
        const sun = getSunAt(date);
        if (!sun) { drawFallback(); return; }
        const W = sunCanvas.width, H = sunCanvas.height;
        const elev = Math.max(-12, Math.min(50, sun.elev));
        const sx = 0, sw = W, sh = H;
        const cx = W / 2;
        const horizonY = sh * 0.72;
        const arcR = sh * 0.42;

let viewDir = 0;
    if (waypoints.length >= 2 && isPlaying) {
        const pts = reversed ? [...waypoints].reverse() : waypoints;
        viewDir = getBearingAtDistance(pts, traveledDistanceKm);
    }
        if (viewDir === -1) viewDir = 0;
    // smooth heading rotation
    if (isPlaying) {
        let diff = viewDir - _smoothViewDir;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        _smoothViewDir += diff * 0.06;
        if (_smoothViewDir < 0) _smoothViewDir += 360;
        if (_smoothViewDir >= 360) _smoothViewDir -= 360;
    } else {
        _smoothViewDir = viewDir;
    }
    viewDir = _smoothViewDir;
    function card(a) { return ['N','E','S','W'][Math.round((a % 360) / 90) % 4]; }
    const leftAzim = (viewDir + 260) % 360;
    const rightAzim = (viewDir + 100) % 360;
    function azimToFrac(a) {
        let aa = a, la = leftAzim, ra = rightAzim;
        if (la < ra) return (aa - la) / (ra - la);
        if (aa < la) aa += 360;
        return (aa - la) / (ra + 360 - la);
    }

    // sky colors — interpolate from hand-tuned keyframes
    const { top: skyTop, hor: skyHor } = skyColorAt(elev);

    sunCtx.clearRect(0, 0, W, H);

    // gradient sky
    const grad = sunCtx.createLinearGradient(0, 0, 0, horizonY);
    grad.addColorStop(0, rgb(skyTop));
    grad.addColorStop(1, rgb(skyHor));
    sunCtx.fillStyle = grad;
    sunCtx.fillRect(0, 0, W, horizonY);

    // elevation scale (left side, full height)
    const scaleX = 12;
    const scaleTop = 8;
    const scaleBot = horizonY;
    const scaleH = scaleBot - scaleTop;
    sunCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    sunCtx.shadowColor = 'rgba(0,0,0,0.6)';
    sunCtx.shadowBlur = 3;
    sunCtx.lineWidth = 1.5;
    sunCtx.beginPath();
    sunCtx.moveTo(scaleX, scaleTop);
    sunCtx.lineTo(scaleX, scaleBot);
    sunCtx.stroke();

    // tick marks
    sunCtx.shadowColor = 'rgba(0,0,0,0.6)';
    sunCtx.shadowBlur = 3;
    sunCtx.fillStyle = '#fff';
    sunCtx.font = 'bold 11px sans-serif';
    sunCtx.textAlign = 'left';
    [30, 60, 90].forEach(deg => {
        const ty = scaleBot - scaleH * (deg / 90);
        sunCtx.beginPath();
        sunCtx.moveTo(scaleX - 4, ty);
        sunCtx.lineTo(scaleX + 4, ty);
        sunCtx.stroke();
        sunCtx.fillText(`${deg}\u00b0`, scaleX + 7, ty + 4);
    });
    sunCtx.shadowBlur = 0;
    // sun elevation marker
    const markerY = scaleBot - scaleH * Math.max(0, Math.min(1, sun.elev / 90));
    // bright triangle
    sunCtx.fillStyle = '#ffe066';
    sunCtx.shadowColor = 'rgba(0,0,0,0.5)';
    sunCtx.shadowBlur = 4;
    sunCtx.beginPath();
    sunCtx.moveTo(scaleX + 3, markerY);
    sunCtx.lineTo(scaleX - 7, markerY - 6);
    sunCtx.lineTo(scaleX - 7, markerY + 6);
    sunCtx.closePath();
    sunCtx.fill();
    // border
    sunCtx.strokeStyle = 'rgba(255,255,255,0.7)';
    sunCtx.lineWidth = 1;
    sunCtx.stroke();
    sunCtx.shadowBlur = 0;

    // ground
    const groundBr = Math.max(0, Math.min(1, (elev + 3) / 13));
    sunCtx.fillStyle = `rgba(40,55,40,${0.5 * groundBr})`;
    sunCtx.fillRect(0, horizonY, W, sh - horizonY);

    // horizon line
    sunCtx.strokeStyle = `rgba(255,255,255,${0.5 * groundBr})`;
    sunCtx.lineWidth = 1;
    sunCtx.beginPath();
    sunCtx.moveTo(sx, horizonY);
    sunCtx.lineTo(sx + sw, horizonY);
    sunCtx.stroke();

    // mountain silhouette (1500m away, assumed ~300m rise → ~12°)
    const mtnWidth = sw * 0.38;
    const mtnHeight = arcR * 0.22; // ~12°
    const mtnX = cx;
    sunCtx.fillStyle = `rgba(60,75,60,${0.85 * groundBr})`;
    sunCtx.beginPath();
    sunCtx.moveTo(mtnX - mtnWidth / 2, horizonY);
    sunCtx.lineTo(mtnX, horizonY - mtnHeight);
    sunCtx.lineTo(mtnX + mtnWidth / 2, horizonY);
    sunCtx.closePath();
    sunCtx.fill();
    // ridge line
    sunCtx.strokeStyle = `rgba(120,140,100,${0.5 * groundBr})`;
    sunCtx.lineWidth = 1.5;
    sunCtx.beginPath();
    sunCtx.moveTo(mtnX - mtnWidth / 2, horizonY);
    sunCtx.lineTo(mtnX, horizonY - mtnHeight);
    sunCtx.lineTo(mtnX + mtnWidth / 2, horizonY);
    sunCtx.stroke();

// compass — north-up, heading arrow, sun at absolute azimuth
    const compR = 30;
    const compCX = mtnX, compCY = horizonY + 28;
    sunCtx.save();
    sunCtx.translate(compCX, compCY);

    function polar(a, r) {
        const rad = (a - 90) * Math.PI / 180;
        return [Math.cos(rad) * r, Math.sin(rad) * r];
    }

    // circle
    sunCtx.strokeStyle = 'rgba(255,255,255,0.25)';
    sunCtx.lineWidth = 1;
    sunCtx.beginPath();
    sunCtx.arc(0, 0, compR, 0, Math.PI * 2);
    sunCtx.stroke();

    // N/E/S/W labels
    const dirs = [
        { label: 'N', angle: 0,    col: 'rgba(255,255,255,0.45)' },
        { label: 'E', angle: 90,   col: 'rgba(255,255,255,0.25)' },
        { label: 'S', angle: 180,  col: 'rgba(255,255,255,0.25)' },
        { label: 'W', angle: 270,  col: 'rgba(255,255,255,0.25)' },
    ];
    dirs.forEach(d => {
        const [tx, ty] = polar(d.angle, compR + 12);
        sunCtx.fillStyle = d.col;
        sunCtx.font = '12px sans-serif';
        sunCtx.textAlign = 'center';
        sunCtx.textBaseline = 'middle';
        sunCtx.fillText(d.label, tx, ty);
    });

    // heading arrow — thick line from center in heading direction
    const [hx, hy] = polar(viewDir, compR - 3);
    sunCtx.strokeStyle = '#ffe066';
    sunCtx.lineWidth = 3;
    sunCtx.beginPath();
    sunCtx.moveTo(0, 0);
    sunCtx.lineTo(hx, hy);
    sunCtx.stroke();
    // arrowhead
    const aRad = (viewDir - 90) * Math.PI / 180;
    const pR = aRad + Math.PI / 2;
    sunCtx.fillStyle = '#ffe066';
    sunCtx.beginPath();
    sunCtx.moveTo(hx, hy);
    sunCtx.lineTo(hx - Math.cos(aRad) * 7 + Math.cos(pR) * 4, hy - Math.sin(aRad) * 7 + Math.sin(pR) * 4);
    sunCtx.lineTo(hx - Math.cos(aRad) * 7 - Math.cos(pR) * 4, hy - Math.sin(aRad) * 7 - Math.sin(pR) * 4);
    sunCtx.closePath();
    sunCtx.fill();

    // sun icon
    {
        const [six, siy] = polar(sun.azim, compR + 12);
        // glow
        sunCtx.fillStyle = 'rgba(255,220,80,0.12)';
        sunCtx.beginPath();
        sunCtx.arc(six, siy, 12, 0, Math.PI * 2);
        sunCtx.fill();
        // rays
        sunCtx.strokeStyle = 'rgba(255,210,60,0.5)';
        sunCtx.lineWidth = 1.2;
        for (let r = 0; r < 8; r++) {
            const ra = r * Math.PI / 4;
            sunCtx.beginPath();
            sunCtx.moveTo(six + Math.cos(ra) * 7, siy + Math.sin(ra) * 7);
            sunCtx.lineTo(six + Math.cos(ra) * 11, siy + Math.sin(ra) * 11);
            sunCtx.stroke();
        }
        // body
        const grad = sunCtx.createRadialGradient(six - 1, siy - 1, 0, six, siy, 6);
        grad.addColorStop(0, '#fff8c0');
        grad.addColorStop(0.5, '#ffe066');
        grad.addColorStop(1, 'rgba(255,180,40,0.6)');
        sunCtx.fillStyle = grad;
        sunCtx.beginPath();
        sunCtx.arc(six, siy, 6, 0, Math.PI * 2);
        sunCtx.fill();
    }

    sunCtx.restore();

    // caption bar
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const info = document.getElementById('sunInfo');
    if (info) info.textContent = `${timeStr}  ·  sun ${sun.elev.toFixed(1)}\u00b0`;
    } catch(e) { console.error('drawSunView', e); drawFallback(); }
}

function drawFallback() {
    const W = sunCanvas.width, H = sunCanvas.height;
    sunCtx.fillStyle = '#1a1a2e';
    sunCtx.fillRect(0, 0, W, H);
    const horizonY = H * 0.58;
    sunCtx.fillStyle = 'rgba(40,55,40,0.5)';
    sunCtx.fillRect(0, horizonY, W, H - horizonY);
    sunCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    sunCtx.beginPath();
    sunCtx.moveTo(0, horizonY);
    sunCtx.lineTo(W, horizonY);
    sunCtx.stroke();
}

function updateSunView(date, force) {
    try {
        if (date) drawSunView(date);
    } catch(e) {
        console.error('sun widget error', e);
    }
}

function refreshSunView() {
    const st = getStartDateTime();
    if (st) updateSunView(new Date(st.getTime() + simElapsedSeconds * 1000), true);
}

elStartTime.addEventListener('input', refreshSunView);
refreshSunView();

// Toggle sun widget
document.getElementById('sunViewToggle').addEventListener('click', function () {
    const container = document.querySelector('.sun-controls');
    container.classList.toggle('collapsed');
    this.textContent = container.classList.contains('collapsed') ? '▲' : '▼';
});

// Toggle elevation widget
document.getElementById('elevViewToggle').addEventListener('click', function () {
    const container = document.querySelector('.elev-controls');
    container.classList.toggle('collapsed');
    this.textContent = container.classList.contains('collapsed') ? '▲' : '▼';
});

// ============================================================
//   Elevation profile
// ============================================================
const elevCanvas = document.getElementById('elevView');
const elevCtx = elevCanvas.getContext('2d');

async function refreshElevations() {
    if (waypoints.length < 2) {
        routeElevationData = [];
        drawElevProfile();
        return;
    }
    document.getElementById('elevInfo').textContent = 'Loading...';
    document.getElementById('infoElevation').textContent = '…';
    try {
        const locations = waypoints.map(p => ({ latitude: p.lat, longitude: p.lng }));
        const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations })
        });
        const data = await res.json();
        if (data && data.results && data.results.length === waypoints.length) {
            routeElevationData = [];
            let cumDist = 0;
            routeElevationData.push({ dist: 0, ele: data.results[0].elevation });
            for (let i = 1; i < waypoints.length; i++) {
                cumDist += haversineKm(waypoints[i - 1], waypoints[i]);
                routeElevationData.push({ dist: cumDist, ele: data.results[i].elevation });
            }
            drawElevProfile();
        } else {
            drawElevProfile();
        }
    } catch (err) {
        console.error('Elevation fetch error:', err);
        if (routeElevationData.length >= 2) {
            drawElevProfile();
        } else {
            document.getElementById('elevInfo').textContent = 'Failed';
            document.getElementById('infoElevation').textContent = '—';
        }
    }
}

function deferElevRefresh() {
    if (_elevTimer) clearTimeout(_elevTimer);
    _elevTimer = setTimeout(() => { refreshElevations(); _elevTimer = null; }, 300);
}

function getElevation(distKm) {
    if (!routeElevationData.length) return 0;
    if (distKm <= 0) return routeElevationData[0].ele;
    const last = routeElevationData[routeElevationData.length - 1];
    if (distKm >= last.dist) return last.ele;
    for (let i = 1; i < routeElevationData.length; i++) {
        if (routeElevationData[i].dist >= distKm) {
            const t = (distKm - routeElevationData[i - 1].dist) / (routeElevationData[i].dist - routeElevationData[i - 1].dist);
            return routeElevationData[i - 1].ele + (routeElevationData[i].ele - routeElevationData[i - 1].ele) * t;
        }
    }
    return last.ele;
}

function computeSlope(distKm, totalDistKm) {
    if (routeElevationData.length < 2 || totalDistKm <= 0) return 0;
    const step = 0.03;
    const ahead = Math.min(distKm + step, totalDistKm);
    const behind = Math.max(distKm - step, 0);
    const rise = (getElevation(ahead) - getElevation(behind)) / 1000;
    const run = (ahead - behind);
    if (run <= 0) return 0;
    return Math.atan2(rise, run) * 180 / Math.PI;
}

function drawElevProfile() {
    const W = elevCanvas.width, H = elevCanvas.height;
    elevCtx.clearRect(0, 0, W, H);

    if (routeElevationData.length < 2) {
        elevCtx.fillStyle = '#0d1a2d';
        elevCtx.fillRect(0, 0, W, H);
        elevCtx.fillStyle = '#556688';
        elevCtx.font = '13px sans-serif';
        elevCtx.textAlign = 'center';
        elevCtx.fillText('No elevation data', W / 2, H / 2 + 4);
        document.getElementById('elevInfo').textContent = '';
        return;
    }

    const pad = { top: 14, bottom: 22, left: 48, right: 12 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const eles = routeElevationData.map(d => d.ele);
    const minEle = Math.min(...eles);
    const maxEle = Math.max(...eles);
    const eleRange = Math.max(maxEle - minEle, 10);
    const totalDist = routeElevationData[routeElevationData.length - 1].dist;

    elevCtx.fillStyle = '#0d1a2d';
    elevCtx.fillRect(0, 0, W, H);

    // grid lines
    elevCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    elevCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + plotH * i / 4;
        elevCtx.beginPath();
        elevCtx.moveTo(pad.left, y);
        elevCtx.lineTo(W - pad.right, y);
        elevCtx.stroke();
    }

    const isMph = speedUnit() === 'mph';
    const elevUnit = isMph ? 'ft' : 'm';
    const elevConv = isMph ? 3.28084 : 1;

    // Y labels
    elevCtx.fillStyle = 'rgba(255,255,255,0.35)';
    elevCtx.font = '10px sans-serif';
    elevCtx.textAlign = 'right';
    elevCtx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
        const ele = (maxEle - eleRange * i / 4) * elevConv;
        const y = pad.top + plotH * i / 4;
        if (y >= pad.top && y <= pad.top + plotH) {
            elevCtx.fillText(Math.round(ele) + elevUnit, pad.left - 6, y);
        }
    }

    // X labels
    elevCtx.textAlign = 'center';
    elevCtx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
        const dist = totalDist * i / 4;
        const x = pad.left + plotW * i / 4;
        elevCtx.fillStyle = 'rgba(255,255,255,0.35)';
        elevCtx.fillText(formatDistance(dist), x, H - pad.bottom + 6);
    }

    // profile path
    elevCtx.strokeStyle = '#4a7cf7';
    elevCtx.lineWidth = 2;
    elevCtx.beginPath();
    for (let i = 0; i < routeElevationData.length; i++) {
        const x = pad.left + (routeElevationData[i].dist / totalDist) * plotW;
        const y = pad.top + plotH * (1 - (routeElevationData[i].ele - minEle) / eleRange);
        if (i === 0) elevCtx.moveTo(x, y);
        else elevCtx.lineTo(x, y);
    }
    elevCtx.stroke();

    // fill under curve
    const lastX = pad.left + plotW;
    const baseY = pad.top + plotH;
    elevCtx.fillStyle = 'rgba(74,124,247,0.08)';
    elevCtx.lineTo(lastX, baseY);
    elevCtx.lineTo(pad.left, baseY);
    elevCtx.closePath();
    elevCtx.fill();

    // current position marker
    if (isPlaying && totalDistanceKm > 0) {
        const curDist = Math.min(traveledDistanceKm, totalDist);
        const curX = pad.left + (curDist / totalDist) * plotW;
        const curEle = getElevation(curDist);
        const curY = pad.top + plotH * (1 - (curEle - minEle) / eleRange);

        elevCtx.strokeStyle = 'rgba(255,255,255,0.15)';
        elevCtx.lineWidth = 1;
        elevCtx.setLineDash([3, 4]);
        elevCtx.beginPath();
        elevCtx.moveTo(curX, pad.top);
        elevCtx.lineTo(curX, pad.top + plotH);
        elevCtx.stroke();
        elevCtx.setLineDash([]);

        elevCtx.fillStyle = '#ffe066';
        elevCtx.beginPath();
        elevCtx.arc(curX, curY, 4, 0, Math.PI * 2);
        elevCtx.fill();
        elevCtx.strokeStyle = '#fff';
        elevCtx.lineWidth = 1.5;
        elevCtx.stroke();
    }

    // elevation info
    const curEle = isPlaying ? getElevation(traveledDistanceKm) : (routeElevationData[0] ? routeElevationData[0].ele : 0);
    document.getElementById('elevInfo').textContent = `${Math.round(curEle * elevConv)}${elevUnit}  ·  max ${Math.round(maxEle * elevConv)}${elevUnit}  ·  min ${Math.round(minEle * elevConv)}${elevUnit}`;
    const infoEl = document.getElementById('infoElevation');
    if (infoEl) infoEl.textContent = `${Math.round(curEle * elevConv)}${elevUnit}`;
}

// Initial draw
drawElevProfile();

// ============================================================
//   Export / Import
// ============================================================
document.getElementById('btnExport').addEventListener('click', () => {
    const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        routes: getSavedRoutes(),
        settings: {
            speedUnit: document.getElementById('speedUnit').value,
            mapLayer: document.getElementById('mapLayer').value,
            chkLabels: document.getElementById('chkLabels').checked,
            chkFollow: document.getElementById('chkFollow').checked,
        }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trail-routes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Routes exported', '');
});

document.getElementById('btnImport').addEventListener('click', () => {
    const saved = getSavedRoutes();
    if (saved && Object.keys(saved).length > 0) {
        if (!confirm('Existing routes will be replaced. Export them first to keep a backup.\n\nContinue with import?')) {
            return;
        }
    }
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.routes || typeof data.routes !== 'object') {
                setStatus('Invalid file format', 'error');
                return;
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.routes));
            if (data.settings) {
                const s = data.settings;
                if (s.speedUnit) document.getElementById('speedUnit').value = s.speedUnit;
                if (s.mapLayer) document.getElementById('mapLayer').value = s.mapLayer;
                if (s.chkLabels !== undefined) document.getElementById('chkLabels').checked = s.chkLabels;
                if (s.chkFollow !== undefined) document.getElementById('chkFollow').checked = s.chkFollow;
            }
            populateRouteList();
            setStatus(`${Object.keys(data.routes).length} route(s) imported`, '');
        } catch (err) {
            setStatus('Failed to parse file', 'error');
        }
    };
    reader.readAsText(file);
    this.value = '';
});

// ============================================================
//   Help modal
// ============================================================
document.getElementById('btnHelp').addEventListener('click', async () => {
    const modal = document.getElementById('helpModal');
    const content = document.getElementById('helpContent');
    content.innerHTML = 'Loading...';
    modal.style.display = 'flex';
    try {
        const res = await fetch('README.md');
        const md = await res.text();
        content.innerHTML = marked.parse(md);
    } catch (err) {
        content.innerHTML = '<p>Failed to load help.</p>';
    }
});
document.getElementById('helpClose').addEventListener('click', () => {
    document.getElementById('helpModal').style.display = 'none';
});
document.getElementById('helpModal').addEventListener('click', function (e) {
    if (e.target === this) this.style.display = 'none';
});
