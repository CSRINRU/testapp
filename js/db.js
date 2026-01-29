// import { AppState } from './state.js'; // REMOVED: No longer using global AppState for DB connection

// モジュールレベル変数としてDB接続を保持 (Service Pattern)
let db = null;

// データベースの初期化
export async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ReceiptManagerDB', 1);

        request.onerror = () => {
            console.error('データベースのオープンに失敗しました');
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result; // Local variable assignment
            console.log('データベースをオープンしました');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;

            // レシート用のストア作成
            if (!dbInstance.objectStoreNames.contains('receipts')) {
                const receiptStore = dbInstance.createObjectStore('receipts', { keyPath: 'id', autoIncrement: true });
                receiptStore.createIndex('date', 'date', { unique: false });
                receiptStore.createIndex('store', 'store', { unique: false });
                receiptStore.createIndex('category', 'category', { unique: false });
            }

            // 設定用のストア作成
            if (!dbInstance.objectStoreNames.contains('settings')) {
                dbInstance.createObjectStore('settings', { keyPath: 'key' });
            }
        };
    });
}

// IndexedDBへの保存
export async function saveToIndexedDB(storeName, key, data) {
    if (!db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        const request = store.put({ key, data });

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// IndexedDBからの読み込み
export async function getFromIndexedDB(storeName, key) {
    if (!db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);

        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result.data);
            } else {
                resolve(null);
            }
        };
    });
}



/**
 * レシートの読み込み
 * @param {Function} updateReceiptList 
 * @param {Function} updateDataCount 
 */
export async function loadReceipts(updateReceiptList, updateDataCount) {
    if (!db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['receipts'], 'readonly');
        const store = transaction.objectStore('receipts');
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            // AppState.receipts = request.result || []; // REMOVED: Controlled by caller/Store now
            // The caller (main.js) should handle updating the Store.
            // But to keep signature compatible for now, we return data.
            // Ideally loadReceipts should just return data.
            // Keeping existing callback pattern but removing direct State mutation inside DB module if possible,
            // BUT existing code calls 'updateReceiptList' which might rely on global state.
            // For this step, I will return the data and let the caller handling it, 
            // OR I should import 'store' here and update it?
            // "Single responsibility": DB module should just fetch data.
            // But 'loadReceipts' name implies it does everything.
            // I will return the result and let main.js update the store.

            // However, looking at 'main.js', it calls 'loadReceipts(updateReceiptList, updateDataCount)'.
            // And 'updateReceiptList' in 'ui.js' probably reads from AppState/Store.
            // So we MUST update the Store here OR change main.js to update the store.
            // Plan said: "Refactor js/main.js to use the new store".
            // So I should import 'store' here and set it, OR return it.
            // Modifying 'loadReceipts' to return data is cleaner but requires changing call sites.
            // Let's import store here to minimize breakage for now, or just return data and have main.js update store.
            // Let's decide to import 'store' here to fulfill "setReceipts" action.

            // Wait, pure DB module shouldn't import UI store ideally.
            // But keeping it simple: 'loadReceipts' is a business logic function here.

            // I'll make it return the receipts, and main.js will set them to store.

            const receipts = request.result || [];
            // 画像データはメモリに展開しない (廃止対応)
            receipts.forEach(r => r.image = null);

            // Returning receipts so caller can update store
            resolve(receipts);
        };
    });
}

/**
 * レシートの保存
 * @param {Object} receipt 
 * @param {Function} updateReceiptList 
 * @param {Function} updateDataCount 
 * @param {Function} updateAnalysis 
 */
export async function saveReceipt(receipt, updateReceiptList, updateDataCount, updateAnalysis) {
    if (!db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['receipts'], 'readwrite');
        const store = transaction.objectStore('receipts');

        // 画像データの保存は廃止
        const receiptToSave = { ...receipt, image: null };
        const request = store.put(receiptToSave);

        request.onerror = () => reject(request.error);
        request.onsuccess = async () => {
            // await loadReceipts(updateReceiptList, updateDataCount); // Recursive/Circular dependency if we use store?
            // The proper way is: save to DB -> successful -> add/update in Store -> UI updates via subscription.
            // But for now, we want to maintain the specific callbacks if passed.
            // I will simply resolve here, and let the caller handle UI updates/reloading.
            // The original code re-loaded everything. Structure is poor.
            // I will resolve, and let caller handle.
            resolve();
        };
    });
}

/**
 * レシートの削除
 * @param {number} id 
 * @param {Function} updateReceiptList 
 * @param {Function} updateDataCount 
 * @param {Function} updateAnalysis 
 */
export async function deleteReceipt(id, updateReceiptList, updateDataCount, updateAnalysis) {
    if (!db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['receipts'], 'readwrite');
        const store = transaction.objectStore('receipts');

        const request = store.delete(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = async () => {
            // Same as saveReceipt, just resolve.
            resolve();
        };
    });
}

/**
 * 全てのレシートを削除
 */
export async function clearAllReceipts() {
    if (!db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['receipts'], 'readwrite');
        const store = transaction.objectStore('receipts');
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
