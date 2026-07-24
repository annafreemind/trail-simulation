import { state } from './state.js';
import { chkDrone } from './dom.js';

let _mapRef = null;
let _droneLayer = null;
let _droneGeoJson = null;
let _loaded = false;
let _fetching = false;

export function setDroneMap(map) { _mapRef = map; }

const DRONE_COLOR = '#ff8c00';
const DRONE_MARKER_STYLE = { radius: 4, color: '#fff', weight: 1, fillColor: DRONE_COLOR, fillOpacity: 0.9, zIndexOffset: 550 };

export function fetchDroneData() {
    if (_fetching || _loaded) return;
    _fetching = true;
    return fetch('data/El_Pianista__the_path_after_the_Mirador__Video_.json')
        .then(r => r.json())
        .then(data => { _droneGeoJson = data; _loaded = true; _fetching = false; })
        .catch(() => { _fetching = false; });
}

export function loadDroneRoutes() {
    if (!_mapRef || !_loaded || !_droneGeoJson) return;
    if (_droneLayer) return;

    const grouped = { markers: [], shapes: [] };
    (_droneGeoJson.features || []).forEach(f => {
        if (f.geometry.type === 'Point') grouped.markers.push(f);
        else if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') grouped.shapes.push(f);
    });

    _droneLayer = L.layerGroup().addTo(_mapRef);

    grouped.shapes.forEach(f => {
        const title = (f.properties && f.properties.title) || '';
        const coords = f.geometry.type === 'MultiLineString'
            ? f.geometry.coordinates[0]
            : f.geometry.coordinates;
        const latlngs = coords.map(c => [c[1], c[0]]);
        const line = L.polyline(latlngs, {
            color: DRONE_COLOR, weight: 4.5, opacity: 0.5, interactive: true,
        });
        if (title) line.bindTooltip(title, { sticky: true });
        line.addTo(_droneLayer);
    });

    grouped.markers.forEach(f => {
        const title = (f.properties && f.properties.title) || '';
        const coords = f.geometry.coordinates;
        const marker = L.circleMarker([coords[1], coords[0]], DRONE_MARKER_STYLE).addTo(_droneLayer);
        if (title) marker.bindTooltip(title, { permanent: false, direction: 'top', offset: [0, -4] });
    });
}

export function removeDroneRoutes() {
    if (_droneLayer) {
        _mapRef.removeLayer(_droneLayer);
        _droneLayer = null;
    }
}

export function toggleDroneRoutes() {
    if (chkDrone.checked) {
        if (!_loaded) {
            const p = fetchDroneData();
            if (p) p.then(() => { if (chkDrone.checked) loadDroneRoutes(); });
            return;
        }
        loadDroneRoutes();
    } else {
        removeDroneRoutes();
    }
}

export function syncMap3dDrone() {
    if (!state.map3d) return;

    if (!chkDrone.checked) {
        if (state.map3d.getLayer('drone-lines')) state.map3d.removeLayer('drone-lines');
        if (state.map3d.getSource('drone')) state.map3d.removeSource('drone');
        return;
    }

    if (!_loaded) return;

    const src = state.map3d.getSource('drone');
    if (src) {
        src.setData(_droneGeoJson);
    } else {
        state.map3d.addSource('drone', { type: 'geojson', data: _droneGeoJson });
        state.map3d.addLayer({ id: 'drone-lines', type: 'line', source: 'drone', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': DRONE_COLOR, 'line-width': 4.5, 'line-opacity': 0.5 } });
    }
}

export function removeMap3dDrone() {
    if (!state.map3d) return;
    if (state.map3d.getLayer('drone-lines')) state.map3d.removeLayer('drone-lines');
    if (state.map3d.getSource('drone')) state.map3d.removeSource('drone');
}

export function getDroneLoaded() { return _loaded; }
