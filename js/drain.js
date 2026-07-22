import { state } from './state.js';
import { drainCustomFields, drainTimeLabel, _drainEls, chkDrain } from './dom.js';
import { getPositionAtDistance, haversineKm, formatTime } from './helpers.js';
import { syncMap3dDrain } from './map3d.js';
import { getStartDateTime } from './animation.js';
import { drainRenderer } from './map.js';

let _mapRef = null;
export function setDrainMap(map) { _mapRef = map; }

let _saveSettingsFn = null;
export function setSaveSettingsRef(fn) { _saveSettingsFn = fn; }

export function drainTimes() {
    const a = drainGet('startH') * 60 + drainGet('startM');
    const b = drainGet('endH') * 60 + drainGet('endM');
    return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function drainGet(key) {
    return parseInt(document.getElementById(_drainEls[key][2]).textContent) || _drainEls[key][0];
}

export function drainSet(key, v) {
    const [min, max, id] = _drainEls[key];
    v = Math.max(min, Math.min(max, v));
    document.getElementById(id).textContent = key.endsWith('M') ? String(v).padStart(2, '0') : v;
}

export function drainStep(key, dir) {
    let v = drainGet(key) + dir;
    if (key.endsWith('M')) {
        if (v < 0) v = 59;
        if (v > 59) v = 0;
    }
    drainSet(key, v);
}

export function drainCustomChanged() {
    let sm = drainGet('startH') * 60 + drainGet('startM');
    let em = drainGet('endH') * 60 + drainGet('endM');
    sm = Math.max(14 * 60 + 40, Math.min(16 * 60 + 40, sm));
    em = Math.max(14 * 60 + 40, Math.min(16 * 60 + 40, em));
    if (em - sm < 5) {
        em = sm + 5;
        if (em > 16 * 60 + 40) { em = 16 * 60 + 40; sm = em - 5; }
    }
    drainSet('startH', Math.floor(sm / 60));
    drainSet('startM', sm % 60);
    drainSet('endH', Math.floor(em / 60));
    drainSet('endM', em % 60);
    clearDrainState();
    updateBatteryDrain();
    syncMap3dDrain();
    updateDrainTimeLabel();
    if (_saveSettingsFn) _saveSettingsFn();
}

export function updateDrainTimeLabel() {
    const sh = String(drainGet('startH')).padStart(2, '0');
    const sm = String(drainGet('startM')).padStart(2, '0');
    const eh = String(drainGet('endH')).padStart(2, '0');
    const em = String(drainGet('endM')).padStart(2, '0');
    drainTimeLabel.textContent = sh + ':' + sm + '\u2013 ' + eh + ':' + em;
}

export function clearDrainState() {
    clearDrainLayers();
    state.batteryDrainActive = false;
    state._drainEnded = false;
}

export function setDrainVisibility(visible) {
    drainCustomFields.style.display = visible ? '' : 'none';
    drainTimeLabel.style.display = '';
    updateDrainTimeLabel();
}

export function clearDrainLayers() {
    if (state.batteryDrainLine) { _mapRef.removeLayer(state.batteryDrainLine); state.batteryDrainLine = null; }
    state._drainStopDots.forEach(d => _mapRef.removeLayer(d));
    state._drainStopDots.length = 0;
}

function updateDrainStartFromTime() {
    if (state._drainStartSet) return;
    const st = getStartDateTime();
    if (!st) return;
    const simTime = new Date(st.getTime() + state.simElapsedSeconds * 1000);
    const simTotalMins = simTime.getHours() * 60 + simTime.getMinutes();
    const dt = drainTimes();
    const DRAIN_START = dt.start;
    if (simTotalMins <= DRAIN_START) return;
    const startMins = st.getHours() * 60 + st.getMinutes();
    const elapsed = simTotalMins - startMins;
    if (elapsed <= 0) return;
    const frac = Math.max(0, Math.min(1, (DRAIN_START - startMins) / elapsed));
    state._drainStartDist = state.traveledDistanceKm * frac;
    state._drainStartSet = true;
}

export function updateBatteryDrain() {
    if (!state.isPlaying || !state.movingMarker) return;

    const drainOn = chkDrain && chkDrain.checked;

    if (!drainOn) {
        if (state.batteryDrainLine) { _mapRef.removeLayer(state.batteryDrainLine); state.batteryDrainLine = null; }
        state._drainStopDots.forEach(d => _mapRef.removeLayer(d));
        syncMap3dDrain();
        state.batteryDrainActive = false;
        state._drainStopActive = false;
        return;
    }

    if (!state.batteryDrainActive) {
        state.batteryDrainActive = true;
        state._drainLastUpdateDist = state.traveledDistanceKm;
        updateDrainStartFromTime();
        if (state._drainStartSet) {
            refreshDrainPath();
        }
        state._drainStopDots.forEach(d => d.addTo(_mapRef));
        if (state.activeStopIndex >= 0 && state._drainStopDots.length > 0) {
            const lp = state._drainStopDots[state._drainStopDots.length - 1].getLatLng();
            if (lp.distanceTo(state.movingMarker.getLatLng()) < 1) state._drainStopActive = true;
        }
    }

    if (state.activeStopIndex >= 0) {
        if (!state._drainStopActive) {
            const st = getStartDateTime();
            if (st) {
                const now = new Date(st.getTime() + state.simElapsedSeconds * 1000);
                const nowMins = now.getHours() * 60 + now.getMinutes();
                const dt = drainTimes();
                if (nowMins >= dt.start && nowMins <= dt.end) {
                    state._drainStopActive = true;
                    const pos = state.movingMarker.getLatLng();
                    const dot = L.circle(pos, {
                        radius: 10, color: 'transparent', weight: 0,
                        fillColor: '#ff4081', fillOpacity: 0.5,
                        interactive: false, renderer: drainRenderer,
                    }).addTo(_mapRef);
                    state._drainStopDots.push(dot);
                }
            }
        }
        return;
    }

    state._drainStopActive = false;

    if (state._drainEnded) return;

    const st = getStartDateTime();
    if (!st) return;
    const simTime = new Date(st.getTime() + state.simElapsedSeconds * 1000);
    const simTotalMins = simTime.getHours() * 60 + simTime.getMinutes();

    const dt = drainTimes();
    const DRAIN_START = dt.start;
    const DRAIN_END = dt.end;

    if (simTotalMins < DRAIN_START) return;

    if (simTotalMins > DRAIN_END) {
        if (!state._drainEnded) {
            if (!state._drainStartSet) {
                state._drainStartSet = true;
                const startMins = st.getHours() * 60 + st.getMinutes();
                const elapsed = simTotalMins - startMins;
                if (elapsed > 0 && simTotalMins > DRAIN_START) {
                    state._drainStartDist = state.traveledDistanceKm * Math.max(0, Math.min(1, (DRAIN_START - startMins) / elapsed));
                } else {
                    state._drainStartDist = state.traveledDistanceKm;
                }
            }
            if (state._drainEndDist <= 0) {
                const startMins = st.getHours() * 60 + st.getMinutes();
                const elapsed = simTotalMins - startMins;
                state._drainEndDist = elapsed > 0
                    ? state.traveledDistanceKm * Math.min(1, (DRAIN_END - startMins) / elapsed)
                    : state.traveledDistanceKm;
            }
            state._drainEnded = true;
            if (drainOn) {
                state.batteryDrainActive = true;
                state._drainLastUpdateDist = state.traveledDistanceKm;
                refreshDrainPath();
            }
        }
        return;
    }

    if (!state._drainStartSet) {
        state._drainStartSet = true;
        const startMins = st.getHours() * 60 + st.getMinutes();
        const elapsed = simTotalMins - startMins;
        if (elapsed > 0 && simTotalMins > DRAIN_START) {
            const frac = Math.max(0, Math.min(1, (DRAIN_START - startMins) / elapsed));
            state._drainStartDist = state.traveledDistanceKm * frac;
        } else {
            state._drainStartDist = state.traveledDistanceKm;
        }
    }

    if (state.traveledDistanceKm - state._drainLastUpdateDist < 0.005) return;

    state._drainLastUpdateDist = state.traveledDistanceKm;
    refreshDrainPath();
}

export function refreshDrainPath() {
    if (state._isZooming || !state.batteryDrainActive) return;

    state._drainLastUpdateDist = state.traveledDistanceKm;
    const endDist = state._drainEnded ? state._drainEndDist : state.traveledDistanceKm;
    const pts = [];
    pts.push(getPositionAtDistance(state.waypoints, state._drainStartDist));

    let dist = 0;
    for (let i = 0; i < state.waypoints.length - 1; i++) {
        const segDist = haversineKm(state.waypoints[i], state.waypoints[i + 1]);
        const segEnd = dist + segDist;
        if (dist >= state._drainStartDist && dist < endDist) pts.push(state.waypoints[i]);
        if (segEnd > state._drainStartDist && segEnd <= endDist) pts.push(state.waypoints[i + 1]);
        dist = segEnd;
        if (dist >= endDist) break;
    }

    const lastPos = getPositionAtDistance(state.waypoints, Math.min(endDist, state.totalDistanceKm));
    const lastPt = pts[pts.length - 1];
    if (!lastPt || Math.abs(lastPt.lat - lastPos.lat) > 0.00001 || Math.abs(lastPt.lng - lastPos.lng) > 0.00001) {
        pts.push(lastPos);
    }

    if (pts.length < 2) return;

    if (state.batteryDrainLine) {
        state.batteryDrainLine.setLatLngs(pts);
    } else {
        state.batteryDrainLine = L.polyline(pts, {
            color: '#ff4081', weight: 14, opacity: 0.6,
            interactive: false, renderer: drainRenderer,
        }).addTo(_mapRef);
    }
}

export function initDrain() {
    document.querySelectorAll('.drain-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            drainStep(btn.dataset.target, parseInt(btn.dataset.dir));
            drainCustomChanged();
        });
        btn.addEventListener('mousedown', () => {
            const key = btn.dataset.target;
            const dir = parseInt(btn.dataset.dir);
            let count = 0;
            const repeat = () => {
                drainStep(key, dir);
                drainCustomChanged();
                count++;
                const delay = count < 3 ? 300 : 80;
                state._drainRepeat = setTimeout(repeat, delay);
            };
            state._drainRepeat = setTimeout(repeat, 400);
        });
        btn.addEventListener('mouseup', () => { clearTimeout(state._drainRepeat); });
        btn.addEventListener('mouseleave', () => { clearTimeout(state._drainRepeat); });
    });
}
