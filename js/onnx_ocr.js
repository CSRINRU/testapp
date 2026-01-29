/**
 * OnnxOCR: PaddleOCRをブラウザ(Web Worker)で動作させるクラス
 * onnxruntime-webを使用
 */
class OnnxOCR {
    constructor() {
        this.detSession = null;
        this.recSession = null;
        this.keys = null;
        this.isInitialized = false;

        // 設定
        this.limitSideLen = 2000; // 検出時の画像リサイズ上限 (レシートなど縦長画像のために大きめに)
        this.detDbThresh = 0.4;  // 検出の閾値（ノイズ除去のため上げる）
        this.detDbBoxThresh = 0.6; // より確実な検出のみ
        this.recImgH = 48; // 認識モデルの入力高さ (v4は48)
        this.recImgW = 320;
        this.recScoreThresh = 0.6; // 認識信頼度の閾値

        // Debug params
        this.preprocessContrast = 1.3;
        this.enableContrast = true;     // コントラスト強調のOn/Off
        this.enableSharpening = true;   // シャープニングのOn/Off
        this.lastPreprocessedImage = null; // デバッグ用: 前処理後の画像 (WorkerではDataURL化はコスト高いのでnullか必要時のみ)
    }

    /**
     * 初期化処理
     */
    async init() {
        if (this.isInitialized) return;

        try {
            // WASMパスの設定 (lib/フォルダにあると仮定)
            // サーバーのルートからの絶対パスを指定して曖昧さを排除する
            ort.env.wasm.wasmPaths = '/lib/';

            // 文字コード表の読み込み
            await this.loadKeys();

            // モデルの読み込み
            const sessionOptions = {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            };

            console.log('Loading detection model...');
            this.detSession = await ort.InferenceSession.create('/models/ppocrv5/det/det.onnx', sessionOptions);

            console.log('Loading recognition model...');
            this.recSession = await ort.InferenceSession.create('/models/ppocrv5/rec/rec.onnx', sessionOptions);

            this.isInitialized = true;
            console.log('OCR Models initialized successfully');
        } catch (e) {
            console.error('OCR Initialization failed:', e);
            throw e;
        }
    }

    /**
     * 文字コード表の読み込み
     */
    async loadKeys() {
        // Worker環境では相対パスはWorkerスクリプトからの相対になる
        // /models/... でルート指定が無難
        const response = await fetch('/models/ppocrv5/ppocrv5_dict.txt');
        const text = await response.text();
        // 行ごとに分割して配列にする
        this.keys = text.split('\n');
        // 最後が空行の場合があるので調整
        if (this.keys[this.keys.length - 1] === '') {
            this.keys.pop();
        }
    }

    /**
     * 画像からテキストを抽出（メイン処理）
     * @param {string|Blob|ImageBitmap} imageSource 
     */
    async recognize(imageSource) {
        if (!this.isInitialized) await this.init();

        // 画像の読み込みとImageBitmap化
        const originalImage = await this.loadImage(imageSource);

        // 画像前処理（コントラスト強調・シャープニング）
        const image = this.preprocessImage(originalImage);

        // 1. テキスト検出 (Detection)
        const boxes = await this.detectText(image);
        console.log(`検出されたテキスト領域: ${boxes.length}個`);

        // 2. テキスト認識 (Recognition)
        const results = [];
        for (const box of boxes) {
            // ボックスにパディングを追加（高さに応じた適応的パディング）
            const padding = Math.max(8, Math.round(box.h * 0.15));
            const paddedBox = {
                x: Math.max(0, box.x - padding),
                y: Math.max(0, box.y - padding),
                w: Math.min(image.width - Math.max(0, box.x - padding), box.w + padding * 2),
                h: Math.min(image.height - Math.max(0, box.y - padding), box.h + padding * 2)
            };

            // 小さすぎるボックスはスキップ
            if (paddedBox.w < 10 || paddedBox.h < 10) continue;

            // ボックス部分の画像を切り出し
            const cropCanvas = this.cropImage(image, paddedBox);
            // 認識実行
            const { text, score } = await this.recognizeText(cropCanvas);

            if (text.length > 0 && score > this.recScoreThresh) {
                results.push({ text, score, box });
            }
        }

        // 3. 結果の結合（上から下、左から右へ並び替え）
        results.sort((a, b) => {
            // Y座標でソート（ある程度の許容誤差を持たせる）
            const yDiff = Math.abs(a.box.y - b.box.y);
            // 文字の高さの半分くらいを一行の誤差とみなす
            const avgHeight = (a.box.h + b.box.h) / 2;
            if (yDiff < avgHeight * 0.5) {
                return a.box.x - b.box.x;
            }
            return a.box.y - b.box.y;
        });

        // 4. 同一行のテキストを結合
        const lines = this.mergeToLines(results);

        // リソース解放
        if (originalImage.close) originalImage.close();
        // preprocessImageで作成したcanvasなどのGPUリソースはGC任せだが、closeできるならすべき
        // OffscreenCanvasはexplicit closeがないが、ImageBitmapはcloseすべき

        return lines.join('\n');
    }

    /**
     * 画像前処理（コントラスト強調・シャープニング）
     * @param {ImageBitmap} image 
     * @returns {OffscreenCanvas}
     */
    preprocessImage(image) {
        let width = image.width;
        let height = image.height;

        // 0. リサイズ (limitSideLen)
        if (Math.max(width, height) > this.limitSideLen) {
            const ratio = Math.max(width, height) > 0 ? this.limitSideLen / Math.max(width, height) : 1;
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // drawImageでリサイズ適用
        ctx.drawImage(image, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // 1. グレースケール変換して輝度を分析
        const gray = new Uint8Array(canvas.width * canvas.height);
        for (let i = 0; i < data.length; i += 4) {
            gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }

        // 2. コントラスト強調（ヒストグラムストレッチ）
        if (this.enableContrast) {
            let min = 255, max = 0;
            for (let i = 0; i < gray.length; i++) {
                if (gray[i] < min) min = gray[i];
                if (gray[i] > max) max = gray[i];
            }
            const range = max - min || 1;

            // 3. コントラスト強調を適用
            for (let i = 0; i < data.length; i += 4) {
                const grayVal = gray[i / 4];
                // ストレッチ
                const stretched = ((grayVal - min) / range) * 255;
                // コントラスト係数（レシート用に強め）
                const contrast = this.preprocessContrast;
                const enhanced = Math.min(255, Math.max(0, ((stretched - 128) * contrast) + 128));

                data[i] = enhanced;     // R
                data[i + 1] = enhanced; // G
                data[i + 2] = enhanced; // B
            }
        } else {
            // グレースケールのみ適用
            for (let i = 0; i < data.length; i += 4) {
                const grayVal = gray[i / 4];
                data[i] = grayVal;
                data[i + 1] = grayVal;
                data[i + 2] = grayVal;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // 4. シャープニング（畳み込みフィルタ）
        if (this.enableSharpening) {
            const sharpened = this.applySharpen(ctx, canvas.width, canvas.height);
            ctx.putImageData(sharpened, 0, 0);
        }

        // WorkerではtoDataURLは非同期だが、ここではデバッグ表示しないので省略
        // this.lastPreprocessedImage = ... 

        return canvas;
    }

    /**
     * シャープニングフィルタを適用
     */
    applySharpen(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const output = new Uint8ClampedArray(data.length);

        // シャープニングカーネル
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                            sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    output[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, sum));
                }
                output[(y * width + x) * 4 + 3] = 255; // Alpha
            }
        }

        // 境界ピクセルをコピー
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < 4; c++) {
                output[x * 4 + c] = data[x * 4 + c];
                output[((height - 1) * width + x) * 4 + c] = data[((height - 1) * width + x) * 4 + c];
            }
        }
        for (let y = 0; y < height; y++) {
            for (let c = 0; c < 4; c++) {
                output[(y * width) * 4 + c] = data[(y * width) * 4 + c];
                output[(y * width + width - 1) * 4 + c] = data[(y * width + width - 1) * 4 + c];
            }
        }

        return new ImageData(output, width, height);
    }

    /**
     * 結果を同一行にまとめる
     * @param {Array} results 
     * @returns {Array<string>}
     */
    mergeToLines(results) {
        if (results.length === 0) return [];

        const lines = [];
        let currentLine = [results[0]];

        for (let i = 1; i < results.length; i++) {
            const prev = currentLine[currentLine.length - 1];
            const curr = results[i];
            const avgHeight = (prev.box.h + curr.box.h) / 2;
            const yDiff = Math.abs(prev.box.y - curr.box.y);

            if (yDiff < avgHeight * 0.5) {
                // 同じ行
                currentLine.push(curr);
            } else {
                // 新しい行
                lines.push(currentLine.map(r => r.text).join(' '));
                currentLine = [curr];
            }
        }
        lines.push(currentLine.map(r => r.text).join(' '));

        return lines;
    }

    // --- Detection Logic ---

    async detectText(image) { // image is OffscreenCanvas
        // 画像の前処理 (Resize & Normalize)
        const { tensor, ratioH, ratioW, newH, newW } = await this.preprocessDet(image);

        // 推論実行
        const feeds = { [this.detSession.inputNames[0]]: tensor };
        const results = await this.detSession.run(feeds);
        const output = results[this.detSession.outputNames[0]]; // shape: [1, 1, H, W]

        // 後処理
        const mapData = output.data;
        const boxes = this.postprocessDetSimple(mapData, newW, newH, ratioW, ratioH);

        return boxes;
    }

    async preprocessDet(image) {
        let w = image.width;
        let h = image.height;
        let ratio = 1.0;

        // リサイズ計算 (32の倍数にする)
        if (Math.max(w, h) > this.limitSideLen) {
            if (h > w) {
                ratio = this.limitSideLen / h;
            } else {
                ratio = this.limitSideLen / w;
            }
        }

        let resizeH = Math.round(h * ratio);
        let resizeW = Math.round(w * ratio);

        // 32の倍数に丸める
        resizeH = Math.round(resizeH / 32) * 32;
        resizeW = Math.round(resizeW / 32) * 32;

        const ratioH = resizeH / h;
        const ratioW = resizeW / w;

        // Canvasでリサイズ
        const canvas = new OffscreenCanvas(resizeW, resizeH);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, resizeW, resizeH);

        const imageData = ctx.getImageData(0, 0, resizeW, resizeH);
        const data = imageData.data;

        // Tensor作成 (NCHW format, Normalize)
        // Mean = [0.485, 0.456, 0.406], Std = [0.229, 0.224, 0.225]
        const floatData = new Float32Array(3 * resizeH * resizeW);
        const mean = [0.485, 0.456, 0.406];
        const std = [0.229, 0.224, 0.225];

        for (let i = 0; i < resizeH * resizeW; i++) {
            // R
            floatData[i] = ((data[i * 4] / 255.0) - mean[0]) / std[0];
            // G
            floatData[i + resizeH * resizeW] = ((data[i * 4 + 1] / 255.0) - mean[1]) / std[1];
            // B
            floatData[i + 2 * resizeH * resizeW] = ((data[i * 4 + 2] / 255.0) - mean[2]) / std[2];
        }

        const tensor = new ort.Tensor('float32', floatData, [1, 3, resizeH, resizeW]);
        return { tensor, ratioH, ratioW, newH: resizeH, newW: resizeW };
    }

    postprocessDetSimple(mapData, width, height, ratioW, ratioH) {
        const boxes = [];
        // 1. 行ごとのスコア合計を計算 (Y Projection)
        const yProj = new Float32Array(height);
        for (let y = 0; y < height; y++) {
            let sum = 0;
            for (let x = 0; x < width; x++) {
                if (mapData[y * width + x] > this.detDbThresh) {
                    sum += 1;
                }
            }
            yProj[y] = sum;
        }

        // 2. YProjectionから行を切り出し
        let inBlock = false;
        let startY = 0;
        for (let y = 0; y < height; y++) {
            if (!inBlock && yProj[y] > 5) {
                inBlock = true;
                startY = y;
            } else if (inBlock && yProj[y] <= 5) {
                inBlock = false;
                this.findBoxesInRow(mapData, width, startY, y, ratioW, ratioH, boxes);
            }
        }
        if (inBlock) {
            this.findBoxesInRow(mapData, width, startY, height, ratioW, ratioH, boxes);
        }

        return boxes;
    }

    findBoxesInRow(mapData, width, startY, endY, ratioW, ratioH, boxes) {
        const height = endY - startY;
        if (height < 5) return;

        // X Projection
        const xProj = new Float32Array(width);
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let y = startY; y < endY; y++) {
                if (mapData[y * width + x] > this.detDbThresh) {
                    sum += 1;
                }
            }
            xProj[x] = sum;
        }

        let inBlock = false;
        let startX = 0;
        for (let x = 0; x < width; x++) {
            if (!inBlock && xProj[x] > 2) {
                inBlock = true;
                startX = x;
            } else if (inBlock && xProj[x] <= 2) {
                inBlock = false;
                boxes.push({
                    x: Math.round(startX / ratioW),
                    y: Math.round(startY / ratioH),
                    w: Math.round((x - startX) / ratioW),
                    h: Math.round((endY - startY) / ratioH)
                });
            }
        }
        if (inBlock) {
            boxes.push({
                x: Math.round(startX / ratioW),
                y: Math.round(startY / ratioH),
                w: Math.round((width - startX) / ratioW),
                h: Math.round((endY - startY) / ratioH)
            });
        }
    }


    // --- Recognition Logic ---

    async recognizeText(cropCanvas) {
        // 前処理
        const tensor = await this.preprocessRec(cropCanvas);

        // 推論
        const feeds = { [this.recSession.inputNames[0]]: tensor };
        const results = await this.recSession.run(feeds);
        const output = results[this.recSession.outputNames[0]]; // shape: [1, seq_len, num_classes]

        // 後処理 (CTC Decode)
        return this.decodeRec(output.data, output.dims);
    }

    async preprocessRec(canvas) {
        // PaddleOCR v4 rec shape: [3, 48, 320] etc.
        let h = canvas.height;
        let w = canvas.width;

        const imgH = this.recImgH; // 48
        const ratio = imgH / h;
        const imgW = Math.round(w * ratio);

        const resizeCanvas = new OffscreenCanvas(imgW, imgH);
        const ctx = resizeCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, imgW, imgH);

        const imageData = ctx.getImageData(0, 0, imgW, imgH);
        const data = imageData.data;

        // Tensor作成
        const floatData = new Float32Array(3 * imgH * imgW);
        // Normalize: (x/255 - 0.5) / 0.5
        for (let i = 0; i < imgH * imgW; i++) {
            // R
            floatData[i] = ((data[i * 4] / 255.0) - 0.5) / 0.5;
            // G
            floatData[i + imgH * imgW] = ((data[i * 4 + 1] / 255.0) - 0.5) / 0.5;
            // B
            floatData[i + 2 * imgH * imgW] = ((data[i * 4 + 2] / 255.0) - 0.5) / 0.5;
        }

        return new ort.Tensor('float32', floatData, [1, 3, imgH, imgW]);
    }

    decodeRec(data, dims) {
        const seqLen = dims[1];
        const vocabSize = dims[2];

        let charIndices = [];
        let confidences = [];

        for (let i = 0; i < seqLen; i++) {
            let maxScore = -Infinity;
            let maxIdx = 0;
            const offset = i * vocabSize;

            for (let j = 0; j < vocabSize; j++) {
                if (data[offset + j] > maxScore) {
                    maxScore = data[offset + j];
                    maxIdx = j;
                }
            }
            charIndices.push(maxIdx);
            confidences.push(maxScore);
        }

        const blankIdx = 0;
        let sb = '';
        let lastIdx = -1;
        let scoreSum = 0;
        let count = 0;

        for (let i = 0; i < seqLen; i++) {
            const idx = charIndices[i];
            if (idx !== lastIdx && idx !== blankIdx) {
                const charIdx = idx - 1;
                if (charIdx >= 0 && charIdx < this.keys.length) {
                    sb += this.keys[charIdx];
                    scoreSum += confidences[i];
                    count++;
                }
            }
            lastIdx = idx;
        }

        return {
            text: sb,
            score: count > 0 ? scoreSum / count : 0.0
        };
    }

    // --- Helpers ---

    async loadImage(src) {
        if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) {
            return src;
        }
        if (typeof Blob !== 'undefined' && src instanceof Blob) {
            return createImageBitmap(src);
        }
        if (typeof src === 'string') {
            const response = await fetch(src);
            const blob = await response.blob();
            return createImageBitmap(blob);
        }
        throw new Error('Unsupported image source by OnnxOCR Worker');
    }

    cropImage(image, box) {
        const canvas = new OffscreenCanvas(Math.max(1, box.w), Math.max(1, box.h));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    setParams(params) {
        if (typeof params.detDbThresh === 'number') this.detDbThresh = params.detDbThresh;
        if (typeof params.detDbBoxThresh === 'number') this.detDbBoxThresh = params.detDbBoxThresh;
        if (typeof params.recScoreThresh === 'number') this.recScoreThresh = params.recScoreThresh;
        if (typeof params.preprocessContrast === 'number') this.preprocessContrast = params.preprocessContrast;
        if (typeof params.limitSideLen === 'number') this.limitSideLen = params.limitSideLen;

        if (typeof params.enableContrast === 'boolean') this.enableContrast = params.enableContrast;
        if (typeof params.enableSharpening === 'boolean') this.enableSharpening = params.enableSharpening;
    }
}

// Global scope attachment for importScripts
self.OnnxOCR = OnnxOCR;
