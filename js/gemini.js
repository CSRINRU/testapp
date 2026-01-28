import { MAJOR_CATEGORIES, MAJOR_CATEGORY_NAME_TO_ID, CATEGORY_IDS, MINOR_CATEGORY_DICTIONARY, MINOR_CATEGORY_DISPLAY_NAMES } from './constants.js';

/**
 * GeminiService: Gemini APIを使用してレシートテキストを構造化するサービス
 */
export class GeminiService {
    constructor() {
        this.apiKey = localStorage.getItem('geminiApiKey') || '';
        this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
    }

    /**
     * APIキーを設定
     * @param {string} key 
     */
    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('geminiApiKey', key);
    }

    /**
     * APIキーが設定されているか確認
     */
    hasApiKey() {
        return !!this.apiKey;
    }

    /**
     * レシートのテキストを構造化する
     * @param {string} text OCRで読み取った生のテキスト
     * @returns {Promise<Object>} 構造化されたデータ
     */
    async structureReceipt(text) {
        if (!this.apiKey) {
            throw new Error('Gemini APIキーが設定されていません。設定画面でキーを入力してください。');
        }

        const validCategories = MAJOR_CATEGORIES.join(', ');

        const prompt = `
以下のOCRで読み取ったレシートのテキストから情報を抽出・修正してJSON形式で出力してください。
誤字脱字がある場合は文脈から判断して修正してください。

出力フォーマット:
{
  "store": "店舗名（不明な場合は「不明」）",
  "date": "YYYY-MM-DD（不明な場合は今日の日付）",
  "total": 数値（合計金額）,
  "items": [
    {
      "name": "商品名",
      "count": 数値（個数、不明な場合は1）,
      "amount": 数値（商品の単価×個数の合計金額）,
      "major_category": "大カテゴリ（後述のリストから選択）",
      "minor_category": "小カテゴリ（具体的な分類、例: 野菜、肉、文具、など）"
    }
  ]
}

大カテゴリの選択肢: ${validCategories}
※これ以外の値を大カテゴリに入れないでください。判別不能な場合は「その他」にしてください。

入力テキスト:
${text}
`;

        const body = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                response_mime_type: "application/json"
            }
        };

        try {
            const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            console.log("Gemini Response Data:", data);
            const rawText = data.candidates[0].content.parts[0].text;
            console.log("Gemini Extracted Text:", rawText);

            // JSON部分のみを抽出（```json ... ``` や説明文が含まれる場合の対策）
            const jsonStartIndex = rawText.indexOf('{');
            const jsonEndIndex = rawText.lastIndexOf('}');

            let jsonString = rawText;
            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                jsonString = rawText.substring(jsonStartIndex, jsonEndIndex + 1);
            }

            // JSONパース
            const parsedData = JSON.parse(jsonString);

            // カテゴリをIDに変換してマッピング
            if (parsedData.items && Array.isArray(parsedData.items)) {
                parsedData.items.forEach(item => {
                    // 大カテゴリの変換 (日本語 -> ID)
                    const majorName = item.major_category;
                    if (MAJOR_CATEGORY_NAME_TO_ID[majorName]) {
                        item.major_category = MAJOR_CATEGORY_NAME_TO_ID[majorName];
                    } else {
                        item.major_category = CATEGORY_IDS.OTHER; // マッチしない場合はその他
                    }

                    // 小カテゴリの変換 (日本語 -> ID)
                    const minorName = item.minor_category;
                    // 部分一致も含めて辞書検索するか、完全一致のみか。
                    // Geminiは指示通りに出す傾向があるため、まずは完全一致 or 辞書のキーに含まれるかで判断
                    // ここでは辞書のキーと完全一致、もしくは辞書のキーがGemini出力に含まれるかを簡易チェック

                    let minorId = 'other_minor'; // デフォルト

                    if (MINOR_CATEGORY_DICTIONARY[minorName]) {
                        minorId = MINOR_CATEGORY_DICTIONARY[minorName];
                    } else {
                        // 辞書にない場合、辞書のキーを含んでいるか検索 (例: "新鮮野菜" -> "野菜"マッチ)
                        for (const [key, id] of Object.entries(MINOR_CATEGORY_DICTIONARY)) {
                            if (minorName.includes(key)) {
                                minorId = id;
                                break;
                            }
                        }
                    }

                    // IDをセット
                    item.minor_category = minorId;

                    // 表示用テキストはUI側で解決するため、ここではIDのみ保持 (あるいはUIの都合で変換しておくか？)
                    // 要件: "データの管理はID化" -> ここではIDにする
                });
            }

            return parsedData;
        } catch (error) {
            console.error('Gemini API request failed:', error);
            throw error;
        }
    }
}

export const geminiService = new GeminiService();
