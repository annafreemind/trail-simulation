export const elStartTime = document.getElementById('startTime');
export const elSpeed = document.getElementById('speed');
export const elSpeedUnit = document.getElementById('speedUnit');
export const elTimeScale = document.getElementById('timeScale');
export const elTimeScaleLabel = document.getElementById('timeScaleLabel');
export const btnStart = document.getElementById('btnStart');
export const btnPause = document.getElementById('btnPause');
export const btnStop = document.getElementById('btnStop');
export const btnClear = document.getElementById('btnClear');
export const btnFit = document.getElementById('btnFit');
export const btnUndo = document.getElementById('btnUndo');
export const statusBar = document.getElementById('status-bar');
export const infoPoints = document.getElementById('infoPoints');
export const infoDistance = document.getElementById('infoDistance');
export const infoTimer = document.getElementById('infoTimer');
export const infoCurrentTime = document.getElementById('infoCurrentTime');
export const infoCurrentSpeed = document.getElementById('infoCurrentSpeed');
export const chkFollow = document.getElementById('chkFollow');
export const chkLabels = document.getElementById('chkLabels');
export const chkPoi = document.getElementById('chkPoi');
export const chkPoiLabels = document.getElementById('chkPoiLabels');
export const chkUphill = document.getElementById('chkUphill');
export const chk112 = document.getElementById('chk112');
export const chkDrain = document.getElementById('chkDrain');
export const btn3D = document.getElementById('btn3D');

export const sunCanvas = document.getElementById('sunView');
export const sunCtx = sunCanvas.getContext('2d');
export const elevCanvas = document.getElementById('elevView');
export const elevCtx = elevCanvas.getContext('2d');

export const routePointList = document.getElementById('routePointList');
export const combinedNavList = document.getElementById('combinedNavList');

export const drainCustomFields = document.getElementById('drainCustomFields');
export const drainTimeLabel = document.getElementById('drainTimeLabel');

export const mapEl = document.getElementById('map');
export const map3dEl = document.getElementById('map3d');

export const _drainEls = {
    startH: [14, 16, 'drainStartHVal'],
    startM: [0, 59, 'drainStartMVal'],
    endH: [14, 16, 'drainEndHVal'],
    endM: [0, 59, 'drainEndMVal'],
};
