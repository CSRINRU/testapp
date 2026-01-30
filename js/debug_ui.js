
export const DebugUI = {
    setup() {
        // 初期設定が必要な場合はここに記述するが、動的なコンテンツの多くはshow()で扱われる
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

        // セクションを表示
        debugSection.classList.remove('hidden');

        // 画像と矩形を描画
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            // キャンバスサイズを画像サイズに合わせる (表示サイズはCSSで調整)
            canvas.width = img.width;
            canvas.height = img.height;

            ctx.drawImage(img, 0, 0);

            // Draw boxes
            if (ocrResult.blocks) {
                ctx.lineWidth = 3;
                ocrResult.blocks.forEach(block => {
                    const { box, text, score } = block;
                    // box: [{x,y}, {x,y}, {x,y}, {x,y}] or {x,y,w,h} (fallback)

                    // 信頼度に基づいて色分け (オプション)
                    if (score > 0.8) {
                        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
                        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                    } else {
                        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)'; // オレンジ
                        ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
                    }

                    if (Array.isArray(box)) {
                        // 回転した矩形 (ポリゴン)
                        ctx.beginPath();
                        ctx.moveTo(box[0].x, box[0].y);
                        for (let i = 1; i < box.length; i++) {
                            ctx.lineTo(box[i].x, box[i].y);
                        }
                        ctx.closePath();

                        // メインの矩形をライム色で描画
                        ctx.strokeStyle = 'lime';
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        // 向きを示すインジケータ (最初の辺 0-1) を赤色で描画
                        // これにより「上」方向または主軸方向を示す
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
                        // 旧スタイルの矩形用フォールバック
                        ctx.strokeRect(box.x, box.y, box.w, box.h);
                    }
                });
            }
        };
        img.src = imageData;

        // テキストリストを作成
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

                    // ホバー時のハイライト (オプション機能)
                });
            }
        }

        // イベントリスナーの設定
        const handleContinue = () => {
            debugSection.classList.add('hidden');
            if (onContinue) onContinue();
            cleanup();
        };

        const handleRetry = () => {
            debugSection.classList.add('hidden');
            // Retryはキャンセルとして扱い、カメラ画面へ戻る。
            // 状態保持が複雑なため、現時点では前処理画面へは戻らない仕様とする。
            // キャンセルロジック: デバッグ・前処理・処理中画面を隠し、カメラを表示
            const preview = document.getElementById('selectedImagePreview');
            const video = document.getElementById('cameraPreview');
            const overlay = document.getElementById('cameraOverlay');
            const processingSection = document.getElementById('processingSection');
            const prepSection = document.getElementById('preprocessing-section');
            const cameraContainer = document.getElementById('camera-container');

            if (preview) preview.classList.add('hidden');
            if (processingSection) processingSection.classList.add('hidden');
            if (prepSection) prepSection.classList.add('hidden');

            // カメラを表示
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

        // 安全のため古いリスナーを削除 (複製による置換)
        const newContinue = continueBtn.cloneNode(true);
        const newRetry = retryBtn.cloneNode(true);
        continueBtn.parentNode.replaceChild(newContinue, continueBtn);
        retryBtn.parentNode.replaceChild(newRetry, retryBtn);

        newContinue.addEventListener('click', handleContinue);
        newRetry.addEventListener('click', handleRetry);
    }
};
