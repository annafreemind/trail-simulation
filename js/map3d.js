import { state } from './state.js';
import { onMapClick } from './map.js';
import { mapEl, map3dEl, btn3D, chkLabels, chkPoi, chkPoiLabels } from './dom.js';
import { formatStopDuration, formatSpeed } from './helpers.js';

export const TILE_URLS_3D = {
    osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    topo: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    wayback2014: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/10/{z}/{y}/{x}',
};

let _mapRef = null;
let _layerRefs = null;
let _saveSettingsFn = null;

export function setMap3dMapRef(map) { _mapRef = map; }
export function setMap3dLayerRefs(refs) { _layerRefs = refs; }
export function setSaveSettingsRef(fn) { _saveSettingsFn = fn; }

function _map3dUpsert(id, geoJSON) {
    const src = state.map3d.getSource(id);
    if (src) { src.setData(geoJSON); return; }
    state.map3d.addSource(id, { type: 'geojson', data: geoJSON });
}

function _map3dLayer(id, type, source, paint, layout) {
    if (state.map3d.getLayer(id)) return;
    const opts = { id, type, source };
    if (paint) opts.paint = paint;
    if (layout) opts.layout = layout;
    state.map3d.addLayer(opts);
}

let _camIconCanvas = null;
function _getCamIconImageData() {
    if (!_camIconCanvas) {
        _camIconCanvas = document.createElement('canvas');
        _camIconCanvas.width = 36; _camIconCanvas.height = 36;
        const ctx = _camIconCanvas.getContext('2d', { willReadFrequently: true });
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\uD83D\uDCF7', 18, 18);
    }
    return _camIconCanvas.getContext('2d').getImageData(0, 0, 36, 36);
}

export function initMap3D() {
    if (state.map3d) return;

    const layerKey = document.getElementById('mapLayer').value;
    const tileUrl = TILE_URLS_3D[layerKey] || TILE_URLS_3D.osm;
    const maxzoom = layerKey === 'osm' ? 19 : layerKey === 'topo' ? 17 : 18;

    state.map3d = new maplibregl.Map({
        container: 'map3d',
        center: [_mapRef.getCenter().lng, _mapRef.getCenter().lat],
        zoom: Math.min(_mapRef.getZoom(), 20),
        pitch: 60,
        maxPitch: 85,
        localFontFamily: 'Arial, sans-serif',
        style: {
            version: 8,
            sources: {
                imagery: {
                    type: 'raster',
                    tiles: [tileUrl],
                    tileSize: 256,
                    maxzoom: maxzoom,
                },
                terrainSource: {
                    type: 'raster-dem',
                    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    encoding: 'terrarium',
                    maxzoom: 15,
                },
            },
            layers: [{
                id: 'imagery',
                type: 'raster',
                source: 'imagery',
            }],
            terrain: { source: 'terrainSource', exaggeration: 1.5 },
        },
    });

    state.map3d.once('load', () => {
        if (!state.map3d) return;
        state.map3d.addControl(new maplibregl.NavigationControl());
        state.map3d.addControl(new maplibregl.TerrainControl({ source: 'terrainSource', exaggeration: 1.5 }));

        ensureCameraIcon();

        syncMap3dStaticLayers();
        syncMap3dDrain();
        updateMap3dPoiVisibility();
        if (state.isPlaying && state.movingMarker) {
            addMap3dMarker();
            updateMap3dMarker(state.movingMarker.getLatLng());
        }

        const canvas = state.map3d.getCanvas();
        canvas.addEventListener('mousedown', () => { state._map3dMouseDown = true; });
        state._map3dMouseUpHandler = () => { state._map3dMouseDown = false; };
        document.addEventListener('mouseup', state._map3dMouseUpHandler);

        state.map3d.on('click', (e) => {
            onMapClick({ latlng: L.latLng(e.lngLat.lat, e.lngLat.lng) });
        });
    });
}

export function updateMap3dImagery(tileUrl, maxzoom) {
    if (!state.map3d) return;

    const src = state.map3d.getSource('imagery');
    if (!src) return;

    if (src.maxzoom === maxzoom) {
        src.setTiles([tileUrl]);
        return;
    }

    const center = state.map3d.getCenter();
    const zoom = state.map3d.getZoom();
    const bearing = state.map3d.getBearing();
    const pitch = state.map3d.getPitch();

    state.map3d.removeLayer('imagery');
    state.map3d.removeSource('imagery');

    state.map3d.addSource('imagery', {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: maxzoom,
    });

    const layers = state.map3d.getStyle().layers;
    const firstId = layers.length > 0 ? layers[0].id : undefined;
    state.map3d.addLayer({ id: 'imagery', type: 'raster', source: 'imagery' }, firstId);

    state.map3d.setCenter(center);
    state.map3d.setZoom(zoom);
    state.map3d.setBearing(bearing);
    state.map3d.setPitch(pitch);
}

function ensureCameraIcon() {
    if (!state.map3d || state.map3d.hasImage('camera-icon')) return;
    if (!state.map3d.loaded()) return;
    state.map3d.addImage('camera-icon', _getCamIconImageData(), { pixelRatio: 2 });
}

export function syncMap3dRoute() {
    if (!state.map3d) return;

    if (state.waypoints.length < 2) {
        if (state.map3d.getLayer('route-line')) state.map3d.removeLayer('route-line');
        if (state.map3d.getSource('route')) state.map3d.removeSource('route');
    }

    if (state.waypoints.length === 0) {
        if (state.map3d.getLayer('waypoints')) state.map3d.removeLayer('waypoints');
        if (state.map3d.getSource('waypoints')) state.map3d.removeSource('waypoints');
        return;
    }

    _map3dUpsert('waypoints', { type: 'FeatureCollection', features: state.waypoints.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) });
    _map3dLayer('waypoints', 'circle', 'waypoints', { 'circle-radius': 4, 'circle-color': '#4a7cf7', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' });
    if (state.map3d.getLayer('waypoints')) state.map3d.moveLayer('waypoints');

    if (state.waypoints.length >= 2) {
        const coords = state.waypoints.map(p => [p.lng, p.lat]);
        _map3dUpsert('route', { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        _map3dLayer('route-line', 'line', 'route', { 'line-color': '#4a7cf7', 'line-width': 4 });
    }
}

export function syncMap3dStops() {
    if (!state.map3d) return;
    _map3dUpsert('stops', { type: 'FeatureCollection', features: state.scheduledStops.map(s => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.latlng.lng, s.latlng.lat] } })) });
    _map3dLayer('stops', 'circle', 'stops', { 'circle-radius': 6, 'circle-color': '#f39c12', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' });
    if (state.map3d.getLayer('stops')) state.map3d.moveLayer('stops');
    state._map3dStopLabels.forEach(m => m.remove());
    state._map3dStopLabels.length = 0;
    if (chkLabels.checked) {
        state.scheduledStops.forEach(s => {
            const el = document.createElement('div');
            el.className = 'map3d-marker-label';
            el.innerHTML = `<span class="point-label point-label-stop">${s.label} (${formatStopDuration(s.duration)})</span>`;
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat([s.latlng.lng, s.latlng.lat]).addTo(state.map3d);
            state._map3dStopLabels.push(marker);
        });
    }
}

export function syncMap3dSpeeds() {
    if (!state.map3d) return;
    _map3dUpsert('speeds', { type: 'FeatureCollection', features: state.speedPoints.map(s => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.latlng.lng, s.latlng.lat] } })) });
    _map3dLayer('speeds', 'circle', 'speeds', { 'circle-radius': 6, 'circle-color': '#2ecc71', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' });
    if (state.map3d.getLayer('speeds')) state.map3d.moveLayer('speeds');
    state._map3dSpeedLabels.forEach(m => m.remove());
    state._map3dSpeedLabels.length = 0;
    if (chkLabels.checked) {
        state.speedPoints.forEach(s => {
            const el = document.createElement('div');
            el.className = 'map3d-marker-label';
            el.innerHTML = `<span class="point-label point-label-speed">${s.label} (${formatSpeed(s.speed)})</span>`;
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat([s.latlng.lng, s.latlng.lat]).addTo(state.map3d);
            state._map3dSpeedLabels.push(marker);
        });
    }
}

export function syncMap3dCustoms() {
    if (!state.map3d) return;
    _map3dUpsert('customs', { type: 'FeatureCollection', features: state.customPoints.map(s => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.latlng.lng, s.latlng.lat] } })) });
    _map3dLayer('customs', 'circle', 'customs', { 'circle-radius': 6, 'circle-color': '#9b59b6', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' });
    if (state.map3d.getLayer('customs')) state.map3d.moveLayer('customs');
    state._map3dCustomLabels.forEach(m => m.remove());
    state._map3dCustomLabels.length = 0;
    if (chkLabels.checked) {
        state.customPoints.forEach(s => {
            const el = document.createElement('div');
            el.className = 'map3d-marker-label';
            el.innerHTML = `<span class="point-label point-label-custom">${s.label}</span>`;
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat([s.latlng.lng, s.latlng.lat]).addTo(state.map3d);
            state._map3dCustomLabels.push(marker);
        });
    }
}

function _syncMap3dPhotosData() {
    if (!state.map3d || typeof PHOTOS === 'undefined' || PHOTOS.length === 0) return;
    ensureCameraIcon();
    if (!state.map3d.hasImage('camera-icon')) return;
    _map3dUpsert('poi-photos', { type: 'FeatureCollection', features: PHOTOS.map(p => ({ type: 'Feature', properties: { photo: p.photo, time: p.time, desc: p.desc }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) });
    _map3dLayer('poi-photos', 'symbol', 'poi-photos', null, { 'icon-image': 'camera-icon', 'icon-size': 1.2, 'icon-anchor': 'bottom' });
    if (state.map3d.getLayer('poi-photos')) state.map3d.moveLayer('poi-photos');
}

function _syncMap3dPoisData() {
    if (!state.map3d || typeof POIS === 'undefined' || POIS.length === 0) return;
    _map3dUpsert('poi-points', { type: 'FeatureCollection', features: POIS.map(p => ({ type: 'Feature', properties: { label: p.name }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) });
    _map3dLayer('poi-points', 'circle', 'poi-points', { 'circle-radius': 14, 'circle-color': 'transparent', 'circle-stroke-width': 2, 'circle-stroke-color': '#e74c3c' });
    if (state.map3d.getLayer('poi-points')) state.map3d.moveLayer('poi-points');
}

export function syncMap3dStaticLayers() {
    if (!state.map3d) return;
    syncMap3dRoute();
    syncMap3dStops();
    syncMap3dSpeeds();
    syncMap3dCustoms();
    _syncMap3dPhotosData();
    _syncMap3dPoisData();
}

export function syncMap3dDrain() {
    if (!state.map3d) return;

    if (!state.batteryDrainActive && !state.batteryDrainLine) {
        if (state.map3d.getLayer('drain-line')) state.map3d.removeLayer('drain-line');
        if (state.map3d.getSource('drain-line')) state.map3d.removeSource('drain-line');
        if (state.map3d.getLayer('drain-dots')) state.map3d.removeLayer('drain-dots');
        if (state.map3d.getSource('drain-dots')) state.map3d.removeSource('drain-dots');
        return;
    }

    if (state.batteryDrainActive && state.batteryDrainLine) {
        const latlngs = state.batteryDrainLine.getLatLngs();
        if (latlngs && latlngs.length >= 2) {
            const coords = latlngs.map(p => [p.lng, p.lat]);
            const src = state.map3d.getSource('drain-line');
            if (src) {
                src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
            } else {
                state.map3d.addSource('drain-line', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
                state.map3d.addLayer({ id: 'drain-line', type: 'line', source: 'drain-line', paint: { 'line-color': '#ff4081', 'line-width': 14, 'line-opacity': 0.6 } });
                if (state.map3d.getLayer('route-line')) state.map3d.moveLayer('drain-line', 'route-line');
            }
        }
    }

    if (state._drainStopDots.length > 0) {
        const features = state._drainStopDots.map(d => { const p = d.getLatLng(); return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }; });
        const src = state.map3d.getSource('drain-dots');
        if (src) {
            src.setData({ type: 'FeatureCollection', features });
        } else {
            state.map3d.addSource('drain-dots', { type: 'geojson', data: { type: 'FeatureCollection', features } });
            state.map3d.addLayer({ id: 'drain-dots', type: 'circle', source: 'drain-dots', paint: { 'circle-radius': 10, 'circle-color': '#ff4081', 'circle-opacity': 0.5 } }, 'route-line');
        }
    } else {
        if (state.map3d.getLayer('drain-dots')) state.map3d.removeLayer('drain-dots');
        if (state.map3d.getSource('drain-dots')) state.map3d.removeSource('drain-dots');
    }
}

export function syncMap3d112() {
    if (!state.map3d) return;
    state._map3d112Labels.forEach(m => m.remove());
    state._map3d112Labels.length = 0;
    if (state._112Points.length === 0) {
        if (state.map3d.getLayer('112-markers')) state.map3d.removeLayer('112-markers');
        if (state.map3d.getSource('112-markers')) state.map3d.removeSource('112-markers');
        return;
    }

    _map3dUpsert('112-markers', { type: 'FeatureCollection', features: state._112Points.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.latlng.lng, p.latlng.lat] } })) });
    _map3dLayer('112-markers', 'circle', '112-markers', { 'circle-radius': 4, 'circle-color': '#e74c3c', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' });
    if (state.map3d.getLayer('112-markers')) state.map3d.moveLayer('112-markers');
    if (chkLabels.checked) {
        state._112Points.forEach(p => {
            const el = document.createElement('div');
            el.className = 'map3d-marker-label';
            el.innerHTML = `<span class="point-label point-label-112">${p.label}</span>`;
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat([p.latlng.lng, p.latlng.lat]).addTo(state.map3d);
            state._map3d112Labels.push(marker);
        });
    }
}

export function updateMap3dPoiVisibility() {
    if (!state.map3d) return;
    const iconsVis = chkPoi.checked ? 'visible' : 'none';
    ['poi-photos', 'poi-points'].forEach(id => { if (state.map3d.getLayer(id)) state.map3d.setLayoutProperty(id, 'visibility', iconsVis); });

    const show = chkPoi.checked && chkPoiLabels.checked;
    const displayVal = show ? '' : 'none';

    if (show && state._map3dPhotoMarkers.length === 0 && typeof PHOTOS !== 'undefined') {
        PHOTOS.forEach(p => {
            const el = document.createElement('div');
            el.className = 'map3d-marker-label';
            el.innerHTML = `<span class="map3d-label-text">${p.photo} \u00B7 ${p.time}</span>`;
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -20] }).setLngLat([p.lng, p.lat]).addTo(state.map3d);
            state._map3dPhotoMarkers.push(marker);
        });
    }
    if (show && state._map3dPoiMarkers.length === 0 && typeof POIS !== 'undefined') {
        POIS.forEach(p => {
            const el = document.createElement('div');
            el.className = 'map3d-marker-label';
            el.innerHTML = `<span class="map3d-label-text">${p.name}</span>`;
            const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat([p.lng, p.lat]).addTo(state.map3d);
            state._map3dPoiMarkers.push(marker);
        });
    }

    state._map3dPhotoMarkers.forEach(m => { m.getElement().style.display = displayVal; });
    state._map3dPoiMarkers.forEach(m => { m.getElement().style.display = displayVal; });
}

export function addMap3dMarker() {
    if (!state.map3d) return;
    const pos = [state.waypoints[0].lng, state.waypoints[0].lat];
    _map3dUpsert('move-marker', { type: 'Point', coordinates: pos });
    _map3dLayer('move-marker-layer', 'circle', 'move-marker', {
        'circle-radius': 8, 'circle-color': '#e74c3c', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' });
    if (state.map3d.getLayer('move-marker-layer')) state.map3d.moveLayer('move-marker-layer');
}

export function updateMap3dMarker(latlng) {
    if (!state.map3d) return;
    const src = state.map3d.getSource('move-marker');
    if (src) src.setData({ type: 'Point', coordinates: [latlng.lng, latlng.lat] });
}

export function removeMap3dMarker() {
    if (!state.map3d) return;
    if (state.map3d.getLayer('move-marker-layer')) state.map3d.removeLayer('move-marker-layer');
    if (state.map3d.getSource('move-marker')) state.map3d.removeSource('move-marker');
}

export function toggleMap3D() {
    const active = btn3D.classList.contains('active');

    if (active) {
        mapEl.style.display = 'none';
        map3dEl.style.display = 'block';
        initMap3D();
        state.map3d.resize();
        state.map3d.jumpTo({ center: [_mapRef.getCenter().lng, _mapRef.getCenter().lat], zoom: Math.min(_mapRef.getZoom(), 20) });
    } else {
        if (state.map3d) {
            const c = state.map3d.getCenter();

            const layerKey = document.getElementById('mapLayer').value;
            const layerMap = { osm: _layerRefs.osmLayer, topo: _layerRefs.topoLayer, satellite: _layerRefs.satelliteLayer, wayback2014: _layerRefs.wayback2014Layer };
            const newLayer = layerMap[layerKey];
            if (newLayer && newLayer !== state.currentLayer) {
                if (state.currentLayer) _mapRef.removeLayer(state.currentLayer);
                newLayer.addTo(_mapRef);
                state.currentLayer = newLayer;
            }

            _mapRef.setView([c.lat, c.lng], state.map3d.getZoom());
            state._map3dPhotoMarkers.forEach(m => m.remove());
            state._map3dPhotoMarkers.length = 0;
            state._map3dPoiMarkers.forEach(m => m.remove());
            state._map3dPoiMarkers.length = 0;
            state._map3dStopLabels.forEach(m => m.remove());
            state._map3dStopLabels.length = 0;
            state._map3dSpeedLabels.forEach(m => m.remove());
            state._map3dSpeedLabels.length = 0;
            state._map3dCustomLabels.forEach(m => m.remove());
            state._map3dCustomLabels.length = 0;
            state._map3d112Labels.forEach(m => m.remove());
            state._map3d112Labels.length = 0;
            if (state._map3dMouseUpHandler) {
                document.removeEventListener('mouseup', state._map3dMouseUpHandler);
                state._map3dMouseUpHandler = null;
            }
            state.map3d.remove();
            state.map3d = null;
        }
        mapEl.style.display = 'block';
        map3dEl.style.display = 'none';
        _mapRef.invalidateSize();
    }
    if (_saveSettingsFn) _saveSettingsFn();
}
