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

        // Scale factors for output
        const scaleX = originalImage.width / image.width;
        const scaleY = originalImage.height / image.height;

        // 2. テキスト認識 (Recognition)
        const results = [];
        for (const box of boxes) {
            // box is 4 points: [{x,y}, {x,y}, {x,y}, {x,y}]

            // Calculate width and height of the box
            const edge1 = Math.hypot(box[1].x - box[0].x, box[1].y - box[0].y);
            const edge2 = Math.hypot(box[2].x - box[1].x, box[2].y - box[1].y);

            // Assume longer edge is width (usually true for text)
            // But checking orientation helps. 
            // For now, prepare crop

            // ボックス部分の画像を切り出し (Rotated Crop)
            const cropCanvas = this.cropRotatedImage(image, box);

            // 認識実行
            const { text, score } = await this.recognizeText(cropCanvas);

            if (text.length > 0 && score > this.recScoreThresh) {
                // Scale box back to original coordinates
                const outBox = box.map(p => ({
                    x: Math.round(p.x * scaleX),
                    y: Math.round(p.y * scaleY)
                }));

                // Calculate Padded Box (for visualization)
                const paddedBox = this.getPaddedBox(box);
                const outPaddedBox = paddedBox.map(p => ({
                    x: Math.round(p.x * scaleX),
                    y: Math.round(p.y * scaleY)
                }));

                // Helper to get bounding rect for sorting
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
                    box: outBox, // 4 points
                    paddedBox: outPaddedBox, // Padded area
                    // Metadata for sorting
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
        // Calculate dimensions same as cropRotatedImage
        const w1 = Math.hypot(box[1].x - box[0].x, box[1].y - box[0].y);
        const w2 = Math.hypot(box[3].x - box[2].x, box[3].y - box[2].y);
        const w = (w1 + w2) / 2;

        const h1 = Math.hypot(box[3].x - box[0].x, box[3].y - box[0].y);
        const h2 = Math.hypot(box[2].x - box[1].x, box[2].y - box[1].y);
        const h = (h1 + h2) / 2;

        const padding = Math.max(4, Math.round(Math.min(w, h) * 0.1));

        // Center
        const cx = (box[0].x + box[2].x) / 2;
        const cy = (box[0].y + box[2].y) / 2;

        // Angle (from top edge)
        const angle = Math.atan2(box[1].y - box[0].y, box[1].x - box[0].x);

        // Calculate unit vectors
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const vx = -Math.sin(angle); // Perpendicular (90 deg counter-clockwise from x?) 
        const vy = Math.cos(angle);
        // Note: Canvas Y is down. Standard rotation...
        // If angle is direction of 0->1. 
        // 1->2 is usually +90deg (clockwise in screen coords?)
        // Let's check: 0->1 is "Right". 1->2 is "Down" (y increases).
        // 0->1 vector: (1, 0). angle 0.
        // 1->2 vector: (0, 1). 
        // If I use (-sin, cos) for (0, 1) -> (0, 1). correct.

        // Half dimensions for padded box
        const halfW = (w / 2) + padding;
        const halfH = (h / 2) + padding;

        // Corners: TL, TR, BR, BL
        // TL: Center - halfW*u - halfH*v
        // TR: Center + halfW*u - halfH*v
        // BR: Center + halfW*u + halfH*v
        // BL: Center - halfW*u + halfH*v
        // Wait, "Top" is -v direction? 
        // In screen coords, "Down" is +Y. 
        // If 0-1 is Top edge, then center is below it.
        // So 0-1 is at -halfH relative to Center?
        // Let's verify direction. 
        // Center is average. 0 is TL.
        // Vector C->0 should be roughly (-halfW, -halfH).
        // Let's use signs that match the relative position of box[0] to Center.

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

        // Ensure width is the longer side (if logic allows vertical text, this might need check)
        // For standard horizontal text detection, width is usually > height.
        // If h > w, it might be vertical text or just very short text.
        // Let's assume the box points are ordered TL, TR, BR, BL relative to text direction?
        // Our PCA implementation returns points in counter-clockwise/clockwise order but start point varies.
        // We need to properly orient the text.

        // Find top-left most point to be index 0?
        // PCA returns an object oriented to the main axis.

        // Simplified approach: Clip the max dimension as W.
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

        // Calculate angle
        // Assume edge 0-1 is the top edge (width)
        // If w < h, maybe 0-1 is actually the side edge?
        // Let's assume 0-1 corresponds to the first eigenvector direction.

        // Note on PCA result:
        // We constructed: TL, TR, BR, BL in rotated space (minX, minY)...
        // So 0->1 is vector along X-axis in rotated space.
        // If we assumed Angle 0 is X-axis, then 0-1 is along angle.

        const angle = Math.atan2(box[1].y - box[0].y, box[1].x - box[0].x);

        ctx.translate(dstW / 2, dstH / 2);
        ctx.rotate(-angle); // Rotate opposite to bring text horizontal? 
        // If text is rotated +30deg, we need to rotate context -30deg to align?
        // Wait, drawImage draws source to dest.
        // We want to transform the coordinates.
        // Easier: Transform the canvas so that drawing the image at (cx, cy) makes it upright?

        // Correct approach for 'extracting' rotated rect:
        // 1. Translate canvas origin to center.
        // 2. Rotate canvas by -angle (to align the box with canvas axes).
        // 3. Draw image offset by -cx, -cy.

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

    // --- Detection Logic ---

    async detectText(image) { // image is OffscreenCanvas
        // 画像の前処理 (Resize & Normalize)
        const { tensor, ratioH, ratioW, newH, newW } = await this.preprocessDet(image);

        // 推論実行
        const feeds = { [this.detSession.inputNames[0]]: tensor };
        const results = await this.detSession.run(feeds);
        const output = results[this.detSession.outputNames[0]]; // shape: [1, 1, H, W]

        // 後処理 (Contour based)
        const mapData = output.data;
        // Output shape is [1, 1, newH, newW]
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

    /**
     * Contours & Rotated Box Implementation
     */
    postprocessDetContours(mapData, width, height, ratioW, ratioH) {
        const boxes = [];
        const visited = new Uint8Array(width * height);
        const points = [];

        // 1. Threshold & Find connected components
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (mapData[idx] > this.detDbThresh && visited[idx] === 0) {
                    // Start BFS for a new component
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

                        // 8-neighbor connectivity
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

                    // 2. Filter small components
                    if (componentPoints.length < 10) continue;

                    // 3. Score filter
                    const meanScore = scoreSum / componentPoints.length;
                    if (meanScore < this.detDbBoxThresh) continue;

                    // 4. Get Rotated Bounding Box (PCA)
                    const box = this.getMinAreaRect(componentPoints);
                    // box is 4 points: [{x,y}, {x,y}, {x,y}, {x,y}]

                    // 4. Score filter (Mean score of the box)
                    // (Simplified: just use blob existence as strong evidence, or implement mask mean if needed)

                    // 5. Scale back to original image size
                    const scaledBox = box.map(p => ({
                        x: Math.round(p.x / ratioW),
                        y: Math.round(p.y / ratioH)
                    }));

                    // Box validation check
                    const w = Math.hypot(scaledBox[0].x - scaledBox[1].x, scaledBox[0].y - scaledBox[1].y);
                    const h = Math.hypot(scaledBox[1].x - scaledBox[2].x, scaledBox[1].y - scaledBox[2].y);

                    if (Math.min(w, h) < 5) continue; // Too thin

                    boxes.push(scaledBox);
                }
            }
        }
        return boxes;
    }

    /**
     * Calculate Rotated Bounding Box using PCA
     */
    getMinAreaRect(points) {
        if (points.length === 0) return [];

        // Calculate center (mean)
        let sumX = 0, sumY = 0;
        for (const p of points) {
            sumX += p.x;
            sumY += p.y;
        }
        const meanX = sumX / points.length;
        const meanY = sumY / points.length;

        // Calculate Covariance Matrix
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

        // Calculate Eigenvectors
        // Lambda calculation
        const L1 = (c11 + c22 + Math.sqrt((c11 - c22) ** 2 + 4 * c12 * c12)) / 2;
        const L2 = (c11 + c22 - Math.sqrt((c11 - c22) ** 2 + 4 * c12 * c12)) / 2;

        // Eigenvector 1 (Main axis)
        let angle = 0;
        if (Math.abs(c12) > 1e-6) {
            angle = Math.atan2(L1 - c11, c12);
        } else if (c11 >= c22) {
            angle = 0; // X-axis
        } else {
            angle = Math.PI / 2; // Y-axis
        }

        // Rotate points to align with main axis
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

        // Construct Box corners in rotated space
        const corners = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY }
        ];

        // Rotate back to original space
        const result = corners.map(p => {
            const x = p.x * Math.cos(angle) - p.y * Math.sin(angle) + meanX;
            const y = p.x * Math.sin(angle) + p.y * Math.cos(angle) + meanY;
            return { x, y };
        });

        // Ensure consistent point ordering (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
        // Note: Simple sorting by x/y might fail for rotated boxes.
        // The PCA approach generates points in order: TL, TR, BR, BL relative to the rotated frame.
        // We just need to check if the box width > height. If not (vertical text?), keep it as is.
        // PaddleOCR expects specific order? 
        // Standard order: Sort by Y first then X?
        // Let's implement a simple sort to be safe: Find top-left-ish.
        // But the PCA loop above (minX...maxY) actually traces the rectangle counter-clockwise or clockwise.
        // Let's just return the 4 points.
        return result;
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
