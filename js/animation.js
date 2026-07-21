import { state } from './state.js';
import {
    elStartTime, elSpeed, infoTimer, infoCurrentTime, infoCurrentSpeed,
    chkFollow, chkUphill, chk112, chkDrain, btnStart, btnPause, btnStop,
    elTimeScale, btn3D,
} from './dom.js';
import {
    haversineKm, pathLength, formatDistance, formatDuration, formatTime,
    getPositionAtDistance, getBearingAtDistance, getSpeedKmh, formatSpeed,
    formatStopDuration, speedUnit,
} from './helpers.js';
import { computeSlope, getElevation, redrawPath } from './route.js';
import {
    renderScheduledStops, renderSpeedPoints, renderRoutePoints,
    render112Points, showAlarm, hideAlarm,
} from './points.js';
import { updateBatteryDrain, setDrainVisibility, clearDrainLayers } from './drain.js';
import { addMap3dMarker, updateMap3dMarker, removeMap3dMarker, syncMap3d112, syncMap3dDrain } from './map3d.js';
import { setStatus } from './map.js';

let _mapRef = null;
export function setAnimMap(map) { _mapRef = map; }

let _drawElevProfile = null;
export function setDrawElevProfile(fn) { _drawElevProfile = fn; }

let _drawSunView = null;
export function setDrawSunView(fn) { _drawSunView = fn; }

let _updateStartButton = null;
export function setUpdateStartButton(fn) { _updateStartButton = fn; }

export function stopAnimation() {
    hideAlarm();
    state._alarmTimeouts.forEach(clearTimeout);
    state._alarmTimeouts.length = 0;
    if (state.animationId) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
    }
    if (state.movingMarker) {
        _mapRef.removeLayer(state.movingMarker);
        state.movingMarker = null;
        removeMap3dMarker();
    }
    state.isPlaying = false;
    state.isPaused = false;
    elSpeed.disabled = false;
    elStartTime.disabled = false;
    btn3D.disabled = false;
    setDrainVisibility(chkDrain.checked);
    state.isAtEnd = false;
    state.alarmTriggered = false;
    state._112Fired = {};
    state._112PointMarkers.forEach(m => _mapRef.removeLayer(m));
    state._112PointMarkers.length = 0;
    state._112Points.length = 0;
    syncMap3d112();
    state.traveledDistanceKm = 0;
    state.simElapsedSeconds = 0;
    state._prevSimSec = -1;
    state._smoothViewDir = 0;
    state._lastRecordedMinute = -1;
    state.elevationHistory.length = 0;
    state.batteryDrainActive = false;
    state._drainStartDist = 0;
    state._drainStartSet = false;
    state._drainEndDist = 0;
    state._drainLastWpIdx = -1;
    state._drainLastUpdateDist = 0;
    state._drainEnded = false;
    clearDrainLayers();
    syncMap3dDrain();

    state.scheduledStops.forEach(s => { s.visited = false; delete s.startTime; delete s.endTime; });
    state.speedPoints.forEach(sp => sp.activated = false);
    renderScheduledStops();
    renderSpeedPoints();
    renderRoutePoints();

    btnStart.textContent = 'Start';
    btnPause.disabled = true;
    btnPause.textContent = 'Pause';
    btnStop.disabled = true;
    redrawPath();
    resetTimerDisplay();
    const st = getStartDateTime();
    if (st) updateSunView(st);
    if (_updateStartButton) _updateStartButton();
    if (_drawElevProfile) _drawElevProfile();
}

export function resetTimerDisplay() {
    infoTimer.textContent = '00:00:00';
    infoCurrentTime.textContent = '\u2014';
    infoCurrentSpeed.textContent = '\u2014';
}

export function getStartDateTime() {
    const val = elStartTime.value;
    if (!val) return null;
    const [h, m] = val.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}

export function startAnimation() {
    if (state.waypoints.length < 2) return;
    const speed = getSpeedKmh();
    if (speed <= 0) {
        setStatus('Speed must be greater than 0', 'error');
        return;
    }
    state._currentSpeedKmh = speed;

    state.totalDistanceKm = pathLength(state.waypoints);

    if (state.isAtEnd) {
        if (state.traveledDistanceKm >= state.totalDistanceKm) {
            setStatus('Add more waypoints to extend the route', 'error');
            return;
        }
        state.scheduledStops.forEach(s => { s.visited = false; delete s.startTime; delete s.endTime; });
        state.speedPoints.forEach(sp => sp.activated = false);
        state.activeStopIndex = -1;
        state.stopRemaining = 0;
        renderScheduledStops();
        renderSpeedPoints();
    } else {
        state.traveledDistanceKm = 0;
        state.simElapsedSeconds = 0;

        state.scheduledStops.forEach(s => { s.visited = false; delete s.startTime; delete s.endTime; });
        state.speedPoints.forEach(sp => sp.activated = false);
        state.activeStopIndex = -1;
        state.stopRemaining = 0;
        renderScheduledStops();
        renderSpeedPoints();

        state.markers.forEach(m => _mapRef.removeLayer(m));
        state.markers.length = 0;

        if (state.movingMarker) {
            _mapRef.removeLayer(state.movingMarker);
            state.movingMarker = null;
        }

        const icon = L.divIcon({
            className: 'move-marker',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        });
        state.movingMarker = L.marker(state.waypoints[0], { icon, zIndexOffset: 1000 }).addTo(_mapRef);
        addMap3dMarker();
    }

    state.isAtEnd = false;
    state.alarmTriggered = false;
    state._prevSimSec = -1;
    state._smoothViewDir = 0;
    state.batteryDrainActive = false;
    state._drainStartDist = 0;
    state._drainStartSet = false;
    state._drainEndDist = 0;
    state._drainLastWpIdx = -1;
    state._drainLastUpdateDist = 0;
    state._drainEnded = false;
    clearDrainLayers();
    syncMap3dDrain();
    state.isPlaying = true;
    state.isPaused = false;
    elSpeed.disabled = true;
    elStartTime.disabled = true;
    btn3D.disabled = true;
    setDrainVisibility(false);
    btnStart.disabled = true;
    btnStart.textContent = 'Start';
    btnPause.disabled = false;
    btnPause.textContent = 'Pause';
    btnStop.disabled = false;
    if (_updateStartButton) _updateStartButton();

    state.lastFrameTimestamp = performance.now();

    setStatus('Movement started', 'active');
    updateStartTime();

    state.animationId = requestAnimationFrame(animationLoop);
}

export function animationLoop(timestamp) {
    if (!state.isPlaying) return;

    const delta = (timestamp - state.lastFrameTimestamp) / 1000;
    state.lastFrameTimestamp = timestamp;
    const multiplier = parseFloat(elTimeScale.value) || 1;

    if (state.isPaused) {
        state.animationId = requestAnimationFrame(animationLoop);
        return;
    }

    state.simElapsedSeconds += delta * multiplier;

    const st = getStartDateTime();
    if (st) {
        const midnight = new Date(st);
        midnight.setHours(24, 0, 0, 0);
        const maxSec = (midnight - st) / 1000;
        if (state.simElapsedSeconds >= maxSec) {
            state.simElapsedSeconds = maxSec;
            updateCurrentTime(state.simElapsedSeconds);
            updateTimerDisplay(state.simElapsedSeconds);
            setStatus('A day full of mysteries comes to an end\u2026', '');
            stopAnimation();
            return;
        }
    }

    if (state.activeStopIndex >= 0) {
        state.stopRemaining -= delta * multiplier;
        if (state.stopRemaining <= 0) {
            state.stopRemaining = 0;
            state.activeStopIndex = -1;
            setStatus('Movement resumed', 'active');
            updateTimerDisplay(state.simElapsedSeconds);
            updateCurrentTime(state.simElapsedSeconds);
            infoCurrentSpeed.textContent = formatSpeed(getSpeedKmh());
            updateBatteryDrain();
            syncMap3dDrain();
            state.animationId = requestAnimationFrame(animationLoop);
            return;
        }
        updateTimerDisplay(state.simElapsedSeconds);
        updateCurrentTime(state.simElapsedSeconds);
        infoCurrentSpeed.textContent = '0 ' + speedUnit();
        updateBatteryDrain();
        syncMap3dDrain();
        setStatus(`Waiting at "${state.scheduledStops[state.activeStopIndex].label}" \u2014 ${Math.ceil(state.stopRemaining)}s`, '');
        state.animationId = requestAnimationFrame(animationLoop);
        return;
    }

    const speed = getSpeedKmh();
    let effectiveSpeed = speed;
    state._slopeDeg = 0;
    if (chkUphill.checked) {
        if (state.routeElevationData.length >= 2) {
            state._slopeDeg = computeSlope(state.traveledDistanceKm, state.totalDistanceKm);
            if (state._slopeDeg > 0) {
                effectiveSpeed = speed * Math.max(0.5, 1 - state._slopeDeg / 28);
            }
        }
    }
    const speedKmPerSec = effectiveSpeed / 3600;
    state.traveledDistanceKm += speedKmPerSec * delta * multiplier;
    state.traveledDistanceKm = Math.min(state.traveledDistanceKm, state.totalDistanceKm);

    const pts = state.waypoints;
    const pos = getPositionAtDistance(pts, state.traveledDistanceKm);
    state.movingMarker.setLatLng(pos);
    updateMap3dMarker(pos);
    if (state.followMode) _mapRef.panTo(pos, { animate: false });
    if (state.followMode && state.map3d) state.map3d.jumpTo({ center: [pos.lng, pos.lat] });

    updateBatteryDrain();
    syncMap3dDrain();

    if (chk112.checked) {
        const st2 = getStartDateTime();
        if (st2 && state._prevSimSec >= 0) {
            const prev = new Date(st2.getTime() + state._prevSimSec * 1000);
            const current = new Date(st2.getTime() + state.simElapsedSeconds * 1000);
            for (const at of state.ALARM_TIMES) {
                if (state._112Fired[at.label]) continue;
                const alarmMin = at.h * 60 + at.m;
                const prevMin = prev.getHours() * 60 + prev.getMinutes();
                const curMin = current.getHours() * 60 + current.getMinutes();
                if (prevMin < alarmMin && curMin >= alarmMin) {
                    state._112Fired[at.label] = true;
                    state._112Points.push({ latlng: pos, label: at.label });
                    render112Points();
                    showAlarm(at.label);
                    setStatus(`${at.label} triggered`, 'error');
                }
            }
        }
    }
    state._prevSimSec = state.simElapsedSeconds;

    if (state.traveledDistanceKm > 0) {
        const curMin = Math.floor(state.simElapsedSeconds / 60);
        if (curMin > state._lastRecordedMinute) {
            state._lastRecordedMinute = curMin;
            state.elevationHistory.push({
                dist: state.traveledDistanceKm,
                ele: getElevation(state.traveledDistanceKm),
                time: state.simElapsedSeconds,
            });
        }
    }

    if (state.activeStopIndex < 0 && state.traveledDistanceKm > 0) {
        for (let i = 0; i < state.scheduledStops.length; i++) {
            const s = state.scheduledStops[i];
            if (s.visited) continue;
            const triggerAt = s.routeDist;
            if (state.traveledDistanceKm >= triggerAt) {
                s.visited = true;
                state.activeStopIndex = i;
                state.stopRemaining = s.duration;
                const st3 = getStartDateTime();
                s.startTime = st3 ? new Date(st3.getTime() + state.simElapsedSeconds * 1000) : null;
                s.endTime = s.startTime ? new Date(s.startTime.getTime() + s.duration * 1000) : null;
                setStatus(`Arrived at "${s.label}" \u2014 stopping for ${formatStopDuration(s.duration)}`, '');
                infoCurrentSpeed.textContent = '0 ' + speedUnit();
                renderScheduledStops();
                break;
            }
        }
    }

    for (let i = 0; i < state.speedPoints.length; i++) {
        const sp = state.speedPoints[i];
        if (sp.activated) continue;
        const triggerAt = sp.routeDist;
        if (state.traveledDistanceKm >= triggerAt) {
            sp.activated = true;
            state._currentSpeedKmh = sp.speed;
            setStatus(`Speed changed to ${formatSpeed(sp.speed)} at "${sp.label}"`, '');
            renderSpeedPoints();
            break;
        }
    }

    if (state.activeStopIndex >= 0) {
        state.animationId = requestAnimationFrame(animationLoop);
        return;
    }

    if (state.traveledDistanceKm >= state.totalDistanceKm) {
        const finalPos = state.waypoints[state.waypoints.length - 1];
        state.movingMarker.setLatLng(finalPos);
        updateMap3dMarker(finalPos);
        state.traveledDistanceKm = state.totalDistanceKm;
        state.isAtEnd = true;
        infoCurrentSpeed.textContent = '0 ' + speedUnit();
        setStatus('Route completed \u2014 timer running', 'active');
    }

    if (!state.isAtEnd) {
        if (state._slopeDeg > 0) {
            infoCurrentSpeed.textContent = formatSpeed(effectiveSpeed) + '  \u2191' + state._slopeDeg.toFixed(0) + '\u00b0';
        } else {
            infoCurrentSpeed.textContent = formatSpeed(getSpeedKmh());
        }
    }
    updateTimerDisplay(state.simElapsedSeconds);
    updateCurrentTime(state.simElapsedSeconds);
    if (_drawElevProfile) _drawElevProfile();

    state.animationId = requestAnimationFrame(animationLoop);
}

export function updateTimerDisplay(sec) {
    infoTimer.textContent = formatDuration(sec);
}

export function updateCurrentTime(elapsedSec) {
    const startDate = getStartDateTime();
    if (startDate) {
        const currentDate = new Date(startDate.getTime() + elapsedSec * 1000);
        infoCurrentTime.textContent = formatTime(currentDate);
        updateSunView(currentDate);
    } else {
        infoCurrentTime.textContent = '\u2014';
    }
}

export function updateStartTime() {
    updateCurrentTime(0);
}

export function updateSunView(date, force) {
    try {
        if (_drawSunView && date) _drawSunView(date);
    } catch (e) {
        console.error('sun widget error', e);
    }
}
