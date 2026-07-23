import { state } from './state.js';
import {
    statusBar, btn3D, chkLabels, chkPoi, chkPoiLabels,
    mapEl, map3dEl,
} from './dom.js';
import { parseDuration, getSpeedKmh, formatSpeed, speedUnit } from './helpers.js';
import {
    closestPointOnRoute, getRouteDistance, sortByRoute,
    redrawPath, updateInfo, buildElevationData, setRouteMap,
} from './route.js';
import { renderScheduledStops, renderSpeedPoints, renderCustomPoints } from './points.js';
import { initMap3D, toggleMap3D, syncMap3dStaticLayers, syncMap3dDrain, updateMap3dImagery } from './map3d.js';
import { TILE_URLS_3D as TILES3D } from './map3d.js';
import { updateBatteryDrain } from './drain.js';
import { drawElevProfile, updateStartButton } from './ui.js';

const map = L.map('map', {
    center: [8.836955, -82.423918],
    zoom: 17,
    maxZoom: 22,
    zoomControl: true,
});

map.createPane('route');
map.getPane('route').style.zIndex = 350;
const routeRenderer = L.svg({ pane: 'route' });

map.createPane('drain');
map.getPane('drain').style.zIndex = 340;
map.getPane('drain').style.pointerEvents = 'none';
const drainRenderer = L.svg({ pane: 'drain' });

map.on('zoomstart', () => { state._isZooming = true; });
map.on('zoomend', () => { state._isZooming = false; updateBatteryDrain(); });

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    maxNativeZoom: 17,
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
});
topoLayer.on('tileerror', (e) => {
    if (!e.tile._retried) {
        e.tile._retried = true;
        setTimeout(() => e.tile.src = e.tile.src, 500);
    }
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 17,
    attribution: '&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
});

const wayback2014Layer = L.tileLayer('https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/10/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 17,
    attribution: '&copy; Esri, ArcGIS, World Imagery Wayback 2014',
});

state.currentLayer = osmLayer;

function onTileLayerChange() {
    const is3DActive = state.map3d && btn3D.classList.contains('active');

    if (is3DActive) {
        const tileUrl = TILES3D[this.value] || TILES3D.osm;
        const maxzoom = (this.value === 'osm') ? 19 : (this.value === 'topo') ? 17 : 18;
        updateMap3dImagery(tileUrl, maxzoom);
        syncMap3dStaticLayers();
        syncMap3dDrain();
    } else {
        const layerMap = { osm: osmLayer, topo: topoLayer, satellite: satelliteLayer, wayback2014: wayback2014Layer };
        const newLayer = layerMap[this.value];
        if (newLayer && newLayer !== state.currentLayer) {
            map.removeLayer(state.currentLayer);
            newLayer.addTo(map);
            state.currentLayer = newLayer;
        }
    }
}

function setStatus(msg, type) {
    statusBar.textContent = msg;
    statusBar.className = type ? type : '';
}

function onMapClick(e) {
    if (state.isPlaying) return;
    if (state.isAddingStops) {
        if (state.waypoints.length < 2) { setStatus('Draw a route first', 'error'); return; }
        const pt = closestPointOnRoute(e.latlng);
        const label = document.getElementById('stopLabel').value.trim() || 'Stopover ' + (state.scheduledStops.length + 1);
        const dur = parseDuration(document.getElementById('stopDuration').value) || 120;
        state.scheduledStops.push({ latlng: pt, label, duration: dur, visited: false, routeDist: getRouteDistance(pt) });
        sortByRoute(state.scheduledStops);
        renderScheduledStops();
        setStatus(`Scheduled stop "${label}" added (${dur}s)`, '');
        return;
    }
    if (state.isAddingSpeedPoints) {
        if (state.waypoints.length < 2) { setStatus('Draw a route first', 'error'); return; }
        const pt = closestPointOnRoute(e.latlng);
        const label = document.getElementById('speedLabel').value.trim() || 'Speed change ' + (state.speedPoints.length + 1);
        const speedIn = parseFloat(document.getElementById('speedValue').value) || 5;
        const speed = speedUnit() === 'mph' ? speedIn / 0.621371 : speedIn;
        state.speedPoints.push({ latlng: pt, label, speed, activated: false, routeDist: getRouteDistance(pt) });
        sortByRoute(state.speedPoints);
        renderSpeedPoints();
        setStatus(`Speed point "${label}" added (${formatSpeed(speed)})`, '');
        return;
    }
    if (state.isAddingCustomPoints) {
        const label = document.getElementById('customLabel').value.trim() || 'Custom point';
        state.customPoints.push({ latlng: e.latlng, label });
        renderCustomPoints();
        setStatus(`Custom point "${label}" added`, '');
        return;
    }
    state.waypoints.push(e.latlng);
    redrawPath();
    updateInfo();
    setStatus(`Waypoint ${state.waypoints.length} added`, '');
    buildElevationData();
    drawElevProfile();
    updateStartButton();
}

const poiIcons = L.layerGroup().addTo(map);
const poiLabels = L.layerGroup().addTo(map);

PHOTOS.forEach(p => {
    L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: 'photo-icon-only', html: '\uD83D\uDCF7', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 700,
    }).addTo(poiIcons);

    L.marker([p.lat, p.lng], {
        icon: L.divIcon({
            className: 'photo-label-only',
            html: `<span class="photo-text"><span class="photo-line">${p.photo}</span> \u00B7 <span class="photo-time">${p.time}</span><br><span class="photo-desc">${p.desc}</span></span>`,
            iconSize: [0, 0],
            iconAnchor: [-12, 14],
        }),
        zIndexOffset: 700,
        interactive: false,
    }).addTo(poiLabels);
});

L.rectangle([[8.705, -82.555], [8.975, -82.285]], {
    color: '#e74c3c', weight: 1.5, fillOpacity: 0, dashArray: '6 4', interactive: false,
}).addTo(map);

L.marker([8.975, -82.42], {
    icon: L.divIcon({
        className: '',
        html: '<div style="text-align:center;color:#e74c3c;font-size:13px;font-weight:600">Elevation data coverage (SRTM1, 30\u00D730 km)</div>',
        iconSize: [350, 20],
        iconAnchor: [175, 20],
    }),
    interactive: false,
}).addTo(map);

POIS.forEach(p => {
    L.circleMarker([p.lat, p.lng], {
        radius: 14, color: '#e74c3c', weight: 2, fillColor: 'transparent', fillOpacity: 0, zIndexOffset: 500,
    }).addTo(poiIcons);

    L.marker([p.lat, p.lng], {
        icon: L.divIcon({
            className: 'photo-label-only',
            html: `<span class="photo-text"><span class="photo-line" style="font-weight:400">${p.name}</span></span>`,
            iconSize: [0, 0], iconAnchor: [-16, 8],
        }),
        zIndexOffset: 700,
        interactive: false,
    }).addTo(poiLabels);
});

function initMap() {
    setRouteMap(map);

    map.on('click', onMapClick);

    document.getElementById('mapLayer').addEventListener('change', onTileLayerChange);

    btn3D.addEventListener('click', function () {
        this.classList.toggle('active');
        toggleMap3D();
        localStorage.setItem('trail_3d_active', this.classList.contains('active'));
    });

    if (!chkPoi.checked) {
        try { map.removeLayer(poiIcons); } catch (e) { /* noop */ }
    }
    if (!chkPoiLabels.checked || !chkPoi.checked) {
        try { map.removeLayer(poiLabels); } catch (e) { /* noop */ }
    }
}

export { map, osmLayer, topoLayer, satelliteLayer, wayback2014Layer, poiIcons, poiLabels, setStatus, initMap, routeRenderer, drainRenderer };
