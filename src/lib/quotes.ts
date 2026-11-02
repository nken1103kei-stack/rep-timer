export type QuoteCategory = "筋肉痛" | "食事" | "筋トレ" | "脚トレ" | "ジム";
export type Quote = { id: number; name: string; quote: string; category: QuoteCategory };

/** Parody quotes from fictional "fitness legends" shown at the top of the home screen. */
export const QUOTES: Quote[] = [
  { id: 1, name: "ソクラテス・スクワテス", quote: "無知の知。脚トレの翌日は、歩けぬことを知る。", category: "筋肉痛" },
  { id: 3, name: "レオナルド・ダ・ベンチ", quote: "最後の晩餐？いや、最後のチートデイだ。", category: "食事" },
  { id: 4, name: "ガリレオ・ガリマッチョ", quote: "それでもバーベルは動く。", category: "筋トレ" },
  { id: 6, name: "ルネ・デカルトレ", quote: "我、鍛える。ゆえに我、筋肉痛あり。", category: "筋肉痛" },
  { id: 7, name: "ウィリアム・シェイクスピアー", quote: "挙げるべきか、下ろすべきか。それが問題だ。", category: "筋トレ" },
  { id: 8, name: "チャールズ・ダー筋", quote: "生き残るのは最も強い者ではない。脚トレから逃げなかった者だ。", category: "脚トレ" },
  { id: 9, name: "アルベルト・アインシュタ筋", quote: "時間は相対的だ。プランクの1分は明らかに長い。", category: "筋トレ" },
  { id: 10, name: "フリードリヒ・ニーチェスト", quote: "筋肉を殺さない重量は、筋肉を強くする。", category: "筋トレ" },
  { id: 14, name: "武田信ゲイン", quote: "風林火山。風のように入館し、山のようにベンチから動かぬ。", category: "ジム" },
  { id: 15, name: "伊達マサムキ", quote: "あと10年早く生まれていれば、ベンチ100kgいけたのに。", category: "筋トレ" },
  { id: 18, name: "二宮筋次郎", quote: "薪を背負って勉強するな。薪を背負ってスクワットしろ。", category: "脚トレ" },
  { id: 20, name: "アルキメデス・デッドリフト", quote: "我に十分な長さのテコを与えよ。ジムごと持ち上げてみせよう。", category: "筋トレ" },
  { id: 24, name: "ウィンストン・チャーチルアップ", quote: "決して屈するな。決して、決して。ただしスクワットでは屈め。", category: "脚トレ" },
  { id: 25, name: "マーティン・ルーサー・筋グ", quote: "私には夢がある。いつの日か、腹筋が照明なしで割れて見えるという夢が。", category: "筋トレ" },
  { id: 26, name: "ジョン・F・ケネディップス", quote: "ジムが何をしてくれるかではなく、自分がジムで何をするかを問え。", category: "ジム" },
  { id: 27, name: "ジョージ・ワシントレーニング", quote: "私は嘘をつけない。昨日、脚トレをサボりました。", category: "脚トレ" },
  { id: 28, name: "夏目ソウセ筋", quote: "月が綺麗ですね。いや、それより君の三角筋が綺麗ですね。", category: "筋トレ" },
  { id: 29, name: "太宰オサムキ", quote: "生まれて、すみません。脚トレ飛ばして、もっとすみません。", category: "脚トレ" },
  { id: 30, name: "フランツ・カフカーフレイズ", quote: "ある朝目覚めると、私は巨大な筋肉痛に変身していた。", category: "筋肉痛" },
];

/** Accent per quote category, taken from the body-part palette. */
export const QUOTE_COLORS: Record<QuoteCategory, string> = {
  筋肉痛: "#FF375F",
  食事: "#E0A100",
  筋トレ: "#FF4F00",
  脚トレ: "#30D158",
  ジム: "#0A84FF",
};

/** A random quote, never the one currently shown. */
export function pickQuote(currentId: number | null, rand: () => number = Math.random): Quote {
  const pool = QUOTES.filter((q) => q.id !== currentId);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
