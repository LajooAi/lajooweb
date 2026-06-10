const QUOTE_RECOMMENDATION_LABEL_REGEX = /(\s*)(\*{0,2}\b(My pick|Why|Trade-off|Next):\*{0,2})/g;

function getRecommendationLabels(text) {
  const labels = [];
  const matcher = new RegExp(QUOTE_RECOMMENDATION_LABEL_REGEX.source, 'g');
  let match = matcher.exec(text);

  while (match) {
    labels.push(String(match[3] || '').toLowerCase());
    match = matcher.exec(text);
  }

  return labels;
}

export function normalizeStructuredRecommendationParagraphs(text) {
  if (!text || typeof text !== 'string') return text;

  const labels = getRecommendationLabels(text);
  const hasRecommendationStructure =
    labels.includes('my pick') &&
    labels.filter((label) => ['why', 'trade-off', 'next'].includes(label)).length >= 2;

  if (!hasRecommendationStructure) return text;

  return text
    .replace(QUOTE_RECOMMENDATION_LABEL_REGEX, (match, leadingWhitespace, labelText, _label, offset, fullText) => {
      const prefix = fullText.slice(0, offset);
      if (!prefix.trim()) return `${leadingWhitespace}${labelText}`;
      return `\n\n${labelText}`;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
