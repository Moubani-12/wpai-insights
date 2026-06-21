/**
 * charts.js — Chart.js chart builders
 * All functions accept a canvas element (or its 2D context) and data.
 */

const CHART_PALETTE = {
  primary: '#00d4aa',
  secondary: '#7c5cfc',
  accent: '#ff6b9d',
  warm: '#ffa94d',
  info: '#4dabf7',
  grid: 'rgba(255,255,255,0.06)',
  text: 'rgba(255,255,255,0.7)',
  textMuted: 'rgba(255,255,255,0.35)',
};

// Generate a palette of N colors from a base hue
function generateColors(n, alpha = 0.85) {
  const colors = [];
  const hues = [168, 270, 340, 35, 210, 120, 0, 300, 60, 180];
  for (let i = 0; i < n; i++) {
    const hue = hues[i % hues.length];
    colors.push(`hsla(${hue}, 70%, 60%, ${alpha})`);
  }
  return colors;
}

// Destroy existing chart on a canvas if one exists
function destroyChart(canvasId) {
  const existing = Chart.getChart(canvasId);
  if (existing) existing.destroy();
}

// ─── Monthly Timeline ──────────────────────────────────────────────────────────
function buildTimeline(canvasId, monthlyData) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !monthlyData.length) return null;

  const labels = monthlyData.map((d) => {
    const [y, m] = d.month.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleDateString('en', { month: 'short', year: '2-digit' });
  });
  const data = monthlyData.map((d) => d.count);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Messages',
        data,
        borderColor: CHART_PALETTE.primary,
        backgroundColor: 'rgba(0, 212, 170, 0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: CHART_PALETTE.primary,
        pointRadius: 4,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 20, 40, 0.95)',
          borderColor: CHART_PALETTE.primary,
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: CHART_PALETTE.text,
          padding: 12,
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => ` ${item.raw.toLocaleString()} messages`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: CHART_PALETTE.grid },
          ticks: { color: CHART_PALETTE.textMuted, maxRotation: 45, font: { size: 11 } },
        },
        y: {
          grid: { color: CHART_PALETTE.grid },
          ticks: { color: CHART_PALETTE.textMuted, font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}

// ─── Day of Week Bar Chart ─────────────────────────────────────────────────────
function buildDayChart(canvasId, dayTotals) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !dayTotals.length) return null;

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dayTotals.map((d) => d.day),
      datasets: [{
        label: 'Messages',
        data: dayTotals.map((d) => d.count),
        backgroundColor: dayTotals.map((_, i) =>
          `hsla(168, 70%, ${45 + i * 3}%, 0.75)`),
        borderColor: dayTotals.map((_, i) =>
          `hsla(168, 70%, ${55 + i * 3}%, 1)`),
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 20, 40, 0.95)',
          borderColor: CHART_PALETTE.primary,
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: CHART_PALETTE.text,
          padding: 12,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: CHART_PALETTE.text, font: { size: 12, weight: '500' } },
        },
        y: {
          grid: { color: CHART_PALETTE.grid },
          ticks: { color: CHART_PALETTE.textMuted, font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}

// ─── Hourly Heatmap (custom canvas renderer) ───────────────────────────────────
function buildHeatmap(canvasId, heatmap) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx2d = canvas.getContext('2d');
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
    if (i === 0) return '12a';
    if (i === 12) return '12p';
    return i < 12 ? `${i}a` : `${i - 12}p`;
  });

  const maxVal = Math.max(...heatmap.flat(), 1);

  const padding = { top: 30, left: 44, right: 12, bottom: 20 };
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx2d.scale(dpr, dpr);

  const W = rect.width - padding.left - padding.right;
  const H = rect.height - padding.top - padding.bottom;
  const cellW = W / 24;
  const cellH = H / 7;

  ctx2d.clearRect(0, 0, rect.width, rect.height);

  // Draw hour labels
  ctx2d.font = '10px Inter, sans-serif';
  ctx2d.fillStyle = 'rgba(255,255,255,0.35)';
  ctx2d.textAlign = 'center';
  for (let h = 0; h < 24; h += 3) {
    const x = padding.left + h * cellW + cellW / 2;
    ctx2d.fillText(HOUR_LABELS[h], x, padding.top - 10);
  }

  // Draw day labels
  ctx2d.textAlign = 'right';
  for (let d = 0; d < 7; d++) {
    const y = padding.top + d * cellH + cellH / 2 + 4;
    ctx2d.fillText(DAY_LABELS[d], padding.left - 6, y);
  }

  // Draw cells
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const val = heatmap[d][h];
      const intensity = val / maxVal;
      const x = padding.left + h * cellW;
      const y = padding.top + d * cellH;

      // Color from deep navy (empty) to emerald (max)
      const r = Math.round(0 + intensity * 0);
      const g = Math.round(212 * intensity);
      const b = Math.round(50 + intensity * (170 - 50));
      const a = 0.1 + intensity * 0.85;

      ctx2d.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
      ctx2d.beginPath();
      ctx2d.roundRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3, 3);
      ctx2d.fill();

      // Value label for hot cells
      if (intensity > 0.5 && cellW > 22) {
        ctx2d.fillStyle = 'rgba(255,255,255,0.85)';
        ctx2d.font = '8px Inter, sans-serif';
        ctx2d.textAlign = 'center';
        ctx2d.fillText(val, x + cellW / 2, y + cellH / 2 + 3);
      }
    }
  }
}

// ─── Top Users Horizontal Bar ──────────────────────────────────────────────────
function buildTopUsers(canvasId, topUsers) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !topUsers.length) return null;

  const top = topUsers.slice(0, 8);
  const colors = generateColors(top.length);

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map((u) => u.name),
      datasets: [{
        label: 'Messages',
        data: top.map((u) => u.messages),
        backgroundColor: colors,
        borderColor: colors.map((c) => c.replace(/[\d.]+\)$/, '1)')),
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 20, 40, 0.95)',
          borderColor: CHART_PALETTE.secondary,
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: CHART_PALETTE.text,
          padding: 12,
          callbacks: {
            label: (item) => ` ${item.raw.toLocaleString()} messages`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: CHART_PALETTE.grid },
          ticks: { color: CHART_PALETTE.textMuted, font: { size: 11 } },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          ticks: { color: CHART_PALETTE.text, font: { size: 12 } },
        },
      },
    },
  });
}

// ─── Emoji Doughnut Chart ─────────────────────────────────────────────────────
function buildEmojiChart(canvasId, topEmojis) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !topEmojis.length) return null;

  const top = topEmojis.slice(0, 10);
  const colors = generateColors(top.length, 0.8);

  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: top.map((e) => `${e.emoji} ×${e.count}`),
      datasets: [{
        data: top.map((e) => e.count),
        backgroundColor: colors,
        borderColor: 'rgba(15, 20, 40, 0.8)',
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: CHART_PALETTE.text,
            font: { size: 13 },
            padding: 14,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 20, 40, 0.95)',
          borderColor: CHART_PALETTE.accent,
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: CHART_PALETTE.text,
          padding: 12,
          callbacks: {
            label: (item) => ` Used ${item.raw.toLocaleString()} times`,
          },
        },
      },
    },
  });
}

// ─── Sentiment Trend Line Chart (basic, non-AI, keyword-based) ────────────────
function buildSentimentChart(canvasId, sentimentTrend) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !sentimentTrend || !sentimentTrend.length) return null;

  const labels = sentimentTrend.map((d) => {
    const [y, m] = d.month.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleDateString('en', { month: 'short', year: '2-digit' });
  });
  const scores = sentimentTrend.map((d) => d.score);

  // Color each point green if positive, red/pink if negative, gray if neutral
  const pointColors = scores.map((s) => {
    if (s > 10) return CHART_PALETTE.primary; // green-ish
    if (s < -10) return CHART_PALETTE.accent;  // red/pink-ish
    return CHART_PALETTE.textMuted;
  });

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Mood Score',
        data: scores,
        borderColor: CHART_PALETTE.secondary,
        backgroundColor: 'rgba(124, 92, 252, 0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: 5,
        pointHoverRadius: 8,
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 20, 40, 0.95)',
          borderColor: CHART_PALETTE.secondary,
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: CHART_PALETTE.text,
          padding: 12,
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => {
              const score = item.raw;
              const mood = score > 10 ? 'Positive 😊' : score < -10 ? 'Negative 😕' : 'Neutral 😐';
              return ` ${mood} (score: ${score})`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: CHART_PALETTE.grid },
          ticks: { color: CHART_PALETTE.textMuted, maxRotation: 45, font: { size: 11 } },
        },
        y: {
          grid: {
            color: (ctx) => ctx.tick.value === 0 ? 'rgba(255,255,255,0.25)' : CHART_PALETTE.grid,
          },
          ticks: { color: CHART_PALETTE.textMuted, font: { size: 11 } },
          min: -100,
          max: 100,
        },
      },
    },
  });
}

window.Charts = { buildTimeline, buildDayChart, buildHeatmap, buildTopUsers, buildEmojiChart, buildSentimentChart };