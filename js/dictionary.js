import { AppState } from './state.js';
import { DEFAULT_DICTIONARY } from './constants.js';
import { getFromIndexedDB, saveToIndexedDB } from './db.js';

/**
 * カテゴリ辞書の初期化
 */
export async function initCategoryDictionary() {
    // IndexedDBからカテゴリ辞書を読み込む
    const savedDictionary = await getFromIndexedDB('settings', 'categoryDictionary');

    if (savedDictionary) {
        AppState.categoryDictionary = savedDictionary;
    } else {
        AppState.categoryDictionary = DEFAULT_DICTIONARY;
        await saveToIndexedDB('settings', 'categoryDictionary', DEFAULT_DICTIONARY);
    }

    // 設定画面に辞書を表示
    updateDictionaryDisplay();
}

/**
 * カテゴリ分類
 * @param {string[]} items 
 * @returns {string} カテゴリ名
 */
import { AIClassifier } from './ai_classifier.js';

const aiClassifier = new AIClassifier();

/**
 * カテゴリ分類 (AI + 辞書)
 * @param {string[]} items 
 * @returns {Promise<string>} カテゴリ名
 */
export async function classifyCategory(items) {
    // 1. まず既存の辞書（キーワードマッチ）で判定
    // ユーザー定義のルールを優先する

    // すべての商品名を結合
    const allItems = items.join(' ');

    // 各カテゴリのキーワードに基づいてスコアを計算
    const scores = {};
    let dictionaryHit = false;

    for (const [category, keywords] of Object.entries(AppState.categoryDictionary)) {
        let score = 0;
        for (const keyword of keywords) {
            if (allItems.includes(keyword)) {
                score++;
            }
        }
        scores[category] = score;
        if (score > 0) dictionaryHit = true;
    }

    // 辞書でヒットがあれば、それを優先して返す
    if (dictionaryHit) {
        let maxScore = 0;
        let selectedCategory = 'その他';

        for (const [category, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                selectedCategory = category;
            }
        }

        if (selectedCategory !== 'その他') {
            console.log('Category classified by Dictionary:', selectedCategory);
            return selectedCategory;
        }
    }

    // 2. 辞書で決まらない場合、AIで推論
    try {
        console.log('Classifying by AI...');
        const aiCategory = await aiClassifier.predict(items);
        console.log('Category classified by AI:', aiCategory);
        return aiCategory;
    } catch (e) {
        console.warn('AI classification failed, falling back to default', e);
        return 'その他';
    }
}

/**
 * カテゴリ辞書の表示を更新
 */
export async function updateDictionaryDisplay() {
    const container = document.getElementById('categoryDictionary');
    if (!container) return;

    container.innerHTML = '';

    for (const [category, keywords] of Object.entries(AppState.categoryDictionary)) {
        // カテゴリヘッダー
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'dictionary-category';
        categoryHeader.innerHTML = `<strong>${category}</strong> (${keywords.length}キーワード)`;
        container.appendChild(categoryHeader);

        // キーワード一覧
        keywords.forEach(keyword => {
            const item = document.createElement('div');
            item.className = 'dictionary-item';
            item.innerHTML = `
                <span class="keyword-text">${keyword}</span>
                <span class="category-badge">${category}</span>
                <button class="btn btn-small delete-keyword" data-keyword="${keyword}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            container.appendChild(item);
        });
    }

    // キーワード削除イベントの設定
    document.querySelectorAll('.delete-keyword').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const keyword = e.target.closest('button').getAttribute('data-keyword');
            deleteKeywordFromDictionary(keyword);
        });
    });
}

/**
 * キーワードを辞書に追加
 */
export async function addKeywordToDictionary() {
    const keywordInput = document.getElementById('newKeyword');
    const categorySelect = document.getElementById('newCategory');

    const keyword = keywordInput.value.trim();
    const category = categorySelect.value;

    if (!keyword) {
        alert('キーワードを入力してください');
        return;
    }

    // 既存のキーワードかチェック
    for (const cat of Object.keys(AppState.categoryDictionary)) {
        if (AppState.categoryDictionary[cat].includes(keyword)) {
            alert('このキーワードは既に登録されています');
            return;
        }
    }

    // 辞書に追加
    if (!AppState.categoryDictionary[category]) {
        AppState.categoryDictionary[category] = [];
    }

    AppState.categoryDictionary[category].push(keyword);

    // IndexedDBに保存
    await saveToIndexedDB('settings', 'categoryDictionary', AppState.categoryDictionary);

    // 表示を更新
    updateDictionaryDisplay();

    // 入力欄をクリア
    keywordInput.value = '';

    alert('キーワードを追加しました');
}

/**
 * キーワードを辞書から削除
 * @param {string} keyword 
 */
export async function deleteKeywordFromDictionary(keyword) {
    if (!confirm(`キーワード「${keyword}」を削除しますか？`)) {
        return;
    }

    // すべてのカテゴリからキーワードを削除
    for (const category of Object.keys(AppState.categoryDictionary)) {
        const index = AppState.categoryDictionary[category].indexOf(keyword);
        if (index !== -1) {
            AppState.categoryDictionary[category].splice(index, 1);
            break;
        }
    }

    // IndexedDBに保存
    await saveToIndexedDB('settings', 'categoryDictionary', AppState.categoryDictionary);

    // 表示を更新
    updateDictionaryDisplay();
}
