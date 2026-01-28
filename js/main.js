import { AppState } from './state.js';
import { initDatabase, loadReceipts } from './db.js';
import { setupCamera } from './camera.js';

import { updateAnalysis } from './analysis.js';
import { setupTabNavigation, setupEventListeners, updateReceiptList, updateDataCount, showReceiptModal } from './ui.js';

// DebugUIからアクセスできるようにグローバル公開
window.showReceiptModal = showReceiptModal;

// 初期化関数
document.addEventListener('DOMContentLoaded', async () => {
    // タブ切り替えの設定
    setupTabNavigation();

    // データベースの初期化とデータ読み込み
    await initDatabase();

    // データの読み込み
    await loadReceipts(updateReceiptList, updateDataCount);

    // カメラ機能の設定
    setupCamera();

    // イベントリスナーの設定
    setupEventListeners();

    // 初期分析データの更新
    updateAnalysis();
});

// アプリ終了時のカメラストリーム停止
window.addEventListener('beforeunload', () => {
    if (AppState.cameraStream) {
        AppState.cameraStream.getTracks().forEach(track => track.stop());
    }
});
