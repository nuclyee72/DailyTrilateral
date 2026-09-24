/**
 * hubApi.js — ProjectDaily 허브(/ProjectDaily/)가 카드 안에서 이 게임의 통계를 보여 줄 때 쓰는 모듈.
 * 게임 통계창과 같은 계산(storage · share)을 그대로 쓴다. DOM은 건드리지 않는다.
 * (세 게임 모두 같은 모양: stats · calendarShareText · todayShareText)
 */
import { dateStrKST } from './daily/dateUtil.js';
import { summarize, loadProgress, distBucketsFor, maxGuessesFor } from './daily/storage.js';
import { buildCalendarShareText, buildShareText } from './daily/share.js';

const SITE_URL = 'https://nuclyee72.github.io/DailyTrilateral/';

/** 숫자 4개 + 분포 막대 */
export function stats(mode) {
  const s = summarize(dateStrKST(), mode);
  const labels = distBucketsFor(maxGuessesFor(mode));
  return {
    played: s.played, winRate: s.winRate, curStreak: s.curStreak, maxStreak: s.maxStreak,
    distTitle: '시도 분포',
    dist: labels.map((label, i) => ({ label, count: s.distribution[i], fail: i === labels.length - 1 })),
  };
}

/** 📋 달력 공유 문구 */
export function calendarShareText(mode, year, month) {
  const { results } = summarize(dateStrKST(), mode);
  return buildCalendarShareText({ results, year, month, url: SITE_URL });
}

/** 오늘 결과 공유 문구 — 오늘 그 모드를 아직 안 끝냈으면 null */
export async function todayShareText(mode) {
  const today = dateStrKST();
  const p = loadProgress(today, mode);
  if (!p || p.status === 'playing') return null;
  return buildShareText({ date: today, guesses: p.guesses, url: SITE_URL, variant: mode });
}
