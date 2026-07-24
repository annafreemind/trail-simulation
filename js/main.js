import { initMap, setStatus, setMapSaveSettingsRef, osmLayer, topoLayer, satelliteLayer, wayback2014Layer, poiIcons, poiLabels, map } from './map.js';
import { setMap3dMapRef, setMap3dLayerRefs, setSaveSettingsRef as setMap3dSaveRef, toggleMap3D } from './map3d.js';
import { state } from './state.js';
import { chkLabels, chkPoi, chkPoiLabels, btnStart, btnPause, btnStop, btn3D, elSpeed, elSpeedUnit, infoCurrentSpeed } from './dom.js';
import { initDrain, setDrainMap, setSaveSettingsRef as setDrainSaveRef, setDrainVisibility } from './drain.js';
import { setAnimMap, startAnimation, stopAnimation, animationLoop, getStartDateTime, updateCurrentTime, updateStartTime, setUpdateStartButton, setDrawElevProfile, setDrawSunView } from './animation.js';
import { initUI, saveSettings, updateStartButton, drawElevProfile, refreshSunView } from './ui.js';
import { initStorage } from './storage.js';
import { setPointsMap, initPoints } from './points.js';
import { formatSpeed, getSpeedKmh } from './helpers.js';
import { setDroneMap, fetchDroneData, loadDroneRoutes, syncMap3dDrone } from './drone-routes.js';

setMap3dMapRef(map);
setMap3dLayerRefs({ osmLayer, topoLayer, satelliteLayer, wayback2014Layer, currentLayer: state.currentLayer });
setMap3dSaveRef(saveSettings);
setDrainMap(map);
setDrainSaveRef(saveSettings);
setMapSaveSettingsRef(saveSettings);
setAnimMap(map);
setUpdateStartButton(updateStartButton);
setDrawElevProfile(drawElevProfile);
setDrawSunView(refreshSunView);

initMap();

setPointsMap(map);
initPoints();

initUI();
initDrain();
initStorage();

if (localStorage.getItem('trail_3d_active') === 'true') {
    btn3D.classList.add('active');
    toggleMap3D();
}

setDroneMap(map);
fetchDroneData().then(() => {
    if (document.getElementById('chkDrone').checked) {
        loadDroneRoutes();
        syncMap3dDrone();
    }
});

btnStart.addEventListener('click', startAnimation);

btnPause.addEventListener('click', () => {
    if (!state.isPlaying) return;
    if (!state.isPaused) {
        state.isPaused = true;
        btnPause.textContent = 'Resume';
        setStatus('Paused', '');
        setDrainVisibility(false);
    } else {
        state.isPaused = false;
        btnPause.textContent = 'Pause';
        setDrainVisibility(false);
        state.lastFrameTimestamp = performance.now();
        infoCurrentSpeed.textContent = formatSpeed(getSpeedKmh());
        setStatus('Movement resumed', 'active');
        state.animationId = requestAnimationFrame(animationLoop);
    }
});

btnStop.addEventListener('click', () => {
    stopAnimation();
    setStatus('Movement stopped', '');
});

setStatus('Click the map to start building a route');
