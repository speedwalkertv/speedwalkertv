/** Contrato estavel para qualquer jogo: {kind:'event',event:{type,user,...}}. */
const text = (value, max = 180) => String(value ?? '').slice(0, max);
const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 1000000) : fallback;
};

const userOf = (raw) => {
  const user = raw?.user ?? raw?.details?.user ?? raw ?? {};
  return {
    id: text(user.userId ?? user.user_id ?? '', 80),
    username: text(user.uniqueId ?? user.unique_id ?? '', 80),
    nickname: text(user.nickname ?? user.uniqueId ?? 'Visitante', 80)
  };
};

export function normalizeEvent(type, raw = {}) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const base = { type, user: userOf(data), timestamp: Date.now() };

  switch (type) {
    case 'chat':
      return { ...base, text: text(data.comment, 250) };
    case 'gift': {
      const giftType = Number(data.giftDetails?.giftType ?? data.giftType ?? 0);
      // Em presentes com sequencia, o TikTok envia cada progresso e depois o mesmo
      // total novamente. Acoes de jogo ocorrem apenas no fim para nao duplicar.
      if (giftType === 1 && !data.repeatEnd) return null;
      return {
        ...base,
        giftId: text(data.giftId, 60),
        giftName: text(data.giftDetails?.giftName ?? data.extendedGiftInfo?.name ?? data.giftName ?? 'Presente', 100),
        count: Math.max(1, number(data.repeatCount, 1)),
        diamondsEach: number(data.extendedGiftInfo?.diamond_count ?? data.extendedGiftInfo?.diamondCount ?? data.giftDetails?.diamondCount),
        streak: giftType === 1
      };
    }
    case 'like':
      return { ...base, count: number(data.likeCount), total: number(data.totalLikeCount) };
    case 'follow':
    case 'share':
    case 'join':
    case 'subscribe':
      return base;
    case 'viewer_count':
      return { ...base, count: number(data.viewerCount ?? data.memberCount) };
    case 'question':
      return { ...base, text: text(data.details?.questionText ?? data.questionText, 250) };
    default:
      return null;
  }
}
