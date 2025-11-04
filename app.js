import { PLYViewer } from './js/PLYViewer.js';

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.plyViewer = new PLYViewer();
        console.log('PLY Viewer初期化完了');
    } catch (error) {
        console.error('PLY Viewer初期化エラー:', error);
    }
});
