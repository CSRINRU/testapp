// import { AppState } from './state.js'; // 削除: DB接続でグローバルなAppStateを使用しなくなったため

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
            db = request.result; // DBインスタンスを保持
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
            // Storeの更新は呼び出し元(main.js等)の責任とするため、ここではデータ取得結果を返すのみとする。
            const receipts = request.result || [];
            // 画像データはメモリに展開しない (廃止対応)
            receipts.forEach(r => r.image = null);

            // 呼び出し元でStoreを更新できるようにデータを返す
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
            // 適切なUI更新フロー: DB保存 -> 成功 -> Store更新 -> UI反映
            // 現状は呼び出し元でUI更新やリロードを制御しているため、ここでは解決のみ行う。
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
            // saveReceiptと同様、解決のみ行う
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
