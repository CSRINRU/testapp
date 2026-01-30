export class CroppingUI {
    constructor(canvas, initialCropRatio = 1.0, onRedraw = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onRedraw = onRedraw;
        this.ctx = canvas.getContext('2d');
        this.imageWidth = 0;
        this.imageHeight = 0;

        // Crop rect in IMAGE coordinates
        this.cropRect = { x: 0, y: 0, w: 0, h: 0 };
        this.initialCropRatio = initialCropRatio;

        // Interaction state
        this.isDragging = false;
        this.dragMode = null; // 'move', 'nw', 'ne', 'sw', 'se'
        this.startPos = { x: 0, y: 0 };
        this.startRect = { ...this.cropRect };

        // Configuration
        this.handleSize = 20; // Hit detection size
        this.visibleHandleSize = 10; // Drawing size
        this.minCropSize = 50;

        this.bindEvents();
    }

    setImageSize(width, height) {
        this.imageWidth = width;
        this.imageHeight = height;
        this.resetCrop();
    }

    resetCrop() {
        const w = this.imageWidth;
        const h = this.imageHeight;
        const marginW = w * (1 - this.initialCropRatio) / 2;
        const marginH = h * (1 - this.initialCropRatio) / 2;

        this.cropRect = {
            x: marginW,
            y: marginH,
            w: w * this.initialCropRatio,
            h: h * this.initialCropRatio
        };
    }

    // Convert display coordinates (canvas CSS pixels) to image coordinates
    getScale() {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: this.canvas.width / rect.width,
            y: this.canvas.height / rect.height
        };
    }

    // Event Handling
    bindEvents() {
        const start = (x, y) => {
            const scale = this.getScale();
            const mouseX = x * scale.x;
            const mouseY = y * scale.y;
            this.handleStart(mouseX, mouseY);
        };

        const move = (x, y) => {
            if (!this.isDragging) return;
            const scale = this.getScale();
            const mouseX = x * scale.x;
            const mouseY = y * scale.y;
            this.handleMove(mouseX, mouseY);
        };

        const end = () => {
            this.isDragging = false;
            this.dragMode = null;
        };

        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => start(e.offsetX, e.offsetY));
        this.canvas.addEventListener('mousemove', (e) => move(e.offsetX, e.offsetY));
        window.addEventListener('mouseup', end);

        // Touch Events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            start(touch.clientX - rect.left, touch.clientY - rect.top);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            move(touch.clientX - rect.left, touch.clientY - rect.top);
        }, { passive: false });

        this.canvas.addEventListener('touchend', end);
    }

    handleStart(mx, my) {
        this.dragMode = this.getHitMode(mx, my);
        if (this.dragMode) {
            this.isDragging = true;
            this.startPos = { x: mx, y: my };
            this.startRect = { ...this.cropRect };
        }
    }

    handleMove(mx, my) {
        const dx = mx - this.startPos.x;
        const dy = my - this.startPos.y;

        let newRect = { ...this.startRect };

        if (this.dragMode === 'move') {
            newRect.x += dx;
            newRect.y += dy;
        } else {
            // Resize logic
            if (this.dragMode.includes('n')) {
                newRect.y += dy;
                newRect.h -= dy;
            }
            if (this.dragMode.includes('s')) {
                newRect.h += dy;
            }
            if (this.dragMode.includes('w')) {
                newRect.x += dx;
                newRect.w -= dx;
            }
            if (this.dragMode.includes('e')) {
                newRect.w += dx;
            }
        }

        // Normalize rect (handle negative width/height)
        if (newRect.w < 0) {
            newRect.x += newRect.w;
            newRect.w = Math.abs(newRect.w);
            // Flip interaction mode if needed (omitted for simplicity, just constrain)
        }
        if (newRect.h < 0) {
            newRect.y += newRect.h;
            newRect.h = Math.abs(newRect.h);
        }

        // Constrain to image bounds
        this.cropRect = this.constrainRect(newRect);

        // Redraw
        if (this.onRedraw) this.onRedraw();
        this.draw();
    }

    constrainRect(rect) {
        // Enforce min size
        if (rect.w < this.minCropSize) rect.w = this.minCropSize;
        if (rect.h < this.minCropSize) rect.h = this.minCropSize;

        // Enforce boundaries
        if (rect.x < 0) rect.x = 0;
        if (rect.y < 0) rect.y = 0;
        if (rect.x + rect.w > this.imageWidth) rect.x = this.imageWidth - rect.w;
        if (rect.y + rect.h > this.imageHeight) rect.y = this.imageHeight - rect.h;

        // If 'move' pushes out of bounds, fix it (already done above mostly, but double check)
        if (rect.x < 0) { rect.x = 0; } // If width > image width?
        if (rect.y < 0) { rect.y = 0; }

        return rect;
    }

    getHitMode(x, y) {
        const r = this.cropRect;
        // Scale handle size based on image/display ratio to stay usable on large images
        const scale = this.getScale();
        // Use the larger scale to ensure visibility/usability
        const s = Math.max(scale.x, scale.y);
        // 20 visual pixels * scale = image pixels
        const h = this.handleSize * s;

        // Corners
        if (Math.abs(x - r.x) < h && Math.abs(y - r.y) < h) return 'nw';
        if (Math.abs(x - (r.x + r.w)) < h && Math.abs(y - r.y) < h) return 'ne';
        if (Math.abs(x - r.x) < h && Math.abs(y - (r.y + r.h)) < h) return 'sw';
        if (Math.abs(x - (r.x + r.w)) < h && Math.abs(y - (r.y + r.h)) < h) return 'se';

        // Inside
        if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return 'move';

        return null;
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const r = this.cropRect;

        // Clear only overlay if we were layered? 
        // But here we might need to redraw the image first if this is a single canvas.
        // Assuming caller handles base image draw, or we just draw overlay ON TOP.
        // But since we are likely calling this repeatedly in drag, we assume the base image is already there 
        // OR we need to trigger a full redraw callback.
        // For now, let's assume the caller will re-draw the base image, then call this.draw().
        // WAIT: If I don't control the base image draw, I can't "clear" the previous crop overlay without clearing the image.
        // So, I should probably emit a 'requestRedraw' event or accept a callback.
        // Or simpler: The user of this class calls `updatePreview()` which draws image THEN `croppingUI.draw()`.

        // Overlay (dimmed background)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

        // Top rect
        ctx.fillRect(0, 0, w, r.y);
        // Bottom rect
        ctx.fillRect(0, r.y + r.h, w, h - (r.y + r.h));
        // Left rect
        ctx.fillRect(0, r.y, r.x, r.h);
        // Right rect
        ctx.fillRect(r.x + r.w, r.y, w - (r.x + r.w), r.h);

        // Grid lines (optional, rule of thirds)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Verticals
        ctx.moveTo(r.x + r.w / 3, r.y); ctx.lineTo(r.x + r.w / 3, r.y + r.h);
        ctx.moveTo(r.x + 2 * r.w / 3, r.y); ctx.lineTo(r.x + 2 * r.w / 3, r.y + r.h);
        // Horizontals
        ctx.moveTo(r.x, r.y + r.h / 3); ctx.lineTo(r.x + r.w, r.y + r.h / 3);
        ctx.moveTo(r.x, r.y + 2 * r.h / 3); ctx.lineTo(r.x + r.w, r.y + 2 * r.h / 3);
        ctx.stroke();

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);

        // Handles
        // Scale handle size
        const scale = this.getScale();
        const s = Math.max(scale.x, scale.y);
        const hs = this.visibleHandleSize * s;

        ctx.fillStyle = '#fff';
        // NW
        ctx.fillRect(r.x - hs / 2, r.y - hs / 2, hs, hs);
        // NE
        ctx.fillRect(r.x + r.w - hs / 2, r.y - hs / 2, hs, hs);
        // SW
        ctx.fillRect(r.x - hs / 2, r.y + r.h - hs / 2, hs, hs);
        // SE
        ctx.fillRect(r.x + r.w - hs / 2, r.y + r.h - hs / 2, hs, hs);
    }

    getCropRect() {
        return { ...this.cropRect };
    }

    /**
     * Returns a new Canvas with the cropped image.
     * @param {CanvasImageSource} sourceImage - Original image/canvas
     */
    getCroppedCanvas(sourceImage) {
        const r = this.cropRect;
        const out = document.createElement('canvas');
        out.width = Math.round(r.w);
        out.height = Math.round(r.h);
        const ctx = out.getContext('2d');
        ctx.drawImage(sourceImage, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
        return out;
    }
}
