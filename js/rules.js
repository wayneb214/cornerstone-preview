// The same daily rules as Packages/CornerstoneCore/Sources/CornerstoneCore/Rules.swift.
// Question order uses Swift's SplitMix64 seed and Fisher-Yates shuffle.

const MASK = (1n << 64n) - 1n;
export const FREE_QUESTIONS = 3;
export const MONTHLY = "£3.99";
export const ANNUAL = "£29.99";
export const ANNUAL_PER_MONTH = "£2.50";
export const TRIAL_DAYS = 7;
export const ROME_PACK = "£2.99";
export const ROME_FOR_SALE = false;

export function dayKey(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function previousDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  const yy = date.getUTCFullYear();
  const mm = date.getUTCMonth() + 1;
  const dd = date.getUTCDate();
  return `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function dayOfYear(date) {
  const y = date.getFullYear();
  const start = Date.UTC(y, 0, 1);
  const current = Date.UTC(y, date.getMonth(), date.getDate());
  return Math.floor((current - start) / 86400000) + 1;
}

export function selectFact(facts, date) {
  if (!facts.length) return null;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const matches = facts
    .filter((fact) => (fact.calendar_dates || []).some((item) => item.month === month && item.day === day))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (matches.length) {
    const index = Math.abs(year) % matches.length;
    const primary = matches[index];
    return {
      primary,
      alsoOnThisDay: matches.filter((fact) => fact.id !== primary.id),
      matchedCalendar: true,
    };
  }
  const ordered = facts.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const index = (dayOfYear(date) - 1) % ordered.length;
  return { primary: ordered[index], alsoOnThisDay: [], matchedCalendar: false };
}

function splitmix(state) {
  state = (state + 0x9E3779B97F4A7C15n) & MASK;
  let z = state;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
  return { state, value: (z ^ (z >> 31n)) & MASK };
}

function nextBelow(next, upper) {
  const bound = BigInt(upper);
  let random = next();
  let product = random * bound;
  let low = product & MASK;
  let high = product >> 64n;
  if (low < bound) {
    const threshold = ((0n - bound) & MASK) % bound;
    while (low < threshold) {
      random = next();
      product = random * bound;
      low = product & MASK;
      high = product >> 64n;
    }
  }
  return Number(high);
}

export function quizSeed(date) {
  const year = BigInt(date.getFullYear());
  const month = BigInt(date.getMonth() + 1);
  const day = BigInt(date.getDate());
  return ((year << 16n) ^ (month << 8n) ^ day ^ 0xC05E100n) & MASK;
}

export function orderQuestions(questions, date) {
  const ordered = questions.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let state = quizSeed(date);
  const next = () => {
    const step = splitmix(state);
    state = step.state;
    return step.value;
  };
  let amount = ordered.length;
  let index = 0;
  while (amount > 1) {
    const random = nextBelow(next, amount);
    amount -= 1;
    const other = index + random;
    const swap = ordered[index];
    ordered[index] = ordered[other];
    ordered[other] = swap;
    index += 1;
  }
  return ordered;
}

export function recordStreak(state, date) {
  const key = dayKey(date);
  if (state.lastCompletedDayKey === key) return { ...state };
  const next = { ...state };
  if (state.lastCompletedDayKey && previousDayKey(key) === state.lastCompletedDayKey) {
    next.current = state.current + 1;
  } else {
    next.current = 1;
  }
  next.longest = Math.max(state.longest || 0, next.current);
  next.lastCompletedDayKey = key;
  return next;
}

export function remainingQuestions(ordered, answeredIds, isMember) {
  const answered = new Set(answeredIds);
  const pending = ordered.filter((question) => !answered.has(question.id));
  if (isMember) return pending;
  const used = ordered.filter((question) => answered.has(question.id)).length;
  const left = Math.max(0, FREE_QUESTIONS - used);
  return pending.slice(0, left);
}

export function countsAsDailyCompletion(answeredCount, available) {
  const needed = Math.min(FREE_QUESTIONS, available);
  return needed > 0 && answeredCount >= needed;
}

export function englishDay(date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(date);
}

export function englishChecked(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return iso || "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
