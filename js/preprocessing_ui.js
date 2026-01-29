
import { getPreprocessedPreview } from './ocr.js';
import { defaultOCRParams } from './constants.js';

export const PreprocessingUI = {
    // State
    initialized: false,
    currentImageDataUrl: null,
    currentParams: { ...defaultOCRParams }, // Use imported default params as base
    onAnalyze: null,
    onCancel: null,
    debounceTimer: null,

    // UI Elements
    elements: {},

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
            cancelBtn: document.getElementById('prepCancelBtn'),
            analyzeBtn: document.getElementById('prepAnalyzeBtn'),
            tabBtns: document.querySelectorAll('.prep-tab-btn'),
            tabContents: document.querySelectorAll('.prep-tab-content')
        };

        if (!section || !processedCanvas) {
            console.error('Preprocessing UI elements not found');
            return;
        }

        this.bindEvents();
        this.initialized = true;
    },

    bindEvents() {
        // Helpers
        const bindSlider = (slider, display, paramName, needsPreview = false) => {
            if (!slider) return;
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (display) display.textContent = val;
                this.currentParams[paramName] = val;
                if (needsPreview) this.requestPreviewUpdate();
            });
        };

        const bindCheckbox = (checkbox, paramName, needsPreview = false) => {
            if (!checkbox) return;
            checkbox.addEventListener('change', (e) => {
                const val = e.target.checked;
                this.currentParams[paramName] = val;
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
                // Return current params
                if (this.onAnalyze) this.onAnalyze({ ...this.currentParams });
            });
        }

        // Tab Switching
        this.elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');

                // Deactivate all
                this.elements.tabBtns.forEach(b => b.classList.remove('active'));
                this.elements.tabContents.forEach(c => c.classList.remove('active'));

                // Activate target
                btn.classList.add('active');
                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.add('active');
            });
        });
    },

    show(imageDataUrl, onAnalyze, onCancel, initialParams = null) {
        if (!this.initialized) this.init();

        this.currentImageDataUrl = imageDataUrl;
        this.onAnalyze = onAnalyze;
        this.onCancel = onCancel;

        if (initialParams) {
            this.currentParams = { ...initialParams };
        }
        // If no initial params provided, keep using previous or defaults if initialized differently. 
        // Ideally we should reset to defaults if new session? 
        // For now trusting caller or persistence.

        this.elements.section.classList.remove('hidden');
        document.querySelector('.camera-container').classList.add('hidden');

        // Init controls UI from params
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
    },

    hide() {
        if (this.elements.section) this.elements.section.classList.add('hidden');
        const camContainer = document.querySelector('.camera-container');
        if (camContainer) camContainer.classList.remove('hidden');
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

            // Close bitmap
            imageBitmap.close();

            this.drawLimitFrame(ctx, cvs.width, cvs.height);
        } catch (e) {
            console.error('Preview Error:', e);
        }
    },

    drawLimitFrame(ctx, w, h) {
        const limit = this.currentParams.limitSideLen;
        const isDownscaling = Math.max(w, h) > limit;

        // 解像度テキストの描画
        const text = `${w} x ${h}`;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // 背景
        const textWidth = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, textWidth + 20, 40);

        // 文字
        ctx.fillStyle = '#00ff00';
        ctx.fillText(text, 20, 20);

        if (isDownscaling) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 10;
            ctx.strokeRect(0, 0, w, h);
        } else {
            ctx.strokeStyle = 'lime';
            ctx.lineWidth = 5;
            ctx.strokeRect(0, 0, w, h);
        }
    }
};

