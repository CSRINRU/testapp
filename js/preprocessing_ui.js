
import { ocrEngine } from './ocr.js';

export function setupPreprocessingUI(onAnalyzeCallback, onCancelCallback) {
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
    let currentImage = null; // Image object
    let currentLimitSide = 2000;

    // Helpers
    const bindSlider = (slider, display, paramName, callback) => {
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            display.textContent = val;
            const params = {};
            params[paramName] = val;
            ocrEngine.setParams(params);

            if (callback) callback(val);
        });
    };

    const bindCheckbox = (checkbox, paramName, callback) => {
        checkbox.addEventListener('change', (e) => {
            const val = e.target.checked;
            const params = {};
            params[paramName] = val;
            ocrEngine.setParams(params);
            if (callback) callback();
        });
    };

    // Bindings
    bindSlider(sliderContrast, dispContrast, 'preprocessContrast', updatePreview);
    bindCheckbox(checkContrast, 'enableContrast', updatePreview);

    bindCheckbox(checkSharpening, 'enableSharpening', updatePreview);

    bindSlider(sliderLimitSide, dispLimitSide, 'limitSideLen', (val) => {
        currentLimitSide = val;
        updatePreview(); // Re-draw frame
    });

    bindSlider(sliderDetThresh, dispDetThresh, 'detDbThresh');
    bindSlider(sliderBoxThresh, dispBoxThresh, 'detDbBoxThresh');
    bindSlider(sliderRecThresh, dispRecThresh, 'recScoreThresh');

    cancelBtn.addEventListener('click', () => {
        hide();
        if (onCancelCallback) onCancelCallback();
    });

    analyzeBtn.addEventListener('click', () => {
        hide();
        // Proceed with OCR
        if (onAnalyzeCallback) onAnalyzeCallback();
    });

    function show(imageDataUrl) {
        section.classList.remove('hidden');
        document.querySelector('.camera-container').classList.add('hidden'); // Hide camera view

        // Load image for processing
        const img = new Image();
        img.onload = () => {
            currentImage = img;

            // Init controls from current engine values
            sliderContrast.value = ocrEngine.preprocessContrast;
            dispContrast.textContent = ocrEngine.preprocessContrast;
            checkContrast.checked = ocrEngine.enableContrast;

            checkSharpening.checked = ocrEngine.enableSharpening;

            sliderLimitSide.value = ocrEngine.limitSideLen;
            dispLimitSide.textContent = ocrEngine.limitSideLen;
            currentLimitSide = ocrEngine.limitSideLen;

            sliderDetThresh.value = ocrEngine.detDbThresh;
            dispDetThresh.textContent = ocrEngine.detDbThresh;

            sliderBoxThresh.value = ocrEngine.detDbBoxThresh;
            dispBoxThresh.textContent = ocrEngine.detDbBoxThresh;

            sliderRecThresh.value = ocrEngine.recScoreThresh;
            dispRecThresh.textContent = ocrEngine.recScoreThresh;

            updatePreview();
        };
        img.src = imageDataUrl;
    }

    function hide() {
        section.classList.add('hidden');
        document.querySelector('.camera-container').classList.remove('hidden'); // Show camera view back
    }

    function updatePreview() {
        if (!currentImage) return;

        // 1. Get preprocessed image from Engine
        const tempCanvas = ocrEngine.preprocessImage(currentImage);

        // 2. Setup Display Canvas
        processedCanvas.width = tempCanvas.width;
        processedCanvas.height = tempCanvas.height;
        const ctx = processedCanvas.getContext('2d');

        // 3. Draw Image
        ctx.drawImage(tempCanvas, 0, 0);

        // 4. Draw Limit Frame if needed
        drawLimitFrame(ctx, tempCanvas.width, tempCanvas.height);
    }

    function drawLimitFrame(ctx, w, h) {
        // limitSideLen logic matches ocrEngine logic:
        // if max(w,h) > limit, it will be resized.
        // We want to show what PART of the image fits or how big the limit is relative to the current image.
        // Wait, ocrEngine logic works by resizing the WHOLE image to fit WITHIN the limit.
        // So drawing a frame of size `limit` on the image helps visualize if the image is LARGER than the limit.
        // If image is larger than limit, it will be downscaled.
        // So we should draw a rectangle of size limit x limit (or aspect ratio respected) to show the scale?
        // Actually, if w > limit or h > limit, it will be downscaled.
        // A simple way is: if max(w,h) > limit, draw a Red Border around the edge indicating "Downscaling will occur".
        // Or, more intuitively: Draw a dashed box of size `limit` centered on the image? 
        // If the box is smaller than the image, it implies downscaling.

        const limit = currentLimitSide;
        const isDownscaling = Math.max(w, h) > limit;

        if (isDownscaling) {
            // Draw a red border to indicate downscaling
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 10;
            ctx.strokeRect(0, 0, w, h);

            // Also text indicating resizing
            ctx.fillStyle = 'red';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Resize to ${limit}px`, w / 2, 50);
        } else {
            // Draw a green border to indicate OK
            ctx.strokeStyle = 'lime';
            ctx.lineWidth = 5;
            ctx.strokeRect(0, 0, w, h);
        }
    }

    return { show };
}
