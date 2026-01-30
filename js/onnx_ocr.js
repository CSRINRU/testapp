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
        this.paddingRatio = 0.1; // パディング率

        // デバッグ用パラメータ
        this.preprocessContrast = 1.3;
        this.enableContrast = true;     // コントラスト強調のOn/Off
        this.enableSharpening = true;   // シャープニングのOn/Off
        this.lastPreprocessedImage = null; // デバッグ用: 前処理後の画像
    }

    /**
     * 初期化処理
     */
    async init() {
        if (this.isInitialized) return;

        try {
            // WASMパス設定
            ort.env.wasm.wasmPaths = '../lib/';

            // 文字コード表の読み込み
            await this.loadKeys();

            // モデルの読み込み
            const sessionOptions = {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            };

            console.log('Loading detection model...');
            this.detSession = await ort.InferenceSession.create('../models/ppocrv5/det/det.onnx', sessionOptions);

            console.log('Loading recognition model...');
            this.recSession = await ort.InferenceSession.create('../models/ppocrv5/rec/rec.onnx', sessionOptions);

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
        const response = await fetch('../models/ppocrv5/ppocrv5_dict.txt');
        if (!response.ok) {
            throw new Error(`Failed to load dictionary: ${response.status} ${response.statusText}`);
        }
        const text = await response.text();

        // HTMLが返ってきていないかチェック (404ページ対策)
        if (text.trim().startsWith('<')) {
            throw new Error('Dictionary file content appears to be HTML. Likely 404 or path issue.');
        }

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

        // 出力用スケール計算
        const scaleX = originalImage.width / image.width;
        const scaleY = originalImage.height / image.height;

        // 2. テキスト認識 (Recognition)
        const results = [];
        for (const box of boxes) {
            // ボックス座標 (4点)

            // ボックスの幅と高さを計算
            const edge1 = Math.hypot(box[1].x - box[0].x, box[1].y - box[0].y);
            const edge2 = Math.hypot(box[2].x - box[1].x, box[2].y - box[1].y);

            // 長辺を幅と仮定
            // (向きの確認が必要な場合あり)
            // 切り出し準備

            // ボックス部分の画像を切り出し (回転を考慮)
            const cropCanvas = this.cropRotatedImage(image, box);

            // 認識実行
            const { text, score } = await this.recognizeText(cropCanvas);

            if (text.length > 0 && score > this.recScoreThresh) {
                // 元画像座標へ変換
                const outBox = box.map(p => ({
                    x: Math.round(p.x * scaleX),
                    y: Math.round(p.y * scaleY)
                }));

                // パディング付きボックス計算
                const paddedBox = this.getPaddedBox(box);
                const outPaddedBox = paddedBox.map(p => ({
                    x: Math.round(p.x * scaleX),
                    y: Math.round(p.y * scaleY)
                }));

                // ソート用バウンディング短形
                const xs = outBox.map(p => p.x);
                const ys = outBox.map(p => p.y);
                const minX = Math.min(...xs);
                const minY = Math.min(...ys);
                const maxX = Math.max(...xs);
                const maxY = Math.max(...ys);
                const centerY = (minY + maxY) / 2;
                const centerX = (minX + maxX) / 2;
                const height = maxY - minY;

                results.push({
                    text,
                    score,
                    box: outBox, // 4点
                    paddedBox: outPaddedBox, // パディング領域
                    // ソート用メタデータ
                    centerY,
                    centerX,
                    height
                });
            }
        }

        // 3. 結果の結合（上から下、左から右へ並び替え）
        results.sort((a, b) => {
            // Y座標でソート（ある程度の許容誤差を持たせる）
            const yDiff = Math.abs(a.centerY - b.centerY);
            // 文字の高さの半分くらいを一行の誤差とみなす
            const avgHeight = (a.height + b.height) / 2;

            if (yDiff < avgHeight * 0.5) {
                return a.centerX - b.centerX;
            }
            return a.centerY - b.centerY;
        });

        // 4. 同一行のテキストを結合
        const lines = this.mergeToLines(results);

        // リソース解放
        if (originalImage.close) originalImage.close();

        return {
            text: lines.join('\n'),
            blocks: results,
            lines: lines
        };
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

    getPaddedBox(box) {
        // 回転画像の切り出し時と同様の寸法計算
        const w1 = Math.hypot(box[1].x - box[0].x, box[1].y - box[0].y);
        const w2 = Math.hypot(box[3].x - box[2].x, box[3].y - box[2].y);
        const w = (w1 + w2) / 2;

        const h1 = Math.hypot(box[3].x - box[0].x, box[3].y - box[0].y);
        const h2 = Math.hypot(box[2].x - box[1].x, box[2].y - box[1].y);
        const h = (h1 + h2) / 2;

        // パディング計算
        const padding = Math.max(4, Math.round(Math.min(w, h) * this.paddingRatio));

        // 中心座標
        const cx = (box[0].x + box[2].x) / 2;
        const cy = (box[0].y + box[2].y) / 2;

        // 角度計算 (上辺の傾き)
        const angle = Math.atan2(box[1].y - box[0].y, box[1].x - box[0].x);

        // 単位ベクトル計算
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const vx = -Math.sin(angle); // 垂直方向
        const vy = Math.cos(angle);

        // パディング適用後のサイズ (半値)
        const halfW = (w / 2) + padding;
        const halfH = (h / 2) + padding;

        // 頂点計算 (TL, TR, BR, BL)
        // 中心からベクトル演算で各頂点を求める

        return [
            { x: cx - halfW * ux - halfH * vx, y: cy - halfW * uy - halfH * vy }, // TL
            { x: cx + halfW * ux - halfH * vx, y: cy + halfW * uy - halfH * vy }, // TR
            { x: cx + halfW * ux + halfH * vx, y: cy + halfW * uy + halfH * vy }, // BR
            { x: cx - halfW * ux + halfH * vx, y: cy - halfW * uy + halfH * vy }  // BL
        ];
    }

    cropRotatedImage(image, box) {
        // Box: 4 points [{x,y}, ...]
        // Determine width and height
        const w1 = Math.hypot(box[1].x - box[0].x, box[1].y - box[0].y);
        const w2 = Math.hypot(box[3].x - box[2].x, box[3].y - box[2].y);
        const w = (w1 + w2) / 2;

        const h1 = Math.hypot(box[3].x - box[0].x, box[3].y - box[0].y);
        const h2 = Math.hypot(box[2].x - box[1].x, box[2].y - box[1].y);
        const h = (h1 + h2) / 2;

        // 幅を長辺とする(横書き想定)
        // 簡易的アプローチ: 最大寸法を幅として使用
        let dstW = w;
        let dstH = h;

        // Canvas size
        // Add padding
        const padding = Math.max(4, Math.round(Math.min(w, h) * 0.1));
        dstW += padding * 2;
        dstH += padding * 2;

        const canvas = new OffscreenCanvas(Math.round(dstW), Math.round(dstH));
        const ctx = canvas.getContext('2d');

        // Center of the source box
        const cx = (box[0].x + box[2].x) / 2;
        const cy = (box[0].y + box[2].y) / 2;

        // 回転角度を計算 (0-1辺を幅/上辺と仮定)
        // PCA結果の0->1ベクトルは主軸に沿っていると想定
        const angle = Math.atan2(box[1].y - box[0].y, box[1].x - box[0].x);

        ctx.translate(dstW / 2, dstH / 2);
        ctx.rotate(-angle); // テキストを水平にするため逆回転

        // 回転矩形抽出の手順:
        // 1. キャンバス中心へ移動
        // 2. 角度分逆回転 (軸合わせ)
        // 3. 画像をオフセット位置に描画

        ctx.rotate(-angle);
        ctx.translate(-cx, -cy);
        ctx.drawImage(image, 0, 0);

        return canvas;
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

            const yDiff = Math.abs(prev.centerY - curr.centerY);
            const avgHeight = (prev.height + curr.height) / 2;

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

    // --- 検出ロジック ---

    async detectText(image) { // image は OffscreenCanvas
        // 画像の前処理 (Resize & Normalize)
        const { tensor, ratioH, ratioW, newH, newW } = await this.preprocessDet(image);

        // 推論実行
        const feeds = { [this.detSession.inputNames[0]]: tensor };
        const results = await this.detSession.run(feeds);
        const output = results[this.detSession.outputNames[0]]; // shape: [1, 1, H, W]

        // 後処理 (Contour based)
        const mapData = output.data;
        // 出力形状は [1, 1, newH, newW]
        const boxes = this.postprocessDetContours(mapData, newW, newH, ratioW, ratioH);

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

        // Tensor作成 (NCHW形式, 正規化)
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

    /**
     * 輪郭検出と回転ボックス処理
     */
    postprocessDetContours(mapData, width, height, ratioW, ratioH) {
        const boxes = [];
        const visited = new Uint8Array(width * height);
        const points = [];

        // 1. 閾値処理と連結成分探索
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (mapData[idx] > this.detDbThresh && visited[idx] === 0) {
                    // 新規コンポーネントのBFS探索開始
                    const componentPoints = [];
                    const queue = [idx];
                    visited[idx] = 1;

                    let scoreSum = 0;

                    while (queue.length > 0) {
                        const currIdx = queue.shift();
                        const cx = currIdx % width;
                        const cy = Math.floor(currIdx / width);
                        componentPoints.push({ x: cx, y: cy });

                        scoreSum += mapData[currIdx];

                        // 8近傍探索
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const ny = cy + dy;
                                const nx = cx + dx;
                                if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                                    const nIdx = ny * width + nx;
                                    if (visited[nIdx] === 0 && mapData[nIdx] > this.detDbThresh) {
                                        visited[nIdx] = 1;
                                        queue.push(nIdx);
                                    }
                                }
                            }
                        }
                    }

                    // 2. 微小領域を除去
                    if (componentPoints.length < 10) continue;

                    // 3. スコアフィルタリング
                    const meanScore = scoreSum / componentPoints.length;
                    if (meanScore < this.detDbBoxThresh) continue;

                    // 4. 回転バウンディングボックス取得 (PCA)
                    const box = this.getMinAreaRect(componentPoints);
                    // ボックス座標 (4点)

                    // 4. ボックスの平均スコアでフィルタリング
                    // (簡易実装: ブロブの存在を重視)

                    // 5. 元サイズへ復元
                    const scaledBox = box.map(p => ({
                        x: Math.round(p.x / ratioW),
                        y: Math.round(p.y / ratioH)
                    }));

                    // ボックス検証
                    const w = Math.hypot(scaledBox[0].x - scaledBox[1].x, scaledBox[0].y - scaledBox[1].y);
                    const h = Math.hypot(scaledBox[1].x - scaledBox[2].x, scaledBox[1].y - scaledBox[2].y);

                    if (Math.min(w, h) < 5) continue; // 細長すぎるため除外

                    boxes.push(scaledBox);
                }
            }
        }
        return boxes;
    }

    /**
     * PCAによる回転バウンディングボックス計算
     */
    getMinAreaRect(points) {
        if (points.length === 0) return [];

        // 中心 (平均) の計算
        let sumX = 0, sumY = 0;
        for (const p of points) {
            sumX += p.x;
            sumY += p.y;
        }
        const meanX = sumX / points.length;
        const meanY = sumY / points.length;

        // 共分散行列の計算
        let c11 = 0, c12 = 0, c22 = 0;
        for (const p of points) {
            const dx = p.x - meanX;
            const dy = p.y - meanY;
            c11 += dx * dx;
            c12 += dx * dy;
            c22 += dy * dy;
        }
        c11 /= points.length;
        c12 /= points.length;
        c22 /= points.length;

        // 固有ベクトル計算
        // 固有値計算
        const L1 = (c11 + c22 + Math.sqrt((c11 - c22) ** 2 + 4 * c12 * c12)) / 2;
        const L2 = (c11 + c22 - Math.sqrt((c11 - c22) ** 2 + 4 * c12 * c12)) / 2;

        // 第1固有ベクトル (主軸)
        let angle = 0;
        if (Math.abs(c12) > 1e-6) {
            angle = Math.atan2(L1 - c11, c12);
        } else if (c11 >= c22) {
            angle = 0; // X-axis
        } else {
            angle = Math.PI / 2; // Y-axis
        }

        // 主軸に合わせて点を回転
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        for (const p of points) {
            const dx = p.x - meanX;
            const dy = p.y - meanY;
            const rx = dx * cos - dy * sin;
            const ry = dx * sin + dy * cos;

            if (rx < minX) minX = rx;
            if (rx > maxX) maxX = rx;
            if (ry < minY) minY = ry;
            if (ry > maxY) maxY = ry;
        }

        // 回転空間でのボックス頂点算出
        const corners = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY }
        ];

        // 元の空間へ戻す
        const result = corners.map(p => {
            const x = p.x * Math.cos(angle) - p.y * Math.sin(angle) + meanX;
            const y = p.x * Math.sin(angle) + p.y * Math.cos(angle) + meanY;
            return { x, y };
        });

        // 頂点順序の整合性確認
        // (簡易ソートや回転方向チェックなどが必要な場合があるが、ここではPCA順序を使用) 
        // 標準順序: Y優先、次にXでソート?
        // 安全のため単純なソートを実装: 左上を探す。
        // しかし上記のPCAループ(minX...maxY)は実際には矩形を反時計回りまたは時計回りにトレースしている。
        // 単に4点を返すことにする。
        return result;
    }


    // --- 認識ロジック ---

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
        // 正規化: (x/255 - 0.5) / 0.5
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
        // 形状: [1, seq_len, num_classes]
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

    // --- ヘルパー ---

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
        if (typeof params.paddingRatio === 'number') this.paddingRatio = params.paddingRatio;
        if (typeof params.preprocessContrast === 'number') this.preprocessContrast = params.preprocessContrast;
        if (typeof params.limitSideLen === 'number') this.limitSideLen = params.limitSideLen;

        if (typeof params.enableContrast === 'boolean') this.enableContrast = params.enableContrast;
        if (typeof params.enableSharpening === 'boolean') this.enableSharpening = params.enableSharpening;
    }
}

// グローバルスコープへ登録
self.OnnxOCR = OnnxOCR;
