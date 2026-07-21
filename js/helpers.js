import { state } from './state.js';
import { elSpeed, elSpeedUnit } from './dom.js';

export function haversineKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
    return 2 * state.EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function pathLength(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += haversineKm(pts[i - 1], pts[i]);
    return total;
}

export function speedUnit() { return elSpeedUnit ? elSpeedUnit.value : 'kmh'; }

export function formatDistance(km) {
    const isMph = speedUnit() === 'mph';
    const val = isMph ? km * 0.621371 : km;
    const unit = isMph ? ' mi' : ' km';
    if (km < (isMph ? 0.0048 : 0.01)) return isMph ? '0 ft' : '0 m';
    if (val < 1) return (val * (isMph ? 5280 : 1000)).toFixed(0) + (isMph ? ' ft' : ' m');
    if (val < 10) return val.toFixed(2) + unit;
    if (val < 100) return val.toFixed(1) + unit;
    return val.toFixed(0) + unit;
}

export function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseDuration(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseInt(str) || 0;
}

export function formatStopDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function maskDurationInput(el) {
    let val = el.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (val.length > 2) val = val.slice(0, 2) + ':' + val.slice(2);
    el.value = val;
}

export function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function getPositionAtDistance(pts, distKm) {
    if (!pts || pts.length === 0) return null;
    if (distKm <= 0 || pts.length < 2) return pts[0];
    let accumulated = 0;
    for (let i = 1; i < pts.length; i++) {
        const segLen = haversineKm(pts[i - 1], pts[i]);
        if (segLen <= 0) continue;
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

export function getBearingAtDistance(pts, distKm) {
    if (distKm <= 0 || pts.length < 2) return 0;
    let accumulated = 0;
    for (let i = 1; i < pts.length; i++) {
        const segLen = haversineKm(pts[i - 1], pts[i]);
        if (segLen <= 0) continue;
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

export function formatSpeed(kmh) {
    const unit = speedUnit();
    const val = unit === 'mph' ? kmh * 0.621371 : kmh;
    return val.toFixed(1) + ' ' + unit;
}

export function getSpeedKmh() {
    if (state.isPlaying) return state._currentSpeedKmh;
    const val = parseFloat(elSpeed.value) || 0;
    return elSpeedUnit.value === 'mph' ? val / 0.621371 : val;
}

export function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgb(c) {
    return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

export function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

export function skyColorAt(elev, radiation) {
    const clamped = Math.max(-12, Math.min(50, elev));
    const elevFactor = Math.max(0, Math.min(1, (clamped + 8) / 30));
    const maxRad = 995;
    const radFactor = radiation !== undefined ? Math.max(0, Math.min(1, radiation / maxRad)) : elevFactor;
    const dayFactor = radFactor * 0.75 + elevFactor * 0.25;
    const warmFactor = smoothstep(0, 12, Math.max(0, 12 - Math.abs(clamped)));
    const warmth = warmFactor * (1 - Math.max(dayFactor, radFactor) * 0.7);
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

export function getSunAt(date) {
    const totalMin = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    const idx = Math.floor(totalMin / 5);
    const t = (totalMin / 5) - idx;
    const row = sunData.table[idx];
    const next = sunData.table[Math.min(idx + 1, sunData.table.length - 1)];
    if (!row) return null;
    if (!next) return { elev: row[2], azim: row[3] };
    return { elev: row[2] + (next[2] - row[2]) * t, azim: row[3] + (next[3] - row[3]) * t };
}

export function getWeatherAt(date) {
    const fracHour = date.getHours() + date.getMinutes() / 60;
    const idx = Math.max(0, Math.min(Math.floor(fracHour), 22));
    const t = Math.max(0, Math.min(1, fracHour - idx));
    const nextIdx = Math.min(idx + 1, 23);
    const result = {};
    for (const key of ['temperature','humidity','precipitation','windSpeed','windDir','cloudCover','radiation','weatherCode']) {
        result[key] = weatherData[key][idx] + (weatherData[key][nextIdx] - weatherData[key][idx]) * t;
    }
    return result;
}
