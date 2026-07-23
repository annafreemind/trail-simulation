import { state } from './state.js';
import {
    elStartTime, elSpeed, elSpeedUnit, elTimeScale, elTimeScaleLabel,
    btnStart, btnPause, btnStop, btnClear, btnUndo, btnFit,
    infoCurrentSpeed, infoTimer,
    chkFollow, chkLabels, chkPoi, chkPoiLabels, chkTerrain, chk112, chkDrain,
    btn3D,
    sunCanvas, sunCtx, elevCanvas, elevCtx,
} from './dom.js';
import {
    formatDistance, getSpeedKmh, formatSpeed, speedUnit,
    getSunAt, getWeatherAt, skyColorAt, lerp3, rgb, smoothstep,
    getBearingAtDistance, getPositionAtDistance, pathLength,
    formatDuration, formatTime, maskDurationInput,
} from './helpers.js';
import { redrawPath, updateInfo, buildElevationData, getElevation } from './route.js';
import { renderScheduledStops, renderSpeedPoints, renderCustomPoints, render112Points } from './points.js';
import {
    setDrainVisibility, updateBatteryDrain, clearDrainState,
    drainGet, drainSet, drainCustomChanged, updateDrainTimeLabel, drainStep,
} from './drain.js';
import { getStartDateTime, stopAnimation, updateCurrentTime, updateStartTime } from './animation.js';
import { setStatus } from './map.js';
import { updateMap3dPoiVisibility, syncMap3dDrain } from './map3d.js';
import { map, poiIcons, poiLabels } from './map.js';

function saveSettings() {
    localStorage.setItem('trail_settings', JSON.stringify({
        mapLayer: document.getElementById('mapLayer').value,
        speedUnit: speedUnit(),
        speed: elSpeed.value,
        speedValue: document.getElementById('speedValue').value,
        startTime: elStartTime.value,
        chkLabels: chkLabels.checked,
        chkPoi: chkPoi.checked,
        chkPoiLabels: chkPoiLabels.checked,
        chkFollow: chkFollow.checked,
        chkTerrain: chkTerrain.checked,
        chkUphill: chkTerrain.checked,
        chk112: chk112.checked,
        chkDrain: chkDrain.checked,
        drainStart: drainGet('startH') + ':' + String(drainGet('startM')).padStart(2, '0'),
        drainEnd: drainGet('endH') + ':' + String(drainGet('endM')).padStart(2, '0'),
        timeScale: elTimeScale.value,
        sunCollapsed: document.querySelector('.sun-controls').classList.contains('collapsed'),
        elevCollapsed: document.querySelector('.elev-controls').classList.contains('collapsed'),
    }));
}

function updateStartButton() {
    btnStart.disabled = state.waypoints.length < 2 || !parseFloat(elSpeed.value) || state.isPlaying;
    btnUndo.disabled = state.waypoints.length === 0 || state.isPlaying;
    btnClear.disabled = state.isPlaying;
    document.querySelectorAll('.mode-btn').forEach(b => {
        b.disabled = state.isPlaying;
    });
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
        if (state.waypoints.length >= 2 && state.isPlaying) {
            const pts = state.waypoints;
            viewDir = getBearingAtDistance(pts, state.traveledDistanceKm);
        }
        if (viewDir === -1) viewDir = 0;
        if (state.isPlaying) {
            let diff = viewDir - state._smoothViewDir;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            state._smoothViewDir += diff * 0.06;
            if (state._smoothViewDir < 0) state._smoothViewDir += 360;
            if (state._smoothViewDir >= 360) state._smoothViewDir -= 360;
        } else {
            state._smoothViewDir = viewDir;
        }
        viewDir = state._smoothViewDir;
        function card(a) { return ['N','E','S','W'][Math.round((a % 360) / 90) % 4]; }
        const leftAzim = (viewDir + 260) % 360;
        const rightAzim = (viewDir + 100) % 360;
        function azimToFrac(a) {
            let aa = a, la = leftAzim, ra = rightAzim;
            if (la < ra) return (aa - la) / (ra - la);
            if (aa < la) aa += 360;
            return (aa - la) / (ra + 360 - la);
        }

        const weather = getWeatherAt(date);
        const { top: skyTop, hor: skyHor } = skyColorAt(elev, weather.radiation);

        sunCtx.clearRect(0, 0, W, H);

        const sunFrac = Math.max(0, Math.min(1, 1 - (sun.azim - 70) / 220));
        const sunCanvasX = W * sunFrac;
        const sunCanvasY = horizonY * (1 - Math.max(0, sun.elev) / 90);

        {
            const baseGrad = sunCtx.createLinearGradient(0, 0, 0, horizonY);
            baseGrad.addColorStop(0, rgb(skyTop));
            baseGrad.addColorStop(1, rgb(skyHor));
            sunCtx.fillStyle = baseGrad;
        }
        sunCtx.fillRect(0, 0, W, horizonY);
        {
            const shadowStr = Math.max(0, Math.min(1, 1 - Math.abs(sun.elev) / 30));
            const shadowAlpha = 0.24 * shadowStr;
            if (shadowAlpha > 0.02) {
                const shadowX = sunCanvasX < W / 2 ? W : 0;
                const shadowR = Math.max(W, horizonY) * 0.65;
                const shadowGrad = sunCtx.createRadialGradient(shadowX, horizonY * 0.42, 0, shadowX, horizonY * 0.42, shadowR);
                shadowGrad.addColorStop(0, 'rgba(8,12,40,' + shadowAlpha.toFixed(3) + ')');
                shadowGrad.addColorStop(0.35, 'rgba(8,12,40,' + (shadowAlpha * 0.5).toFixed(3) + ')');
                shadowGrad.addColorStop(0.7, 'rgba(8,12,40,' + (shadowAlpha * 0.15).toFixed(3) + ')');
                shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
                sunCtx.fillStyle = shadowGrad;
                sunCtx.fillRect(0, 0, W, horizonY);
            }
        }

        const skyPathPoints = [];
        for (const row of sunData.table) {
            const el = row[2], az = row[3];
            if (el > 0) {
                const frac = Math.max(0, Math.min(1, 1 - (az - 70) / 220));
                const px = W * frac;
                const py = horizonY * (1 - el / 90);
                skyPathPoints.push([px, py]);
            }
        }
        if (skyPathPoints.length > 1) {
            sunCtx.strokeStyle = 'rgba(255,200,60,0.2)';
            sunCtx.lineWidth = 1.5;
            sunCtx.setLineDash([4, 4]);
            sunCtx.beginPath();
            sunCtx.moveTo(skyPathPoints[0][0], skyPathPoints[0][1]);
            for (let i = 1; i < skyPathPoints.length; i++) {
                sunCtx.lineTo(skyPathPoints[i][0], skyPathPoints[i][1]);
            }
            sunCtx.stroke();
            sunCtx.setLineDash([]);
        }

        if (sun.elev > -6) {
            const alpha = sun.elev < 0 ? 1 + sun.elev / 6 : 1;
            sunCtx.save();
            sunCtx.globalAlpha = alpha;
            sunCtx.fillStyle = 'rgba(255,220,80,0.15)';
            sunCtx.beginPath();
            sunCtx.arc(sunCanvasX, sunCanvasY, 14, 0, Math.PI * 2);
            sunCtx.fill();
            sunCtx.strokeStyle = 'rgba(255,210,60,0.6)';
            sunCtx.lineWidth = 1.5;
            for (let r = 0; r < 8; r++) {
                const ra = r * Math.PI / 4;
                sunCtx.beginPath();
                sunCtx.moveTo(sunCanvasX + Math.cos(ra) * 8, sunCanvasY + Math.sin(ra) * 8);
                sunCtx.lineTo(sunCanvasX + Math.cos(ra) * 13, sunCanvasY + Math.sin(ra) * 13);
                sunCtx.stroke();
            }
            const skyGrad = sunCtx.createRadialGradient(sunCanvasX - 1, sunCanvasY - 1, 0, sunCanvasX, sunCanvasY, 7);
            skyGrad.addColorStop(0, '#fff8c0');
            skyGrad.addColorStop(0.5, '#ffe066');
            skyGrad.addColorStop(1, 'rgba(255,180,40,0.7)');
            sunCtx.fillStyle = skyGrad;
            sunCtx.beginPath();
            sunCtx.arc(sunCanvasX, sunCanvasY, 7, 0, Math.PI * 2);
            sunCtx.fill();
            sunCtx.restore();
        }

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
        const markerY = scaleBot - scaleH * Math.max(0, Math.min(1, sun.elev / 90));
        sunCtx.fillStyle = '#ffe066';
        sunCtx.shadowColor = 'rgba(0,0,0,0.5)';
        sunCtx.shadowBlur = 4;
        sunCtx.beginPath();
        sunCtx.moveTo(scaleX + 3, markerY);
        sunCtx.lineTo(scaleX - 7, markerY - 6);
        sunCtx.lineTo(scaleX - 7, markerY + 6);
        sunCtx.closePath();
        sunCtx.fill();
        sunCtx.strokeStyle = 'rgba(255,255,255,0.7)';
        sunCtx.lineWidth = 1;
        sunCtx.stroke();
        sunCtx.shadowBlur = 0;

        const groundBr = Math.max(0, Math.min(1, weather.radiation / 995));
        sunCtx.fillStyle = `rgba(${Math.round(10 + 30 * groundBr)},${Math.round(15 + 40 * groundBr)},${Math.round(10 + 30 * groundBr)},1)`;
        sunCtx.fillRect(0, horizonY, W, sh - horizonY);

        sunCtx.strokeStyle = `rgba(${Math.round(30 + 90 * groundBr)},${Math.round(30 + 110 * groundBr)},${Math.round(30 + 70 * groundBr)},${0.15 + 0.35 * groundBr})`;
        sunCtx.lineWidth = 1.5;
        sunCtx.beginPath();
        sunCtx.moveTo(sx, horizonY);
        sunCtx.lineTo(sx + sw, horizonY);
        sunCtx.stroke();

        const mtnWidth = sw * 0.38;
        const mtnHeight = arcR * 0.38;
        const mtnX = cx;
        sunCtx.fillStyle = `rgba(${Math.round(15 + 45 * groundBr)},${Math.round(20 + 55 * groundBr)},${Math.round(15 + 45 * groundBr)},1)`;
        sunCtx.beginPath();
        sunCtx.moveTo(mtnX - mtnWidth / 2, horizonY);
        sunCtx.lineTo(mtnX, horizonY - mtnHeight);
        sunCtx.lineTo(mtnX + mtnWidth / 2, horizonY);
        sunCtx.closePath();
        sunCtx.fill();
        sunCtx.strokeStyle = `rgba(${Math.round(30 + 90 * groundBr)},${Math.round(30 + 110 * groundBr)},${Math.round(30 + 70 * groundBr)},${0.15 + 0.35 * groundBr})`;
        sunCtx.lineWidth = 1.5;
        sunCtx.beginPath();
        sunCtx.moveTo(mtnX - mtnWidth / 2, horizonY);
        sunCtx.lineTo(mtnX, horizonY - mtnHeight);
        sunCtx.lineTo(mtnX + mtnWidth / 2, horizonY);
        sunCtx.stroke();

        const compR = 48;
        const compCX = mtnX, compCY = horizonY + 20;
        sunCtx.save();
        sunCtx.translate(compCX, compCY);

        function polar(a, r) {
            const rad = (a - 90) * Math.PI / 180;
            return [Math.cos(rad) * r, Math.sin(rad) * r];
        }

        sunCtx.strokeStyle = 'rgba(255,255,255,0.25)';
        sunCtx.lineWidth = 1;
        sunCtx.beginPath();
        sunCtx.arc(0, 0, compR, 0, Math.PI * 2);
        sunCtx.stroke();

        const pathPoints = [];
        for (const row of sunData.table) {
            const el = row[2], az = row[3];
            if (el > 0) {
                const r = compR * (1 - el / 90);
                const [px, py] = polar(az, r);
                pathPoints.push([px, py]);
            }
        }
        if (pathPoints.length > 1) {
            sunCtx.strokeStyle = 'rgba(255,200,60,0.3)';
            sunCtx.lineWidth = 2;
            sunCtx.setLineDash([4, 4]);
            sunCtx.beginPath();
            sunCtx.moveTo(pathPoints[0][0], pathPoints[0][1]);
            for (let i = 1; i < pathPoints.length; i++) {
                sunCtx.lineTo(pathPoints[i][0], pathPoints[i][1]);
            }
            sunCtx.stroke();
            sunCtx.setLineDash([]);
        }

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

        const arrowStartR = compR * 0.25;
        const [hx, hy] = polar(viewDir, compR);
        const [ox, oy] = polar(viewDir, arrowStartR);
        sunCtx.strokeStyle = '#e74c3c';
        sunCtx.lineWidth = 5;
        sunCtx.beginPath();
        sunCtx.moveTo(ox, oy);
        sunCtx.lineTo(hx, hy);
        sunCtx.stroke();
        const aRad = (viewDir - 90) * Math.PI / 180;
        const pR = aRad + Math.PI / 2;
        sunCtx.fillStyle = '#e74c3c';
        sunCtx.beginPath();
        sunCtx.moveTo(hx, hy);
        sunCtx.lineTo(hx - Math.cos(aRad) * 10 + Math.cos(pR) * 6, hy - Math.sin(aRad) * 10 + Math.sin(pR) * 6);
        sunCtx.lineTo(hx - Math.cos(aRad) * 10 - Math.cos(pR) * 6, hy - Math.sin(aRad) * 10 - Math.sin(pR) * 6);
        sunCtx.closePath();
        sunCtx.fill();

        if (sun.elev > -6) {
            const alpha = sun.elev < 0 ? 1 + sun.elev / 6 : 1;
            sunCtx.save();
            sunCtx.globalAlpha = alpha;
            const sunR = compR * (1 - Math.max(0, sun.elev) / 90);
            const [six, siy] = polar(sun.azim, sunR);
            sunCtx.fillStyle = 'rgba(255,220,80,0.12)';
            sunCtx.beginPath();
            sunCtx.arc(six, siy, 12, 0, Math.PI * 2);
            sunCtx.fill();
            sunCtx.strokeStyle = 'rgba(255,210,60,0.5)';
            sunCtx.lineWidth = 1.2;
            for (let r = 0; r < 8; r++) {
                const ra = r * Math.PI / 4;
                sunCtx.beginPath();
                sunCtx.moveTo(six + Math.cos(ra) * 7, siy + Math.sin(ra) * 7);
                sunCtx.lineTo(six + Math.cos(ra) * 11, siy + Math.sin(ra) * 11);
                sunCtx.stroke();
            }
            const grad = sunCtx.createRadialGradient(six - 1, siy - 1, 0, six, siy, 6);
            grad.addColorStop(0, '#fff8c0');
            grad.addColorStop(0.5, '#ffe066');
            grad.addColorStop(1, 'rgba(255,180,40,0.6)');
            sunCtx.fillStyle = grad;
            sunCtx.beginPath();
            sunCtx.arc(six, siy, 6, 0, Math.PI * 2);
            sunCtx.fill();
            sunCtx.restore();
        }

        sunCtx.restore();

        const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        const info = document.getElementById('sunInfo');
        if (info) info.textContent = `${timeStr}  \u00B7  sun ${sun.elev.toFixed(1)}\u00b0`;
    } catch(e) { console.error('drawSunView', e); drawFallback(); }
}

function updateSunView(date) {
    try {
        if (date) drawSunView(date);
    } catch(e) {
        console.error('sun widget error', e);
    }
}

function refreshSunView() {
    const st = getStartDateTime();
    if (st) updateSunView(new Date(st.getTime() + state.simElapsedSeconds * 1000));
}

function drawElevProfile() {
    const W = elevCanvas.width, H = elevCanvas.height;
    elevCtx.clearRect(0, 0, W, H);

    if (state.routeElevationData.length < 2) {
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

    const eles = state.routeElevationData.map(d => d.ele);
    const minEle = Math.min(...eles);
    const maxEle = Math.max(...eles);
    const eleRange = Math.max(maxEle - minEle, 10);
    const totalDist = state.routeElevationData[state.routeElevationData.length - 1].dist;

    elevCtx.fillStyle = '#0d1a2d';
    elevCtx.fillRect(0, 0, W, H);

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

    elevCtx.textAlign = 'center';
    elevCtx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
        const dist = totalDist * i / 4;
        const x = pad.left + plotW * i / 4;
        elevCtx.fillStyle = 'rgba(255,255,255,0.35)';
        elevCtx.fillText(formatDistance(dist), x, H - pad.bottom + 6);
    }

    const smoothed = [];
    const SMOOTH_KM = 0.015;
    let winStart = 0, winEnd = 0, winSum = 0;
    for (let i = 0; i < state.routeElevationData.length; i++) {
        const d = state.routeElevationData[i].dist;
        while (state.routeElevationData[winStart].dist < d - SMOOTH_KM) {
            winSum -= state.routeElevationData[winStart].ele;
            winStart++;
        }
        while (winEnd < state.routeElevationData.length && state.routeElevationData[winEnd].dist <= d + SMOOTH_KM) {
            winSum += state.routeElevationData[winEnd].ele;
            winEnd++;
        }
        smoothed.push({ dist: d, ele: winSum / (winEnd - winStart) });
    }

    const coords = [];
    for (let i = 0; i < smoothed.length; i++) {
        const x = pad.left + (smoothed[i].dist / totalDist) * plotW;
        const y = pad.top + plotH * (1 - (smoothed[i].ele - minEle) / eleRange);
        coords.push([x, y]);
    }

    elevCtx.strokeStyle = '#4a7cf7';
    elevCtx.lineWidth = 2;

    elevCtx.fillStyle = 'rgba(74,124,247,0.08)';
    elevCtx.beginPath();
    elevCtx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) elevCtx.lineTo(coords[i][0], coords[i][1]);
    const baseY = pad.top + plotH;
    elevCtx.lineTo(coords[coords.length - 1][0], baseY);
    elevCtx.lineTo(coords[0][0], baseY);
    elevCtx.closePath();
    elevCtx.fill();

    elevCtx.beginPath();
    elevCtx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) elevCtx.lineTo(coords[i][0], coords[i][1]);
    elevCtx.stroke();

    if (state.isPlaying && state.totalDistanceKm > 0) {
        const curDist = Math.min(state.traveledDistanceKm, totalDist);
        const curX = pad.left + (curDist / totalDist) * plotW;
        let curEle = smoothed[0].ele;
        for (let i = 1; i < smoothed.length; i++) {
            if (smoothed[i].dist >= curDist) {
                const t = (curDist - smoothed[i - 1].dist) / (smoothed[i].dist - smoothed[i - 1].dist);
                curEle = smoothed[i - 1].ele + (smoothed[i].ele - smoothed[i - 1].ele) * (t || 0);
                break;
            }
            curEle = smoothed[i].ele;
        }
        const curY = pad.top + plotH * (1 - (curEle - minEle) / eleRange);

        elevCtx.strokeStyle = 'rgba(255,255,255,0.15)';
        elevCtx.lineWidth = 1;
        elevCtx.setLineDash([3, 4]);
        elevCtx.beginPath();
        elevCtx.moveTo(curX, pad.top);
        elevCtx.lineTo(curX, pad.top + plotH);
        elevCtx.stroke();
        elevCtx.setLineDash([]);

        elevCtx.fillStyle = '#e74c3c';
        elevCtx.beginPath();
        elevCtx.arc(curX, curY, 4, 0, Math.PI * 2);
        elevCtx.fill();
        elevCtx.strokeStyle = '#fff';
        elevCtx.lineWidth = 1.5;
        elevCtx.stroke();
    }

    const curEle = state.isPlaying ? getElevation(state.traveledDistanceKm) : (state.routeElevationData[0] ? state.routeElevationData[0].ele : 0);
    document.getElementById('elevInfo').textContent = `${Math.round(curEle * elevConv)}${elevUnit}  \u00B7  max ${Math.round(maxEle * elevConv)}${elevUnit}  \u00B7  min ${Math.round(minEle * elevConv)}${elevUnit}`;
    const infoEl = document.getElementById('infoElevation');
    if (infoEl) infoEl.textContent = `${Math.round(curEle * elevConv)}${elevUnit}`;
}

export function initUI() {
    elSpeed.addEventListener('input', () => {
        const val = parseFloat(elSpeed.value) || 0;
        state._speedKmh = speedUnit() === 'mph' ? val / 0.621371 : val;
        updateStartButton();
        if (!state.isPlaying) saveSettings();
    });

    elSpeedUnit.addEventListener('change', () => {
        const isMph = speedUnit() === 'mph';
        elSpeed.value = isMph ? (state._speedKmh * 0.621371).toFixed(1) : state._speedKmh.toFixed(1);

        const sv = document.getElementById('speedValue');
        const svVal = parseFloat(sv.value);
        if (svVal) sv.value = isMph ? (svVal * 0.621371).toFixed(1) : (svVal / 0.621371).toFixed(1);

        infoCurrentSpeed.textContent = formatSpeed(getSpeedKmh());
        updateStartButton();
        updateInfo();
        renderSpeedPoints();
        drawElevProfile();
        saveSettings();
    });

    btnClear.addEventListener('click', () => {
        stopAnimation();
        state.waypoints.length = 0;
        state.scheduledStops.length = 0;
        state.speedPoints.length = 0;
        state.customPoints.length = 0;
        state.routeElevationData.length = 0;
        state.elevationHistory.length = 0;
        state.traveledDistanceKm = 0;
        state.simElapsedSeconds = 0;
        state._lastRecordedMinute = -1;
        renderScheduledStops();
        renderSpeedPoints();
        renderCustomPoints();
        redrawPath();
        updateInfo();
        updateStartButton();
        infoTimer.textContent = '00:00:00';
        infoCurrentTime.textContent = '—';
        infoCurrentSpeed.textContent = '—';
        drawElevProfile();
        document.getElementById('infoElevation').textContent = '—';
        setStatus('Route cleared. Click the map to start a new one', '');
    });

    btnUndo.addEventListener('click', () => {
        if (state.waypoints.length === 0) return;
        state.waypoints.pop();
        if (state.waypoints.length < 2 && state.polyline) {
            map.removeLayer(state.polyline);
            state.polyline = null;
            state.scheduledStops.length = 0;
            state.speedPoints.length = 0;
            renderScheduledStops();
            renderSpeedPoints();
        }
        redrawPath();
        updateInfo();
        updateStartButton();
        setStatus(state.waypoints.length ? 'Last point removed' : 'All points removed', '');
        if (state.waypoints.length < 2) {
            state.routeElevationData.length = 0;
        } else {
            const totalDist = pathLength(state.waypoints);
            state.routeElevationData = state.routeElevationData.filter(d => d.dist <= totalDist + 0.0001);
            const removedStops = state.scheduledStops.filter(s => s.routeDist > totalDist + 0.0001);
            const removedSpeeds = state.speedPoints.filter(s => s.routeDist > totalDist + 0.0001);
            if (removedStops.length || removedSpeeds.length) {
                state.scheduledStops = state.scheduledStops.filter(s => s.routeDist <= totalDist + 0.0001);
                state.speedPoints = state.speedPoints.filter(s => s.routeDist <= totalDist + 0.0001);
                renderScheduledStops();
                renderSpeedPoints();
                setStatus(`Last point removed. Also removed ${removedStops.length + removedSpeeds.length} speed/stop point(s) past the route end`, '');
            }
        }
        drawElevProfile();
    });

    btnFit.addEventListener('click', () => {
        if (state.map3d) {
            if (state.waypoints.length >= 2) {
                const lngs = state.waypoints.map(p => p.lng);
                const lats = state.waypoints.map(p => p.lat);
                state.map3d.fitBounds(
                    [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                    { padding: 50, maxZoom: 18 }
                );
            } else {
                state.map3d.flyTo({ center: [state.CENTER[1], state.CENTER[0]], zoom: state.ZOOM });
            }
        } else {
            if (state.waypoints.length >= 2) {
                map.fitBounds(L.latLngBounds(state.waypoints), { padding: [50, 50] });
            } else {
                map.setView(state.CENTER, state.ZOOM);
            }
        }
    });

    chkFollow.addEventListener('change', () => {
        state.followMode = chkFollow.checked;
        setStatus(state.followMode ? 'Follow mode on' : 'Follow mode off', '');
        saveSettings();
    });

    chkLabels.addEventListener('change', () => {
        renderScheduledStops();
        renderSpeedPoints();
        renderCustomPoints();
        render112Points();
        saveSettings();
    });

    chkPoi.addEventListener('change', () => {
        chkPoiLabels.disabled = !chkPoi.checked;
        if (chkPoi.checked) {
            poiIcons.addTo(map);
            if (chkPoiLabels.checked) {
                poiLabels.addTo(map);
            }
        } else {
            map.removeLayer(poiIcons);
            map.removeLayer(poiLabels);
        }
        updateMap3dPoiVisibility();
        saveSettings();
    });

    chkPoiLabels.addEventListener('change', () => {
        if (chkPoiLabels.checked) {
            poiLabels.addTo(map);
        } else {
            map.removeLayer(poiLabels);
        }
        updateMap3dPoiVisibility();
        saveSettings();
    });

    chkTerrain.addEventListener('change', saveSettings);

    chk112.addEventListener('change', saveSettings);

    chkDrain.addEventListener('change', () => {
        setDrainVisibility(chkDrain.checked && !state.isPlaying);
        updateBatteryDrain();
        syncMap3dDrain();
        saveSettings();
    });

    document.getElementById('stopDuration').addEventListener('input', function () {
        maskDurationInput(this);
    });

    elTimeScaleLabel.textContent = elTimeScale.value;
    elTimeScale.addEventListener('input', () => {
        elTimeScaleLabel.textContent = elTimeScale.value;
        saveSettings();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
            btn.classList.add('active');
            document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).style.display = 'flex';
            btn3D.style.display = '';
            if (btn.dataset.tab === 'route' && state.isPlaying) {
                setStatus('Stop the simulation to edit the route', 'warning');
            }
        });
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
            });
            btn.classList.add('active');
            btn.style.background = 'rgba(74,124,247,.2)';
            state.isAddingStops = btn.dataset.mode === 'stop';
            state.isAddingSpeedPoints = btn.dataset.mode === 'speed';
            state.isAddingCustomPoints = btn.dataset.mode === 'custom';
            document.getElementById('stopInputs').style.display = btn.dataset.mode === 'stop' ? 'block' : 'none';
            document.getElementById('speedInputs').style.display = btn.dataset.mode === 'speed' ? 'block' : 'none';
            document.getElementById('customInputs').style.display = btn.dataset.mode === 'custom' ? 'block' : 'none';
            const msgs = { waypoint: 'Click to add waypoints', stop: 'Click on route to place a stop', speed: 'Click on route to place a speed point', custom: 'Click on the map to place a custom point' };
            setStatus(msgs[btn.dataset.mode], '');
        });
    });

    setStatus('Click the map to start building a route');
    updateStartButton();

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

    elStartTime.addEventListener('input', () => {
        refreshSunView();
        saveSettings();
    });

    document.getElementById('sunViewToggle').addEventListener('click', function () {
        const container = document.querySelector('.sun-controls');
        container.classList.toggle('collapsed');
        this.textContent = container.classList.contains('collapsed') ? '\u25B2' : '\u25BC';
        saveSettings();
    });

    document.getElementById('elevViewToggle').addEventListener('click', function () {
        const container = document.querySelector('.elev-controls');
        container.classList.toggle('collapsed');
        this.textContent = container.classList.contains('collapsed') ? '\u25B2' : '\u25BC';
        saveSettings();
    });

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

    drawElevProfile();
    refreshSunView();
}

export { saveSettings, drawElevProfile, refreshSunView, updateStartButton };
