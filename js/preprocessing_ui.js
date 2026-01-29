
import { getPreprocessedPreview } from './ocr.js';

export function setupPreprocessingUI(onAnalyzeCallback, onCancelCallback, defaultParams) {
    const section = document.getElementById('preprocessing-section');
    const processedCanvas = document.getElementById('prepProcessedCanvas');

    // Controls
    const sliderContrast = document.getElementById('slider-contrast');
    const checkContrast = document.getElementById('check-contrast');
    const dispContrast = document.getElementById('disp-contrast');

    const checkSharpening = document.getElementById('check-sharpening');

    const sliderLimitSide = document.getElementById('slider-limitSide');
    const dispLimitSide = document.getElementById('disp-limitSide');

    const sliderDetThresh = document.getElementById('slider-detThresh');
    const dispDetThresh = document.getElementById('disp-detThresh');

    const sliderBoxThresh = document.getElementById('slider-boxThresh');
    const dispBoxThresh = document.getElementById('disp-boxThresh');

    const sliderRecThresh = document.getElementById('slider-recThresh');
    const dispRecThresh = document.getElementById('disp-recThresh');

    const cancelBtn = document.getElementById('prepCancelBtn');
    const analyzeBtn = document.getElementById('prepAnalyzeBtn');

    if (!section || !processedCanvas) return;

    // State
    let currentImageDataUrl = null;
    let currentParams = { ...defaultParams };
    let previewPending = false;

    // Helpers
    const bindSlider = (slider, display, paramName, needsPreview = false) => {
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            display.textContent = val;
            currentParams[paramName] = val;
            if (needsPreview) requestPreviewUpdate();
        });
    };

    const bindCheckbox = (checkbox, paramName, needsPreview = false) => {
        checkbox.addEventListener('change', (e) => {
            const val = e.target.checked;
            currentParams[paramName] = val;
            if (needsPreview) requestPreviewUpdate();
        });
    };

    // Tab Switching Logic
    const tabBtns = document.querySelectorAll('.prep-tab-btn');
    const tabContents = document.querySelectorAll('.prep-tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            // Deactivate all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Activate target
            btn.classList.add('active');
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    // Bindings
    bindSlider(sliderContrast, dispContrast, 'preprocessContrast', true);
    bindCheckbox(checkContrast, 'enableContrast', true);

    bindCheckbox(checkSharpening, 'enableSharpening', true);

    bindSlider(sliderLimitSide, dispLimitSide, 'limitSideLen', true);

    bindSlider(sliderDetThresh, dispDetThresh, 'detDbThresh', false);
    bindSlider(sliderBoxThresh, dispBoxThresh, 'detDbBoxThresh', false);
    bindSlider(sliderRecThresh, dispRecThresh, 'recScoreThresh', false);

    cancelBtn.addEventListener('click', () => {
        hide();
        if (onCancelCallback) onCancelCallback();
    });

    analyzeBtn.addEventListener('click', () => {
        hide();
        // Return current params
        if (onAnalyzeCallback) onAnalyzeCallback(currentParams);
    });

    function show(imageDataUrl) {
        currentImageDataUrl = imageDataUrl;
        section.classList.remove('hidden');
        document.querySelector('.camera-container').classList.add('hidden');

        // Init controls
        sliderContrast.value = currentParams.preprocessContrast;
        dispContrast.textContent = currentParams.preprocessContrast;
        checkContrast.checked = currentParams.enableContrast;

        checkSharpening.checked = currentParams.enableSharpening;

        sliderLimitSide.value = currentParams.limitSideLen;
        dispLimitSide.textContent = currentParams.limitSideLen;

        sliderDetThresh.value = currentParams.detDbThresh;
        dispDetThresh.textContent = currentParams.detDbThresh;

        sliderBoxThresh.value = currentParams.detDbBoxThresh;
        dispBoxThresh.textContent = currentParams.detDbBoxThresh;

        sliderRecThresh.value = currentParams.recScoreThresh;
        dispRecThresh.textContent = currentParams.recScoreThresh;

        requestPreviewUpdate();
    }

    function hide() {
        section.classList.add('hidden');
        const camContainer = document.querySelector('.camera-container');
        if (camContainer) camContainer.classList.remove('hidden');
    }

    // Debounced Preview Update
    let debounceTimer = null;
    function requestPreviewUpdate() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updatePreview();
        }, 300); // 300ms delay
    }

    async function updatePreview() {
        if (!currentImageDataUrl) return;

        try {
            // Workerへ前処理リクエスト
            const imageBitmap = await getPreprocessedPreview(currentImageDataUrl, currentParams);

            // Canvasに描画
            processedCanvas.width = imageBitmap.width;
            processedCanvas.height = imageBitmap.height;
            const ctx = processedCanvas.getContext('2d');
            ctx.drawImage(imageBitmap, 0, 0);

            // Close bitmap to free memory
            imageBitmap.close();

            drawLimitFrame(ctx, processedCanvas.width, processedCanvas.height);
        } catch (e) {
            console.error('Preview Error:', e);
        }
    }

    function drawLimitFrame(ctx, w, h) {
        const limit = currentParams.limitSideLen;
        const isDownscaling = Math.max(w, h) > limit;

        // Preview canvas is ALREADY resized?
        // Note: preprocessImage function in OnnxOCR applies resizing IF it was part of detection preprocessing, 
        // BUT preprocessImage method specifically handles Contrast/Sharpening.
        // It does NOT resize to limitSideLen. Resizing happens in preprocessDet.
        // So the image displayed here is the full resolution (or original) with contrast applied.

        if (isDownscaling) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 10;
            ctx.strokeRect(0, 0, w, h);

            ctx.fillStyle = 'red';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Resize to ${limit}px`, w / 2, 50);
        } else {
            ctx.strokeStyle = 'lime';
            ctx.lineWidth = 5;
            ctx.strokeRect(0, 0, w, h);
        }
    }

    return { show };
}
