
export const DebugUI = {
    setup() {
        // Initial setup if needed, but show() handles most dynamic content
    },

    show(imageData, ocrResult, onContinue) {
        const debugSection = document.getElementById('debug-ui-section');
        const container = document.getElementById('debug-ui-container');
        const canvas = document.getElementById('debug-canvas');
        const continueBtn = document.getElementById('debug-continue-btn');
        const retryBtn = document.getElementById('debug-retry-btn');
        const textList = document.getElementById('debug-text-list');

        if (!debugSection || !canvas) {
            console.error('Debug UI elements not found');
            if (onContinue) onContinue();
            return;
        }

        // Show section
        debugSection.classList.remove('hidden');

        // Draw Image and Boxes
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            // Adjust canvas size to fit window but maintain aspect ratio
            // Or simple approach: match image size but scale with CSS
            canvas.width = img.width;
            canvas.height = img.height;

            ctx.drawImage(img, 0, 0);

            // Draw boxes
            if (ocrResult.blocks) {
                ctx.lineWidth = 3;
                ocrResult.blocks.forEach(block => {
                    const { box, text, score } = block;
                    // box: [{x,y}, {x,y}, {x,y}, {x,y}] or {x,y,w,h} (fallback)

                    // Color based on confidence (optional)
                    if (score > 0.8) {
                        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
                        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                    } else {
                        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)'; // Orange
                        ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
                    }

                    if (Array.isArray(box)) {
                        // Rotated Box (Polygon)
                        ctx.beginPath();
                        ctx.moveTo(box[0].x, box[0].y);
                        for (let i = 1; i < box.length; i++) {
                            ctx.lineTo(box[i].x, box[i].y);
                        }
                        ctx.closePath();

                        // Main box in Lime
                        ctx.strokeStyle = 'lime';
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        // Orientation indicator (First edge 0-1) in Red
                        // This indicates the "top" or main axis direction
                        ctx.beginPath();
                        ctx.moveTo(box[0].x, box[0].y);
                        ctx.lineTo(box[1].x, box[1].y);
                        ctx.strokeStyle = 'red';
                        ctx.lineWidth = 3;
                        ctx.stroke();

                        ctx.stroke();

                        // ctx.fill(); 

                        // Draw Padded Box (if available)
                        if (block.paddedBox) {
                            const pBox = block.paddedBox;
                            ctx.beginPath();
                            ctx.moveTo(pBox[0].x, pBox[0].y);
                            for (let i = 1; i < pBox.length; i++) {
                                ctx.lineTo(pBox[i].x, pBox[i].y);
                            }
                            ctx.closePath();

                            ctx.strokeStyle = 'cyan';
                            ctx.lineWidth = 1;
                            ctx.setLineDash([5, 5]); // Dashed line
                            ctx.stroke();
                            ctx.setLineDash([]); // Reset
                        }
                    } else {
                        // Fallback for old style box
                        ctx.strokeRect(box.x, box.y, box.w, box.h);
                    }
                });
            }
        };
        img.src = imageData;

        // Populate Text List
        if (textList) {
            textList.innerHTML = '';
            if (ocrResult.blocks) {
                ocrResult.blocks.forEach(block => {
                    const div = document.createElement('div');
                    div.className = 'debug-text-item';
                    const spanText = document.createElement('span');
                    spanText.textContent = block.text;
                    const spanScore = document.createElement('span');
                    spanScore.textContent = `${Math.round(block.score * 100)}%`;
                    spanScore.className = 'debug-score';
                    div.appendChild(spanText);
                    div.appendChild(spanScore);
                    textList.appendChild(div);

                    // Highlight on hover (optional enhancement)
                });
            }
        }

        // Event Listeners
        const handleContinue = () => {
            debugSection.classList.add('hidden');
            if (onContinue) onContinue();
            cleanup();
        };

        const handleRetry = () => {
            debugSection.classList.add('hidden');
            // Simply hide, user is back to camera view or wherever resetView put them.
            // But ideally we want to go back to Preprocessing? 
            // For now, let's just close and let user start over or maybe use browser back if we had history.
            // Since we reset view in error handler, going "Back" usually means cleaning up.
            // In the ocr.js integration, we called resetView() if error, but here we are in success path.
            // If user cancels here, we should probably reset view.

            // To properly go "Back" to preprocessing would require keeping state.
            // For now, treat "Retry" as "Cancel" -> "Reset to Camera".
            // Cancel logic: Hide debug, prep, processing, show camera
            const preview = document.getElementById('selectedImagePreview');
            const video = document.getElementById('cameraPreview');
            const overlay = document.getElementById('cameraOverlay');
            const processingSection = document.getElementById('processingSection');
            const prepSection = document.getElementById('preprocessing-section');
            const cameraContainer = document.getElementById('camera-container');

            if (preview) preview.classList.add('hidden');
            if (processingSection) processingSection.classList.add('hidden');
            if (prepSection) prepSection.classList.add('hidden');

            // Show Camera
            if (cameraContainer) {
                cameraContainer.classList.remove('hidden');
                cameraContainer.classList.remove('hidden-camera');
            }
            if (video) video.classList.remove('hidden');
            if (overlay) overlay.classList.remove('hidden');

            cleanup();
        };

        const cleanup = () => {
            continueBtn.removeEventListener('click', handleContinue);
            retryBtn.removeEventListener('click', handleRetry);
        };

        // Remove old listeners to be safe (cloning node is a trick, or just one-time listener)
        const newContinue = continueBtn.cloneNode(true);
        const newRetry = retryBtn.cloneNode(true);
        continueBtn.parentNode.replaceChild(newContinue, continueBtn);
        retryBtn.parentNode.replaceChild(newRetry, retryBtn);

        newContinue.addEventListener('click', handleContinue);
        newRetry.addEventListener('click', handleRetry);
    }
};
