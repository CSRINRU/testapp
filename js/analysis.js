import { AppState } from './state.js';

/**
 * 分析データの更新
 */
export function updateAnalysis() {
    try {
        console.log('updateAnalysis called. Receipts count:', AppState.receipts?.length || 0);

        if (!AppState.receipts || AppState.receipts.length === 0) {
            // データがない場合の表示
            console.log('No receipts found, displaying empty state');
            displayEmptyAnalysis();
            return;
        }

        // 分析期間の取得
        const periodEl = document.getElementById('analysisPeriod');
        const period = periodEl ? periodEl.value : 'month';
        let filteredReceipts = [...AppState.receipts];

        if (period !== 'custom') {
            const now = new Date();
            let startDate;

            switch (period) {
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'lastMonth':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                    filteredReceipts = filteredReceipts.filter(receipt => {
                        const receiptDate = new Date(receipt.date);
                        return receiptDate >= startDate && receiptDate <= endDate;
                    });
                    break;
                case '3months':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
            }

            if (period !== 'lastMonth' && startDate) {
                filteredReceipts = filteredReceipts.filter(receipt => {
                    return new Date(receipt.date) >= startDate;
                });
            }
        }

        console.log('Filtered receipts count:', filteredReceipts.length);

        // 基本統計
        const totalAmount = filteredReceipts.reduce((sum, receipt) => sum + (Number(receipt.total) || 0), 0);
        const receiptCount = filteredReceipts.length;
        const avgAmount = receiptCount > 0 ? Math.round(totalAmount / receiptCount) : 0;

        console.log('Total amount:', totalAmount, 'Receipt count:', receiptCount, 'Avg:', avgAmount);

        // 最多カテゴリ (アイテムベースで集計)
        const categoryCount = {};
        filteredReceipts.forEach(receipt => {
            if (Array.isArray(receipt.items) && receipt.items.length > 0) {
                receipt.items.forEach(item => {
                    const cat = item.category || 'その他';
                    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
                });
            } else {
                // itemsがない、空の場合はレシート自体のカテゴリを使うか、未分類とするか
                // ここではitemsがあることを前提としているが、古いデータのためにfallback
                // itemがない場合はカウントしない、または「不明」とする
            }
        });

        let topCategory = '-';
        let maxCount = 0;
        for (const [category, count] of Object.entries(categoryCount)) {
            if (count > maxCount) {
                maxCount = count;
                topCategory = category;
            }
        }

        // 統計を表示
        const totalAmountEl = document.getElementById('totalAmount');
        const receiptCountEl = document.getElementById('receiptCount');
        const avgAmountEl = document.getElementById('avgAmount');
        const topCategoryEl = document.getElementById('topCategory');

        if (totalAmountEl) totalAmountEl.textContent = `¥${totalAmount.toLocaleString()}`;
        if (receiptCountEl) receiptCountEl.textContent = receiptCount;
        if (avgAmountEl) avgAmountEl.textContent = `¥${avgAmount.toLocaleString()}`;
        if (topCategoryEl) topCategoryEl.textContent = topCategory;

        // グラフを描画
        drawCharts(filteredReceipts);

        // よく買う商品を表示
        updateTopProducts(filteredReceipts);
    } catch (error) {
        console.error('分析データの更新中にエラーが発生しました:', error);
        displayEmptyAnalysis(); // エラー時は空表示にするなど
    }
}

/**
 * データがない/エラー時の表示
 */
function displayEmptyAnalysis() {
    const totalAmountEl = document.getElementById('totalAmount');
    const receiptCountEl = document.getElementById('receiptCount');
    const avgAmountEl = document.getElementById('avgAmount');
    const topCategoryEl = document.getElementById('topCategory');

    if (totalAmountEl) totalAmountEl.textContent = '¥0';
    if (receiptCountEl) receiptCountEl.textContent = '0';
    if (avgAmountEl) avgAmountEl.textContent = '¥0';
    if (topCategoryEl) topCategoryEl.textContent = '-';

    // グラフをクリア
    clearCharts();
}

/**
 * グラフをクリア
 */
export function clearCharts() {
    const categoryCanvas = document.getElementById('categoryChart');
    const storeCanvas = document.getElementById('storeChart');

    if (categoryCanvas) {
        const ctx = categoryCanvas.getContext('2d');
        ctx.clearRect(0, 0, categoryCanvas.width, categoryCanvas.height);
    }

    if (storeCanvas) {
        const ctx = storeCanvas.getContext('2d');
        ctx.clearRect(0, 0, storeCanvas.width, storeCanvas.height);
    }

    // 商品リストをクリア
    const topProductsEl = document.getElementById('topProducts');
    if (topProductsEl) topProductsEl.innerHTML = '<p class="empty-text">データがありません</p>';
}

/**
 * グラフを描画
 * @param {Object[]} receipts 
 */
export function drawCharts(receipts) {
    // カテゴリ別支出グラフ
    drawCategoryChart(receipts);

    // 店舗別支出グラフ
    drawStoreChart(receipts);
}

/**
 * カテゴリ別支出グラフ
 * @param {Object[]} receipts 
 */
export function drawCategoryChart(receipts) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // カテゴリ別合計を計算
    const categoryTotals = {};

    receipts.forEach(receipt => {
        let itemsTotal = 0;
        const receiptTotal = Number(receipt.total) || 0;

        if (Array.isArray(receipt.items) && receipt.items.length > 0) {
            receipt.items.forEach(item => {
                const amount = Number(item.amount) || 0; // 金額がない場合は0
                const cat = item.category || 'その他';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
                itemsTotal += amount;
            });
        }

        // 差額を「不明」として計上 (レシート合計 > アイテム合計の場合のみ)
        // わずかな計算誤差を許容するか、あるいはStrictにするか。ここでは単純比較。
        if (receiptTotal > itemsTotal) {
            const diff = receiptTotal - itemsTotal;
            // 差額が大きすぎる場合（例えば全額など）も考慮
            if (diff > 0) {
                categoryTotals['不明'] = (categoryTotals['不明'] || 0) + diff;
            }
        }
    });

    // データの準備
    const categories = Object.keys(categoryTotals);
    const amounts = Object.values(categoryTotals);

    // 色の配列
    const colors = [
        '#4e54c8', '#8f94fb', '#ff6b6b', '#4ecdc4', '#ffd166',
        '#06d6a0', '#118ab2', '#ef476f', '#ffd166', '#073b4c'
    ];

    // キャンバスのクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (amounts.length === 0) return;

    // グラフの描画（シンプルな円グラフ）
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    let startAngle = 0;
    const total = amounts.reduce((sum, amount) => sum + amount, 0);

    // 円グラフの描画
    for (let i = 0; i < amounts.length; i++) {
        const sliceAngle = (amounts[i] / total) * 2 * Math.PI;

        // 扇形の描画
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();

        // 凡例の描画
        const legendX = 20;
        const legendY = 20 + i * 25;
        const legendWidth = 15;
        const legendHeight = 15;

        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(
            `${categories[i]}: ¥${amounts[i].toLocaleString()} (${Math.round(amounts[i] / total * 100)}%)`,
            legendX + legendWidth + 10,
            legendY + legendHeight - 3
        );

        startAngle += sliceAngle;
    }
}

/**
 * 店舗別支出グラフ
 * @param {Object[]} receipts 
 */
export function drawStoreChart(receipts) {
    const canvas = document.getElementById('storeChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 店舗別合計を計算
    const storeTotals = {};
    receipts.forEach(receipt => {
        const total = Number(receipt.total) || 0;
        const store = receipt.store || '未設定';
        storeTotals[store] = (storeTotals[store] || 0) + total;
    });

    // トップ5を抽出
    const sortedStores = Object.entries(storeTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (sortedStores.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('データがありません', canvas.width / 2, canvas.height / 2);
        return;
    }

    const stores = sortedStores.map(item => item[0]);
    const amounts = sortedStores.map(item => item[1]);

    // キャンバスのクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // グラフの設定
    const barWidth = 40;
    const spacing = 30;
    const startX = 60;
    const startY = canvas.height - 40;
    const maxAmount = Math.max(...amounts);
    const graphHeight = canvas.height - 80;

    // バーの描画
    for (let i = 0; i < amounts.length; i++) {
        const barHeight = (amounts[i] / maxAmount) * graphHeight;
        const x = startX + i * (barWidth + spacing);
        const y = startY - barHeight;

        // バーの描画
        ctx.fillStyle = i % 2 === 0 ? '#4e54c8' : '#8f94fb';
        ctx.fillRect(x, y, barWidth, barHeight);

        // 金額の表示
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
            `¥${amounts[i].toLocaleString()}`,
            x + barWidth / 2,
            y - 5
        );

        // 店舗名の表示（長すぎる場合は省略）
        let storeName = stores[i];
        if (storeName.length > 10) {
            storeName = storeName.substring(0, 8) + '...';
        }

        ctx.fillText(
            storeName,
            x + barWidth / 2,
            startY + 20
        );
    }

    // 軸の描画
    ctx.beginPath();
    ctx.moveTo(startX - 10, startY);
    ctx.lineTo(startX + amounts.length * (barWidth + spacing), startY);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
}

/**
 * よく買う商品を更新
 * @param {Object[]} receipts 
 */
export function updateTopProducts(receipts) {
    const container = document.getElementById('topProducts');
    if (!container) return;

    // 商品名の出現回数をカウント
    const productCount = {};
    receipts.forEach(receipt => {
        if (!Array.isArray(receipt.items)) return;

        receipt.items.forEach(item => {
            // 商品名を取得
            let name;
            let count = 1;

            if (typeof item === 'object' && item !== null && item.name) {
                name = item.name;
                count = Number(item.count) || 1;
            } else if (typeof item === 'string') {
                name = item;
            } else {
                return; // スキップ
            }

            // 簡易的に商品名をキーにする
            const cleanItem = String(name).trim().substring(0, 30);
            if (cleanItem) {
                // 個数分を加算 (countが取得できればその分、なければ1)
                productCount[cleanItem] = (productCount[cleanItem] || 0) + count;
            }
        });
    });

    // トップ10を抽出
    const topProducts = Object.entries(productCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    if (topProducts.length === 0) {
        container.innerHTML = '<p class="empty-text">データがありません</p>';
        return;
    }

    container.innerHTML = '';

    topProducts.forEach(([product, count], index) => {
        const item = document.createElement('div');
        item.className = 'product-item';
        item.innerHTML = `
            <span>${index + 1}. ${product}</span>
            <span class="product-count">${count}回</span>
        `;
        container.appendChild(item);
    });
}
