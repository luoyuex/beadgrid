// Explicitly retire the old credit endpoint; stale clients must refresh.
export async function POST() {
  return Response.json({ error: '次数制已停用，请刷新页面并使用会员兑换入口' }, { status: 410 });
}
