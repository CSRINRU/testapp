import { store } from './store.js';
import { PreprocessingUI } from './preprocessing_ui.js';
import { GeminiPreviewUI } from './gemini_preview_ui.js';
import { geminiService } from './gemini.js';
import { CATEGORY_IDS, defaultOCRParams } from './constants.js';
import { DebugUI } from './debug_ui.js';

// Workerの初期化
const worker = new Worker('js/ocr_worker.js');

// メッセージID管理
let messageIdCounter = 0;
const pendingPromises = new Map();

// Workerからのメッセージハンドラ
worker.onmessage = (e) => {
    const { type, payload, error, messageId } = e.data;

    if (pendingPromises.has(messageId)) {
        const { resolve, reject } = pendingPromises.get(messageId);
        pendingPromises.delete(messageId);

        if (type === 'ERROR') {
            reject(new Error(error));
        } else {
            resolve(payload);
        }
    } else {
        // console.warn('Received message for unknown ID:', messageId, e.data);
    }
};

worker.onerror = (err) => {
    console.error('Worker Error:', err);
};

// Workerへのリクエスト送信ヘルパー
function postWorkerMessage(type, payload, transferList = []) {
    return new Promise((resolve, reject) => {
        const messageId = messageIdCounter++;
        pendingPromises.set(messageId, { resolve, reject });
        worker.postMessage({ type, payload, messageId }, transferList);
    });
}

// 初期化フラグ
let isWorkerInitialized = false;



/**
 * OCRエンジンの初期化 (必要に応じて呼び出される)
 */
async function initOCR() {
    if (isWorkerInitialized) return;

    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = '初期化中...';

    await postWorkerMessage('INIT', {});
    isWorkerInitialized = true;
}

/**
 * プレビュー用画像前処理
 * @param {string} imageData Base64
 * @param {Object} params 
 * @returns {Promise<ImageBitmap>}
 */
export async function getPreprocessedPreview(imageData, params) {
    if (!isWorkerInitialized) await initOCR();
    // 効率化のためBase64を直接Workerへ送信
    return await postWorkerMessage('PREPROCESS', { image: imageData, params });
}

/**
 * OCR処理関数
 * @param {string} imageData 
 * @param {Object} params (Optional)
 * @returns {Promise<string>} 認識されたテキスト
 */
export async function processOCR(imageData, params = null) {
    try {
        const progressText = document.getElementById('progressText');
        const progressFill = document.getElementById('progressFill');

        if (progressText) progressText.textContent = 'モデルをロード中...';

        // 初期化
        await initOCR();

        if (progressText) progressText.textContent = '文字認識中...';
        if (progressFill) progressFill.style.width = '50%';

        // 実行
        // 実行
        const result = await postWorkerMessage('RECOGNIZE', { image: imageData, params });

        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = '完了';

        return result;
    } catch (error) {
        console.error('OCR処理中にエラーが発生しました:', error);
        throw error;
    }
}

/**
 * 画像処理フロー (UI連携)
 * @param {string} imageData 
 * @param {Function} showReceiptModal 
 */
export async function processImage(imageData, showReceiptModal) {
    store.setCurrentImageData(imageData);

    // カメラコンテナを表示し、開始画面を隠す
    const container = document.getElementById('camera-container');
    const startScreen = document.getElementById('camera-start-screen');
    if (container) container.classList.remove('hidden-camera');
    if (startScreen) startScreen.classList.add('hidden');

    // プレビュー表示
    const preview = document.getElementById('selectedImagePreview');
    const video = document.getElementById('cameraPreview');
    const overlay = document.getElementById('cameraOverlay');

    if (preview) {
        preview.src = imageData;
        preview.classList.remove('hidden');
    }
    if (video) video.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');

    const processingSection = document.getElementById('processingSection');
    if (processingSection) processingSection.classList.add('hidden');

    // 前処理UIセットアップ
    // 解析用パラメータの保持
    let currentParams = { ...defaultOCRParams };

    // OCRモードに基づいて分岐
    const ocrMethod = store.state.currentOcrMethod;

    if (ocrMethod === 'gemini') {
        GeminiPreviewUI.show(
            imageData,
            // Send Callback
            async (resizedImageData) => {
                const loadingSection = document.getElementById('processingSection');
                const progressText = document.getElementById('progressText');
                const progressFill = document.getElementById('progressFill');

                if (loadingSection) loadingSection.classList.remove('hidden');
                if (progressText) progressText.textContent = 'Gemini AIで解析中...';
                if (progressFill) progressFill.style.width = '50%';

                try {
                    // Gemini API呼び出し
                    const receiptData = await geminiService.structureReceiptFromImage(resizedImageData);

                    if (loadingSection) loadingSection.classList.add('hidden');

                    // 結果確認・編集モーダルを表示
                    showReceiptModal(receiptData);
                } catch (error) {
                    console.error('Gemini Analysis Failed:', error);
                    alert('Gemini解析エラー: ' + error.message);
                    if (loadingSection) loadingSection.classList.add('hidden');
                    resetView();
                }
            },
            // Cancel Callback
            () => {
                resetView();
            }
        );
        return;
    }

    // Local OCR Flow
    PreprocessingUI.show(
        imageData,
        // Analyze Callback
        async (finalParams) => {
            if (finalParams) currentParams = finalParams;

            // processingSectionを表示する前に、カメラコンテナを隠す
            // (PreprocessingUI.hide()がカメラを表示状態に戻してしまうため)
            const container = document.getElementById('camera-container');
            if (container) {
                container.classList.add('hidden-camera');
                container.classList.add('hidden'); // 両方つけておく
            }

            if (processingSection) processingSection.classList.remove('hidden');


            // Local OCRモード (既存フロー)
            try {
                // OCR処理
                const ocrResult = await processOCR(imageData, currentParams);

                console.group('OCR認識結果詳細');
                console.log('全体テキスト:', ocrResult.text);
                console.log('抽出ブロック数:', ocrResult.blocks ? ocrResult.blocks.length : 0);
                if (ocrResult.blocks && ocrResult.blocks.length > 0) {
                    console.table(ocrResult.blocks.map(b => {
                        let dimStr = '';
                        if (Array.isArray(b.box)) {
                            // 中心点または始点を表示
                            dimStr = `(${b.box[0].x},${b.box[0].y})...`;
                        } else {
                            dimStr = `${b.box.x},${b.box.y},${b.box.w},${b.box.h}`;
                        }
                        return { // テーブル表示用オブジェクト
                            text: b.text,
                            score: (b.score * 100).toFixed(1) + '%',
                            box: dimStr
                        };
                    }));
                } else {
                    console.log('抽出されたブロックはありません');
                }
                console.groupEnd();

                // Debug UIを表示
                DebugUI.show(imageData, ocrResult, async () => {
                    // 処理継続
                    await processGemini(ocrResult.text, imageData, progressText, showReceiptModal, processingSection);
                });

            } catch (error) {
                alert('レシートの解析に失敗しました。\n' + error.message);
                if (processingSection) processingSection.classList.add('hidden');
                // ビューのリセット
                resetView();
            }
        },
        // キャンセル時のコールバック
        () => {
            resetView();
        },
        // 現在のパラメータ
        null
    );
}

function resetView() {
    const preview = document.getElementById('selectedImagePreview');
    const video = document.getElementById('cameraPreview');
    const overlay = document.getElementById('cameraOverlay');
    const prepSection = document.getElementById('preprocessing-section');
    const geminiSection = document.getElementById('gemini-preview-section'); // 追加
    const container = document.getElementById('camera-container');

    if (prepSection) prepSection.classList.add('hidden');
    if (geminiSection) geminiSection.classList.add('hidden'); // 追加
    if (preview) preview.classList.add('hidden');
    // if (video) video.classList.remove('hidden'); // default hidden
    // if (overlay) overlay.classList.remove('hidden'); // default hidden

    // カメラコンテナを隠し、スタート画面を表示する
    if (container) {
        container.classList.add('hidden');
        container.classList.add('hidden-camera');
    }
    const startScreen = document.getElementById('camera-start-screen');
    if (startScreen) startScreen.classList.remove('hidden');

    // イベント発火: UI側でカメラ停止などを行う
    window.dispatchEvent(new CustomEvent('ocr-reset'));
}

async function processGemini(text, imageData, progressText, showReceiptModal, processingSection) {
    try {
        let receiptData;
        if (geminiService.hasApiKey()) {
            try {
                if (progressText) progressText.textContent = 'AIで構造化中...';
                receiptData = await geminiService.structureReceipt(text);
            } catch (e) {
                console.error('Gemini processing failed', e);
                alert('Geminiでの解析に失敗しました。簡易解析を行います。\n' + e.message);
                receiptData = extractReceiptData(text);
            }
        } else {
            alert('Gemini APIキーが設定されていません。簡易解析を行います。');
            receiptData = extractReceiptData(text);
        }

        if (receiptData.items && receiptData.items.length > 0) {
            if (progressText) progressText.textContent = 'データ整理中...';
            for (let i = 0; i < receiptData.items.length; i++) {
                let item = receiptData.items[i];
                if (typeof item === 'string') {
                    item = { name: item, count: 1, amount: 0 };
                    receiptData.items[i] = item;
                }
                if (!item.major_category) item.major_category = CATEGORY_IDS.OTHER;
                if (!item.minor_category) item.minor_category = 'ー';
            }
        }

        receiptData.image = imageData;

        if (typeof showReceiptModal === 'function') {
            showReceiptModal(receiptData);
        }
    } catch (error) {
        throw error;
    } finally {
        if (processingSection) processingSection.classList.add('hidden');
        // モーダル表示のため自動リセットは遅延実行
        setTimeout(resetView, 1000);
    }
}

/**
 * OCR結果からレシートデータを抽出 (簡易版)
 */
export function extractReceiptData(text) {
    const receipt = {
        date: new Date().toISOString().split('T')[0],
        store: '',
        total: 0,
        items: [],
        memo: ''
    };
    const lines = text.split('\n').filter(line => line.trim() !== '');

    // 日付 (YYYY/MM/DD)
    const dateRegex = /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/;
    for (const line of lines) {
        const match = line.match(dateRegex);
        if (match) {
            receipt.date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
            break;
        }
    }

    // 合計
    const totalRegex = /(合計|税込|総額|計)[^\d]*[￥¥]?[\s]*([\d,]+)/;
    for (const line of lines) {
        const match = line.match(totalRegex);
        if (match) {
            receipt.total = parseInt(match[2].replace(/,/g, '')) || 0;
            break;
        }
    }
    if (receipt.total === 0) {
        let max = 0;
        const amountRegex = /[￥¥]?[\s]*([\d,]+)/g;
        for (const line of lines) {
            let match;
            while ((match = amountRegex.exec(line)) !== null) {
                const val = parseInt(match[1].replace(/,/g, '')) || 0;
                if (val > max && val < 500000) max = val;
            }
        }
        receipt.total = max;
    }

    // 店舗 (簡易)
    for (let i = 0; i < Math.min(3, lines.length); i++) {
        const line = lines[i].trim();
        if (!line.match(dateRegex) && !line.match(/[￥¥][\d,]+/)) {
            receipt.store = line.substring(0, 50);
            break;
        }
    }

    // Items (簡易)
    const itemRegex = /^[^￥¥\d]*[^\d]{2,}/;
    for (const line of lines) {
        const cl = line.trim();
        if (!cl.match(dateRegex) && !cl.match(totalRegex) && cl !== receipt.store && cl.match(itemRegex) && cl.length > 1) {
            receipt.items.push(cl.substring(0, 100));
        }
    }
    if (receipt.items.length === 0) receipt.items = ['商品1', '商品2'];

    return receipt;
}
