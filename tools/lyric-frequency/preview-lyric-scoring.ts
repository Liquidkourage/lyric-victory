import { getLyricWordScoreBreakdown } from "../../src/lib/lyric-scoring";

const sampleWords = [
  "the",
  "i",
  "you",
  "love",
  "baby",
  "babies",
  "yeah",
  "oh",
  "ooh",
  "na",
  "la",
  "hey",
  "whoa",
  "tonight",
  "heart",
  "girl",
  "dance",
  "dancing",
  "lonely",
  "forever",
  "surrender",
  "hallelujah",
  "thunderstruck",
  "serendipity",
  "discombobulate",
];

console.log("Single-appearance preview:");
console.log("word,source,stem,rank,basePoints,points");
for (const word of sampleWords) {
  const result = getLyricWordScoreBreakdown(word, 1);
  console.log(
    `${result.word},${result.source},${result.matchedStem ?? "(fallback)"},${result.rank},${result.basePoints},${result.pointsPerBlank}`,
  );
}

console.log("");
console.log("Repeated-word preview:");
console.log("word,appearances,source,stem,rank,basePoints,pointsPerBlank,totalIfAllRevealed");
for (const word of ["baby", "yeah", "na", "love", "tonight", "hallelujah"]) {
  for (const appearances of [2, 3, 4, 6]) {
    const result = getLyricWordScoreBreakdown(word, appearances);
    console.log(
      `${result.word},${appearances},${result.source},${result.matchedStem ?? "(fallback)"},${result.rank},${result.basePoints},${result.pointsPerBlank},${result.pointsPerBlank * appearances}`,
    );
  }
}
