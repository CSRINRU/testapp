import { store } from './store.js';
import { processImage } from './ocr.js';

let cameraStream = null;

/**
 * カメラ機能の設定
 */
export function setupCamera() {
    // 既存のカメラストリームを停止
    stopCamera();

    const video = document.getElementById('cameraPreview');
    if (!video) return;

    // ストアから設定を取得
    const currentCamera = store.state.currentCamera;

    const constraints = {
        video: {
            facingMode: currentCamera,
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            video.srcObject = stream;
            cameraStream = stream;
        })
        .catch(err => {
            console.error('カメラへのアクセスに失敗しました:', err);
            alert('カメラへのアクセスが許可されていません。ブラウザの設定を確認してください。');
        });
}

/**
 * カメラを停止する
 */
export function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

/**
 * 写真撮影
 * @param {Function} showReceiptModal 
 */
export function capturePhoto(showReceiptModal) {
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('photoCanvas');
    if (!video || !canvas) return;
    const context = canvas.getContext('2d');

    // キャンバスのサイズをビデオに合わせる
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // キャンバスに画像を描画
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 撮影した画像を処理
    processImage(canvas.toDataURL('image/jpeg'), showReceiptModal);
}

/**
 * 画像アップロード処理
 * @param {Event} event 
 * @param {Function} showReceiptModal 
 */
export function handleImageUpload(event, showReceiptModal) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target.result;

        if (store.state.isChangingModalImage) {
            // モーダル表示中の画像変更の場合
            updateModalImage(imageData);
            store.setIsChangingModalImage(false);
        } else {
            // 通常の新規追加の場合
            processImage(imageData, showReceiptModal);
        }
    };
    reader.readAsDataURL(file);

    // 入力値をリセット
    event.target.value = '';
}

/**
 * モーダル内の画像を更新
 * @param {string|null} imageData 
 */
export function updateModalImage(imageData) {
    const preview = document.getElementById('editImagePreview');
    const noImage = document.getElementById('noImageText');
    const removeBtn = document.getElementById('removeImageBtn');

    if (!preview || !noImage) return;

    if (imageData) {
        preview.src = imageData;
        preview.classList.remove('hidden');
        noImage.classList.add('hidden');
        if (removeBtn) removeBtn.classList.remove('hidden');
        store.setCurrentImageData(imageData);
    } else {
        preview.src = '';
        preview.classList.add('hidden');
        noImage.classList.remove('hidden');
        if (removeBtn) removeBtn.classList.add('hidden');
        store.setCurrentImageData(null);
    }
}
