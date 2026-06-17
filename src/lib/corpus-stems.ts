import { LYRIC_STEM_RANKS } from "./lyric-stem-ranks";

export type CorpusStem = {
  stem: string;
  rank: number;
};

export const CORPUS_STEMS_BY_RANK: CorpusStem[] = Object.entries(LYRIC_STEM_RANKS)
  .map(([stem, rank]) => ({ stem, rank }))
  .sort((a, b) => a.rank - b.rank);

export function getCorpusStemAtRank(rank: number) {
  return CORPUS_STEMS_BY_RANK[rank - 1] ?? null;
}
