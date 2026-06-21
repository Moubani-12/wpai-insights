/**
 * app.js — Main Application Orchestrator
 * Wires together: upload → parse → stats → render charts → AI insights
 */

(() => {
  'use strict';

  // ─── Theme toggle (dark/light) ────────────────────────────────────────────────
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  const THEME_STORAGE_KEY = 'wpai-theme';

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (themeToggleIcon) themeToggleIcon.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (themeToggleIcon) themeToggleIcon.textContent = '🌙';
    }
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (e) {
      // localStorage unavailable (e.g. privacy mode) — default to dark
    }
    applyTheme(saved === 'light' ? 'light' : 'dark');
  }

  themeToggleBtn?.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const next = isLight ? 'dark' : 'light';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (e) {
      // ignore if storage is unavailable
    }
  });

  initTheme();

  // ─── State ────────────────────────────────────────────────────────────────────
  let parsedData = null;
  let statsData = null;
  let heatmapResizeObs = null;

  // ─── DOM refs ─────────────────────────────────────────────────────────────────
  const uploadScreen = document.getElementById('upload-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  const parseProgressBar = document.getElementById('parse-progress-bar');
  const parseProgressWrap = document.getElementById('parse-progress');
  const parseStatus = document.getElementById('parse-status');
  const errorBanner = document.getElementById('error-banner');
  const errorMsg = document.getElementById('error-msg');
  const newAnalysisBtn = document.getElementById('new-analysis-btn');
  const aiSection = document.getElementById('ai-section');
  const runAiBtn = document.getElementById('run-ai-btn');
  const exportBtn = document.getElementById('export-btn');
  const searchInput = document.getElementById('chat-search-input');
  const searchResults = document.getElementById('search-results');
  const searchEmpty = document.getElementById('search-empty');
  const compareBtn = document.getElementById('compare-btn');
  const compareModal = document.getElementById('compare-modal');
  const compareCloseBtn = document.getElementById('compare-close-btn');
  const compareDropZone = document.getElementById('compare-drop-zone');
  const compareFileInput = document.getElementById('compare-file-input');
  const compareUploadBtn = document.getElementById('compare-upload-btn');
  const compareUploadStep = document.getElementById('compare-upload-step');
  const compareResultsStep = document.getElementById('compare-results-step');
  const compareErrorBanner = document.getElementById('compare-error');
  const compareErrorMsg = document.getElementById('compare-error-msg');
  const compareResetBtn = document.getElementById('compare-reset-btn');

  // ─── Upload / Drop zone ───────────────────────────────────────────────────────
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  newAnalysisBtn?.addEventListener('click', resetToUpload);

  // ─── File type helpers ────────────────────────────────────────────────────────
  function getExtension(filename) {
    const parts = filename.toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : '';
  }

  // Given a zip File, finds the WhatsApp chat .txt entry inside it and
  // returns its text content. WhatsApp names this "_chat.txt" by default.
  async function extractTextFromZip(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('Zip support failed to load. Please refresh the page and try again.');
    }

    const zip = await JSZip.loadAsync(file);

    const txtEntries = Object.keys(zip.files).filter(
      (name) => !zip.files[name].dir && getExtension(name) === 'txt'
    );

    if (txtEntries.length === 0) {
      throw new Error('No chat .txt file was found inside the zip. Make sure you exported the chat from WhatsApp correctly.');
    }

    const preferred = txtEntries.find((name) => name.toLowerCase().endsWith('_chat.txt')) || txtEntries[0];
    return await zip.files[preferred].async('string');
  }

  // ─── File handling ────────────────────────────────────────────────────────────
  function handleFile(file) {
    const ext = getExtension(file.name);
    const isTxt = ext === 'txt' || file.type === 'text/plain';
    const isZip = ext === 'zip' || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

    if (!isTxt && !isZip) {
      showError('Please upload a WhatsApp .txt or .zip export file.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showError('File is too large (max 50 MB). Try exporting without media.');
      return;
    }

    hideError();

    if (isZip) {
      showProgress('Extracting zip…', 8);
      extractTextFromZip(file)
        .then((text) => {
          showProgress('Reading file…', 10);
          processRawText(text);
        })
        .catch((err) => {
          console.error('Zip error:', err);
          showError(err.message || 'Failed to extract the zip file.');
          hideProgress();
        });
      return;
    }

    showProgress('Reading file…', 10);

    const reader = new FileReader();
    reader.onload = (e) => processRawText(e.target.result);
    reader.onerror = () => showError('Failed to read the file.');
    reader.readAsText(file, 'utf-8');
  }

  // Shared parsing pipeline — used by both .txt and extracted-from-zip paths
  function processRawText(rawText) {
    showProgress('Parsing messages…', 30);
    setTimeout(() => {
      try {
        const result = window.ChatParser.parseChat(rawText);
        if (result.error) {
          showError(result.error);
          hideProgress();
          return;
        }
        parsedData = result;
        showProgress('Computing statistics…', 60);

        setTimeout(() => {
          statsData = window.StatsEngine.computeStats(parsedData.messages);
          showProgress('Rendering dashboard…', 85);

          setTimeout(() => {
            hideProgress();
            renderDashboard();
            showDashboard();
          }, 100);
        }, 50);
      } catch (err) {
        console.error('Parse error:', err);
        showError('Failed to parse the file: ' + err.message);
        hideProgress();
      }
    }, 50);
  }

  // ─── Rendering ────────────────────────────────────────────────────────────────
  function renderDashboard() {
    const s = statsData.summary;

    // Stat cards
    animateCounter('stat-messages', s.totalMessages);
    animateCounter('stat-words', s.totalWords);
    animateCounter('stat-media', s.totalMedia);
    animateCounter('stat-links', s.totalLinks);

    // Chat info
    setText('info-participants', parsedData.participants.join(', '));
    setText('info-format', parsedData.format);
    setText('info-days', s.daysDiff.toLocaleString() + ' days');
    setText('info-avg', s.avgMessagesPerDay.toLocaleString() + ' / day');
    setText('info-peak-hour', formatHour(s.peakHour));
    setText('info-peak-day', s.peakDay);

    // Charts (deferred slightly so the dashboard is visible first)
    requestAnimationFrame(() => {
      window.Charts.buildTimeline('chart-timeline', statsData.monthlyData);
      window.Charts.buildDayChart('chart-days', statsData.dayTotals);
      window.Charts.buildTopUsers('chart-users', statsData.topUsers);
      window.Charts.buildEmojiChart('chart-emoji', statsData.topEmojis);

      // Heatmap (needs container to have layout)
      requestAnimationFrame(() => {
        window.Charts.buildHeatmap('canvas-heatmap', statsData.heatmap);
      });

      // Word cloud
      setTimeout(() => {
        window.WordCloudRenderer.renderWordCloud('wordcloud-container', statsData.topWords);
      }, 300);
    });

    // Emoji per-user breakdown table
    renderEmojiTable();

    // Top users list
    renderUserList();

    // Fun facts (Batch 1 — free features)
    renderFunFacts();

    // Ghost / double-text detector (Batch 2)
    renderGhostDetector();

    // Sentiment trend + milestones (Batch 3)
    requestAnimationFrame(() => {
      window.Charts.buildSentimentChart('chart-sentiment', statsData.sentimentTrend);
    });
    renderMilestones();
  }

  function renderUserList() {
    const list = document.getElementById('user-list');
    if (!list || !statsData.topUsers.length) return;

    const total = statsData.summary.totalMessages;
    const COLORS = ['#00d4aa', '#7c5cfc', '#ff6b9d', '#ffa94d', '#4dabf7',
      '#a9e34b', '#f783ac', '#74c0fc', '#63e6be', '#ffd43b'];

    const users = statsData.topUsers.slice(0, 10);

    // Render bars at width:0 first (so CSS transition fires)
    list.innerHTML = users.map((u, i) => {
      const color = COLORS[i % COLORS.length];
      const initial = u.name.charAt(0).toUpperCase();
      const pct = Math.round((u.messages / total) * 100);
      return `
        <div class="user-row" data-pct="${pct}" data-color="${color}">
          <div class="user-avatar" style="background:${color}20;color:${color};border-color:${color}40">${initial}</div>
          <div class="user-info">
            <div class="user-name">${escapeHtml(u.name)}</div>
            <div class="user-bar-wrap">
              <div class="user-bar" style="width:0%;background:${color}"></div>
            </div>
          </div>
          <div class="user-count">
            <span class="user-msg-count">${u.messages.toLocaleString()}</span>
            <span class="user-pct">${pct}%</span>
          </div>
        </div>`;
    }).join('');

    // Animate bars on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        list.querySelectorAll('.user-row').forEach((row) => {
          const bar = row.querySelector('.user-bar');
          if (bar) bar.style.width = row.dataset.pct + '%';
        });
      });
    });
  }

  function renderEmojiTable() {
    const table = document.getElementById('emoji-table-body');
    if (!table || !statsData.topEmojis.length) return;

    const participants = statsData.summary.participants.slice(0, 4);

    table.innerHTML = statsData.topEmojis.slice(0, 12).map(({ emoji, count }) => {
      const userCols = participants.map((p) => {
        const c = statsData.userStats[p]?.emojis[emoji] || 0;
        return `<td>${c > 0 ? c : '—'}</td>`;
      }).join('');
      return `<tr><td class="emoji-cell">${emoji}</td><td>${count}</td>${userCols}</tr>`;
    }).join('');

    // Build header
    const thead = document.getElementById('emoji-table-head');
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Emoji</th>
          <th>Total</th>
          ${participants.map((p) => `<th>${escapeHtml(p.split(' ')[0])}</th>`).join('')}
        </tr>`;
    }
  }

  function renderFunFacts() {
    const s = statsData;
    if (!s) return;

    // Avg response time
    setText('fact-response-time', s.avgResponseTime?.overall || '—');

    // Longest streak
    const streak = s.longestStreak;
    if (streak && streak.days > 0) {
      setText('fact-streak', streak.days + (streak.days === 1 ? ' day' : ' days'));
      if (streak.range) {
        setText('fact-streak-range', `${streak.range.start} → ${streak.range.end}`);
      }
    } else {
      setText('fact-streak', '—');
    }

    // Busiest day
    if (s.busiestDay) {
      setText('fact-busiest-day', s.busiestDay.date);
      setText('fact-busiest-day-count', `${s.busiestDay.count.toLocaleString()} messages`);
    } else {
      setText('fact-busiest-day', '—');
    }

    // Top conversation starter
    const starters = s.conversationStarters;
    if (starters && starters.length) {
      setText('fact-starter', starters[0].sender);
      setText('fact-starter-days', `started the day ${starters[0].days} times`);
    } else {
      setText('fact-starter', '—');
    }

    // First message
    if (s.firstMessage) {
      const fm = s.firstMessage;
      setText('fact-first-message', '"' + truncate(fm.text, 120) + '"');
      setText('fact-first-message-meta', `${escapeHtml(fm.sender)} · ${formatDateShort(fm.date)}`);
    }

    // Last message
    if (s.lastMessage) {
      const lm = s.lastMessage;
      setText('fact-last-message', '"' + truncate(lm.text, 120) + '"');
      setText('fact-last-message-meta', `${escapeHtml(lm.sender)} · ${formatDateShort(lm.date)}`);
    }

    // Fastest responders list
    const listEl = document.getElementById('fact-response-list');
    if (listEl && s.avgResponseTime?.byUser?.length) {
      listEl.innerHTML = s.avgResponseTime.byUser.slice(0, 6).map((u) => `
        <div class="fact-list-row">
          <span class="fact-list-name">${escapeHtml(u.sender)}</span>
          <span class="fact-list-value">${escapeHtml(u.avgLabel)}</span>
        </div>`).join('');
    } else if (listEl) {
      listEl.innerHTML = '<div class="fact-sub">Not enough data to calculate response times.</div>';
    }
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen).trim() + '…' : str;
  }

  function formatDateShort(date) {
    if (!date) return '';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ─── Ghost / Double-Text Detector (Batch 2) ────────────────────────────────────
  function renderGhostDetector() {
    const listEl = document.getElementById('ghost-list');
    if (!listEl || !statsData?.ghostLeaderboard?.length) {
      if (listEl) listEl.innerHTML = '<div class="fact-sub">Not enough data yet.</div>';
      return;
    }

    listEl.innerHTML = statsData.ghostLeaderboard.slice(0, 8).map((g) => `
      <div class="ghost-row">
        <span class="ghost-row-name">${escapeHtml(g.sender)}</span>
        <div class="ghost-row-stats">
          <div class="ghost-stat">
            <div class="ghost-stat-value">${g.longestStreak}</div>
            <div class="ghost-stat-label">Longest Streak</div>
          </div>
          <div class="ghost-stat">
            <div class="ghost-stat-value">${g.doubleTextEvents}</div>
            <div class="ghost-stat-label">Double-Text Events</div>
          </div>
          <div class="ghost-stat">
            <div class="ghost-stat-value">${g.totalExtraMessages}</div>
            <div class="ghost-stat-label">Extra Msgs Sent</div>
          </div>
        </div>
      </div>`).join('');
  }

  // ─── In-Chat Search (Batch 2) ───────────────────────────────────────────────────
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const escapedQuery = escapeRegex(query);
    const re = new RegExp(escapedQuery, 'gi');
    return escaped.replace(re, (match) => `<mark>${match}</mark>`);
  }

  function runSearch(query) {
    if (!parsedData || !query || query.trim().length < 2) {
      searchResults.innerHTML = '';
      searchEmpty.classList.add('hidden');
      return;
    }

    const q = query.trim().toLowerCase();
    const matches = parsedData.messages.filter((m) =>
      !m.isSystem &&
      (m.message.toLowerCase().includes(q) || m.sender.toLowerCase().includes(q))
    ).slice(0, 50); // cap results for performance

    if (matches.length === 0) {
      searchResults.innerHTML = '';
      searchEmpty.classList.remove('hidden');
      return;
    }

    searchEmpty.classList.add('hidden');
    searchResults.innerHTML = matches.map((m) => `
      <div class="search-result-row">
        <div class="search-result-header">
          <span class="search-result-sender">${escapeHtml(m.sender)}</span>
          <span class="search-result-date">${m.date ? formatDateShort(m.date) : ''}</span>
        </div>
        <div class="search-result-text">${highlightMatch(m.message, query.trim())}</div>
      </div>`).join('');
  }

  let searchDebounceTimer = null;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const value = e.target.value;
    searchDebounceTimer = setTimeout(() => runSearch(value), 150);
  });

  // ─── Export Dashboard as Image (Batch 2) ───────────────────────────────────────
  exportBtn?.addEventListener('click', async () => {
    if (typeof html2canvas === 'undefined') {
      alert('Export feature failed to load. Please refresh the page and try again.');
      return;
    }

    const target = document.querySelector('.dash-body');
    if (!target) return;

    const originalText = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting…';

    try {
      const canvas = await html2canvas(target, {
        backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-base') || '#06070d',
        scale: 2,
        useCORS: true,
      });

      const link = document.createElement('a');
      link.download = 'wpai-insights-dashboard.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export dashboard as image. Please try again.');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = originalText;
    }
  });

  // ─── Milestones Timeline (Batch 3) ─────────────────────────────────────────────
  function renderMilestones() {
    const el = document.getElementById('milestones-timeline');
    if (!el) return;

    const milestones = statsData?.milestones;
    if (!milestones || !milestones.length) {
      el.innerHTML = '<div class="fact-sub">No milestones detected yet.</div>';
      return;
    }

    el.innerHTML = milestones.map((m) => `
      <div class="milestone-item">
        <div class="milestone-icon">${m.icon}</div>
        <div class="milestone-body">
          <div class="milestone-label">${escapeHtml(m.label)}</div>
          ${m.detail ? `<div class="milestone-detail">${escapeHtml(m.detail)}</div>` : ''}
        </div>
        <div class="milestone-date">${m.date ? formatDateShort(m.date) : ''}</div>
      </div>`).join('');
  }

  // ─── Multi-Chat Comparison (Batch 3) ────────────────────────────────────────────
  let compareStatsData = null;

  function openCompareModal() {
    if (!statsData) return;
    compareModal.classList.remove('hidden');
    compareUploadStep.classList.remove('hidden');
    compareResultsStep.classList.add('hidden');
    compareErrorBanner.style.display = 'none';
  }

  function closeCompareModal() {
    compareModal.classList.add('hidden');
  }

  compareBtn?.addEventListener('click', openCompareModal);
  compareCloseBtn?.addEventListener('click', closeCompareModal);
  compareModal?.querySelector('.compare-modal-backdrop')?.addEventListener('click', closeCompareModal);

  compareUploadBtn?.addEventListener('click', () => compareFileInput.click());
  compareFileInput?.addEventListener('change', (e) => {
    if (e.target.files[0]) handleCompareFile(e.target.files[0]);
  });
  compareDropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    compareDropZone.classList.add('drag-over');
  });
  compareDropZone?.addEventListener('dragleave', () => compareDropZone.classList.remove('drag-over'));
  compareDropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    compareDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleCompareFile(file);
  });

  function showCompareError(msg) {
    compareErrorMsg.textContent = msg;
    compareErrorBanner.style.display = 'flex';
  }

  async function handleCompareFile(file) {
    compareErrorBanner.style.display = 'none';
    const ext = getExtension(file.name);
    const isTxt = ext === 'txt' || file.type === 'text/plain';
    const isZip = ext === 'zip' || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

    if (!isTxt && !isZip) {
      showCompareError('Please upload a WhatsApp .txt or .zip export file.');
      return;
    }

    try {
      let rawText;
      if (isZip) {
        rawText = await extractTextFromZip(file);
      } else {
        rawText = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read the file.'));
          reader.readAsText(file, 'utf-8');
        });
      }

      const result = window.ChatParser.parseChat(rawText);
      if (result.error) {
        showCompareError(result.error);
        return;
      }

      compareStatsData = window.StatsEngine.computeStats(result.messages);
      renderCompareResults(statsData, compareStatsData);
    } catch (err) {
      console.error('Compare error:', err);
      showCompareError(err.message || 'Failed to process the file.');
    }
  }

  function renderCompareResults(a, b) {
    compareUploadStep.classList.add('hidden');
    compareResultsStep.classList.remove('hidden');

    setText('compare-col-a-label', 'Current Chat');
    setText('compare-col-b-label', 'Uploaded Chat');

    const rows = [
      { label: 'Total Messages', a: a.summary.totalMessages, b: b.summary.totalMessages, higherIsBetter: true },
      { label: 'Total Words', a: a.summary.totalWords, b: b.summary.totalWords, higherIsBetter: true },
      { label: 'Participants', a: a.summary.participants.length, b: b.summary.participants.length, higherIsBetter: null },
      { label: 'Duration (days)', a: a.summary.daysDiff, b: b.summary.daysDiff, higherIsBetter: null },
      { label: 'Avg Messages / Day', a: a.summary.avgMessagesPerDay, b: b.summary.avgMessagesPerDay, higherIsBetter: true },
      { label: 'Media Shared', a: a.summary.totalMedia, b: b.summary.totalMedia, higherIsBetter: null },
      { label: 'Links Shared', a: a.summary.totalLinks, b: b.summary.totalLinks, higherIsBetter: null },
      { label: 'Avg Response Time', a: a.avgResponseTime?.overall || '—', b: b.avgResponseTime?.overall || '—', higherIsBetter: null },
      { label: 'Longest Active Streak', a: `${a.longestStreak?.days || 0} days`, b: `${b.longestStreak?.days || 0} days`, higherIsBetter: null },
    ];

    const tbody = document.getElementById('compare-table-body');
    tbody.innerHTML = rows.map((r) => {
      const aIsWinner = r.higherIsBetter && typeof r.a === 'number' && typeof r.b === 'number' && r.a > r.b;
      const bIsWinner = r.higherIsBetter && typeof r.a === 'number' && typeof r.b === 'number' && r.b > r.a;
      return `
        <tr>
          <td>${escapeHtml(r.label)}</td>
          <td class="${aIsWinner ? 'compare-winner' : ''}">${typeof r.a === 'number' ? r.a.toLocaleString() : escapeHtml(String(r.a))}</td>
          <td class="${bIsWinner ? 'compare-winner' : ''}">${typeof r.b === 'number' ? r.b.toLocaleString() : escapeHtml(String(r.b))}</td>
        </tr>`;
    }).join('');
  }

  compareResetBtn?.addEventListener('click', () => {
    compareStatsData = null;
    compareFileInput.value = '';
    compareUploadStep.classList.remove('hidden');
    compareResultsStep.classList.add('hidden');
    compareErrorBanner.style.display = 'none';
  });

  // ─── AI Insights ──────────────────────────────────────────────────────────────
  runAiBtn?.addEventListener('click', async () => {
    if (!statsData) return;
    runAiBtn.disabled = true;
    runAiBtn.textContent = 'Analyzing…';
    showAiSkeleton(true);

    try {
      const nonSystem = parsedData.messages.filter((m) => !m.isSystem && !m.isMedia);
      // Sample: most recent 300 messages, formatted as "Name: message"
      const sample = nonSystem.slice(-300).map((m) => `${m.sender}: ${m.message.substring(0, 200)}`);

      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleMessages: sample,
          participants: statsData.summary.participants,
          messageCount: statsData.summary.totalMessages,
          wordCount: statsData.summary.totalWords,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Server error');
      }

      const ai = await resp.json();
      renderAiInsights(ai);
    } catch (err) {
      console.error('AI error:', err);
      document.getElementById('ai-error').textContent = '⚠ ' + err.message;
      document.getElementById('ai-error').style.display = 'block';
      showAiSkeleton(false);
    } finally {
      runAiBtn.disabled = false;
      runAiBtn.textContent = '✦ Run AI Analysis';
    }
  });

  function renderAiInsights(ai) {
    showAiSkeleton(false);
    document.getElementById('ai-error').style.display = 'none';
    const results = document.getElementById('ai-results');
    results.style.display = 'grid';

    // Summary
    setText('ai-summary-text', ai.summary || 'No summary available.');

    // Topics
    const topicsEl = document.getElementById('ai-topics');
    if (topicsEl && ai.topics?.length) {
      topicsEl.innerHTML = ai.topics.map((t) =>
        `<span class="topic-chip">${escapeHtml(t)}</span>`
      ).join('');
    }

    // Languages
    const langsEl = document.getElementById('ai-languages');
    if (langsEl && ai.languages?.length) {
      langsEl.innerHTML = ai.languages.map((l) => `
        <div class="lang-row">
          <span class="lang-name">${escapeHtml(l.language)}</span>
          <div class="lang-bar-wrap"><div class="lang-bar" style="width:${l.percentage}%"></div></div>
          <span class="lang-pct">${l.percentage}%</span>
        </div>`).join('');
    }

    // Toxicity
    const tox = ai.toxicity || {};
    const toxScore = tox.score ?? 0;
    const toxColor = toxScore <= 2 ? '#00d4aa' : toxScore <= 5 ? '#ffa94d' : '#ff4757';
    const toxLabel = tox.level || 'Unknown';
    document.getElementById('ai-tox-score').textContent = toxScore + '/10';
    document.getElementById('ai-tox-score').style.color = toxColor;
    document.getElementById('ai-tox-label').textContent = toxLabel;
    document.getElementById('ai-tox-label').style.background = toxColor + '20';
    document.getElementById('ai-tox-label').style.color = toxColor;
    document.getElementById('ai-tox-explanation').textContent = tox.explanation || '';
    const toxBar = document.getElementById('ai-tox-bar');
    if (toxBar) {
      toxBar.style.width = (toxScore * 10) + '%';
      toxBar.style.background = toxColor;
    }
    const flagsEl = document.getElementById('ai-tox-flags');
    if (flagsEl) {
      if (tox.flaggedPatterns?.length) {
        flagsEl.innerHTML = tox.flaggedPatterns.map((f) =>
          `<li>${escapeHtml(f)}</li>`).join('');
        flagsEl.parentElement.style.display = 'block';
      } else {
        flagsEl.parentElement.style.display = 'none';
      }
    }

    // Relationship Score
    const rel = ai.relationshipScore || {};
    const relScore = rel.score ?? 50;
    const relColor = relScore >= 75 ? '#00d4aa' : relScore >= 50 ? '#7c5cfc' : relScore >= 25 ? '#ffa94d' : '#ff4757';
    setText('ai-rel-score', relScore);
    setText('ai-rel-label', rel.label || '');
    setText('ai-rel-explanation', rel.explanation || '');
    document.getElementById('ai-rel-score').style.color = relColor;

    const relBar = document.getElementById('ai-rel-bar');
    if (relBar) {
      relBar.style.width = relScore + '%';
      relBar.style.background = `linear-gradient(90deg, #7c5cfc, ${relColor})`;
    }

    const relFactors = document.getElementById('ai-rel-factors');
    if (relFactors && rel.factors?.length) {
      relFactors.innerHTML = rel.factors.map((f) =>
        `<li>✓ ${escapeHtml(f)}</li>`).join('');
    }

    // Animate in
    requestAnimationFrame(() => results.classList.add('visible'));
  }

  function showAiSkeleton(show) {
    const sk = document.getElementById('ai-skeleton');
    const res = document.getElementById('ai-results');
    if (show) {
      sk.style.display = 'flex';
      res.style.display = 'none';
    } else {
      sk.style.display = 'none';
    }
  }

  // ─── UI Helpers ───────────────────────────────────────────────────────────────
  function showDashboard() {
    uploadScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    requestAnimationFrame(() => dashboardScreen.classList.add('visible'));
  }

  function resetToUpload() {
    dashboardScreen.classList.remove('visible');
    setTimeout(() => {
      dashboardScreen.classList.add('hidden');
      uploadScreen.classList.remove('hidden');
      fileInput.value = '';
      parsedData = null;
      statsData = null;
      document.getElementById('ai-results').style.display = 'none';
      document.getElementById('ai-skeleton').style.display = 'none';
      document.getElementById('ai-error').style.display = 'none';
    }, 400);
  }

  function showProgress(msg, pct) {
    parseProgressWrap.style.display = 'block';
    parseStatus.textContent = msg;
    parseProgressBar.style.width = pct + '%';
  }

  function hideProgress() {
    parseProgressWrap.style.display = 'none';
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBanner.style.display = 'flex';
  }

  function hideError() {
    errorBanner.style.display = 'none';
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '';
  }

  function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const duration = 1200;
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function formatHour(h) {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Redraw heatmap on window resize
  window.addEventListener('resize', () => {
    if (statsData) {
      requestAnimationFrame(() => {
        window.Charts.buildHeatmap('canvas-heatmap', statsData.heatmap);
      });
    }
  });
})();