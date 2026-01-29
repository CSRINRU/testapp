// OCR Worker
importScripts('../lib/ort.all.min.js');
importScripts('./onnx_ocr.js');

const ocr = new self.OnnxOCR();

self.onmessage = async (e) => {
    const { type, payload, messageId } = e.data;

    try {
        if (type === 'INIT') {
            await ocr.init();
            self.postMessage({ type: 'INIT_COMPLETE', messageId });
        } else if (type === 'SET_PARAMS') {
            ocr.setParams(payload);
            self.postMessage({ type: 'SET_PARAMS_COMPLETE', messageId });
        } else if (type === 'PREPROCESS') {
            const { image, params } = payload;
            if (params) ocr.setParams(params);

            // 画像読み込み
            const img = await ocr.loadImage(image);
            // 前処理
            const processedCanvas = ocr.preprocessImage(img);
            // ImageBitmapに変換して転送
            const bitmap = processedCanvas.transferToImageBitmap();

            // 元画像は閉じる
            if (img.close) img.close();

            self.postMessage({
                type: 'PREPROCESS_COMPLETE',
                payload: bitmap,
                messageId
            }, [bitmap]); // Transfer

        } else if (type === 'RECOGNIZE') {
            const { image, params } = payload;
            if (params) ocr.setParams(params);

            // 画像認識実行
            const text = await ocr.recognize(image);

            self.postMessage({ type: 'RECOGNIZE_COMPLETE', payload: text, messageId });
        }
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: error.message || error.toString(),
            stack: error.stack,
            messageId
        });
    }
};
