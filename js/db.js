import { AppState } from './state.js';

// データベースの初期化
export async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ReceiptManagerDB', 1);

        request.onerror = () => {
            console.error('データベースのオープンに失敗しました');
            reject(request.error);
        };

        request.onsuccess = () => {
            AppState.db = request.result;
            console.log('データベースをオープンしました');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // レシート用のストア作成
            if (!db.objectStoreNames.contains('receipts')) {
                const receiptStore = db.createObjectStore('receipts', { keyPath: 'id', autoIncrement: true });
                receiptStore.createIndex('date', 'date', { unique: false });
                receiptStore.createIndex('store', 'store', { unique: false });
                receiptStore.createIndex('category', 'category', { unique: false });
            }

            // 設定用のストア作成
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        };
    });
}

// IndexedDBへの保存
export async function saveToIndexedDB(storeName, key, data) {
    return new Promise((resolve, reject) => {
        const transaction = AppState.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        const request = store.put({ key, data });

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// IndexedDBからの読み込み
export async function getFromIndexedDB(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = AppState.db.transaction([storeName], 'readonly');
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
    return new Promise((resolve, reject) => {
        const transaction = AppState.db.transaction(['receipts'], 'readonly');
        const store = transaction.objectStore('receipts');
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            AppState.receipts = request.result || [];
            if (updateReceiptList) updateReceiptList();
            if (updateDataCount) updateDataCount();
            resolve();
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
    return new Promise((resolve, reject) => {
        const transaction = AppState.db.transaction(['receipts'], 'readwrite');
        const store = transaction.objectStore('receipts');

        const request = store.put(receipt);

        request.onerror = () => reject(request.error);
        request.onsuccess = async () => {
            await loadReceipts(updateReceiptList, updateDataCount); // 一覧を更新
            if (updateAnalysis) updateAnalysis();
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
    return new Promise((resolve, reject) => {
        const transaction = AppState.db.transaction(['receipts'], 'readwrite');
        const store = transaction.objectStore('receipts');

        const request = store.delete(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = async () => {
            await loadReceipts(updateReceiptList, updateDataCount); // 一覧を更新
            if (updateAnalysis) updateAnalysis();
            resolve();
        };
    });
}
