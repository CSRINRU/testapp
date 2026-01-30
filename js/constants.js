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
    {
        id: 'vegetables',
        name: '野菜',
        synonyms: ['野菜', '青果', 'ベジタブル', '根菜', '葉物', '生野菜', 'カット野菜', '農産物', '農産', 'きのこ', '山菜', 'ハーブ', '豆類']
    },
    {
        id: 'meat',
        name: '肉',
        synonyms: ['肉', '精肉', '食肉', '牛肉', '豚肉', '鶏肉', '挽肉', 'ホルモン', '内臓肉', 'ジビエ', 'ラム', 'マトン', '味付け肉', 'ハム', 'ソーセージ', 'ベーコン']
    },
    {
        id: 'fish',
        name: '魚',
        synonyms: ['魚', '鮮魚', '魚介', '刺身', '切身', '干物', '海鮮', '水産物', '貝類', 'えび', 'かに', 'タコ', 'イカ', '練り物', '塩干', '海藻']
    },
    {
        id: 'deli',
        name: '惣菜',
        synonyms: ['惣菜', 'お惣菜', '弁当', 'おかず', '揚げ物', 'サラダ', '和惣菜', '洋惣菜', '中華惣菜', 'デリカ', 'おつまみ', 'チルド惣菜', '惣菜パン', '日配品']
    },
    {
        id: 'bread',
        name: 'パン',
        synonyms: ['パン', 'ベーカリー', '食パン', 'サンドイッチ', '菓子パン', '調理パン', 'ロールパン', 'フランスパン', 'デニッシュ', 'ベーグル']
    },
    {
        id: 'snacks',
        name: '菓子',
        synonyms: ['菓子', 'お菓子', 'スナック', 'デザート', 'スイーツ', 'アイス', 'チョコレート', 'キャンディ', 'ガム', 'クッキー', '煎餅', '和菓子', '洋菓子', '駄菓子', 'ゼリー', 'プリン']
    },
    {
        id: 'beverage',
        name: '飲料',
        synonyms: ['飲み物', '飲料', 'ドリンク', '酒', 'アルコール', '水', '茶', 'コーヒー', 'ジュース', '清涼飲料', '炭酸飲料', '牛乳', '豆乳', '野菜ジュース', 'スポーツドリンク', 'エナジードリンク', 'ビール', 'ワイン', '焼酎', '日本酒', 'ウィスキー']
    },
    {
        id: 'seasoning',
        name: '調味料',
        synonyms: ['調味料', 'スパイス', '油', '醤油', '味噌', '塩', '砂糖', '酢', 'ソース', 'ケチャップ', 'マヨネーズ', 'ドレッシング', 'だし', 'つゆ', 'みりん', '香辛料', 'わさび', 'からし', 'ルー']
    },
    {
        id: 'processed_food',
        name: '加工食品',
        synonyms: ['加工食品', 'インスタント', 'レトルト', '缶詰', '乾物', '冷凍食品', '麺類', 'カップ麺', 'パスタ', 'シリアル', 'ジャム', 'ふりかけ', '漬物', '豆腐', '納豆', '練り製品', '米', '餅', '小麦粉']
    },
    {
        id: 'dairy',
        name: '乳製品',
        synonyms: ['乳製品', '牛乳', 'チーズ', 'ヨーグルト', 'バター', 'マーガリン', 'クリーム', '生クリーム', '脱脂粉乳', '乳飲料']
    },
    {
        id: 'egg',
        name: '卵',
        synonyms: ['卵', '鶏卵', '玉子', 'たまご', '生卵', 'うずらの卵', '加工卵']
    },

    // 日用品・消耗品
    {
        id: 'consumables',
        name: '消耗品',
        synonyms: ['消耗品', '洗剤', 'ティッシュ', 'トイレットペーパー', 'シャンプー', '石鹸', '住居用洗剤', '洗濯洗剤', '台所洗剤', '柔軟剤', '消臭剤', '芳香剤', '清掃用品', '掃除道具', '衛生用品', '生理用品', '紙おむつ', 'ポリ袋', 'ラップ', 'アルミホイル']
    },
    {
        id: 'medical',
        name: '医薬品',
        synonyms: ['医薬品', '薬', 'サプリメント', 'マスク', '消毒', '常備薬', '絆創膏', '湿布', '目薬', '胃腸薬', '風邪薬', '鎮痛剤', '漢方薬', '健康食品', 'コンタクト用品']
    },
    {
        id: 'cosmetics',
        name: '化粧品',
        synonyms: ['化粧品', 'コスメ', 'スキンケア', 'メイク', '基礎化粧品', 'ヘアケア', 'ボディケア', '日焼け止め', 'ハンドクリーム', '香水', '美容用品']
    },

    // 雑貨
    {
        id: 'stationery',
        name: '文具',
        synonyms: ['文具', '文房具', 'ペン', 'ノート', 'ファイル', '筆記用具', '事務用品', '封筒', 'のり', 'ハサミ', 'カッター', 'メモ帳', 'カレンダー']
    },
    {
        id: 'kitchenware',
        name: 'キッチン用品',
        synonyms: ['キッチン用品', '食器', '調理器具', '鍋', 'フライパン', '包丁', 'まな板', 'ボウル', '保存容器', 'キッチン雑貨', 'カトラリー', '水回り用品']
    },
    {
        id: 'electronics',
        name: '家電',
        synonyms: ['家電', '電化製品', '電池', 'ケーブル', '照明', '管球', 'キッチン家電', '生活家電', '理美容家電', 'PC周辺機器', 'スマホアクセサリ', 'AV機器']
    },

    // 衣服
    {
        id: 'apparel',
        name: '衣服',
        synonyms: ['衣類', '服', 'ファッション', '下着', '靴下', 'シャツ', 'インナー', '靴', 'シューズ', '帽子', 'バッグ', '小物', '寝具', 'タオル', '洋服']
    },

    // 嗜好品
    {
        id: 'tobacco',
        name: 'タバコ',
        synonyms: ['タバコ', '煙草', '喫煙具', '電子タバコ', '加熱式タバコ', 'シガー', 'ライター']
    },
    {
        id: 'books',
        name: '本・雑誌',
        synonyms: ['本', '雑誌', '書籍', 'マンガ', 'コミック', '文庫', '新書', '絵本', '参考書', '新聞', 'ムック', '電子書籍']
    },
    {
        id: 'games',
        name: 'ゲーム・玩具',
        synonyms: ['ゲーム', 'おもちゃ', 'ホビー', '玩具', 'フィギュア', 'プラモデル', 'カードゲーム', 'ぬいぐるみ', '知育玩具', 'パーティーグッズ', 'テレビゲーム']
    },

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
    detDbThresh: 0.25,
    detDbBoxThresh: 0.3,
    recScoreThresh: 0.45,
    paddingRatio: 0.35, // 文字領域のパディング率 (35%)
    preprocessContrast: 0.8,
    enableContrast: true,
    enableSharpening: false
};
