/**
 * 앱 안내 문구 한 줄을 시안의 하루 한 번 안내 모양(제목 + 설명)으로 나눈다.
 * "오늘은 이미 일기로 물을 받았어요. 일기는 저장했고, ..." → 첫 문장이 제목, 나머지가 설명
 * React Native 없이 테스트하려고 DailyNotice.tsx와 나눴다.
 */
export function splitNotice(text: string): { title: string; description: string | null } {
  const at = text.indexOf('. ');
  if (at < 0) return { title: text, description: null };
  return { title: text.slice(0, at), description: text.slice(at + 2) };
}
