// カテゴリID定義
export const CATEGORY_IDS = {
    FOOD: 'food',
    DAILY_GOODS: 'daily_goods',
    MISC: 'misc',
    CLOTHING: 'clothing',
    LUXURY: 'luxury',
    OTHER: 'other'
};

// 大カテゴリ表示名マッピング (ID -> 日本語)
export const MAJOR_CATEGORY_DISPLAY_NAMES = {
    [CATEGORY_IDS.FOOD]: '食料品',
    [CATEGORY_IDS.DAILY_GOODS]: '日用品',
    [CATEGORY_IDS.MISC]: '雑貨',
    [CATEGORY_IDS.CLOTHING]: '衣服',
    [CATEGORY_IDS.LUXURY]: '嗜好品',
    [CATEGORY_IDS.OTHER]: 'その他'
};

// 大カテゴリ逆マッピング (日本語 -> ID)
export const MAJOR_CATEGORY_NAME_TO_ID = Object.entries(MAJOR_CATEGORY_DISPLAY_NAMES).reduce((acc, [id, name]) => {
    acc[name] = id;
    return acc;
}, {});

// Geminiプロンプト用（文字列の配列）
export const MAJOR_CATEGORIES = Object.values(MAJOR_CATEGORY_DISPLAY_NAMES);

// 小カテゴリ定義リスト
// ここに新しいカテゴリや同義語を追加してください
const MINOR_CATEGORY_DEFINITIONS = [
    // 食料品関連
    { id: 'vegetables', name: '野菜', synonyms: ['野菜', '青果', 'ベジタブル', '根菜', '葉物'] },
    { id: 'meat', name: '肉', synonyms: ['肉', '精肉', '食肉', '牛肉', '豚肉', '鶏肉', '挽肉'] },
    { id: 'fish', name: '魚', synonyms: ['魚', '鮮魚', '魚介', '刺身', '切身'] },
    { id: 'deli', name: '惣菜', synonyms: ['惣菜', 'お惣菜', '弁当', 'おかず', '揚げ物', 'サラダ'] },
    { id: 'bread', name: 'パン', synonyms: ['パン', 'ベーカリー', '食パン', 'サンドイッチ'] },
    { id: 'snacks', name: '菓子', synonyms: ['菓子', 'お菓子', 'スナック', 'デザート', 'スイーツ', 'アイス'] },
    { id: 'beverage', name: '飲料', synonyms: ['飲み物', '飲料', 'ドリンク', '酒', 'アルコール', '水', '茶', 'コーヒー', 'ジュース'] },
    { id: 'seasoning', name: '調味料', synonyms: ['調味料', 'スパイス', '油', '醤油', '味噌', '塩', '砂糖'] },
    { id: 'processed_food', name: '加工食品', synonyms: ['加工食品', 'インスタント', 'レトルト', '缶詰', '乾物', '冷凍食品'] },
    { id: 'dairy', name: '乳製品', synonyms: ['乳製品', '牛乳', 'チーズ', 'ヨーグルト', 'バター'] },
    { id: 'egg', name: '卵', synonyms: ['卵', '鶏卵', '玉子'] },

    // 日用品・消耗品
    { id: 'consumables', name: '消耗品', synonyms: ['消耗品', '洗剤', 'ティッシュ', 'トイレットペーパー', 'シャンプー', '石鹸'] },
    { id: 'medical', name: '医薬品', synonyms: ['医薬品', '薬', 'サプリメント', 'マスク', '消毒'] },
    { id: 'cosmetics', name: '化粧品', synonyms: ['化粧品', 'コスメ', 'スキンケア', 'メイク'] },

    // 雑貨
    { id: 'stationery', name: '文具', synonyms: ['文具', '文房具', 'ペン', 'ノート', 'ファイル'] },
    { id: 'kitchenware', name: 'キッチン用品', synonyms: ['キッチン用品', '食器', '調理器具', '鍋', 'フライパン'] },
    { id: 'electronics', name: '家電', synonyms: ['家電', '電化製品', '電池', 'ケーブル'] },

    // 衣服
    { id: 'apparel', name: '衣服', synonyms: ['衣類', '服', 'ファッション', '下着', '靴下', 'シャツ'] },

    // 嗜好品
    { id: 'tobacco', name: 'タバコ', synonyms: ['タバコ', '煙草'] },
    { id: 'books', name: '本・雑誌', synonyms: ['本', '雑誌', '書籍', 'マンガ'] },
    { id: 'games', name: 'ゲーム・玩具', synonyms: ['ゲーム', 'おもちゃ', 'ホビー'] },

    // その他
    { id: 'unknown', name: '不明', synonyms: ['不明'] },
    { id: 'other_minor', name: 'その他', synonyms: ['その他'] },
    { id: 'ー', name: 'ー', synonyms: [] } // デフォルト
];

// 定義リストから辞書と表示マッピングを生成
export const MINOR_CATEGORY_DICTIONARY = {};
export const MINOR_CATEGORY_DISPLAY_NAMES = {};

MINOR_CATEGORY_DEFINITIONS.forEach(def => {
    // 表示名マッピング
    MINOR_CATEGORY_DISPLAY_NAMES[def.id] = def.name;

    // 辞書マッピング (同義語 -> ID)
    if (def.synonyms && Array.isArray(def.synonyms)) {
        def.synonyms.forEach(synonym => {
            MINOR_CATEGORY_DICTIONARY[synonym] = def.id;
        });
    }
});


// OCR Default Parameters
export const defaultOCRParams = {
    limitSideLen: 2000,
    detDbThresh: 0.4,
    detDbBoxThresh: 0.6,
    recScoreThresh: 0.6,
    preprocessContrast: 1.3,
    enableContrast: true,
    enableSharpening: true
};
