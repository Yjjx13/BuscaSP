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
  // `\w` does not regard Chinese characters as word characters.  Check for
  // actual Latin or CJK letters instead, so valid Chinese product titles are
  // not mistaken for a title made only of symbols or digits.
  if (/^(.)\1{4,}$/.test(compact) || !/[A-Za-z\u3400-\u9FFF]/.test(compact)) {
    return '商品标题不得仅由数字、符号或重复字符组成';
  }
  return null;
}
