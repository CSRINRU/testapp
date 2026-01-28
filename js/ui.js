import { AppState } from './state.js';
import { formatDate } from './utils.js';
import { saveToIndexedDB, saveReceipt, deleteReceipt } from './db.js';
import { setupCamera, capturePhoto, handleImageUpload, updateModalImage } from './camera.js';
import { addKeywordToDictionary, updateDictionaryDisplay } from './dictionary.js';
import { updateAnalysis } from './analysis.js';
import { geminiService } from './gemini.js';
import { classifyCategory } from './dictionary.js';

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
        setupCamera();
    } else if (tabId === 'analysis') {
        updateAnalysis();
    }

    AppState.currentTab = tabId;
}

/**
 * イベントリスナーの設定
 */
export function setupEventListeners() {
    // カメラ撮影ボタン
    const captureBtn = document.getElementById('captureBtn');
    if (captureBtn) captureBtn.addEventListener('click', () => capturePhoto(showReceiptModal));

    // カメラ切り替えボタン
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    if (switchCameraBtn) {
        switchCameraBtn.addEventListener('click', () => {
            AppState.currentCamera = AppState.currentCamera === 'environment' ? 'user' : 'environment';
            setupCamera();
        });
    }

    // 画像アップロード
    // 画像アップロード（labelで自動的に発火するため、クリックイベントでのclick()は不要）

    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => handleImageUpload(e, showReceiptModal));
    }

    // モーダル内の画像変更ボタン
    const changeImageBtn = document.getElementById('changeImageBtn');
    if (changeImageBtn) {
        changeImageBtn.addEventListener('click', () => {
            AppState.isChangingModalImage = true;
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

    // キーワード追加
    const addKeywordBtn = document.getElementById('addKeywordBtn');
    if (addKeywordBtn) addKeywordBtn.addEventListener('click', addKeywordToDictionary);

    // データ管理
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) exportDataBtn.addEventListener('click', exportData);

    // データをインポート（labelで自動的に発火するため、クリックイベントでのclick()は不要）

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
            if (AppState.confirmCallback) {
                AppState.confirmCallback();
                AppState.confirmCallback = null;
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
                // createItemRow is available in module scope
                container.appendChild(createItemRow());
            }
        });
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
    let filteredReceipts = [...AppState.receipts];

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
            return receipt.category === categoryFilter;
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
            itemsContainer.appendChild(createItemRow({ name: '', count: 1, amount: 0, category: 'その他' }));
        }
    }

    // 画像の設定
    updateModalImage(AppState.currentImageData || receiptData.image);

    // 新規作成モード（IDがない）
    AppState.currentReceiptId = receiptData.id || null;

    // 初回の集計表示更新
    updateItemsSummary();

    // モーダルを表示
    const modal = document.getElementById('receiptModal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * アイテム行を作成
 * @param {Object} item 
 * @returns {HTMLElement}
 */
function createItemRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'item-row';

    // カテゴリの定義
    const categories = ['食品', '雑貨', '日用品', '外食', 'その他'];
    const currentCategory = item.category || 'その他';

    row.innerHTML = `
        <input type="text" class="item-name" value="${item.name || ''}" placeholder="商品名">
        <input type="number" class="item-amount" value="${item.amount || 0}" placeholder="価格">
        <select class="item-category">
            ${categories.map(cat => `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat}</option>`).join('')}
        </select>
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
    const receipt = AppState.receipts.find(r => r.id === id);
    if (!receipt) return;

    // 状態を更新
    AppState.currentImageData = receipt.image;

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
    const categoryCount = {};

    itemRows.forEach(row => {
        const name = row.querySelector('.item-name').value.trim();
        const amount = parseInt(row.querySelector('.item-amount').value) || 0;
        const category = row.querySelector('.item-category').value;
        const count = parseInt(row.querySelector('.item-count').value) || 1;

        if (name) {
            items.push({
                name,
                amount,
                category,
                count
            });
            calculatedTotal += amount;
            categoryCount[category] = (categoryCount[category] || 0) + 1;
        }
    });

    const receipt = {
        date: editDate ? editDate.value : '',
        store: editStore ? editStore.value : '',
        total: editTotal ? parseInt(editTotal.value) || 0 : 0,
        items: items,
        image: null, // 画像は保存しない
        memo: editMemo ? editMemo.value : ''
    };

    // IDが設定されている場合は既存レシートを更新
    if (AppState.currentReceiptId) {
        receipt.id = AppState.currentReceiptId;
    }

    // バリデーション
    if (!receipt.date || !receipt.store || receipt.total <= 0) {
        alert('日付、店舗名、合計金額は必須です');
        return;
    }

    // 保存
    await saveReceipt(receipt, updateReceiptList, updateDataCount, updateAnalysis);

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
        AppState.currentReceiptId = id;
    }

    const receipt = AppState.receipts.find(r => r.id === AppState.currentReceiptId);

    if (!receipt) {
        // モーダルを閉じる
        const modal = document.getElementById('receiptModal');
        if (modal) modal.classList.add('hidden');
        return;
    }

    AppState.confirmCallback = async () => {
        await deleteReceipt(AppState.currentReceiptId, updateReceiptList, updateDataCount, updateAnalysis);
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
        receipts: AppState.receipts,
        categoryDictionary: AppState.categoryDictionary,
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
            const transaction = AppState.db.transaction(['receipts'], 'readwrite');
            const store = transaction.objectStore('receipts');
            const clearRequest = store.clear();

            clearRequest.onsuccess = async () => {
                // 新しいデータを保存
                for (const receipt of data.receipts) {
                    await saveReceipt(receipt, updateReceiptList, updateDataCount, updateAnalysis);
                }

                // カテゴリ辞書をインポート
                if (data.categoryDictionary) {
                    AppState.categoryDictionary = data.categoryDictionary;
                    await saveToIndexedDB('settings', 'categoryDictionary', data.categoryDictionary);
                    updateDictionaryDisplay();
                }

                alert('データのインポートが完了しました');
                event.target.value = ''; // 入力値をリセット
            };

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
    AppState.confirmCallback = async () => {
        // レシートデータをクリア
        const transaction = AppState.db.transaction(['receipts'], 'readwrite');
        const store = transaction.objectStore('receipts');
        store.clear();

        // アプリ状態をリセット
        AppState.receipts = [];
        updateReceiptList();
        updateAnalysis();
        updateDataCount();

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
        dataCountEl.textContent = AppState.receipts.length;
    }
}
