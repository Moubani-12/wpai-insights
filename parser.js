/**
 * parser.js — WhatsApp Chat Export Parser
 *
 * Supports three export formats:
 *  Format A:  "12/31/23, 11:59 PM - Name: message"        (US, 12-hour)
 *  Format B:  "[12/31/23, 23:59:59] Name: message"        (bracketed, 24-hour w/ seconds)
 *  Format C:  "25/05/26, 23:54 - Name: message"            (DD/MM/YY, 24-hour, no seconds)
 *
 * Returns an array of normalized message objects:
 *  { date: Date, sender: string, message: string, isMedia: boolean, hasLink: boolean }
 */

const SYSTEM_KEYWORDS = [
  'messages and calls are end-to-end encrypted',
  'changed their phone number',
  'added you',
  'removed you',
  'left',
  'changed the subject',
  'changed this group',
  'created group',
  'joined using this group',
  "joined using this group's invite link",
  'security code changed',
  'you were added',
  'was added',
  'pinned a message',
  'changed the group description',
  'changed the group icon',
  'deleted this message',
  'this message was deleted',
  'missed voice call',
  'missed video call',
  'you deleted this message',
];

// Format A: "12/31/23, 11:59 PM - Name: message"   (MM/DD/YY, 12-hour with AM/PM)
const REGEX_FORMAT_A = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm))\s-\s(.+?):\s([\s\S]+)/;

// Format B: "[12/31/23, 23:59:59] Name: message"   (bracketed, 24-hour with seconds)
const REGEX_FORMAT_B = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{2}:\d{2}:\d{2})\]\s(.+?):\s([\s\S]+)/;

// Format C: "25/05/26, 23:54 - Name: message"      (DD/MM/YY, 24-hour, no seconds, no AM/PM)
const REGEX_FORMAT_C = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2})\s-\s(.+?):\s([\s\S]+)/;

// System message patterns (no sender colon)
const REGEX_SYS_A = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm))\s-\s(.+)/;
const REGEX_SYS_B = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{2}:\d{2}:\d{2})\]\s(.+)/;
const REGEX_SYS_C = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2})\s-\s(.+)/;

const MEDIA_PLACEHOLDER = '<media omitted>';
const URL_REGEX = /https?:\/\/[^\s]+/gi;

// Invisible Unicode formatting characters WhatsApp sometimes injects
// (LRM, RLM, zero-width space, zero-width joiner/non-joiner, BOM, etc.)
const INVISIBLE_CHARS_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

function stripInvisibleChars(text) {
  return text.replace(INVISIBLE_CHARS_REGEX, '');
}

// Format C uses DD/MM/YY (day first); A and B use MM/DD/YY (month first).
function parseDate(dateStr, timeStr, dayFirst) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  let [p1, p2, y] = parts;
  p1 = parseInt(p1, 10);
  p2 = parseInt(p2, 10);
  y = parseInt(y, 10);
  if (y < 100) y += 2000;

  let d, m;
  if (dayFirst) {
    d = p1; m = p2;
  } else {
    m = p1; d = p2;
  }

  // Parse time
  const timeLower = timeStr.trim().toLowerCase().replace(/\s/g, '');
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  const amPmMatch = timeLower.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?([ap]m)/);
  const h24SecMatch = timeLower.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  const h24Match = timeLower.match(/^(\d{1,2}):(\d{2})$/);

  if (amPmMatch) {
    hours = parseInt(amPmMatch[1], 10);
    minutes = parseInt(amPmMatch[2], 10);
    seconds = amPmMatch[3] ? parseInt(amPmMatch[3], 10) : 0;
    if (amPmMatch[4] === 'pm' && hours !== 12) hours += 12;
    if (amPmMatch[4] === 'am' && hours === 12) hours = 0;
  } else if (h24SecMatch) {
    hours = parseInt(h24SecMatch[1], 10);
    minutes = parseInt(h24SecMatch[2], 10);
    seconds = parseInt(h24SecMatch[3], 10);
  } else if (h24Match) {
    hours = parseInt(h24Match[1], 10);
    minutes = parseInt(h24Match[2], 10);
    seconds = 0;
  }

  return new Date(y, m - 1, d, hours, minutes, seconds);
}

function isSystemMessage(text) {
  const lower = text.toLowerCase();
  return SYSTEM_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Detect which format the file uses.
 * @param {string[]} lines
 * @returns {'A' | 'B' | 'C' | null}
 */
function detectFormat(lines) {
  for (const line of lines.slice(0, 20)) {
    if (REGEX_FORMAT_A.test(line)) return 'A';
    if (REGEX_FORMAT_B.test(line)) return 'B';
    if (REGEX_FORMAT_C.test(line)) return 'C';
  }
  return null;
}

const FORMAT_CONFIG = {
  A: { regex: REGEX_FORMAT_A, sysRegex: REGEX_SYS_A, dayFirst: false, label: '12/31/23, 11:59 PM' },
  B: { regex: REGEX_FORMAT_B, sysRegex: REGEX_SYS_B, dayFirst: false, label: '[12/31/23, 23:59:59]' },
  C: { regex: REGEX_FORMAT_C, sysRegex: REGEX_SYS_C, dayFirst: true,  label: '25/05/26, 23:54' },
};

/**
 * Parse a WhatsApp export .txt file content.
 * @param {string} rawText - Full file contents
 * @returns {{ messages: Array, participants: string[], format: string, error: string|null }}
 */
function parseChat(rawText) {
  // Strip BOM and invisible Unicode formatting characters that WhatsApp
  // sometimes injects before timestamps.
  const cleanedText = stripInvisibleChars(rawText);

  // Normalise line endings
  const lines = cleanedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const formatKey = detectFormat(lines);
  if (!formatKey) {
    return {
      messages: [],
      participants: [],
      format: 'unknown',
      error: 'Could not detect WhatsApp export format. Please make sure you uploaded a valid WhatsApp .txt export.',
    };
  }

  const { regex: REGEX_MSG, sysRegex: REGEX_SYS, dayFirst } = FORMAT_CONFIG[formatKey];

  const messages = [];
  let currentMsg = null;

  for (const line of lines) {
    const msgMatch = REGEX_MSG.exec(line);
    if (msgMatch) {
      // Save previous message
      if (currentMsg) messages.push(currentMsg);

      const [, dateStr, timeStr, sender, text] = msgMatch;
      const date = parseDate(dateStr, timeStr, dayFirst);

      currentMsg = {
        date,
        dateStr,
        timeStr,
        sender: sender.trim(),
        message: text.trim(),
        isMedia: text.trim().toLowerCase().includes(MEDIA_PLACEHOLDER),
        hasLink: URL_REGEX.test(text),
        isSystem: false,
      };
      URL_REGEX.lastIndex = 0; // reset stateful regex
      continue;
    }

    const sysMatch = REGEX_SYS.exec(line);
    if (sysMatch && !REGEX_MSG.test(line)) {
      if (currentMsg) messages.push(currentMsg);
      const [, dateStr, timeStr, sysText] = sysMatch;
      currentMsg = {
        date: parseDate(dateStr, timeStr, dayFirst),
        dateStr,
        timeStr,
        sender: 'System',
        message: sysText.trim(),
        isMedia: false,
        hasLink: false,
        isSystem: true,
      };
      continue;
    }

    // Continuation of previous message (multi-line)
    if (currentMsg && line.trim().length > 0) {
      currentMsg.message += '\n' + line;
      if (!currentMsg.hasLink && URL_REGEX.test(line)) currentMsg.hasLink = true;
      URL_REGEX.lastIndex = 0;
    }
  }

  if (currentMsg) messages.push(currentMsg);

  // Mark remaining system messages by content
  for (const msg of messages) {
    if (!msg.isSystem && isSystemMessage(msg.message)) {
      msg.isSystem = true;
    }
  }

  // Collect unique participant names (non-system)
  const participantSet = new Set();
  for (const msg of messages) {
    if (!msg.isSystem) participantSet.add(msg.sender);
  }

  return {
    messages,
    participants: [...participantSet],
    format: FORMAT_CONFIG[formatKey].label,
    error: null,
  };
}

// Export for use in app.js (browser global)
window.ChatParser = { parseChat };