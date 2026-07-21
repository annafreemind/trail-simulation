import { state } from './state.js';
import { infoPoints, infoDistance } from './dom.js';
import { haversineKm, pathLength, formatDistance } from './helpers.js';
import { syncMap3dRoute } from './map3d.js';

let _mapRef = null;
export function setRouteMap(map) { _mapRef = map; }

export function getRouteDistance(latlng) {
    if (!state.polyline || state.waypoints.length < 2) return 0;
    let bestDist = Infinity;
    let bestCumulativeKm = 0;
    let cumulativeKm = 0;
    for (let i = 1; i < state.waypoints.length; i++) {
        const A = state.waypoints[i - 1];
        const B = state.waypoints[i];
        const segKm = haversineKm(A, B);
        if (segKm <= 0) { cumulativeKm += segKm; continue; }
        const dLatAB = B.lat - A.lat;
        const dLngAB = B.lng - A.lng;
        let t = ((latlng.lat - A.lat) * dLatAB + (latlng.lng - A.lng) * dLngAB) / (dLatAB * dLatAB + dLngAB * dLngAB);
        t = Math.max(0, Math.min(1, t));
        const pt = { lat: A.lat + t * dLatAB, lng: A.lng + t * dLngAB };
        const d = haversineKm(pt, latlng);
        if (d < bestDist) { bestDist = d; bestCumulativeKm = cumulativeKm + t * segKm; }
        cumulativeKm += segKm;
    }
    return bestCumulativeKm;
}

export function closestPointOnRoute(latlng) {
    if (!state.polyline || state.waypoints.length < 2) return latlng;
    if (!_mapRef) return latlng;
    let bestDist = Infinity;
    let bestPt = latlng;
    for (let i = 1; i < state.waypoints.length; i++) {
        const a = _mapRef.latLngToContainerPoint(state.waypoints[i - 1]);
        const b = _mapRef.latLngToContainerPoint(state.waypoints[i]);
        const p = _mapRef.latLngToContainerPoint(latlng);
        const cp = L.LineUtil.closestPointOnSegment(p, a, b);
        const pt = _mapRef.containerPointToLatLng(cp);
        const d = haversineKm(pt, latlng);
        if (d < bestDist) { bestDist = d; bestPt = pt; }
    }
    return bestPt;
}

export function sortByRoute(arr) {
    return arr.sort((a, b) => getRouteDistance(a.latlng) - getRouteDistance(b.latlng));
}

export function redrawPath() {
    if (state.polyline) {
        _mapRef.removeLayer(state.polyline);
        state.polyline = null;
    }
    state.markers.forEach((m) => _mapRef.removeLayer(m));
    state.markers.length = 0;

    if (state.waypoints.length >= 2) {
        state.polyline = L.polyline(state.waypoints, {
            color: '#4a7cf7', weight: 4, opacity: 0.85, dashArray: null,
            renderer: L.svg({ pane: 'route' }),
        }).addTo(_mapRef);
    }

    state.waypoints.forEach((pt, i) => {
        const m = L.circleMarker(pt, {
            radius: 3, color: '#fff', weight: 2, fillColor: '#4a7cf7', fillOpacity: 1, zIndexOffset: 400,
        }).addTo(_mapRef);
        state.markers.push(m);
    });
    syncMap3dRoute();
}

export function updateInfo() {
    infoPoints.textContent = state.waypoints.length;
    if (state.waypoints.length >= 2) {
        state.totalDistanceKm = pathLength(state.waypoints);
        infoDistance.textContent = formatDistance(state.totalDistanceKm);
    } else {
        state.totalDistanceKm = 0;
        infoDistance.textContent = '—';
    }
}

export function buildElevationData() {
    if (state.waypoints.length < 2) {
        state.routeElevationData.length = 0;
        return;
    }
    const totalDist = pathLength(state.waypoints);
    const stepKm = 0.03;
    const data = [];
    let d = 0, segIdx = 0, segPos = 0;
    while (d <= totalDist + 0.0001) {
        while (segIdx < state.waypoints.length - 1) {
            const segLen = haversineKm(state.waypoints[segIdx], state.waypoints[segIdx + 1]);
            if (segPos + 0.0001 >= segLen) { segPos -= segLen; segIdx++; }
            else break;
        }
        let lat, lng;
        if (segIdx >= state.waypoints.length - 1) {
            lat = state.waypoints[state.waypoints.length - 1].lat;
            lng = state.waypoints[state.waypoints.length - 1].lng;
        } else {
            const segLen = haversineKm(state.waypoints[segIdx], state.waypoints[segIdx + 1]);
            const t = segLen > 0 ? segPos / segLen : 0;
            lat = state.waypoints[segIdx].lat + (state.waypoints[segIdx + 1].lat - state.waypoints[segIdx].lat) * t;
            lng = state.waypoints[segIdx].lng + (state.waypoints[segIdx + 1].lng - state.waypoints[segIdx].lng) * t;
        }
        const ele = getElevationFromGrid(lat, lng);
        if (ele !== null) data.push({ dist: d, ele: Math.round(ele) });
        d += stepKm;
        segPos += stepKm;
    }
    state.routeElevationData.length = 0;
    state.routeElevationData.push(...(data.length >= 2 ? data : []));
}

export function getElevation(distKm) {
    if (!state.routeElevationData.length) return 0;
    if (distKm <= 0) return state.routeElevationData[0].ele;
    const last = state.routeElevationData[state.routeElevationData.length - 1];
    if (distKm >= last.dist) return last.ele;
    for (let i = 1; i < state.routeElevationData.length; i++) {
        if (state.routeElevationData[i].dist >= distKm) {
            const t = (distKm - state.routeElevationData[i - 1].dist) / (state.routeElevationData[i].dist - state.routeElevationData[i - 1].dist);
            return state.routeElevationData[i - 1].ele + (state.routeElevationData[i].ele - state.routeElevationData[i - 1].ele) * t;
        }
    }
    return last.ele;
}

export function computeSlope(distKm, totalDistKm) {
    if (state.routeElevationData.length < 2 || totalDistKm <= 0) return 0;
    const step = 0.03;
    const ahead = Math.min(distKm + step, totalDistKm);
    const behind = Math.max(distKm - step, 0);
    const rise = (getElevation(ahead) - getElevation(behind)) / 1000;
    const run = (ahead - behind);
    if (run <= 0) return 0;
    return Math.atan2(rise, run) * 180 / Math.PI;
}
