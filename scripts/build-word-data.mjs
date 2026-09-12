/**
 * build-word-data.mjs — 원본 명사 목록을 내려받아 "2음절 순한글 단어"만 추려 src/data/*.json으로 저장.
 *
 *   npm run build-word-data
 *
 * 원본 출처: han-dle/pd-korean-noun-list-for-wordles (CC0-1.0 — 저작권 없음, 자유 이용/재배포 가능).
 * 그 저장소 자체도 국립국어원 표준국어대사전 + 한국어 학습용 어휘 목록을 가공한 것.
 *   https://github.com/han-dle/pd-korean-noun-list-for-wordles
 *
 * 두 목록을 받는다:
 *  - CommonNouns → words-common-2syl.json  (일상 어휘. 퍼즐 출제용 1순위)
 *  - AllNouns    → words-all-2syl.json     (표준국어대사전 전체. 생성이 막힐 때 보조 풀 + 정답 검증용)
 *
 * 필터 규칙: 정확히 2글자이고 `^[가-힣]{2}$`에 맞는 것만 (한 노드 = 한 음절이라 2음절 단어만 유효한 링크).
 */
const SRC = {
  common: 'https://raw.githubusercontent.com/han-dle/pd-korean-noun-list-for-wordles/main/src/CommonNouns.js',
  all: 'https://raw.githubusercontent.com/han-dle/pd-korean-noun-list-for-wordles/main/src/AllNouns.js',
};

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

const TWO_SYLLABLE = /^[가-힣]{2}$/;

/** `'use strict'; const nouns = [...]; module.exports = nouns;` 형태의 소스를 배열로 평가 */
function parseNounsSource(src) {
  const body = src.replace(/^'use strict';/, '').replace(/module\.exports\s*=\s*nouns;\s*$/, '');
  // eslint-disable-next-line no-new-func -- 원본 저장소는 리터럴 배열만 담고 있어 안전
  return new Function(`${body}\nreturn nouns;`)();
}

async function fetchNouns(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 요청 실패: ${res.status}`);
  return parseNounsSource(await res.text());
}

function twoSyllableOnly(list) {
  return [...new Set(list.filter((w) => TWO_SYLLABLE.test(w)))].sort();
}

async function main() {
  console.log('원본 명사 목록 내려받는 중...');
  const [common, all] = await Promise.all([fetchNouns(SRC.common), fetchNouns(SRC.all)]);

  const commonTwo = twoSyllableOnly(common);
  const allTwo = twoSyllableOnly(all);

  console.log(`상용 어휘: ${common.length}개 → 2음절 ${commonTwo.length}개`);
  console.log(`전체 사전: ${all.length}개 → 2음절 ${allTwo.length}개`);

  await writeFile(path.join(DATA_DIR, 'words-common-2syl.json'), JSON.stringify(commonTwo));
  await writeFile(path.join(DATA_DIR, 'words-all-2syl.json'), JSON.stringify(allTwo));
  console.log('저장 완료: src/data/words-common-2syl.json, src/data/words-all-2syl.json');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
