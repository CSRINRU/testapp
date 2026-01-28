export const AppState = {
    currentTab: 'camera',
    currentReceiptId: null,
    receipts: [],
    categoryDictionary: {},
    cameraStream: null,
    currentCamera: 'environment', // 'environment' = 背面カメラ
    confirmCallback: null,
    currentImageData: null, // 現在選択/取得されている画像データ
    db: null
};
