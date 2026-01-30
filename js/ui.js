import { store } from './store.js';
import { formatDate } from './utils.js';
import { saveToIndexedDB, saveReceipt, deleteReceipt, clearAllReceipts, loadReceipts } from './db.js';
import { setupCamera, capturePhoto, handleImageUpload, updateModalImage, stopCamera } from './camera.js';
import { updateAnalysis } from './analysis.js';
import { geminiService } from './gemini.js';
import { MAJOR_CATEGORIES, MINOR_CATEGORY_DISPLAY_NAMES, CATEGORY_IDS, MAJOR_CATEGORY_DISPLAY_NAMES } from './constants.js';

// 確認モーダル用コールバック
let confirmCallback = null;

/**
 * レシートデータを再読み込みしてストアとUIを更新
 */
async function reloadReceipts() {
    try {
        const receipts = await loadReceipts();
        store.setReceipts(receipts);
        updateReceiptList();
        updateDataCount();
        updateAnalysis();
    } catch (error) {
        console.error('Failed to reload receipts:', error);
    }
}

/**
 * タブ切り替えの設定
 */
export function setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

/**
 * タブ切り替え関数
 * @param {string} tabId 
 */
export function switchTab(tabId) {
    // 現在のタブを非表示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // 現在のタブボタンを非アクティブ化
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // 新しいタブを表示
    const tabContent = document.getElementById(`${tabId}-tab`);
    if (tabContent) tabContent.classList.add('active');

    // 新しいタブボタンをアクティブ化
    const tabBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');

    // タブ固有の初期化
    if (tabId === 'camera') {
        // setupCamera(); // 自動起動しないで待機画面を表示
        // カメラコンテナを非表示、開始画面を表示
        const container = document.getElementById('camera-container');
        const startScreen = document.getElementById('camera-start-screen');
        if (container) container.classList.add('hidden-camera');
        if (startScreen) startScreen.classList.remove('hidden');

        // 他のUI要素をリセット
        const prepSection = document.getElementById('preprocessing-section');
        if (prepSection) prepSection.classList.add('hidden');

        const debugSection = document.getElementById('debug-ui-section');
        if (debugSection) debugSection.classList.add('hidden');

        const processingSection = document.getElementById('processingSection');
        if (processingSection) processingSection.classList.add('hidden');

        // Gemini Preview UIを隠す (追加)
        const geminiPreviewSection = document.getElementById('gemini-preview-section');
        if (geminiPreviewSection) geminiPreviewSection.classList.add('hidden');

        // ビデオ要素の表示を確実に復帰
        const video = document.getElementById('cameraPreview');
        if (video) video.classList.remove('hidden');

        stopCamera(); // 念のため停止
    } else if (tabId === 'analysis') {
        updateAnalysis();
    } else {
        // 他のタブに移動したらカメラ停止
        stopCamera();
    }

    store.setCurrentTab(tabId);
}

/**
 * イベントリスナーの設定
 */
/**
 * OCRメソッド選択の初期化
 */
function initOcrMethodSelection() {
    const methodLocal = document.getElementById('method-local');
    const methodGemini = document.getElementById('method-gemini');
    const geminiWarning = document.getElementById('gemini-warning');

    const updateStore = () => {
        if (methodLocal && methodLocal.checked) {
            store.setOcrMethod('local');
            if (geminiWarning) geminiWarning.classList.add('hidden');
        }
        if (methodGemini && methodGemini.checked) {
            store.setOcrMethod('gemini');
            const hasKey = geminiService.hasApiKey();
            if (!hasKey && geminiWarning) geminiWarning.classList.remove('hidden');
            else if (geminiWarning) geminiWarning.classList.add('hidden');
        }
    };

    if (methodLocal) methodLocal.addEventListener('change', updateStore);
    if (methodGemini) methodGemini.addEventListener('change', updateStore);

    // 初期状態の反映 (Storeのデフォルト値)
    if (store.state.currentOcrMethod === 'gemini' && methodGemini) {
        methodGemini.checked = true;
    } else if (methodLocal) {
        methodLocal.checked = true;
    }
    updateStore();
}

export function setupEventListeners() {
    initOcrMethodSelection();
    // カメラ撮影ボタン
    const captureBtn = document.getElementById('captureBtn');
    if (captureBtn) captureBtn.addEventListener('click', () => capturePhoto(showReceiptModal));

    // カメラ切り替えボタン
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    if (switchCameraBtn) {
        switchCameraBtn.addEventListener('click', () => {
            const current = store.state.currentCamera;
            store.setCurrentCamera(current === 'environment' ? 'user' : 'environment');
            setupCamera();
        });
    }

    // 画像アップロード

    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => handleImageUpload(e, showReceiptModal));
    }

    // モーダル内の画像変更ボタン
    const changeImageBtn = document.getElementById('changeImageBtn');
    if (changeImageBtn) {
        changeImageBtn.addEventListener('click', () => {
            store.setIsChangingModalImage(true);
        });
    }

    const removeImageBtn = document.getElementById('removeImageBtn');
    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', () => {
            updateModalImage(null);
        });
    }

    // フィルター適用
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    if (applyFilterBtn) applyFilterBtn.addEventListener('click', updateReceiptList);

    const filterPeriod = document.getElementById('filterPeriod');
    if (filterPeriod) filterPeriod.addEventListener('change', handlePeriodChange);

    const sortOrder = document.getElementById('sortOrder');
    if (sortOrder) sortOrder.addEventListener('change', updateReceiptList);

    // 分析期間変更
    const analysisPeriod = document.getElementById('analysisPeriod');
    if (analysisPeriod) analysisPeriod.addEventListener('change', updateAnalysis);

    const analysisCategory = document.getElementById('analysisCategory');
    if (analysisCategory) analysisCategory.addEventListener('change', updateAnalysis);

    // データ管理
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) exportDataBtn.addEventListener('click', exportData);

    // データをインポート

    const importFileInput = document.getElementById('importFileInput');
    if (importFileInput) importFileInput.addEventListener('change', importData);

    const clearDataBtn = document.getElementById('clearDataBtn');
    if (clearDataBtn) clearDataBtn.addEventListener('click', confirmClearData);

    // モーダル関連
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.classList.add('hidden');
            });
        });
    });

    // レシート編集保存
    const saveReceiptBtn = document.getElementById('saveReceiptBtn');
    if (saveReceiptBtn) saveReceiptBtn.addEventListener('click', saveEditedReceipt);

    // レシート削除
    const deleteReceiptBtn = document.getElementById('deleteReceiptBtn');
    if (deleteReceiptBtn) deleteReceiptBtn.addEventListener('click', confirmDeleteReceipt);

    // 確認モーダル
    const confirmCancel = document.getElementById('confirmCancel');
    if (confirmCancel) {
        confirmCancel.addEventListener('click', () => {
            document.getElementById('confirmModal').classList.add('hidden');
        });
    }

    const confirmOk = document.getElementById('confirmOk');
    if (confirmOk) {
        confirmOk.addEventListener('click', () => {
            document.getElementById('confirmModal').classList.add('hidden');
            if (confirmCallback) {
                confirmCallback();
                confirmCallback = null;
            }
        });
    }

    // API Key設定
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', saveApiKey);
        // 初期表示時に現在のキーを表示（セキュリティのため伏せ字にするか、あるいは表示しないか。ここではプレースホルダーだけ変更）
        const input = document.getElementById('geminiApiKey');
        if (input && geminiService.hasApiKey()) {
            input.placeholder = '設定済み (変更する場合のみ入力)';
        }
    }

    // 合計金額変更時の集計更新
    const editTotal = document.getElementById('editTotal');
    if (editTotal) {
        editTotal.addEventListener('input', updateItemsSummary);
    }

    // アイテム追加ボタン (モーダル内)
    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            const container = document.getElementById('editItemsContainer');
            if (container) {
                // createItemRowはモジュールスコープで利用可能
                container.appendChild(createItemRow());
            }
        });
    }
    // カメラ開始ボタン (新設)
    const startCaptureBtn = document.getElementById('startCaptureBtn');
    if (startCaptureBtn) {
        startCaptureBtn.addEventListener('click', () => {
            const container = document.getElementById('camera-container');
            const startScreen = document.getElementById('camera-start-screen');

            if (container) container.classList.remove('hidden-camera');
            if (startScreen) startScreen.classList.add('hidden');

            setupCamera();
        });
    }

    // カメラ閉じるボタン (新設)
    const closeCameraBtn = document.getElementById('closeCameraBtn');
    if (closeCameraBtn) {
        closeCameraBtn.addEventListener('click', () => {
            const container = document.getElementById('camera-container');
            const startScreen = document.getElementById('camera-start-screen');

            if (container) container.classList.add('hidden-camera');
            if (startScreen) startScreen.classList.remove('hidden');

            stopCamera();
        });
    }

    // 開始画面のファイル選択 (新設)
    const fileInputStart = document.getElementById('fileInputStart');
    if (fileInputStart) {
        fileInputStart.addEventListener('change', (e) => handleImageUpload(e, showReceiptModal));
    }
}

/**
 * APIキーを保存
 */
function saveApiKey() {
    const input = document.getElementById('geminiApiKey');
    const status = document.getElementById('apiKeyStatus');
    const key = input.value.trim();

    if (!key) {
        if (status) {
            status.textContent = 'APIキーを入力してください';
            status.style.color = 'red';
        }
        return;
    }

    geminiService.setApiKey(key);
    input.value = '';
    input.placeholder = '設定済み (変更する場合のみ入力)';

    if (status) {
        status.textContent = 'APIキーを保存しました';
        status.style.color = 'green';
        setTimeout(() => { status.textContent = ''; }, 3000);
    }
}

/**
 * レシート一覧の更新
 */
export function updateReceiptList() {
    const container = document.getElementById('receiptList');
    if (!container) return;

    const periodFilterEl = document.getElementById('filterPeriod');
    const categoryFilterEl = document.getElementById('filterCategory');
    const periodFilter = periodFilterEl ? periodFilterEl.value : 'all';
    const categoryFilter = categoryFilterEl ? categoryFilterEl.value : 'all';

    // フィルター適用
    let filteredReceipts = [...store.state.receipts];

    // 期間フィルター
    if (periodFilter !== 'all') {
        const now = new Date();
        let startDate;

        switch (periodFilter) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                break;
            case '3months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
                break;
            case 'custom':
                const start = document.getElementById('startDate').value;
                const end = document.getElementById('endDate').value;
                if (start && end) {
                    filteredReceipts = filteredReceipts.filter(receipt => {
                        return receipt.date >= start && receipt.date <= end;
                    });
                }
                break;
        }

        if (periodFilter !== 'custom' && startDate) {
            filteredReceipts = filteredReceipts.filter(receipt => {
                return new Date(receipt.date) >= startDate;
            });
        }
    }

    // カテゴリフィルター
    if (categoryFilter !== 'all') {
        filteredReceipts = filteredReceipts.filter(receipt => {
            // 新しい2階層構造: items内のmajor_categoryに一致するものがあるか
            if (receipt.items && Array.isArray(receipt.items)) {
                return receipt.items.some(item => (item.major_category) === categoryFilter);
            }
            return false;
        });
    }

    // ソート
    const sortOrderEl = document.getElementById('sortOrder');
    const sortOrder = sortOrderEl ? sortOrderEl.value : 'dateDesc';

    filteredReceipts.sort((a, b) => {
        switch (sortOrder) {
            case 'dateDesc':
                return new Date(b.date) - new Date(a.date);
            case 'dateAsc':
                return new Date(a.date) - new Date(b.date);
            case 'amountDesc':
                return b.total - a.total;
            case 'amountAsc':
                return a.total - b.total;
            default:
                return new Date(b.date) - new Date(a.date);
        }
    });

    // レシート一覧を表示
    if (filteredReceipts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-receipt fa-3x"></i>
                <p>該当するレシートがありません</p>
                <p>フィルターを変更するか、レシートを追加してください</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    filteredReceipts.forEach(receipt => {
        const item = document.createElement('div');
        item.className = 'receipt-item';
        item.innerHTML = `
            <div class="receipt-header">
                <div class="receipt-store">${receipt.store || '未設定'}</div>
                <div class="receipt-date">${formatDate(receipt.date)}</div>
            </div>
            ${receipt.image ? `<img src="${receipt.image}" class="receipt-image-thumbnail" data-id="${receipt.id}">` : ''}
            <div class="receipt-total">¥${receipt.total.toLocaleString()}</div>
            <div class="receipt-items">${Array.isArray(receipt.items)
                ? receipt.items.slice(0, 3).map(item => {
                    // itemがオブジェクトの場合はnameを表示、文字列の場合はそのまま表示
                    const name = typeof item === 'object' && item.name ? item.name : item;
                    return `<div>・${name}</div>`;
                }).join('')
                : ''
            }</div>
            <div class="receipt-actions">
                <button class="action-btn edit-btn" data-id="${receipt.id}">
                    <i class="fas fa-edit"></i> 編集
                </button>
                <button class="action-btn delete-btn" data-id="${receipt.id}">
                    <i class="fas fa-trash"></i> 削除
                </button>
            </div>
        `;
        container.appendChild(item);
    });

    // 編集・削除ボタンのイベントを設定
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.closest('button').getAttribute('data-id'));
            editReceipt(id);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.closest('button').getAttribute('data-id'));
            confirmDeleteReceipt(id);
        });
    });

    // サムネイルクリックで詳細表示
    document.querySelectorAll('.receipt-image-thumbnail').forEach(img => {
        img.addEventListener('click', (e) => {
            const id = parseInt(e.target.getAttribute('data-id'));
            editReceipt(id);
        });
    });
}

/**
 * レシート編集モーダルを表示
 * @param {Object} receiptData 
 */
export function showReceiptModal(receiptData) {
    // フォームにデータを設定
    const editDate = document.getElementById('editDate');
    const editStore = document.getElementById('editStore');
    const editTotal = document.getElementById('editTotal');
    const editMemo = document.getElementById('editMemo');

    if (editDate) editDate.value = receiptData.date || new Date().toISOString().split('T')[0];
    if (editStore) editStore.value = receiptData.store || '';
    if (editTotal) editTotal.value = receiptData.total || 0;
    if (editMemo) editMemo.value = receiptData.memo || '';

    // 商品リストの表示
    const itemsContainer = document.getElementById('editItemsContainer');
    if (itemsContainer) {
        itemsContainer.innerHTML = '';
        if (Array.isArray(receiptData.items) && receiptData.items.length > 0) {
            receiptData.items.forEach(item => {
                const row = createItemRow(item);
                itemsContainer.appendChild(row);
            });
        } else {
            // アイテムがない場合は空行を1つ追加
            itemsContainer.appendChild(createItemRow({ name: '', count: 1, amount: 0, major_category: 'other', minor_category: '' }));
        }
    }

    // 画像の設定
    updateModalImage(store.state.currentImageData || receiptData.image);

    // 新規作成モード（IDがない）かどうか
    store.setCurrentReceiptId(receiptData.id || null);

    // 初回の集計表示更新
    updateItemsSummary();

    // モーダルを表示
    const modal = document.getElementById('receiptModal');
    if (modal) {
        modal.classList.remove('hidden');
        // スクロール位置を一番上にリセット
        const content = modal.querySelector('.modal-content');
        if (content) content.scrollTop = 0;
    }
}

/**
 * アイテム行を作成
 * @param {Object} item 
 * @returns {HTMLElement}
 */
function createItemRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'item-row';

    let currentMajor = item.major_category || CATEGORY_IDS.OTHER;
    let currentMinor = item.minor_category || 'other_minor';

    // Major Category Select
    const majorSelectHtml = `
        <select class="item-major-category">
            ${Object.entries(MAJOR_CATEGORY_DISPLAY_NAMES).map(([id, name]) =>
        `<option value="${id}" ${id === currentMajor ? 'selected' : ''}>${name}</option>`
    ).join('')}
        </select>
    `;

    // Minor Category Select
    const minorSelectHtml = `
        <select class="item-minor-category">
            ${Object.entries(MINOR_CATEGORY_DISPLAY_NAMES).map(([id, name]) =>
        `<option value="${id}" ${id === currentMinor ? 'selected' : ''}>${name}</option>`
    ).join('')}
        </select>
    `;

    row.innerHTML = `
        <input type="text" class="item-name" value="${item.name || ''}" placeholder="商品名">
        <input type="number" class="item-amount" value="${item.amount || 0}" placeholder="価格">
        ${majorSelectHtml}
        ${minorSelectHtml}
        <button type="button" class="btn btn-danger btn-small delete-item-btn">
            <i class="fas fa-times"></i>
        </button>
        <input type="hidden" class="item-count" value="${item.count || 1}">
    `;

    // 削除ボタンのイベント
    row.querySelector('.delete-item-btn').addEventListener('click', () => {
        row.remove();
        updateItemsSummary();
    });

    // 金額変更イベント
    row.querySelector('.item-amount').addEventListener('input', updateItemsSummary);

    return row;
}

/**
 * アイテム合計と差額の表示を更新
 */
function updateItemsSummary() {
    const editTotalInput = document.getElementById('editTotal');
    const summaryDiv = document.getElementById('itemsSummary');

    if (!editTotalInput || !summaryDiv) return;

    const receiptTotal = parseInt(editTotalInput.value) || 0;

    let itemsTotal = 0;
    document.querySelectorAll('.item-amount').forEach(input => {
        itemsTotal += parseInt(input.value) || 0;
    });

    const diff = receiptTotal - itemsTotal;

    let diffText = '';
    if (diff !== 0) {
        // 差額がある場合
        const sign = diff > 0 ? '+' : '';
        diffText = ` (差額: ${sign}${diff}円)`;
    }

    summaryDiv.innerHTML = `商品合計: ¥${itemsTotal.toLocaleString()}<span style="color: #999; font-size: 0.8em; margin-left: 10px;">${diffText}</span>`;
}

/**
 * レシート編集
 * @param {number} id 
 */
export function editReceipt(id) {
    const receipt = store.state.receipts.find(r => r.id === id);
    if (!receipt) return;

    // 状態を更新
    store.setCurrentImageData(receipt.image);

    // モーダルを表示
    showReceiptModal(receipt);
}

/**
 * 編集したレシートを保存
 */
export async function saveEditedReceipt() {
    const editDate = document.getElementById('editDate');
    const editStore = document.getElementById('editStore');
    const editTotal = document.getElementById('editTotal');
    const editMemo = document.getElementById('editMemo');

    // アイテムリストの取得
    const itemRows = document.querySelectorAll('.item-row');
    const items = [];
    let calculatedTotal = 0;

    itemRows.forEach(row => {
        const name = row.querySelector('.item-name').value.trim();
        const amount = parseInt(row.querySelector('.item-amount').value) || 0;
        const major_category = row.querySelector('.item-major-category').value;
        const minor_category = row.querySelector('.item-minor-category').value.trim() || 'ー';
        const count = parseInt(row.querySelector('.item-count').value) || 1;

        if (name) {
            items.push({
                name,
                amount,
                major_category,
                minor_category,
                count
            });
            calculatedTotal += amount;
        }
    });

    const receipt = {
        date: editDate ? editDate.value : '',
        store: editStore ? editStore.value : '',
        total: editTotal ? parseInt(editTotal.value) || 0 : 0,
        items: items,
        image: null, // 画像データは別途管理
        memo: editMemo ? editMemo.value : ''
    };

    // 画像データの補完
    // 画像保存は廃止されたため、ここではimageにデータをセットしない
    // if (store.state.currentImageData) {
    //     receipt.image = store.state.currentImageData;
    // }

    // IDが設定されている場合は既存レシートを更新
    const currentId = store.state.currentReceiptId;
    if (currentId) {
        receipt.id = currentId;
    }

    // バリデーション
    if (!receipt.date || !receipt.store || receipt.total <= 0) {
        alert('日付、店舗名、合計金額は必須です');
        return;
    }

    // 保存
    await saveReceipt(receipt);

    // データリロード
    await reloadReceipts();

    // モーダルを閉じる
    const modal = document.getElementById('receiptModal');
    if (modal) modal.classList.add('hidden');

    alert('レシートを保存しました');
}

/**
 * レシート削除の確認
 * @param {number|null} id 
 */
export function confirmDeleteReceipt(id = null) {
    if (id !== null && typeof id === 'number') {
        store.setCurrentReceiptId(id);
    }

    const currentId = store.state.currentReceiptId;
    const receipt = store.state.receipts.find(r => r.id === currentId);

    if (!receipt) {
        // モーダルを閉じる
        const modal = document.getElementById('receiptModal');
        if (modal) modal.classList.add('hidden');
        return;
    }

    confirmCallback = async () => {
        await deleteReceipt(currentId);
        await reloadReceipts();

        const modal = document.getElementById('receiptModal');
        if (modal) modal.classList.add('hidden');
        alert('レシートを削除しました');
    };

    const confirmMessage = document.getElementById('confirmMessage');
    if (confirmMessage) {
        confirmMessage.textContent =
            `「${receipt.store} - ${formatDate(receipt.date)}」のレシートを削除しますか？`;
    }

    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) confirmModal.classList.remove('hidden');
}

/**
 * 期間フィルター変更処理
 */
export function handlePeriodChange() {
    const periodEl = document.getElementById('filterPeriod');
    const period = periodEl ? periodEl.value : 'all';
    const customSection = document.getElementById('customPeriodSection');

    if (customSection) {
        if (period === 'custom') {
            customSection.classList.remove('hidden');
        } else {
            customSection.classList.add('hidden');
        }
    }
}

/**
 * データのエクスポート
 */
export function exportData() {
    const data = {
        receipts: store.state.receipts,
        categoryDictionary: store.state.categoryDictionary || {}, // 辞書データ
        exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `レシートデータ_${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    alert('データをエクスポートしました');
}

/**
 * データのインポート
 * @param {Event} event 
 */
export async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (!data.receipts || !Array.isArray(data.receipts)) {
                throw new Error('無効なデータ形式です');
            }

            // 確認
            if (!confirm(`${data.receipts.length}件のレシートデータをインポートします。既存のデータは上書きされます。よろしいですか？`)) {
                return;
            }

            // 既存のデータをクリア
            await clearAllReceipts();

            // 新しいデータを保存
            for (const receipt of data.receipts) {
                // saveReceiptは現在コールバックを無視するように変更されているため、awaitのみ行う
                await saveReceipt(receipt);
            }

            // UI更新
            await reloadReceipts();

            alert('データのインポートが完了しました');
            event.target.value = ''; // 入力値をリセット

        } catch (error) {
            console.error('データのインポートに失敗しました:', error);
            alert('データのインポートに失敗しました。ファイル形式を確認してください。');
        }
    };

    reader.readAsText(file);
}

/**
 * 全データ削除の確認
 */
export function confirmClearData() {
    confirmCallback = async () => {
        // レシートデータをクリア
        await clearAllReceipts();

        // アプリ状態をリセット
        await reloadReceipts(); // ストアとUIを更新

        alert('全データを削除しました');
    };

    const confirmMessage = document.getElementById('confirmMessage');
    if (confirmMessage) {
        confirmMessage.textContent = 'すべてのレシートデータを削除しますか？この操作は元に戻せません。';
    }

    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) confirmModal.classList.remove('hidden');
}

/**
 * データ件数の更新
 */
export function updateDataCount() {
    const dataCountEl = document.getElementById('dataCount');
    if (dataCountEl) {
        dataCountEl.textContent = store.state.receipts.length;
    }
}
