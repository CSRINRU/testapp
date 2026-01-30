import { CroppingUI } from './cropping_ui.js';

export const GeminiPreviewUI = {
    // State
    initialized: false,
    currentImageDataUrl: null,
    currentParams: {
        limitSideLen: 1600
    },
    onSend: null,
    onCancel: null,

    // UI Elements
    elements: {},
    croppingUI: null,

    init() {
        if (this.initialized) return;

        const section = document.getElementById('gemini-preview-section');
        const canvas = document.getElementById('geminiPreviewCanvas');

        this.elements = {
            section,
            canvas,
            sliderLimitSide: document.getElementById('gemini-slider-limitSide'),
            dispLimitSide: document.getElementById('gemini-disp-limitSide'),
            cancelBtn: document.getElementById('geminiPreviewCancelBtn'),
            sendBtn: document.getElementById('geminiPreviewSendBtn')
        };

        if (!section || !canvas) {
            console.error('Gemini Preview UI elements not found');
            return;
        }

        this.bindEvents();
        this.bindEvents();

        // Initialize CroppingUI
        this.croppingUI = new CroppingUI(this.elements.canvas, 1.0, () => {
            // Redraw callback
            if (this.currentPreviewImage && this.elements.canvas) {
                const ctx = this.elements.canvas.getContext('2d');
                // Ensure we clear/overwrite
                ctx.globalCompositeOperation = 'copy';
                const limit = this.currentParams.limitSideLen;
                if (this.currentDrawSize) {
                    ctx.drawImage(this.currentPreviewImage, 0, 0, this.currentDrawSize.width, this.currentDrawSize.height);
                }
                ctx.globalCompositeOperation = 'source-over';
            }
        });

        this.initialized = true;
    },

    bindEvents() {
        // Slider
        if (this.elements.sliderLimitSide) {
            this.elements.sliderLimitSide.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                this.currentParams.limitSideLen = val;
                if (this.elements.dispLimitSide) {
                    this.elements.dispLimitSide.textContent = val;
                }
                this.updatePreview();
            });
        }

        // Buttons
        if (this.elements.cancelBtn) {
            this.elements.cancelBtn.addEventListener('click', () => {
                this.hide();
                if (this.onCancel) this.onCancel();
            });
        }

        if (this.elements.sendBtn) {
            this.elements.sendBtn.addEventListener('click', () => {
                this.send();
            });
        }
    },

    show(imageDataUrl, onSend, onCancel) {
        if (!this.initialized) this.init();

        this.currentImageDataUrl = imageDataUrl;
        this.onSend = onSend;
        this.onCancel = onCancel;

        this.elements.section.classList.remove('hidden');

        if (this.croppingUI) {
            this.croppingUI.imageWidth = 0; // Force reset
        }

        // Hide camera container if visible
        const container = document.getElementById('camera-container');
        if (container) {
            container.classList.add('hidden-camera');
            container.classList.add('hidden');
        }

        this.updatePreview();
    },

    hide() {
        if (this.elements.section) this.elements.section.classList.add('hidden');

        // Restore camera container
        const camContainer = document.querySelector('.camera-container');
        if (camContainer) {
            camContainer.classList.remove('hidden');
            camContainer.classList.remove('hidden-camera');
        }
    },

    async updatePreview() {
        if (!this.currentImageDataUrl || !this.elements.canvas) return;

        const img = new Image();
        img.onload = () => {
            const limit = this.currentParams.limitSideLen;
            const { width, height } = this.calculateSize(img.width, img.height, limit);
            this.currentDrawSize = { width, height };
            this.currentPreviewImage = img; // Store for redraw

            const cvs = this.elements.canvas;
            cvs.width = width;
            cvs.height = height;
            const ctx = cvs.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Draw resolution info
            // this.drawInfo(ctx, width, height); // Disable old info

            if (this.croppingUI) {
                if (this.croppingUI.imageWidth !== width || this.croppingUI.imageHeight !== height) {
                    this.croppingUI.setImageSize(width, height);
                }
                this.croppingUI.draw();
            }
        };
        img.src = this.currentImageDataUrl;
    },

    calculateSize(w, h, limit) {
        if (w <= limit && h <= limit) return { width: w, height: h };

        let newW = w;
        let newH = h;

        if (w > h) {
            if (w > limit) {
                newW = limit;
                newH = Math.round(h * (limit / w));
            }
        } else {
            if (h > limit) {
                newH = limit;
                newW = Math.round(w * (limit / h));
            }
        }
        return { width: newW, height: newH };
    },

    drawInfo(ctx, w, h) {
        // 画面上のテキストサイズを一貫させるためのスケーリング係数を計算
        const displayW = this.elements.canvas.clientWidth || w;
        const safeDisplayW = displayW > 0 ? displayW : w;
        const scale = w / safeDisplayW;

        // CSSピクセル単位の目標サイズ
        const targetFontSize = 14; // Geminiプレビューは少し大きめでも良いが、プロと合わせるなら8-12程度
        const fontSize = Math.max(12, Math.round(targetFontSize * scale));
        const padding = Math.round(5 * scale);
        const margin = Math.round(5 * scale);

        const text = `${w} x ${h}`;

        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const metrics = ctx.measureText(text);
        const bgW = metrics.width + padding * 2;
        const bgH = fontSize * 1.4;

        // Margin from top-left
        const bgX = margin;
        const bgY = margin;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(bgX, bgY, bgW, bgH);

        ctx.fillStyle = '#00ff00';
        ctx.fillText(text, bgX + padding, bgY + (bgH - fontSize) / 2);
    },

    send() {
        if (!this.elements.canvas) return;

        // Get resized image from canvas
        let resizedDataUrl;
        if (this.croppingUI) {
            const croppedCanvas = this.croppingUI.getCroppedCanvas(this.elements.canvas);
            resizedDataUrl = croppedCanvas.toDataURL('image/jpeg', 0.9);
        } else {
            resizedDataUrl = this.elements.canvas.toDataURL('image/jpeg', 0.9);
        }

        this.hide();
        if (this.onSend) {
            this.onSend(resizedDataUrl);
        }
    }
};
