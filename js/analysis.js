import { store } from './store.js';
import { MAJOR_CATEGORY_DISPLAY_NAMES, MINOR_CATEGORY_DISPLAY_NAMES, CATEGORY_IDS } from './constants.js';

// チャートインスタンス
let categoryChartInstance = null;
let storeChartInstance = null;
let trendChartInstance = null;

// カラーパレット
const COLORS = [
    '#6366f1', '#818cf8', '#ef4444', '#10b981', '#f59e0b',
    '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
    '#64748b', '#06b6d4', '#d946ef', '#22c55e', '#eab308'
];

/**
 * 分析データの更新
 */
export function updateAnalysis() {
    const receipts = store.state.receipts;
    if (!receipts || receipts.length === 0) {
        displayEmptyState();
        return;
    }

    // --- 1. 期間でフィルタリング ---
    const periodEl = document.getElementById('analysisPeriod');
    const period = periodEl ? periodEl.value : 'month';
    let filteredReceipts = filterByPeriod([...receipts], period);

    // --- 2. カテゴリでフィルタリング ---
    const categoryEl = document.getElementById('analysisCategory');
    const selectedCategory = categoryEl ? categoryEl.value : 'all';

    if (selectedCategory !== 'all') {
        filteredReceipts = filteredReceipts.filter(receipt => {
            if (!receipt.items) return false;
            // レシート内のアイテムに該当カテゴリが含まれているか
            // (簡易的に、レシート自体を残すが、集計時にアイテム単位で判定する必要がある)
            // ここでは「レシート単位」でフィルタするのではなく、「データ集計時」にフィルタする方が正確だが、
            // UI上の合計金額なども連動させるため、ここでアイテムをフィルタした「新しいレシートオブジェクト」を作るのがベター

            const relevantItems = receipt.items.filter(item => item.major_category === selectedCategory);
            return relevantItems.length > 0;
        }).map(receipt => {
            // 該当カテゴリのアイテムのみを持つ一時的なレシートオブジェクトを作成
            const relevantItems = receipt.items.filter(item => item.major_category === selectedCategory);
            const newTotal = relevantItems.reduce((sum, item) => sum + (item.amount || 0), 0);
            return {
                ...receipt,
                items: relevantItems,
                total: newTotal
            };
        }).filter(r => r.total > 0);
    }

    if (filteredReceipts.length === 0) {
        displayEmptyState();
        return;
    }

    // --- 3. 集計ロジック ---

    // 基本統計
    const totalAmount = filteredReceipts.reduce((sum, receipt) => sum + receipt.total, 0);
    const receiptCount = filteredReceipts.length;
    const avgAmount = receiptCount > 0 ? Math.round(totalAmount / receiptCount) : 0;

    // 最多カテゴリ集計 (選択されたカテゴリによって意味が変わる)
    let topCategoryLabel = '-';
    if (selectedCategory === 'all') {
        // 大カテゴリで集計
        topCategoryLabel = getTopCategory(filteredReceipts, 'major');
    } else {
        // 小カテゴリで集計
        topCategoryLabel = getTopCategory(filteredReceipts, 'minor', selectedCategory); // selectedCategoryは明示的なコンテキスト
    }

    // 統計を表示
    updateStatsDisplay(totalAmount, receiptCount, avgAmount, topCategoryLabel);

    // グラフを描画
    drawCharts(filteredReceipts, selectedCategory, period);

    // よく買う商品を表示
    updateTopProducts(filteredReceipts);
}

/**
 * 空の状態を表示
 */
function displayEmptyState() {
    const ids = ['totalAmount', 'receiptCount', 'avgAmount', 'topCategory'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = id === 'topCategory' ? '-' : (id === 'receiptCount' ? '0' : '¥0');
    });

    // チャートをクリア
    if (categoryChartInstance) { categoryChartInstance.destroy(); categoryChartInstance = null; }
    if (storeChartInstance) { storeChartInstance.destroy(); storeChartInstance = null; }
    if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }

    // 商品リストをクリア
    const topProductsEl = document.getElementById('topProducts');
    if (topProductsEl) topProductsEl.innerHTML = '<p class="empty-text">データがありません</p>';
}

/**
 * 期間フィルタリング
 */
function filterByPeriod(receipts, period) {
    if (period === 'custom') return receipts; // 必要に応じてカスタム実装を追加 (このスニペットでは未実装)

    const now = new Date();
    let startDate;
    let endDate;

    switch (period) {
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            break;
        case '3months':
            startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); // 正確なロジック: 2ヶ月前の初日
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
    }

    return receipts.filter(receipt => {
        const d = new Date(receipt.date);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
    });
}

/**
 * 最多カテゴリ取得
 */
function getTopCategory(receipts, type, contextMajorCategory = null) {
    const counts = {};
    receipts.forEach(r => {
        r.items.forEach(item => {
            let key;
            if (type === 'major') {
                key = item.major_category || 'other';
            } else {
                key = item.minor_category || 'other_minor';
            }
            if (!contextMajorCategory || item.major_category === contextMajorCategory) {
                counts[key] = (counts[key] || 0) + 1;
            }
        });
    });

    let max = 0;
    let topKey = null;
    for (const [key, val] of Object.entries(counts)) {
        if (val > max) {
            max = val;
            topKey = key;
        }
    }

    if (!topKey) return '-';

    if (type === 'major') {
        return MAJOR_CATEGORY_DISPLAY_NAMES[topKey] || topKey;
    } else {
        return MINOR_CATEGORY_DISPLAY_NAMES[topKey] || topKey; // 小カテゴリ名のマップが存在すると仮定
    }
}

/**
 * 統計表示更新
 */
function updateStatsDisplay(total, count, avg, topCat) {
    const elTotal = document.getElementById('totalAmount');
    const elCount = document.getElementById('receiptCount');
    const elAvg = document.getElementById('avgAmount');
    const elTop = document.getElementById('topCategory');

    if (elTotal) elTotal.textContent = `¥${total.toLocaleString()}`;
    if (elCount) elCount.textContent = count;
    if (elAvg) elAvg.textContent = `¥${avg.toLocaleString()}`;
    if (elTop) elTop.textContent = topCat;
}

/**
 * グラフ描画統括
 */
function drawCharts(receipts, selectedCategory, period) {
    drawCategoryChart(receipts, selectedCategory);
    drawStoreChart(receipts);
    drawTrendChart(receipts, period);
}

/**
 * カテゴリチャート (Pie)
 */
function drawCategoryChart(receipts, selectedCategory) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;

    // 既存のものを破棄
    if (categoryChartInstance) {
        categoryChartInstance.destroy();
        categoryChartInstance = null;
    }

    const totals = {};
    receipts.forEach(r => {
        r.items.forEach(item => {
            let key;
            let displayKey;

            if (selectedCategory === 'all') {
                key = item.major_category || 'other';
                displayKey = MAJOR_CATEGORY_DISPLAY_NAMES[key] || key;
            } else {
                // 選択されたカテゴリの内訳
                key = item.minor_category || 'unknown'; // 小カテゴリIDを使用
                // 表示名が利用可能ならマッピング、なければ生のIDを使用
                displayKey = MINOR_CATEGORY_DISPLAY_NAMES[key] || key;
            }
            totals[displayKey] = (totals[displayKey] || 0) + (item.amount || 0);
        });
    });

    const labels = Object.keys(totals);
    const data = Object.values(totals);

    if (labels.length === 0) return; // 空のチャートを許可するか、適切に処理する

    categoryChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: COLORS,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                title: {
                    display: true,
                    text: selectedCategory === 'all' ? 'カテゴリ別支出' : `${MAJOR_CATEGORY_DISPLAY_NAMES[selectedCategory] || selectedCategory}の内訳`
                }
            }
        }
    });
}

/**
 * 店舗チャート (Bar)
 */
function drawStoreChart(receipts) {
    const canvas = document.getElementById('storeChart');
    if (!canvas) return;

    if (storeChartInstance) {
        storeChartInstance.destroy();
        storeChartInstance = null;
    }

    const storeTotals = {};
    receipts.forEach(r => {
        const storeName = r.store || '不明';
        storeTotals[storeName] = (storeTotals[storeName] || 0) + r.total;
    });

    // ソートしてトップ5を抽出
    const sorted = Object.entries(storeTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);

    storeChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '支出額',
                data: data,
                backgroundColor: '#6366f1',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y', // 長い店舗名には横型スタック表示が適している場合が多い、または標準の'x'
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                x: { beginAtZero: true }
            }
        }
    });
}

/**
 * トレンドチャート (Line)
 */
function drawTrendChart(receipts, period) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;

    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }

    // 日次集計
    // 継続性を確保するために範囲内の全ての日付マップを作成する？
    // 簡略化のため、存在する日付のみ集計してソートする。

    // 改善: レシートを日付順にソート
    const sortedReceipts = [...receipts].sort((a, b) => new Date(a.date) - new Date(b.date));

    // 日付ごとに集計
    const dailyTotals = {};

    // レシートがない日を0として表示するには、日付範囲を生成する必要がある。
    // 今のところ、奇妙に見えない限りデータがある日のみをプロットする。
    // 本来、「期間トレンド」はタイムラインを前提とするため、範囲を確認する方が良い。

    sortedReceipts.forEach(r => {
        const dateStr = r.date.split('T')[0]; // YYYY-MM-DD
        dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + r.total;
    });

    const labels = Object.keys(dailyTotals);
    const data = Object.values(dailyTotals);

    trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '日次支出',
                data: data,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4, // 滑らかな曲線
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

/**
 * よく買う商品を更新
 */
export function updateTopProducts(receipts) {
    const container = document.getElementById('topProducts');
    if (!container) return;

    // 商品名の出現回数をカウント
    const productCount = {};
    receipts.forEach(receipt => {
        if (!receipt.items) return;
        receipt.items.forEach(item => {
            // 商品名を取得
            let name = item.name || (typeof item === 'string' ? item : '不明');
            let count = item.count || 1;

            // 簡易的に商品名をキーにする
            const cleanItem = String(name).trim().substring(0, 30);
            if (cleanItem) {
                // 個数を加算
                productCount[cleanItem] = (productCount[cleanItem] || 0) + count;
            }
        });
    });

    // トップ10を抽出
    const topProducts = Object.entries(productCount)
        .sort((a, b) => b[1] - a[1]) // 回数で降順ソート
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
