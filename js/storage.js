import { state } from './state.js';
import {
    elStartTime, elSpeed, elSpeedUnit, elTimeScale, elTimeScaleLabel,
    chkFollow, chkLabels, chkPoi, chkPoiLabels, chkUphill, chk112, chkDrain,
} from './dom.js';
import {
    redrawPath, updateInfo, buildElevationData,
    sortByRoute, getRouteDistance,
} from './route.js';
import { renderScheduledStops, renderSpeedPoints, renderCustomPoints, render112Points } from './points.js';
import { setStatus, map, poiIcons, poiLabels } from './map.js';
import { saveSettings, drawElevProfile, updateStartButton } from './ui.js';
import { stopAnimation } from './animation.js';
import {
    setDrainVisibility, drainGet, drainSet,
} from './drain.js';

const DB_NAME = 'trail_routes_db';
const STORE_NAME = 'routes';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getRoutesDB() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    const routes = {};
    await new Promise((res, rej) => {
        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) { routes[cursor.key] = cursor.value; cursor.continue(); }
            else res();
        };
        req.onerror = () => rej(req.error);
    });
    db.close();
    return routes;
}

async function saveRoutesDB(routes) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const [name, data] of Object.entries(routes)) {
        store.put(data, name);
    }
    await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    db.close();
}

async function updateRouteDB(name, updater) {
    const routes = await getRoutesDB();
    updater(routes);
    await saveRoutesDB(routes);
}

function getRoutesLS() {
    try { return JSON.parse(localStorage.getItem('trail_routes')) || {}; } catch { return {}; }
}

function saveRoutesLS(routes) {
    try { localStorage.setItem('trail_routes', JSON.stringify(routes)); } catch {}
}

async function migrateToDB() {
    const dbRoutes = await getRoutesDB();
    if (Object.keys(dbRoutes).length > 0) return;
    const ls = getRoutesLS();
    if (Object.keys(ls).length > 0) {
        await saveRoutesDB(ls);
    }
}

async function loadRoute(name) {
    state.routeElevationData.length = 0;
    drawElevProfile();
    const routes = await getRoutesDB();
    const data = routes[name];
    if (!data) { setStatus(`Route "${name}" not found`, 'error'); return; }
    stopAnimation();
    if (data.waypoints) {
        state.waypoints = data.waypoints.map(p => L.latLng(p.lat, p.lng));
    } else if (Array.isArray(data)) {
        state.waypoints = data.map(p => L.latLng(p.lat, p.lng));
    } else {
        setStatus(`Route "${name}" is corrupted`, 'error');
        return;
    }
    redrawPath();
    state.scheduledStops = data.stops ? data.stops.map(s => {
        const pt = L.latLng(s.lat, s.lng);
        return { latlng: pt, label: s.label, duration: s.duration, visited: false, routeDist: getRouteDistance(pt) };
    }) : [];
    state.speedPoints = data.speedPoints ? data.speedPoints.map(sp => {
        const pt = L.latLng(sp.lat, sp.lng);
        return { latlng: pt, label: sp.label, speed: sp.speed, activated: false, routeDist: getRouteDistance(pt) };
    }) : [];
    state.customPoints = data.customPoints ? data.customPoints.map(cp => {
        return { latlng: L.latLng(cp.lat, cp.lng), label: cp.label };
    }) : [];
    sortByRoute(state.scheduledStops);
    sortByRoute(state.speedPoints);
    renderScheduledStops();
    renderSpeedPoints();
    renderCustomPoints();
    updateInfo();
    updateStartButton();
    map.fitBounds(L.latLngBounds(state.waypoints), { padding: [50, 50] });
    setStatus(`Route "${name}" loaded`, 'active');
    if (data.elevationData && data.elevationData.length >= 2) {
        state.routeElevationData = data.elevationData.map(d => ({ dist: d.dist, ele: d.ele }));
        drawElevProfile();
    } else {
        buildElevationData();
        if (state.routeElevationData.length >= 2) saveElevData(name);
    }
}

async function saveElevData(name) {
    await updateRouteDB(name, routes => {
        if (routes[name]) {
            routes[name].elevationData = state.routeElevationData.map(d => ({ dist: d.dist, ele: d.ele }));
        }
    });
}

async function populateRouteList() {
    const routes = await getRoutesDB();
    const el = document.getElementById('routeList');
    const names = Object.keys(routes);
    if (!names.length) { el.innerHTML = ''; return; }
    el.innerHTML = names.map(name => `
        <div style="display:flex;align-items:center;padding:3px 0;border-bottom:1px solid #1a2a4e">
            <span class="route-name" data-name="${name}" style="flex:1;cursor:pointer;color:#aabbdd;font-size:13px">${name}</span>
            <span class="del-route" data-name="${name}" style="color:#e74c3c;cursor:pointer;font-size:15px;font-weight:700;line-height:1;padding:0 4px">\u00d7</span>
        </div>
    `).join('');
}

export function initStorage() {
    document.getElementById('routeList').addEventListener('click', async (e) => {
        const nameEl = e.target.closest('.route-name');
        if (nameEl) {
            document.getElementById('routeName').value = nameEl.dataset.name;
            await loadRoute(nameEl.dataset.name);
            return;
        }
        const del = e.target.closest('.del-route');
        if (del) {
            const name = del.dataset.name;
            if (!confirm(`Delete route "${name}"?`)) return;
            const routes = await getRoutesDB();
            delete routes[name];
            await saveRoutesDB(routes);
            saveRoutesLS(routes);
            await populateRouteList();
            document.getElementById('routeName').value = '';
            setStatus(`Route "${name}" deleted`, '');
        }
    });

    document.getElementById('btnSave').addEventListener('click', async () => {
        if (state.waypoints.length < 2) {
            setStatus('Add at least 2 waypoints first', 'error');
            return;
        }
        const name = document.getElementById('routeName').value.trim();
        if (!name) {
            setStatus('Enter a route name', 'error');
            return;
        }
        const routes = await getRoutesDB();
        routes[name] = {
            waypoints: state.waypoints.map(p => ({ lat: p.lat, lng: p.lng })),
            stops: state.scheduledStops.map(s => ({ lat: s.latlng.lat, lng: s.latlng.lng, label: s.label, duration: s.duration })),
            speedPoints: state.speedPoints.map(sp => ({ lat: sp.latlng.lat, lng: sp.latlng.lng, label: sp.label, speed: sp.speed })),
            customPoints: state.customPoints.map(cp => ({ lat: cp.latlng.lat, lng: cp.latlng.lng, label: cp.label })),
            elevationData: state.routeElevationData.map(d => ({ dist: d.dist, ele: d.ele }))
        };
        await saveRoutesDB(routes);
        saveRoutesLS(routes);
        await populateRouteList();
        document.getElementById('routeName').value = '';
        setStatus(`Route "${name}" saved`, 'active');
    });

    document.getElementById('btnExport').addEventListener('click', async () => {
        const routes = await getRoutesDB();
        saveRoutesLS(routes);
        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            routes: routes,
            settings: {
                speedUnit: elSpeedUnit.value,
                mapLayer: document.getElementById('mapLayer').value,
                chkLabels: chkLabels.checked,
                chkPoi: chkPoi.checked,
                chkPoiLabels: chkPoiLabels.checked,
                chkFollow: chkFollow.checked,
                chkUphill: chkUphill.checked,
                chk112: chk112.checked,
                chkDrain: chkDrain.checked,
                drainStart: drainGet('startH') + ':' + String(drainGet('startM')).padStart(2, '0'),
                drainEnd: drainGet('endH') + ':' + String(drainGet('endM')).padStart(2, '0'),
                timeScale: elTimeScale.value,
                startTime: elStartTime.value,
                speed: elSpeed.value,
                speedValue: document.getElementById('speedValue').value,
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

    document.getElementById('btnImport').addEventListener('click', async () => {
        const saved = await getRoutesDB();
        if (saved && Object.keys(saved).length > 0) {
            if (!confirm('Existing routes will be replaced. Export them first to keep a backup.\n\nContinue with import?')) {
                return;
            }
        }
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            let data;
            try { data = JSON.parse(ev.target.result); }
            catch { setStatus('Invalid file format', 'error'); return; }
            try {
                if (!data.routes || typeof data.routes !== 'object') {
                    setStatus('Invalid file format', 'error');
                    return;
                }
                await saveRoutesDB(data.routes);
                saveRoutesLS(data.routes);
                if (data.settings) {
                    const s = data.settings;
                    if (s.speedUnit) {
                        elSpeedUnit.value = s.speedUnit;
                        elSpeedUnit.dispatchEvent(new Event('change'));
                    }
                    if (s.mapLayer) {
                        document.getElementById('mapLayer').value = s.mapLayer;
                        document.getElementById('mapLayer').dispatchEvent(new Event('change'));
                    }
                    if (s.chkLabels !== undefined) {
                        chkLabels.checked = s.chkLabels;
                        renderScheduledStops();
                        renderSpeedPoints();
                        renderCustomPoints();
                    }
                    if (s.chkPoi !== undefined) {
                        chkPoi.checked = s.chkPoi;
                        if (!s.chkPoi) {
                            map.removeLayer(poiIcons);
                            map.removeLayer(poiLabels);
                        }
                    }
                    if (s.chkPoiLabels !== undefined) {
                        chkPoiLabels.checked = s.chkPoiLabels;
                        chkPoiLabels.disabled = !chkPoi.checked;
                        if (!s.chkPoiLabels || !chkPoi.checked) {
                            map.removeLayer(poiLabels);
                        }
                    }
                    if (s.chkFollow !== undefined) {
                        chkFollow.checked = s.chkFollow;
                        state.followMode = s.chkFollow;
                    }
                    if (s.chkUphill !== undefined) {
                        chkUphill.checked = s.chkUphill;
                    }
                    if (s.chk112 !== undefined) {
                        chk112.checked = s.chk112;
                    }
                    if (s.chkDrain !== undefined) {
                        chkDrain.checked = s.chkDrain;
                        setDrainVisibility(s.chkDrain);
                    }
                    if (s.drainStart) {
                        const [h, m] = s.drainStart.split(':');
                        drainSet('startH', parseInt(h)); drainSet('startM', parseInt(m));
                    }
                    if (s.drainEnd) {
                        const [h, m] = s.drainEnd.split(':');
                        drainSet('endH', parseInt(h)); drainSet('endM', parseInt(m));
                    }
                    if (s.timeScale !== undefined) {
                        elTimeScale.value = s.timeScale;
                        elTimeScaleLabel.textContent = s.timeScale;
                    }
                    if (s.startTime) {
                        elStartTime.value = s.startTime;
                    }
                    if (s.speed) {
                        elSpeed.value = s.speed;
                    }
                    if (s.speedValue) {
                        document.getElementById('speedValue').value = s.speedValue;
                    }
                }
                await populateRouteList();
                setStatus(`${Object.keys(data.routes).length} route(s) imported`, '');
            } catch (err) {
                console.error('Import failed:', err);
                setStatus('Failed to import: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        this.value = '';
    });

    (function () {
        const APP_VERSION = document.querySelector('meta[name="app-version"]')?.getAttribute('content');
        if (!APP_VERSION) return;
        const banner = document.getElementById('updateBanner');
        const closeBtn = document.getElementById('updateBannerClose');
        const lastSeen = localStorage.getItem('trail_last_seen_version');
        if (lastSeen === APP_VERSION) {
            banner.style.display = 'none';
        }
        closeBtn.addEventListener('click', () => {
            banner.style.display = 'none';
            localStorage.setItem('trail_last_seen_version', APP_VERSION);
        });
    })();

    migrateToDB().then(() => populateRouteList());

    try {
        const saved = JSON.parse(localStorage.getItem('trail_settings'));
        if (saved && saved.speedUnit) {
            elSpeedUnit.value = saved.speedUnit;
        }
        if (saved && saved.speed) {
            elSpeed.value = saved.speed;
        }
        if (saved && saved.speedValue) {
            document.getElementById('speedValue').value = saved.speedValue;
        }
        if (saved && saved.startTime) {
            elStartTime.value = saved.startTime;
        }
        if (saved && saved.chkFollow !== undefined) {
            chkFollow.checked = saved.chkFollow;
            state.followMode = saved.chkFollow;
        }
        if (saved && saved.chkUphill !== undefined) {
            chkUphill.checked = saved.chkUphill;
        }
        if (saved && saved.chk112 !== undefined) {
            chk112.checked = saved.chk112;
        }
        if (saved && saved.chkDrain !== undefined) {
            chkDrain.checked = saved.chkDrain;
            setDrainVisibility(saved.chkDrain);
        }
        if (saved && saved.drainStart) {
            const [h, m] = saved.drainStart.split(':');
            drainSet('startH', parseInt(h)); drainSet('startM', parseInt(m));
        }
        if (saved && saved.drainEnd) {
            const [h, m] = saved.drainEnd.split(':');
            drainSet('endH', parseInt(h)); drainSet('endM', parseInt(m));
        }
        if (saved && saved.timeScale) {
            elTimeScale.value = saved.timeScale;
            elTimeScaleLabel.textContent = saved.timeScale;
        }
        if (saved && saved.chkLabels !== undefined) {
            chkLabels.checked = saved.chkLabels;
            renderScheduledStops();
            renderSpeedPoints();
            renderCustomPoints();
            render112Points();
        }
        if (saved && saved.chkPoi !== undefined) {
            chkPoi.checked = saved.chkPoi;
            if (!saved.chkPoi) {
                map.removeLayer(poiIcons);
                map.removeLayer(poiLabels);
            }
        }
        if (saved && saved.chkPoiLabels !== undefined) {
            chkPoiLabels.checked = saved.chkPoiLabels;
            chkPoiLabels.disabled = !chkPoi.checked;
            if (!saved.chkPoiLabels || !chkPoi.checked) {
                map.removeLayer(poiLabels);
            }
        }
        if (saved && saved.mapLayer) {
            document.getElementById('mapLayer').value = saved.mapLayer;
            document.getElementById('mapLayer').dispatchEvent(new Event('change'));
        }
        if (saved && saved.sunCollapsed) {
            const sunCtl = document.querySelector('.sun-controls');
            sunCtl.classList.add('collapsed');
            document.getElementById('sunViewToggle').textContent = '\u25B2';
        }
        if (saved && saved.elevCollapsed) {
            const elevCtl = document.querySelector('.elev-controls');
            elevCtl.classList.add('collapsed');
            document.getElementById('elevViewToggle').textContent = '\u25B2';
        }
    } catch {}
}

export { saveSettings };
