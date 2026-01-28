/**
 * アプリケーションの状態管理を担当するクラス
 * Single Source of Truth として機能する
 */
class Store {
    constructor() {
        this._state = {
            currentTab: 'camera',
            currentReceiptId: null,
            receipts: [],
            categoryDictionary: {}, // 将来的に使用、現時点ではconstants.js等で管理されているかも確認
            currentCamera: 'environment', // 'environment' = 背面カメラ
            currentImageData: null, // 現在選択/取得されている画像データ
            isChangingModalImage: false, // モーダル画像の変更中かフラグ
        };
        this._listeners = new Set();
    }

    /**
     * 状態を取得する (Read-only的なアクセスを推奨)
     */
    get state() {
        return { ...this._state };
    }

    /**
     * リスナー登録
     * @param {Function} listener 
     * @returns {Function} 解除関数
     */
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    /**
     * リスナーへの通知
     */
    _notify() {
        const state = this.state;
        this._listeners.forEach(listener => listener(state));
    }

    // --- Actions ---

    /**
     * 現在のタブを設定
     * @param {string} tabId 
     */
    setCurrentTab(tabId) {
        if (this._state.currentTab !== tabId) {
            this._state.currentTab = tabId;
            this._notify();
        }
    }

    /**
     * 現在のレシートIDを設定
     * @param {number|null} id 
     */
    setCurrentReceiptId(id) {
        this._state.currentReceiptId = id;
        this._notify();
    }

    /**
     * カテゴリ辞書を設定
     * @param {Object} dictionary 
     */
    setCategoryDictionary(dictionary) {
        this._state.categoryDictionary = dictionary;
        this._notify();
    }

    /**
     * レシート一覧を設定
     * @param {Array} receipts 
     */
    setReceipts(receipts) {
        this._state.receipts = receipts;
        this._notify();
    }

    /**
     * レシートを追加
     * @param {Object} receipt 
     */
    addReceipt(receipt) {
        this._state.receipts.push(receipt);
        this._notify();
    }

    /**
     * レシートを更新
     * @param {Object} updatedReceipt 
     */
    updateReceipt(updatedReceipt) {
        const index = this._state.receipts.findIndex(r => r.id === updatedReceipt.id);
        if (index !== -1) {
            this._state.receipts[index] = updatedReceipt;
            this._notify();
        }
    }

    /**
     * レシートを削除
     * @param {number} id 
     */
    deleteReceipt(id) {
        this._state.receipts = this._state.receipts.filter(r => r.id !== id);
        this._notify();
    }

    /**
     * 現在の画像データを設定
     * @param {string} imageData Base64 string
     */
    setCurrentImageData(imageData) {
        this._state.currentImageData = imageData;
        this._notify();
    }

    /**
     * モーダル画像変更フラグを設定
     * @param {boolean} isChanging 
     */
    setIsChangingModalImage(isChanging) {
        this._state.isChangingModalImage = isChanging;
        this._notify();
    }

    /**
     * 現在のカメラ設定を変更
     * @param {string} cameraFacingMode 'environment' or 'user'
     */
    setCurrentCamera(cameraFacingMode) {
        this._state.currentCamera = cameraFacingMode;
        this._notify();
    }
}

// シングルトンインスタンスをエクスポート
export const store = new Store();
