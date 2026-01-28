/**
 * 日付のフォーマット
 * @param {string} dateString 
 * @returns {string} フォーマットされた日付
 */
export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
