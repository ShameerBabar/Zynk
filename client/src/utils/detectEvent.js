/**
 * detectEvent.js
 * Analyses a plain-text message and returns event metadata if a date/time is found.
 * Fully case-insensitive — works with "football", "Football", "FOOTBALL" etc.
 *
 * Returns:
 *   { detected: false }
 *   { detected: true, suggestedTitle, suggestedDate (YYYY-MM-DD), suggestedTime (HH:MM 24h) }
 */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseTime(text) {
  // Case-insensitive: matches "7 PM", "7pm", "7:30 PM", "7:30pm", "19:00"
  const t12 = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (t12) {
    let h = parseInt(t12[1], 10);
    const m = t12[2] ? parseInt(t12[2], 10) : 0;
    const mer = t12[3].toLowerCase();
    if (mer === 'pm' && h !== 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    return `${pad(h)}:${pad(m)}`;
  }
  // 24h: "19:00", "08:30"
  const t24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (t24) {
    return `${pad(parseInt(t24[1], 10))}:${t24[2]}`;
  }
  return null;
}

function nextWeekday(dayIndex) {
  const now = new Date();
  const diff = (dayIndex - now.getDay() + 7) % 7 || 7;
  const result = new Date(now);
  result.setDate(now.getDate() + diff);
  return result;
}

function extractTitle(text) {
  // Strip known date/time words to leave the event subject
  let title = text
    .replace(/\b(this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\btomorrow\b/gi, '')
    .replace(/\btonight\b/gi, '')
    .replace(/\btoday\b/gi, '')
    .replace(/\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, '')
    .replace(/\bat\b/gi, '')
    .replace(/\bon\b/gi, '')
    .replace(/[?"']+/g, '')        // strip punctuation
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!title) return 'Event';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function detectEvent(text) {
  if (!text || text.length < 3) return { detected: false };

  // Work on lowercase copy for matching — original text used for title
  const lower = text.toLowerCase();
  const now = new Date();
  let date = null;
  let time = parseTime(lower);

  // 1. "tomorrow"
  if (/tomorrow/.test(lower)) {
    date = new Date(now);
    date.setDate(now.getDate() + 1);
  }

  // 2. "tonight" or "today"
  if (!date && /(tonight|today)/.test(lower)) {
    date = new Date(now);
  }

  // 3. Day names — "Friday", "this Friday", "next Friday"
  if (!date) {
    for (let i = 0; i < DAYS.length; i++) {
      const re = new RegExp(`(?:this |next )?${DAYS[i]}`);
      if (re.test(lower)) {
        date = nextWeekday(i);
        break;
      }
    }
  }

  // 4. Month + day — "June 27", "Dec 25th"
  if (!date) {
    const longMonths = MONTHS.join('|');
    const shortMonths = MONTH_SHORT.join('|');
    const re = new RegExp(`(${longMonths}|${shortMonths})\\s+(\\d{1,2})(?:st|nd|rd|th)?`);
    const m = lower.match(re);
    if (m) {
      let monthIdx = MONTHS.indexOf(m[1]);
      if (monthIdx === -1) monthIdx = MONTH_SHORT.indexOf(m[1]);
      if (monthIdx !== -1) {
        const day = parseInt(m[2], 10);
        const candidate = new Date(now.getFullYear(), monthIdx, day);
        if (candidate < now) candidate.setFullYear(now.getFullYear() + 1);
        date = candidate;
      }
    }
  }

  // Need at least a date to trigger detection (bare times without date are too noisy)
  if (!date) return { detected: false };

  return {
    detected: true,
    suggestedTitle: extractTitle(text),
    suggestedDate: toISO(date),
    suggestedTime: time,
  };
}
