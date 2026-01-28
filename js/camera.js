import { AppState } from './state.js';
import { processImage } from './ocr.js';

/**
 * カメラ機能の設定
 */
export function setupCamera() {
    // 既存のカメラストリームを停止
    if (AppState.cameraStream) {
        AppState.cameraStream.getTracks().forEach(track => track.stop());
        AppState.cameraStream = null;
    }

    const video = document.getElementById('cameraPreview');
    if (!video) return;

    const constraints = {
        video: {
            facingMode: AppState.currentCamera,
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            video.srcObject = stream;
            AppState.cameraStream = stream;
        })
        .catch(err => {
            console.error('カメラへのアクセスに失敗しました:', err);
            alert('カメラへのアクセスが許可されていません。ブラウザの設定を確認してください。');
        });
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

        if (AppState.isChangingModalImage) {
            // モーダル表示中の画像変更の場合
            updateModalImage(imageData);
            AppState.isChangingModalImage = false;
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
        AppState.currentImageData = imageData;
    } else {
        preview.src = '';
        preview.classList.add('hidden');
        noImage.classList.remove('hidden');
        if (removeBtn) removeBtn.classList.add('hidden');
        AppState.currentImageData = null;
    }
}
