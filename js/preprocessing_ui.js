
import { getPreprocessedPreview } from './ocr.js';
import { defaultOCRParams } from './constants.js';
import { CroppingUI } from './cropping_ui.js';

export const PreprocessingUI = {
    // State
    initialized: false,
    currentImageDataUrl: null,
    currentParams: { ...defaultOCRParams }, // インポートしたデフォルト値をベースに使用
    currentOcrMethod: 'local', // 'local' or 'gemini'
    onAnalyze: null,
    onCancel: null,
    onAnalyze: null,
    onCancel: null,
    debounceTimer: null,
    croppingUI: null,

    // UI Elements
    elements: {},

    // LocalStorage Key
    STORAGE_KEY: 'budget_book_ocr_params',

    init() {
        if (this.initialized) return;

        const section = document.getElementById('preprocessing-section');
        const processedCanvas = document.getElementById('prepProcessedCanvas');

        // Controls
        this.elements = {
            section,
            processedCanvas,
            sliderContrast: document.getElementById('slider-contrast'),
            checkContrast: document.getElementById('check-contrast'),
            dispContrast: document.getElementById('disp-contrast'),
            checkSharpening: document.getElementById('check-sharpening'),
            sliderLimitSide: document.getElementById('slider-limitSide'),
            dispLimitSide: document.getElementById('disp-limitSide'),
            sliderDetThresh: document.getElementById('slider-detThresh'),
            dispDetThresh: document.getElementById('disp-detThresh'),
            sliderBoxThresh: document.getElementById('slider-boxThresh'),
            dispBoxThresh: document.getElementById('disp-boxThresh'),
            sliderRecThresh: document.getElementById('slider-recThresh'),
            dispRecThresh: document.getElementById('disp-recThresh'),
            sliderPadding: document.getElementById('slider-padding'),
            dispPadding: document.getElementById('disp-padding'),
            cancelBtn: document.getElementById('prepCancelBtn'),
            analyzeBtn: document.getElementById('prepAnalyzeBtn'),
            tabBtns: document.querySelectorAll('.prep-tab-btn'),
            tabContents: document.querySelectorAll('.prep-tab-content'),
            methodLocal: document.getElementById('method-local'),
            methodGemini: document.getElementById('method-gemini'),
            geminiWarning: document.getElementById('gemini-warning')
        };

        if (!section || !processedCanvas) {
            console.error('Preprocessing UI elements not found');
            return;
        }

        // Load saved params or use defaults
        this.loadParams();

        // Initialize CroppingUI
        this.croppingUI = new CroppingUI(this.elements.processedCanvas, 1.0, () => {
            // Redraw base image
            if (this.currentPreviewBitmap && this.elements.processedCanvas) {
                const ctx = this.elements.processedCanvas.getContext('2d');
                ctx.globalCompositeOperation = 'copy'; // Replace content
                ctx.drawImage(this.currentPreviewBitmap, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
            }
        });

        this.bindEvents();
        this.initialized = true;
    },

    loadParams() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // 全てのキーが存在することを確認するためデフォルト値とマージ
                // パース結果が有効なオブジェクトか確認
                if (parsed && typeof parsed === 'object') {
                    this.currentParams = { ...defaultOCRParams, ...parsed };
                    console.log('Loaded OCR params:', this.currentParams);
                }
            }
        } catch (e) {
            console.warn('Failed to load OCR params:', e);
            // Fallback to defaults is already handled by initial state
        }
    },

    saveParams() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentParams));
        } catch (e) {
            console.warn('Failed to save OCR params:', e);
        }
    },

    bindEvents() {
        // Helpers
        const bindSlider = (slider, display, paramName, needsPreview = false) => {
            if (!slider) return;
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (display) display.textContent = val;
                this.currentParams[paramName] = val;
                this.saveParams(); // 変更時に保存
                if (needsPreview) this.requestPreviewUpdate();
            });
        };

        const bindCheckbox = (checkbox, paramName, needsPreview = false) => {
            if (!checkbox) return;
            checkbox.addEventListener('change', (e) => {
                const val = e.target.checked;
                this.currentParams[paramName] = val;
                this.saveParams(); // 変更時に保存
                if (needsPreview) this.requestPreviewUpdate();
            });
        };

        // Bindings
        bindSlider(this.elements.sliderContrast, this.elements.dispContrast, 'preprocessContrast', true);
        bindCheckbox(this.elements.checkContrast, 'enableContrast', true);
        bindCheckbox(this.elements.checkSharpening, 'enableSharpening', true);
        bindSlider(this.elements.sliderLimitSide, this.elements.dispLimitSide, 'limitSideLen', true);
        bindSlider(this.elements.sliderDetThresh, this.elements.dispDetThresh, 'detDbThresh', false);
        bindSlider(this.elements.sliderBoxThresh, this.elements.dispBoxThresh, 'detDbBoxThresh', false);
        bindSlider(this.elements.sliderRecThresh, this.elements.dispRecThresh, 'recScoreThresh', false);
        bindSlider(this.elements.sliderPadding, this.elements.dispPadding, 'paddingRatio', false);

        // Buttons
        if (this.elements.cancelBtn) {
            this.elements.cancelBtn.addEventListener('click', () => {
                this.hide();
                if (this.onCancel) this.onCancel();
            });
        }

        if (this.elements.analyzeBtn) {
            this.elements.analyzeBtn.addEventListener('click', () => {
                this.hide();
                // Get cropped image
                let croppedDataUrl = null;
                if (this.croppingUI && this.elements.processedCanvas) {
                    const croppedCanvas = this.croppingUI.getCroppedCanvas(this.elements.processedCanvas);
                    croppedDataUrl = croppedCanvas.toDataURL('image/jpeg');
                }

                // 現在のパラメータと切り抜き画像を返す
                if (this.onAnalyze) this.onAnalyze({ ...this.currentParams, croppedImage: croppedDataUrl });
            });
        }

        // Tab Switching
        this.elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');

                // 全て非アクティブ化
                this.elements.tabBtns.forEach(b => b.classList.remove('active'));
                this.elements.tabContents.forEach(c => c.classList.remove('active'));

                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.add('active');
            });
        });

    },

    checkApiKey() {
        const hasKey = localStorage.getItem('geminiApiKey'); // 直接geminiServiceにアクセスできないため簡易チェック、またはlocalStorageから
        if (!hasKey && this.elements.geminiWarning) {
            this.elements.geminiWarning.classList.remove('hidden');
        } else if (this.elements.geminiWarning) {
            this.elements.geminiWarning.classList.add('hidden');
        }
    },

    show(imageDataUrl, onAnalyze, onCancel, initialParams = null) {
        if (!this.initialized) this.init();

        // Reset cropping UI for new image
        if (this.croppingUI) {
            // We can't set size here because we don't know the processed size yet.
            // But we can reset internal state if needed.
            // Actually `setImageSize` in `updatePreview` will handle reset if dimensions differ.
            // But if dimensions are same as previous image, it won't reset. 
            // Ideally we force reset for a new `show` call.
            this.croppingUI.imageWidth = 0; // Force reset in updatePreview
        }

        this.currentImageDataUrl = imageDataUrl;
        this.onAnalyze = onAnalyze;
        this.onCancel = onCancel;

        if (initialParams) {
            // 明示的なパラメータは保存値をオーバーライドするが、ユーザーが変更しない限りストレージは上書きしない
            this.currentParams = { ...initialParams };
        } else {
            // 念のためストレージから再読み込み、または現在値を維持
            this.loadParams();
        }

        this.elements.section.classList.remove('hidden');
        document.querySelector('.camera-container').classList.add('hidden-camera'); // 一貫したクラスを使用

        // パラメータからUIコントロールを初期化
        this.updateControls();

        this.requestPreviewUpdate();
    },

    updateControls() {
        const p = this.currentParams;
        const e = this.elements;

        if (e.sliderContrast) e.sliderContrast.value = p.preprocessContrast;
        if (e.dispContrast) e.dispContrast.textContent = p.preprocessContrast;
        if (e.checkContrast) e.checkContrast.checked = p.enableContrast;

        if (e.checkSharpening) e.checkSharpening.checked = p.enableSharpening;

        if (e.sliderLimitSide) e.sliderLimitSide.value = p.limitSideLen;
        if (e.dispLimitSide) e.dispLimitSide.textContent = p.limitSideLen;

        if (e.sliderDetThresh) e.sliderDetThresh.value = p.detDbThresh;
        if (e.dispDetThresh) e.dispDetThresh.textContent = p.detDbThresh;

        if (e.sliderBoxThresh) e.sliderBoxThresh.value = p.detDbBoxThresh;
        if (e.dispBoxThresh) e.dispBoxThresh.textContent = p.detDbBoxThresh;

        if (e.sliderRecThresh) e.sliderRecThresh.value = p.recScoreThresh;
        if (e.dispRecThresh) e.dispRecThresh.textContent = p.recScoreThresh;

        if (e.sliderPadding) e.sliderPadding.value = p.paddingRatio;
        if (e.dispPadding) e.dispPadding.textContent = p.paddingRatio;
    },

    hide() {
        if (this.elements.section) this.elements.section.classList.add('hidden');
        const camContainer = document.querySelector('.camera-container');
        if (camContainer) {
            camContainer.classList.remove('hidden');
            camContainer.classList.remove('hidden-camera');
        }
    },

    requestPreviewUpdate() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.updatePreview();
        }, 300);
    },

    async updatePreview() {
        if (!this.currentImageDataUrl || !this.elements.processedCanvas) return;

        try {
            // Workerへ前処理リクエスト
            const imageBitmap = await getPreprocessedPreview(this.currentImageDataUrl, this.currentParams);

            // Canvasに描画
            const cvs = this.elements.processedCanvas;
            cvs.width = imageBitmap.width;
            cvs.height = imageBitmap.height;
            const ctx = cvs.getContext('2d');
            ctx.drawImage(imageBitmap, 0, 0);

            // 画像ビットマップを閉じる
            // imageBitmap.close(); // Keep it open for redraws

            // Close previous bitmap if exists
            if (this.currentPreviewBitmap) {
                this.currentPreviewBitmap.close();
            }
            this.currentPreviewBitmap = imageBitmap;

            // Set image size for cropping UI and reset/draw
            if (this.croppingUI) {
                // If the image size changed significantly, or if it's a new image, we might want to reset?
                // For now, simpler to just set size. 
                // However, we only want to reset crop on NEW image load, not on every param change (like contrast).
                // check if dimensions changed
                if (this.croppingUI.imageWidth !== cvs.width || this.croppingUI.imageHeight !== cvs.height) {
                    this.croppingUI.setImageSize(cvs.width, cvs.height);
                }
                this.croppingUI.draw();
            }

            // this.drawLimitFrame(ctx, cvs.width, cvs.height); // Disable old frame
        } catch (e) {
            console.error('Preview Error:', e);
        }
    },

    drawLimitFrame(ctx, w, h) {
        const limit = this.currentParams.limitSideLen;
        const isDownscaling = Math.max(w, h) > limit;

        // 画面上のテキストサイズを一貫させるためのスケーリング係数を計算
        const displayW = this.elements.processedCanvas.clientWidth || w;
        const safeDisplayW = displayW > 0 ? displayW : w;
        const scale = w / safeDisplayW;

        // CSSピクセル単位の目標サイズ
        const targetFontSize = 8;
        const fontSize = Math.max(8, Math.round(targetFontSize * scale));
        const padding = Math.round(3 * scale);
        const margin = Math.round(4 * scale);

        // 解像度テキストの描画
        const text = `${w} x ${h}`;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // 背景
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;

        const bgX = margin;
        const bgY = margin;
        const bgW = textWidth + (padding * 2);
        const bgH = fontSize * 1.4;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(bgX, bgY, bgW, bgH);

        // 文字
        ctx.fillStyle = '#00ff00';
        ctx.fillText(text, bgX + padding, bgY + (bgH - fontSize) / 2);

        // 線幅のスケーリング
        const baseLineWidth = isDownscaling ? 2 : 1;
        ctx.lineWidth = Math.max(1, Math.round(baseLineWidth * scale));

        if (isDownscaling) {
            ctx.strokeStyle = 'red';
            ctx.strokeRect(0, 0, w, h);
        } else {
            ctx.strokeStyle = 'lime';
            ctx.strokeRect(0, 0, w, h);
        }
    }
};

