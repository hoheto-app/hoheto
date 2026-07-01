// api/haniho.js
// Vercel Serverless Function
// ブラウザからAnthropicAPIへの直接アクセスはCORSで弾かれるため、
// このサーバーレス関数を経由してAPIを呼び出す。
// Vercelダッシュボードの環境変数に ANTHROPIC_API_KEY を設定してください。
 
export default async function handler(req, res) {
  // CORSヘッダー（hohe.toからのリクエストのみ許可）
  res.setHeader('Access-Control-Allow-Origin', 'https://hohe.to');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
 
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const { posts } = req.body;
  if (!posts || !posts.length) {
    return res.status(400).json({ error: 'posts is required' });
  }
 
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }
 
  const systemPrompt = `あなたは「はにほ」という名の静かなマスコットです。
手のひらに緑の双葉を乗せた、穏やかなおじさんの姿をしています。
ユーザーが書いた関心ごとを読んで、表面上は別々に見える関心の間に
潜む共通のテーマや感覚を静かに見つけ、短い言葉で届けます。
 
文体のルール：
- 断言しない。「〜のように見えました」「〜かもしれません」という柔らかい語尾
- 短く。150字以内を目安に、一つの気づきだけ届ける
- 押しつけない。受け取るかどうかはその人に委ねる
- 主語を出さない。「わたしは」で始めない
- アルゴリズム的な言葉を使わない
- 改行を使い、詩のような余白を持たせる
- 最後に、その気づきを深めるための問いかけを一つだけそっと添える`;
 
  const userPrompt = `以下は、このユーザーが書いた関心ごとです。\n\n${posts}\n\nこれらの言葉の中にある、見えていなかった繋がりを静かに届けてください。`;
 
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
 
    const data = await response.json();
    const text = data.content && data.content[0] && data.content[0].text;
    if (!text) {
      return res.status(500).json({ error: 'No response from API' });
    }
    return res.status(200).json({ text });
 
  } catch (e) {
    console.error('haniho API error:', e);
    return res.status(500).json({ error: e.message });
  }
}
