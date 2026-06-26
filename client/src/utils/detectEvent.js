/**
 * detectEvent.js
 * Analyses a plain-text message and returns event metadata if a date/time is found.
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
  // Matches "7 PM", "7:30 PM", "19:00", "8am", "8:30am"
  const t12 = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (t12) {
    let h = parseInt(t12[1], 10);
    const m = t12[2] ? parseInt(t12[2], 10) : 0;
    const mer = t12[3].toLowerCase();
    if (mer === 'pm' && h !== 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    return `${pad(h)}:${pad(m)}`;
  }
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
  // Strip date/time phrases to leave a clean title
  const strip = [
    /\b(this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\btomorrow\b/gi,
    /\btonight\b/gi,
    /\btoday\b/gi,
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi,
    /\bat\b/gi,
    /\bon\b/gi,
  ];
  let title = text;
  strip.forEach(r => { title = title.replace(r, ' '); });
  title = title.replace(/\s{2,}/g, ' ').trim();
  // Capitalise first letter
  return title.charAt(0).toUpperCase() + title.slice(1) || 'Event';
}

export function detectEvent(text) {
  if (!text || text.length < 3) return { detected: false };

  const lower = text.toLowerCase();
  const now = new Date();
  let date = null;
  let time = parseTime(lower);

  // 1. "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    date = new Date(now);
    date.setDate(now.getDate() + 1);
  }

  // 2. "tonight" or "today"
  if (!date && /\b(tonight|today)\b/.test(lower)) {
    date = new Date(now);
  }

  // 3. Day names e.g. "Friday", "this Friday", "next Friday"
  if (!date) {
    for (let i = 0; i < DAYS.length; i++) {
      const re = new RegExp(`\\b(?:this |next )?${DAYS[i]}\\b`, 'i');
      if (re.test(lower)) {
        date = nextWeekday(i);
        break;
      }
    }
  }

  // 4. Month + day e.g. "June 27", "Dec 25th"
  if (!date) {
    const longMonths = MONTHS.join('|');
    const shortMonths = MONTH_SHORT.join('|');
    const re = new RegExp(`\\b(${longMonths}|${shortMonths})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
    const m = lower.match(re);
    if (m) {
      let monthIdx = MONTHS.indexOf(m[1].toLowerCase());
      if (monthIdx === -1) monthIdx = MONTH_SHORT.indexOf(m[1].toLowerCase());
      if (monthIdx !== -1) {
        const day = parseInt(m[2], 10);
        const candidate = new Date(now.getFullYear(), monthIdx, day);
        if (candidate < now) candidate.setFullYear(now.getFullYear() + 1);
        date = candidate;
      }
    }
  }

  // Only report detection if at least a date OR a time with a strong hint was found
  if (!date && !time) return { detected: false };

  // If we only have a time (no date), require at least a day/today/tomorrow word — skip bare times
  if (!date && time) return { detected: false };

  return {
    detected: true,
    suggestedTitle: extractTitle(text),
    suggestedDate: date ? toISO(date) : null,
    suggestedTime: time,
  };
}
