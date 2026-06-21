/**
 * stats.js — Statistics Engine
 * Computes all analytics from the parsed messages array.
 */

// ─── Common English + Hindi stopwords ─────────────────────────────────────────
const STOPWORDS = new Set([
  // English
  'a','about','above','after','again','against','all','am','an','and','any','are',
  'aren\'t','as','at','be','because','been','before','being','below','between',
  'both','but','by','can','can\'t','cannot','could','couldn\'t','did','didn\'t',
  'do','does','doesn\'t','doing','don\'t','down','during','each','few','for',
  'from','further','get','got','had','hadn\'t','has','hasn\'t','have','haven\'t',
  'having','he','he\'d','he\'ll','he\'s','her','here','here\'s','hers','herself',
  'him','himself','his','how','how\'s','i','i\'d','i\'ll','i\'m','i\'ve','if','in',
  'into','is','isn\'t','it','it\'s','its','itself','just','let\'s','like','ll','m',
  'me','more','most','mustn\'t','my','myself','no','nor','not','of','off','on',
  'once','only','or','other','ought','our','ours','ourselves','out','over','own',
  're','s','same','shan\'t','she','she\'d','she\'ll','she\'s','should','shouldn\'t',
  'so','some','such','t','than','that','that\'s','the','their','theirs','them',
  'themselves','then','there','there\'s','these','they','they\'d','they\'ll',
  'they\'re','they\'ve','this','those','through','to','too','under','until','up',
  'us','very','ve','was','wasn\'t','we','we\'d','we\'ll','we\'re','we\'ve','were',
  'weren\'t','what','what\'s','when','when\'s','where','where\'s','which','while',
  'who','who\'s','whom','why','why\'s','will','with','won\'t','would','wouldn\'t',
  'you','you\'d','you\'ll','you\'re','you\'ve','your','yours','yourself','yourselves',
  // Common chat words
  'ok','okay','yeah','yes','yep','no','nope','hi','hello','hey','bye','lol','haha',
  'hahaha','lmao','omg','wtf','btw','tbh','imo','idk','dm','bro','dude','hmm',
  'ohh','ohhhh','ah','ohh','oh','ha','haha','ha','ooh','oof','ugh','wow','wow',
  // Hindi transliteration common words
  'hai','hain','ho','tha','thi','the','ka','ki','ke','ko','se','mein','par','aur',
  'kya','nahi','nahin','haan','yeh','woh','koi','bhi','toh','ab','kal','aaj',
  'bahut','accha','sahi','theek',
  // Special tokens
  'media','omitted','null','undefined','deleted','message','https','http','www',
]);

// ─── Basic sentiment wordlists (NOT AI — simple keyword counting) ─────────────
// This is a lightweight stand-in for real sentiment analysis: it just counts
// positive vs negative words per month. It's a rough mood indicator, not a
// linguistically accurate measure.
const POSITIVE_WORDS = new Set([
  'good','great','awesome','amazing','love','happy','nice','fun','best','cool',
  'thanks','thank','perfect','excellent','wonderful','glad','excited','yay',
  'beautiful','fantastic','super','enjoy','enjoyed','congrats','congratulations',
  'proud','grateful','blessed','win','won','success','lovely','sweet','haha',
  'lol','lmao','great','superb','brilliant','yes','sure','definitely','agree',
  'accha','badhiya','mast','khushi','pyaar','shukriya',
]);

const NEGATIVE_WORDS = new Set([
  'bad','sad','hate','angry','annoyed','upset','sorry','problem','issue','wrong',
  'terrible','awful','worst','horrible','disappointed','frustrated','tired',
  'sick','pain','hurt','cry','crying','fight','fought','argument','stress',
  'stressed','worried','worry','fear','scared','annoying','ugh','no','never',
  'cant','can\'t','dont','don\'t','stupid','dumb','fail','failed','lost','lose',
  'bura','gussa','dukh','pareshan','tension',
]);

const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
const WORD_REGEX = /\b[a-zA-Z\u00C0-\u024F]{3,}\b/g;

// ─── Helper: Extract emojis from text ─────────────────────────────────────────
function extractEmojis(text) {
  return [...(text.matchAll(EMOJI_REGEX) || [])].map((m) => m[0]);
}

// ─── Helper: Extract words from text ──────────────────────────────────────────
function extractWords(text) {
  const raw = text.toLowerCase().match(WORD_REGEX) || [];
  return raw.filter((w) => !STOPWORDS.has(w) && w.length >= 3 && w.length <= 30);
}

// ─── Helper: format a Date as a readable day key (for streaks) ───────────────
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ─── Helper: human-friendly duration from milliseconds ────────────────────────
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

// ─── Main stats computation ────────────────────────────────────────────────────
function computeStats(messages) {
  const nonSystem = messages.filter((m) => !m.isSystem);

  // ── Summary stats ──────────────────────────────────────────────────────────
  let totalWords = 0;
  let totalMedia = 0;
  let totalLinks = 0;

  for (const msg of nonSystem) {
    if (msg.isMedia) { totalMedia++; continue; }
    const words = msg.message.split(/\s+/).filter(Boolean);
    totalWords += words.length;
    if (msg.hasLink) totalLinks++;
  }

  // ── Per-user breakdown ────────────────────────────────────────────────────
  const userStats = {}; // { [sender]: { messages, words, emojis: {}, media, links } }

  for (const msg of nonSystem) {
    const s = msg.sender;
    if (!userStats[s]) {
      userStats[s] = { messages: 0, words: 0, emojis: {}, emojiTotal: 0, media: 0, links: 0 };
    }
    userStats[s].messages++;
    if (msg.isMedia) { userStats[s].media++; continue; }
    userStats[s].words += msg.message.split(/\s+/).filter(Boolean).length;
    if (msg.hasLink) userStats[s].links++;

    // Emojis per user
    const emojis = extractEmojis(msg.message);
    for (const e of emojis) {
      userStats[s].emojis[e] = (userStats[s].emojis[e] || 0) + 1;
      userStats[s].emojiTotal++;
    }
  }

  // Average message length per user (words per message) — Batch 1 addition
  for (const s of Object.keys(userStats)) {
    const u = userStats[s];
    const textMessages = u.messages - u.media;
    u.avgWordsPerMessage = textMessages > 0 ? Math.round((u.words / textMessages) * 10) / 10 : 0;
  }

  // ── Monthly timeline ──────────────────────────────────────────────────────
  const monthlyMap = {};
  for (const msg of nonSystem) {
    if (!msg.date) continue;
    const key = `${msg.date.getFullYear()}-${String(msg.date.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = (monthlyMap[key] || 0) + 1;
  }
  const monthlyData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  // ── Hourly heatmap (day × hour) ───────────────────────────────────────────
  // heatmap[dayOfWeek][hour] = count  (day 0 = Sunday)
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const msg of nonSystem) {
    if (!msg.date) continue;
    const day = msg.date.getDay();
    const hour = msg.date.getHours();
    heatmap[day][hour]++;
  }

  // ── Day of week totals ────────────────────────────────────────────────────
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayTotals = heatmap.map((hours, i) => ({
    day: DAY_NAMES[i],
    count: hours.reduce((a, b) => a + b, 0),
  }));

  // ── Top users ─────────────────────────────────────────────────────────────
  const topUsers = Object.entries(userStats)
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.messages - a.messages);

  // ── Global word frequency ─────────────────────────────────────────────────
  const wordFreq = {};
  for (const msg of nonSystem) {
    if (msg.isMedia) continue;
    for (const word of extractWords(msg.message)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }
  const topWords = Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 150)
    .map(([word, count]) => ({ word, count }));

  // ── Global emoji frequency ────────────────────────────────────────────────
  const globalEmojis = {};
  for (const user of Object.values(userStats)) {
    for (const [e, c] of Object.entries(user.emojis)) {
      globalEmojis[e] = (globalEmojis[e] || 0) + c;
    }
  }
  const topEmojis = Object.entries(globalEmojis)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([emoji, count]) => ({ emoji, count }));

  // ── Hourly activity peak ──────────────────────────────────────────────────
  const hourTotals = new Array(24).fill(0);
  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      hourTotals[h] += heatmap[d][h];
    }
  }
  const peakHour = hourTotals.indexOf(Math.max(...hourTotals));
  const peakDay = dayTotals.reduce((a, b) => (a.count > b.count ? a : b)).day;

  // ── First & last message date ─────────────────────────────────────────────
  const dated = nonSystem.filter((m) => m.date);
  const firstDate = dated.length ? dated[0].date : null;
  const lastDate = dated.length ? dated[dated.length - 1].date : null;
  const daysDiff = firstDate && lastDate
    ? Math.round((lastDate - firstDate) / (1000 * 60 * 60 * 24))
    : 0;

  // ════════════════════════════════════════════════════════════════════════
  // BATCH 1 — NEW FREE FEATURES (pure JS, no API needed)
  // ════════════════════════════════════════════════════════════════════════

  // ── First & last message (actual content, for the "time capsule" feature) ──
  const firstMessage = dated.length ? {
    sender: dated[0].sender,
    text: dated[0].isMedia ? '📎 Media' : dated[0].message,
    date: dated[0].date,
  } : null;

  const lastMessage = dated.length ? {
    sender: dated[dated.length - 1].sender,
    text: dated[dated.length - 1].isMedia ? '📎 Media' : dated[dated.length - 1].message,
    date: dated[dated.length - 1].date,
  } : null;

  // ── Busiest single day ────────────────────────────────────────────────────
  const dailyCountMap = {};
  for (const msg of dated) {
    const key = dayKey(msg.date);
    dailyCountMap[key] = (dailyCountMap[key] || 0) + 1;
  }
  let busiestDay = null;
  let busiestDayCount = 0;
  for (const [key, count] of Object.entries(dailyCountMap)) {
    if (count > busiestDayCount) {
      busiestDayCount = count;
      busiestDay = key;
    }
  }

  // ── Longest streak (consecutive days with at least 1 message) ────────────
  const sortedDayKeys = Object.keys(dailyCountMap).sort();
  let longestStreak = 0;
  let currentStreak = 0;
  let longestStreakRange = null;
  let streakStart = null;

  for (let i = 0; i < sortedDayKeys.length; i++) {
    const todayKey = sortedDayKeys[i];
    if (i === 0) {
      currentStreak = 1;
      streakStart = todayKey;
    } else {
      const prevDate = new Date(sortedDayKeys[i - 1]);
      const todayDate = new Date(todayKey);
      const diffDays = Math.round((todayDate - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak++;
      } else {
        currentStreak = 1;
        streakStart = todayKey;
      }
    }
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
      longestStreakRange = { start: streakStart, end: todayKey };
    }
  }

  // ── Average response time (overall, and per user) ────────────────────────
  // A "response" = a message from a different sender than the immediately
  // preceding message, within the same day-ish window (we cap gaps > 6 hours
  // since those are likely separate conversations, not a "response").
  const RESPONSE_GAP_CAP_MS = 6 * 60 * 60 * 1000; // 6 hours

  let totalResponseMs = 0;
  let responseCount = 0;
  const userResponseMs = {}; // { [sender]: { total, count } }

  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1];
    const curr = dated[i];
    if (curr.sender === prev.sender) continue; // not a "response", same person continuing

    const gap = curr.date - prev.date;
    if (gap <= 0 || gap > RESPONSE_GAP_CAP_MS) continue; // skip negative/huge gaps

    totalResponseMs += gap;
    responseCount++;

    if (!userResponseMs[curr.sender]) userResponseMs[curr.sender] = { total: 0, count: 0 };
    userResponseMs[curr.sender].total += gap;
    userResponseMs[curr.sender].count++;
  }

  const avgResponseTimeMs = responseCount > 0 ? totalResponseMs / responseCount : null;
  const avgResponseTimeLabel = avgResponseTimeMs !== null ? formatDuration(avgResponseTimeMs) : '—';

  const avgResponseTimeByUser = Object.entries(userResponseMs).map(([sender, { total, count }]) => ({
    sender,
    avgMs: total / count,
    avgLabel: formatDuration(total / count),
  })).sort((a, b) => a.avgMs - b.avgMs); // fastest responder first

  // ── Conversation starters (who sends the first message of each day) ──────
  const starterCounts = {};
  let lastSeenDayKey = null;
  for (const msg of dated) {
    const key = dayKey(msg.date);
    if (key !== lastSeenDayKey) {
      starterCounts[msg.sender] = (starterCounts[msg.sender] || 0) + 1;
      lastSeenDayKey = key;
    }
  }
  const conversationStarters = Object.entries(starterCounts)
    .map(([sender, days]) => ({ sender, days }))
    .sort((a, b) => b.days - a.days);

  // ── Ghost / double-text detector ──────────────────────────────────────────
  // "Double-texting" = sending 2+ messages in a row with no reply from the
  // other person. We track, per user: longest such streak, and total count
  // of "double-text events" (each time they sent 2+ in a row uninterrupted).
  const ghostStats = {}; // { [sender]: { longestStreak, doubleTextEvents, totalExtraMessages } }

  {
    let i = 0;
    while (i < dated.length) {
      const sender = dated[i].sender;
      let streak = 1;
      let j = i + 1;
      while (j < dated.length && dated[j].sender === sender) {
        streak++;
        j++;
      }

      if (!ghostStats[sender]) {
        ghostStats[sender] = { longestStreak: 0, doubleTextEvents: 0, totalExtraMessages: 0 };
      }
      if (streak > ghostStats[sender].longestStreak) {
        ghostStats[sender].longestStreak = streak;
      }
      if (streak >= 2) {
        ghostStats[sender].doubleTextEvents++;
        ghostStats[sender].totalExtraMessages += (streak - 1);
      }

      i = j;
    }
  }

  const ghostLeaderboard = Object.entries(ghostStats)
    .map(([sender, g]) => ({ sender, ...g }))
    .sort((a, b) => b.totalExtraMessages - a.totalExtraMessages);

  // ── Basic sentiment trend (non-AI, keyword-based) ─────────────────────────
  const sentimentByMonth = {}; // { [monthKey]: { positive, negative, score } }
  for (const msg of nonSystem) {
    if (!msg.date || msg.isMedia) continue;
    const key = `${msg.date.getFullYear()}-${String(msg.date.getMonth() + 1).padStart(2, '0')}`;
    if (!sentimentByMonth[key]) sentimentByMonth[key] = { positive: 0, negative: 0 };

    const words = msg.message.toLowerCase().match(/\b[a-z']{2,}\b/g) || [];
    for (const w of words) {
      if (POSITIVE_WORDS.has(w)) sentimentByMonth[key].positive++;
      if (NEGATIVE_WORDS.has(w)) sentimentByMonth[key].negative++;
    }
  }

  const sentimentTrend = Object.entries(sentimentByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { positive, negative }]) => {
      const total = positive + negative;
      // Score from -100 (all negative) to +100 (all positive), 0 = neutral/no signal
      const score = total > 0 ? Math.round(((positive - negative) / total) * 100) : 0;
      return { month, positive, negative, score };
    });

  // ── Milestones & fun timeline events ──────────────────────────────────────
  const milestones = [];

  // Nth message milestones (every 1000 messages)
  if (dated.length > 0) {
    for (let n = 1000; n <= dated.length; n += 1000) {
      const msg = dated[n - 1];
      milestones.push({
        type: 'milestone',
        icon: '🎯',
        label: `${n.toLocaleString()}th message`,
        date: msg.date,
        detail: `sent by ${msg.sender}`,
      });
    }
  }

  // Longest gap between messages (longest silence)
  let longestGapMs = 0;
  let longestGapStart = null;
  let longestGapEnd = null;
  for (let i = 1; i < dated.length; i++) {
    const gap = dated[i].date - dated[i - 1].date;
    if (gap > longestGapMs) {
      longestGapMs = gap;
      longestGapStart = dated[i - 1].date;
      longestGapEnd = dated[i].date;
    }
  }
  if (longestGapStart && longestGapEnd) {
    const gapDays = Math.round(longestGapMs / (1000 * 60 * 60 * 24));
    if (gapDays >= 1) {
      milestones.push({
        type: 'gap',
        icon: '🌙',
        label: `Longest silence: ${gapDays} day${gapDays === 1 ? '' : 's'}`,
        date: longestGapEnd,
        detail: `from ${formatDuration ? '' : ''}${longestGapStart.toLocaleDateString()} to ${longestGapEnd.toLocaleDateString()}`,
      });
    }
  }

  // First message milestone
  if (firstDate) {
    milestones.push({
      type: 'start',
      icon: '🚀',
      label: 'Chat started',
      date: firstDate,
      detail: dated[0] ? `first message from ${dated[0].sender}` : '',
    });
  }

  // Busiest day milestone (reuse already-computed busiestDay below — added after this block)

  milestones.sort((a, b) => (a.date && b.date ? a.date - b.date : 0));

  return {
    summary: {
      totalMessages: nonSystem.length,
      totalWords,
      totalMedia,
      totalLinks,
      participants: topUsers.map((u) => u.name),
      firstDate,
      lastDate,
      daysDiff,
      peakHour,
      peakDay,
      avgMessagesPerDay: daysDiff > 0 ? Math.round(nonSystem.length / daysDiff) : nonSystem.length,
    },
    monthlyData,
    heatmap,
    dayTotals,
    hourTotals,
    topUsers,
    topWords,
    topEmojis,
    userStats,

    // Batch 1 additions
    firstMessage,
    lastMessage,
    busiestDay: busiestDay ? { date: busiestDay, count: busiestDayCount } : null,
    longestStreak: { days: longestStreak, range: longestStreakRange },
    avgResponseTime: { overall: avgResponseTimeLabel, byUser: avgResponseTimeByUser },
    conversationStarters,
    ghostLeaderboard,
    sentimentTrend,
    milestones: (() => {
      if (busiestDay) {
        milestones.push({
          type: 'busiest',
          icon: '🔥',
          label: `Busiest day: ${busiestDayCount.toLocaleString()} messages`,
          date: new Date(busiestDay),
          detail: busiestDay,
        });
      }
      return milestones.sort((a, b) => (a.date && b.date ? a.date - b.date : 0));
    })(),
  };
}

window.StatsEngine = { computeStats };