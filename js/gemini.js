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
            this.mapCategories(parsedData);

            return parsedData;
        } catch (error) {
            console.error('Gemini API request failed:', error);
            throw error;
        }
    }

    /**
     * 画像からレシート情報を構造化する (Multimodal)
     * @param {string} imageDataBase64 Base64 Data URL (e.g. data:image/jpeg;base64,...)
     * @returns {Promise<Object>} 構造化されたデータ
     */
    async structureReceiptFromImage(imageDataBase64) {
        if (!this.apiKey) {
            throw new Error('Gemini APIキーが設定されていません。設定画面でキーを入力してください。');
        }

        // Base64ヘッダーを削除
        const base64Data = imageDataBase64.replace(/^data:image\/\w+;base64,/, "");
        const mimeTypeMatch = imageDataBase64.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";

        const validCategories = MAJOR_CATEGORIES.join(', ');

        const prompt = `
このレシート画像を解析し、以下の情報をJSON形式で出力してください。
各項目を正確に読み取り、誤字があれば文脈から修正してください。

出力JSONフォーマット:
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
`;

        const body = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
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
            console.log("Gemini Vision Response Data:", data);

            if (!data.candidates || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0].text) {
                throw new Error('Gemini APIからの応答が不正です。');
            }

            const rawText = data.candidates[0].content.parts[0].text;
            console.log("Gemini Extracted JSON:", rawText);

            // JSON抽出
            const jsonStartIndex = rawText.indexOf('{');
            const jsonEndIndex = rawText.lastIndexOf('}');
            let jsonString = rawText;
            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                jsonString = rawText.substring(jsonStartIndex, jsonEndIndex + 1);
            }

            const parsedData = JSON.parse(jsonString);

            // カテゴリ変換ロジック (structureReceiptと同じ)
            this.mapCategories(parsedData);

            return parsedData;

        } catch (error) {
            console.error('Gemini Vision API request failed:', error);
            throw error;
        }
    }

    /**
     * データ内のカテゴリ名をIDに変換するヘルパー
     */
    mapCategories(data) {
        if (data.items && Array.isArray(data.items)) {
            data.items.forEach(item => {
                // 大カテゴリ
                const majorName = item.major_category;
                if (MAJOR_CATEGORY_NAME_TO_ID[majorName]) {
                    item.major_category = MAJOR_CATEGORY_NAME_TO_ID[majorName];
                } else {
                    item.major_category = CATEGORY_IDS.OTHER;
                }

                // 小カテゴリ
                const minorName = item.minor_category;
                let minorId = 'other_minor';

                if (MINOR_CATEGORY_DICTIONARY[minorName]) {
                    minorId = MINOR_CATEGORY_DICTIONARY[minorName];
                } else {
                    for (const [key, id] of Object.entries(MINOR_CATEGORY_DICTIONARY)) {
                        if (minorName.includes(key)) {
                            minorId = id;
                            break;
                        }
                    }
                }
                item.minor_category = minorId;
            });
        }
    }
}

export const geminiService = new GeminiService();
