import { AppState } from './state.js';

import { OnnxOCR } from './onnx_ocr.js';
import { setupPreprocessingUI } from './preprocessing_ui.js';
import { geminiService } from './gemini.js';
import { CATEGORY_IDS, MINOR_CATEGORY_DICTIONARY } from './constants.js';

// OCRインスタンス
export const ocrEngine = new OnnxOCR();

/**
 * OCR処理関数（独立した関数として設計）
 * @param {string} imageData 
 * @returns {Promise<string>} 認識されたテキスト
 */
export async function processOCR(imageData) {
    try {
        // 進捗表示の要素を取得
        const progressText = document.getElementById('progressText');
        const progressFill = document.getElementById('progressFill');

        if (progressText) progressText.textContent = 'モデルをロード中...';

        // OCRエンジンの初期化
        await ocrEngine.init();

        if (progressText) progressText.textContent = '文字認識中...';
        if (progressFill) progressFill.style.width = '50%';

        // 画像認識の実行
        // processOCRはPromise<string>を返す必要がある
        const text = await ocrEngine.recognize(imageData);

        // 完了
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = '完了';

        return text;
    } catch (error) {
        console.error('OCR処理中にエラーが発生しました:', error);
        throw error;
    }
}

/**
 * 画像処理
 * @param {string} imageData 
 * @param {Function} showReceiptModal 
 */
export async function processImage(imageData, showReceiptModal) {
    // 状態を保存
    AppState.currentImageData = imageData;

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

    // 処理中表示（一旦非表示にしてUIを出す）
    const processingSection = document.getElementById('processingSection');
    if (processingSection) processingSection.classList.add('hidden');

    // 前処理UIのセットアップと表示
    const preprocessingFn = setupPreprocessingUI(
        // Analyze Callback
        async () => {
            // 処理中表示
            if (processingSection) processingSection.classList.remove('hidden');

            try {
                // OCRエンジンが初期化可能かチェック
                if (typeof ort === 'undefined') {
                    throw new Error('ONNX Runtimeがロードされていません。lib/ort.all.min.jsを確認してください。');
                }

                // OCR処理
                const text = await processOCR(imageData);
                console.log('OCR認識結果:', text);

                let receiptData;

                // Gemini APIが使える場合はそちらを使用
                if (geminiService.hasApiKey()) {
                    try {
                        if (progressText) progressText.textContent = 'AIで構造化中...';
                        receiptData = await geminiService.structureReceipt(text);
                    } catch (e) {
                        console.error('Gemini processing failed, falling back to simple extraction', e);
                        alert('Geminiでの解析に失敗しました。簡易解析を行います。\n' + e.message);
                        receiptData = extractReceiptData(text);
                    }
                } else {
                    // APIキーがない場合は警告して簡易解析 (あるいは設定を促す)
                    alert('Gemini APIキーが設定されていません。設定タブでキーを入力すると、より高精度な解析が可能です。');
                    receiptData = extractReceiptData(text);
                }

                // カテゴリの整理 (Geminiが返したものを確認、なければデフォルト)
                if (receiptData.items && receiptData.items.length > 0) {
                    if (progressText) progressText.textContent = 'データ整理中...';

                    for (let i = 0; i < receiptData.items.length; i++) {
                        let item = receiptData.items[i];
                        // オブジェクトでない場合はオブジェクト化 (簡易解析の場合など)
                        if (typeof item === 'string') {
                            item = { name: item, count: 1, amount: 0 };
                            receiptData.items[i] = item;
                        }

                        // カテゴリのデフォルト設定
                        if (!item.major_category) item.major_category = CATEGORY_IDS.OTHER;
                        if (!item.minor_category) item.minor_category = 'ー';
                    }
                }

                // 画像データも紐付ける
                receiptData.image = imageData;

                // モーダルで確認・編集
                if (typeof showReceiptModal === 'function') {
                    showReceiptModal(receiptData);
                } else {
                    console.error('確認モーダル表示関数が指定されていません');
                    alert('データの確認ができませんでした。');
                }

            } catch (error) {
                alert('レシートの解析に失敗しました。画像を確認してください。\n' + error.message);
                console.error('解析エラー:', error);
            } finally {
                // 処理中表示を非表示
                if (processingSection) processingSection.classList.add('hidden');

                // 解析が終わったらビデオ表示に戻す（3秒後）
                setTimeout(() => {
                    const preview = document.getElementById('selectedImagePreview');
                    const video = document.getElementById('cameraPreview');
                    const overlay = document.getElementById('cameraOverlay');
                    // Preprocessing UIも隠す
                    const prepSection = document.getElementById('preprocessing-section');
                    if (prepSection) prepSection.classList.add('hidden');

                    if (preview) preview.classList.add('hidden');
                    if (video) video.classList.remove('hidden');
                    if (overlay) overlay.classList.remove('hidden');
                }, 3000);
            }
        },
        // Cancel Callback
        () => {
            // キャンセル時はカメラに戻る
            const preview = document.getElementById('selectedImagePreview');
            const video = document.getElementById('cameraPreview');
            const overlay = document.getElementById('cameraOverlay');
            if (preview) preview.classList.add('hidden');
            if (video) video.classList.remove('hidden');
            if (overlay) overlay.classList.remove('hidden');
        }
    );

    // UI表示
    preprocessingFn.show(imageData);

    /*
    try {
        // ... OLD LOGIC REMOVED ...
    */
    return; // Stop here, wait for callback

    /* 
       Old Logic was here. We replaced it with the UI flow.
       The code below is effectively commented out by the fact we return above, 
       but for cleanliness we should remove it or wrap it. 
       Since I am replacing the block using `replace_file_content`, I will just provide the new content 
       and remove the old try/catch block entirely from this section.
    */

    // NOTE to Agent: The `replace_file_content` will replace the range. 
    // I need to be careful to match the EndLine correctly to remove the old try/catch completely.

}

/**
 * OCR結果からレシートデータを抽出
 * @param {string} text 
 * @returns {Object} 抽出されたレシートデータ
 */
export function extractReceiptData(text) {
    const receipt = {
        date: new Date().toISOString().split('T')[0], // デフォルトは今日
        store: '',
        total: 0,
        items: [],
        memo: ''
    };

    const lines = text.split('\n').filter(line => line.trim() !== '');

    // 日付の抽出 (YYYY/MM/DD または YYYY-MM-DD 形式を探す)
    const dateRegex = /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/;
    for (const line of lines) {
        const match = line.match(dateRegex);
        if (match) {
            receipt.date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
            break;
        }
    }

    // 合計金額の抽出 (「合計」「税込」「￥」「¥」などのキーワードと金額)
    const totalRegex = /(合計|税込|総額|計)[^\d]*[￥¥]?[\s]*([\d,]+)/;
    for (const line of lines) {
        const match = line.match(totalRegex);
        if (match) {
            receipt.total = parseInt(match[2].replace(/,/g, '')) || 0;
            break;
        }
    }

    // 金額が抽出できなかった場合は、行から最も大きい数字を探す
    if (receipt.total === 0) {
        let maxAmount = 0;
        const amountRegex = /[￥¥]?[\s]*([\d,]+)/g;

        for (const line of lines) {
            let match;
            while ((match = amountRegex.exec(line)) !== null) {
                const amount = parseInt(match[1].replace(/,/g, '')) || 0;
                if (amount > maxAmount && amount < 100000) { // 10万円未満を対象
                    maxAmount = amount;
                }
            }
        }
        receipt.total = maxAmount;
    }

    // 店舗名の抽出 (最初の数行から探す)
    for (let i = 0; i < Math.min(3, lines.length); i++) {
        const line = lines[i].trim();
        // 日付や金額を含まない行を店舗名候補とする
        if (!line.match(dateRegex) && !line.match(/[￥¥][\d,]+/)) {
            receipt.store = line.substring(0, 50); // 長すぎる場合は切り詰め
            break;
        }
    }

    // 商品名の抽出 (簡易的に「行に商品名らしきもの」を抽出)
    const itemRegex = /^[^￥¥\d]*[^\d]{2,}/; // 数字で始まらず、2文字以上
    for (const line of lines) {
        const cleanLine = line.trim();
        // 日付、店舗名、合計などではない行を商品候補とする
        if (!cleanLine.match(dateRegex) &&
            !cleanLine.match(totalRegex) &&
            cleanLine !== receipt.store &&
            cleanLine.match(itemRegex) &&
            cleanLine.length > 1) {
            receipt.items.push(cleanLine.substring(0, 100)); // 長すぎる場合は切り詰め
        }
    }

    // 商品が抽出できない場合はサンプルデータを追加
    if (receipt.items.length === 0) {
        receipt.items = ['商品1', '商品2', '商品3'];
    }

    return receipt;
}
