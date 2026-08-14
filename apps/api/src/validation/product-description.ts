const BLOCKED_PHRASES = [
  '海量出货', '大量出货', '清仓出货', '111', '1111', 'test', '测试商品', '联系我', '私聊', '有货', '便宜出'
];

/** Returns a user-facing validation message, or null when the description is usable. */
export function productDescriptionError(value: string): string | null {
  const text = value.trim();
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 5) return '商品标题不得少于5个字符，并应注明具体商品名称';
  if (BLOCKED_PHRASES.some(phrase => compact.toLowerCase().includes(phrase))) {
    return '商品标题不得包含泛化营销用语或无意义内容';
  }
  if (/^(.)\1{4,}$/.test(compact) || /^[\d\W_]+$/.test(compact)) {
    return '商品标题不得仅由数字、符号或重复字符组成';
  }
  return null;
}
