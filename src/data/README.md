# 단어 데이터 (2음절 명사)

## 파일

- `words-common-2syl.json` — **일상 어휘 2,185개**. 퍼즐 출제(정답 트리 생성)에 1순위로 쓰는 풀.
- `words-all-2syl.json` — **표준국어대사전 전체 2음절 명사 75,333개**. `words-common-2syl.json`만으로
  트리를 못 찾을 때 보조 풀, 그리고 "이 조합이 사전에 실제로 있는 단어인가"를 검증하는 용도.

두 파일 모두 `["가게", "가격", ...]` 형태의 단순 문자열 배열(오름차순 정렬, 중복 없음)이다.

## 출처 · 저작권

[han-dle/pd-korean-noun-list-for-wordles](https://github.com/han-dle/pd-korean-noun-list-for-wordles)
(**CC0-1.0**, 저작권 없음 — 자유롭게 가공·재배포 가능). 2026-09-12 시점의 `main` 브랜치에서 받음.

그 저장소의 원 출처는 국립국어원:
- `CommonNouns` ← [한국어 학습용 어휘 목록](https://www.korean.go.kr/front/etcData/etcDataView.do?mn_id=46&etc_seq=70&pageIndex=44) (2019-05-30 수정본)
- `AllNouns` ← 표준국어대사전 명사 (2018-11-13 수집)

## 필터 규칙

`^[가-힣]{2}$`에 맞는 것만(정확히 2글자, 순한글) 남김 — 노드 하나가 음절 한 글자이므로, 부모+자식
두 글자가 합쳐졌을 때 유효한 "2음절 단어"인지만 확인하면 되기 때문. 원본에서 `-`로 시작하는 접사류나
띄어쓰기 포함 표제어는 이미 제외되어 있음(원본 저장소 README 참고).

## 갱신 방법

```sh
npm run build-word-data
```

`scripts/build-word-data.mjs`가 원본을 다시 받아 이 두 파일을 새로 만든다.
