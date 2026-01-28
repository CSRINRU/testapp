import { pipeline, env } from '../lib/transformers.min.js';

/**
 * AIClassifier: Transformers.jsを使用したテキスト分類クラス
 * 意味ベースのゼロショット分類を行う
 */
export class AIClassifier {
    constructor() {
        this.classifier = null;
        this.isInitialized = false;
        // 定義済みカテゴリ
        this.categories = ['食品', '雑貨', '日用品', '外食', 'その他'];
        this.modelId = './models/nlp'; // ローカルパス
    }

    /**
     * 初期化処理
     */
    async init() {
        if (this.isInitialized) return;

        try {
            console.log('Loading classification model...');

            // モデルとWASMのパス設定
            env.allowLocalModels = true;
            env.useBrowserCache = false;
            env.localModelPath = './'; // デフォルトの 'models/' プレフィックスを回避し、ルートからのパスを使用

            // Zero-shot classification pipelines
            this.classifier = await pipeline('zero-shot-classification', 'models/nlp', {
                quantized: true // 量子化モデルを使用
            });

            this.isInitialized = true;
            console.log('AI Classifier initialized successfully');
        } catch (e) {
            console.error('AI Classifier Initialization failed:', e);
            // エラー時はnullのままで、フォールバック（辞書のみ）を使うようにする
        }
    }

    /**
     * アイテムのカテゴリを推論
     * @param {string[]} items 商品名のリスト
     * @returns {Promise<string>} 推論されたカテゴリ
     */
    async predict(items) {
        if (!this.isInitialized) {
            await this.init();
        }

        if (!this.classifier) return '未分類'; // エラーなどで初期化できなかった場合

        // 商品名を結合して一つのテキストとして分類するか、
        // 個別に分類して多数決を取るか。ここでは結合して全体の傾向を見る。
        const text = items.join(', ');

        if (!text.trim()) return 'その他';

        try {
            // 推論実行
            // hypothesis_template は日本語に合わせて調整
            const output = await this.classifier(text, this.categories, {
                hypothesis_template: 'この商品は{}です。',
                multi_label: false
            });

            // 結果の形式: { sequence: "...", labels: ["食品", ...], scores: [0.9, ...] }
            console.log('Classification Result:', output);

            // 最もスコアが高いラベルを返す
            return output.labels[0];

        } catch (e) {
            console.error('Classification error:', e);
            return 'その他';
        }
    }

    /**
     * 単一アイテムのカテゴリを推論
     * @param {string} itemName 商品名
     * @returns {Promise<string>} 推論されたカテゴリ
     */
    async predictItem(itemName) {
        if (!this.isInitialized) {
            await this.init();
        }

        if (!this.classifier || !itemName) return 'その他';

        try {
            const output = await this.classifier(itemName, this.categories, {
                hypothesis_template: 'この商品は{}です。',
                multi_label: false
            });
            return output.labels[0];
        } catch (e) {
            console.error('Item Classification error:', e);
            return 'その他';
        }
    }
}
