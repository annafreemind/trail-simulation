import { state } from './state.js';
import { routePointList, combinedNavList, chkLabels } from './dom.js';
import {
    formatStopDuration, formatSpeed, formatTime, getSpeedKmh,
    getBearingAtDistance, getPositionAtDistance,
} from './helpers.js';
import { getRouteDistance } from './route.js';
import { syncMap3dStops, syncMap3dSpeeds, syncMap3dCustoms, syncMap3d112 } from './map3d.js';

let _mapRef = null;
export function setPointsMap(map) { _mapRef = map; }

export function renderRoutePoints() {
    const stops = state.scheduledStops.map((s, i) => ({ ...s, type: 'stop', idx: i }));
    const speeds = state.speedPoints.map((sp, i) => ({ ...sp, type: 'speed', idx: i }));
    const customs = state.customPoints.map((cp, i) => ({ ...cp, type: 'custom', idx: i }));
    const all = [...stops, ...speeds].sort((a, b) => a.routeDist - b.routeDist);
    const items = [...all, ...customs];
    routePointList.innerHTML = items.map(item => {
        const passed = false;
        const color = item.type === 'stop' ? '#f39c12' : item.type === 'speed' ? '#2ecc71' : '#9b59b6';
        const detail = item.type === 'stop' ? formatStopDuration(item.duration) : (item.type === 'speed' ? formatSpeed(item.speed) : '');
        return `<div style="padding:2px 0;border-bottom:1px solid #1a2a4e;display:flex;align-items:center;gap:6px;opacity:${passed ? 0.5 : 1}">
            <span style="color:${color};flex-shrink:0">${passed ? '\u2713' : '\u25cf'}</span>
            <span style="text-decoration:${passed ? 'line-through' : 'none'};flex:1">${item.label}</span>
            ${detail ? `<span style="color:#8899bb;flex-shrink:0;font-size:11px">${detail}</span>` : ''}
            <span class="del-route-point" data-type="${item.type}" data-index="${item.idx}" style="color:#e74c3c;cursor:pointer;font-size:14px;font-weight:700;line-height:1">\u00d7</span>
        </div>`;
    }).join('');
}

export function renderNavList() {
    const stops = state.scheduledStops.map(s => ({ ...s, type: 'stop' }));
    const speeds = state.speedPoints.map(sp => ({ ...sp, type: 'speed' }));
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

export function renderScheduledStops() {
    state.scheduledStopMarkers.forEach(m => _mapRef.removeLayer(m));
    state.scheduledStopMarkers.length = 0;
    state.scheduledStops.forEach((s, i) => {
        const m = L.circleMarker(s.latlng, {
            radius: 4,
            color: '#fff',
            weight: 2,
            fillColor: '#f39c12',
            fillOpacity: s.visited ? 0.4 : 1,
            zIndexOffset: 600,
        }).addTo(_mapRef);
        if (chkLabels.checked) {
            m.bindTooltip(`${s.label} (${formatStopDuration(s.duration)})`, { permanent: true, direction: 'top', offset: [0, -4] });
        }
        state.scheduledStopMarkers.push(m);
    });
    renderRoutePoints();
    renderNavList();
    syncMap3dStops();
}

export function renderSpeedPoints() {
    state.speedPointMarkers.forEach(m => _mapRef.removeLayer(m));
    state.speedPointMarkers.length = 0;
    state.speedPoints.forEach((s, i) => {
        const m = L.circleMarker(s.latlng, {
            radius: 4,
            color: '#fff',
            weight: 2,
            fillColor: '#2ecc71',
            fillOpacity: s.activated ? 0.3 : 1,
            zIndexOffset: 600,
        }).addTo(_mapRef);
        if (chkLabels.checked) {
            m.bindTooltip(`${s.label} (${formatSpeed(s.speed)})`, { permanent: true, direction: 'top', offset: [0, -4] });
        }
        state.speedPointMarkers.push(m);
    });
    renderRoutePoints();
    renderNavList();
    syncMap3dSpeeds();
}

export function renderCustomPoints() {
    state.customPointMarkers.forEach(m => _mapRef.removeLayer(m));
    state.customPointMarkers.length = 0;
    state.customPoints.forEach(s => {
        const m = L.circleMarker(s.latlng, {
            radius: 4,
            color: '#fff',
            weight: 2,
            fillColor: '#9b59b6',
            fillOpacity: 1,
            zIndexOffset: 600,
        }).addTo(_mapRef);
        if (chkLabels.checked) {
            m.bindTooltip(s.label, { permanent: true, direction: 'top', offset: [0, -4] });
        }
        state.customPointMarkers.push(m);
    });
    renderRoutePoints();
    syncMap3dCustoms();
}

export function render112Points() {
    state._112PointMarkers.forEach(m => _mapRef.removeLayer(m));
    state._112PointMarkers.length = 0;
    state._112Points.forEach(p => {
        const m = L.circleMarker(p.latlng, {
            radius: 4,
            color: '#fff',
            weight: 2,
            fillColor: '#e74c3c',
            fillOpacity: 1,
            zIndexOffset: 900,
        }).addTo(_mapRef);
        if (chkLabels.checked) {
            m.bindTooltip(p.label, { permanent: true, direction: 'top', offset: [0, -6] });
        }
        state._112PointMarkers.push(m);
    });
    syncMap3d112();
}

export function showAlarm(text) {
    state._alarmTimeouts.forEach(clearTimeout);
    state._alarmTimeouts.length = 0;
    const el = document.getElementById('alarm');
    el.textContent = text;
    el.style.opacity = '1';
    el.style.display = 'block';
    const t1 = setTimeout(() => { el.style.opacity = '0'; }, 10000);
    const t2 = setTimeout(() => { el.style.display = 'none'; }, 11000);
    state._alarmTimeouts.push(t1, t2);
}

export function hideAlarm() {
    const el = document.getElementById('alarm');
    el.style.display = 'none';
}

export function initPoints() {
    routePointList.addEventListener('click', (e) => {
        const del = e.target.closest('.del-route-point');
        if (!del) return;
        const type = del.dataset.type;
        const idx = parseInt(del.dataset.index);
        if (type === 'stop') {
            state.scheduledStops.splice(idx, 1);
            renderScheduledStops();
        } else if (type === 'speed') {
            state.speedPoints.splice(idx, 1);
            renderSpeedPoints();
        } else if (type === 'custom') {
            state.customPoints.splice(idx, 1);
            renderCustomPoints();
        }
    });
}
