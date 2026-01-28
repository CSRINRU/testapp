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
      "amount": 数値（商品の単価×個数の合計金額）
    }
  ]
}

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
            const jsonText = data.candidates[0].content.parts[0].text;

            // JSONパース
            return JSON.parse(jsonText);
        } catch (error) {
            console.error('Gemini API request failed:', error);
            throw error;
        }
    }
}

export const geminiService = new GeminiService();
