/**
 * wordcloud.js — Word Cloud renderer using wordcloud2.js
 */

function renderWordCloud(containerId, topWords) {
  const container = document.getElementById(containerId);
  if (!container || !topWords.length) return;

  // Clear previous
  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  const w = container.clientWidth || 600;
  const h = container.clientHeight || 280;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const maxCount = topWords[0]?.count || 1;
  const minCount = topWords[topWords.length - 1]?.count || 1;

  const wordList = topWords.slice(0, 100).map(({ word, count }) => {
    // Scale font size: 14–72px
    const normalized = (count - minCount) / (maxCount - minCount + 1);
    const size = Math.round(14 + normalized * 58);
    return [word, size];
  });

  const colors = [
    '#00d4aa', '#7c5cfc', '#ff6b9d', '#ffa94d', '#4dabf7',
    '#a9e34b', '#f783ac', '#74c0fc', '#63e6be', '#ffd43b',
  ];

  try {
    WordCloud(canvas, {
      list: wordList,
      gridSize: Math.round(8 * (w / 600)),
      weightFactor: 1,
      fontFamily: 'Inter, sans-serif',
      color: () => colors[Math.floor(Math.random() * colors.length)],
      rotateRatio: 0.35,
      rotationSteps: 2,
      backgroundColor: 'transparent',
      drawOutOfBound: false,
      shrinkToFit: true,
      hover: (item, dimension, event) => {
        canvas.style.cursor = item ? 'default' : 'default';
      },
    });
  } catch (e) {
    console.warn('WordCloud render error:', e);
    // Fallback: render simple word list
    container.innerHTML = topWords.slice(0, 30).map(({ word, count }) =>
      `<span class="wc-fallback" style="font-size:${12 + count * 0.3}px; opacity:${0.5 + Math.min(count / 50, 0.5)}">${word}</span>`
    ).join(' ');
  }
}

window.WordCloudRenderer = { renderWordCloud };
