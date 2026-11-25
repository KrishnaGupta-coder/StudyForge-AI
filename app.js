/**
 * StudyForge & ClipOCR AI — Offline Tesseract.js OCR + Notes Summarizer + Anki Flashcard Exporter
 */
(function () {
  'use strict';

  const CONFIG_KEY = 'kg_ai_config';
  const SAMPLE_NOTES = `Attention Is All You Need — Key Concepts
Scaled Dot-Product Attention computes attention weights using Q * K^T / sqrt(d_k) to stabilize gradients in high dimensions.
Multi-Head Attention projects queries, keys, and values into multiple subspaces so the model attends to different semantic positions simultaneously.
Positional Encoding injects sequence order via sine and cosine waves of varying frequencies because self-attention lacks recurrence.
Layer Normalization stabilizes deep transformer residual streams during distributed gradient optimization.`;

  const ocrImageInput = document.getElementById('ocrImageInput');
  const btnSampleNotes = document.getElementById('btnSampleNotes');
  const ocrStatus = document.getElementById('ocrStatus');
  const studyInput = document.getElementById('studyInput');
  const btnBuildStudy = document.getElementById('btnBuildStudy');
  const btnExportAnki = document.getElementById('btnExportAnki');
  const btnShuffleCards = document.getElementById('btnShuffleCards');
  const summaryBox = document.getElementById('summaryBox');
  const flashcardsList = document.getElementById('flashcardsList');
  const cardCountVal = document.getElementById('cardCountVal');
  const aiEngineBadge = document.getElementById('aiEngineBadge');

  let currentCards = [];

  function getAiConfig() {
    try {
      const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      if (cfg.provider && cfg.provider !== 'offline') {
        aiEngineBadge.textContent = `Engine: ${cfg.provider.toUpperCase()} + OCR`;
        return cfg;
      }
    } catch {}
    aiEngineBadge.textContent = 'Engine: Offline + OCR';
    return { provider: 'offline' };
  }

  async function runOcr(imageFileOrBlob) {
    if (!window.Tesseract) { ocrStatus.textContent = 'Tesseract.js loading...'; return; }
    ocrStatus.textContent = 'Running OCR...';
    try {
      const result = await Tesseract.recognize(imageFileOrBlob, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            ocrStatus.textContent = `OCR ${Math.round((m.progress || 0) * 100)}%`;
          }
        }
      });
      const clean = (result.data?.text || '').replace(/\n{3,}/g, '\n\n').trim();
      studyInput.value = clean;
      ocrStatus.textContent = 'OCR Complete ✅';
      buildStudyPack();
    } catch (err) {
      ocrStatus.textContent = `OCR Failed: ${err.message}`;
    }
  }

  function buildOfflineCards(text) {
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 28);
    const summary = sentences.slice(0, 4).map(s => `• ${s}`).join('\n');
    const cards = sentences.slice(0, 8).map((s, idx) => {
      const words = s.split(/\s+/);
      const splitIdx = Math.min(5, Math.max(2, Math.floor(words.length / 3)));
      const topic = words.slice(0, splitIdx).join(' ');
      return { q: `Q${idx + 1}: Explain "${topic}..."`, a: s };
    });
    return { summary, cards };
  }

  function renderDeck(summary, cards) {
    summaryBox.textContent = summary || 'No summary generated.';
    currentCards = cards;
    cardCountVal.textContent = cards.length;
    flashcardsList.innerHTML = '';
    cards.forEach((c) => {
      const div = document.createElement('div');
      div.className = 'flashcard';
      div.innerHTML = `<div class="fc-q">${c.q}</div><div class="fc-hint">Click to reveal answer</div><div class="fc-a hidden">${c.a}</div>`;
      div.addEventListener('click', () => {
        div.querySelector('.fc-a').classList.toggle('hidden');
        div.querySelector('.fc-hint').classList.toggle('hidden');
      });
      flashcardsList.appendChild(div);
    });
  }

  async function buildStudyPack() {
    const text = studyInput.value.trim();
    if (!text) return;
    const cfg = getAiConfig();
    if (cfg.provider === 'offline') {
      const pack = buildOfflineCards(text);
      renderDeck(pack.summary, pack.cards);
      return;
    }

    btnBuildStudy.textContent = 'Synthesizing via AI...';
    btnBuildStudy.disabled = true;
    const prompt = `From the study notes below, return ONLY valid JSON with shape {"summary":"3 concise bullet points","cards":[{"q":"question","a":"concise answer"}]}.\nNotes:\n${text.slice(0, 3500)}`;
    try {
      let raw = '';
      if (cfg.provider === 'ollama') {
        const res = await fetch(cfg.endpoint || 'http://localhost:11434/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: cfg.model || 'qwen2.5:3b', messages: [{ role: 'user', content: prompt }], stream: false })
        });
        raw = (await res.json()).message?.content || '';
      } else if (cfg.provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model || 'gemini-4-hydrogen'}:generateContent?key=${cfg.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        raw = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const res = await fetch(cfg.endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }] })
        });
        raw = (await res.json()).choices?.[0]?.message?.content || '';
      }
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : raw);
      renderDeck(parsed.summary || '', Array.isArray(parsed.cards) ? parsed.cards : []);
    } catch {
      const pack = buildOfflineCards(text);
      renderDeck(pack.summary, pack.cards);
    } finally {
      btnBuildStudy.textContent = 'Generate Summary & Flashcards ⚡';
      btnBuildStudy.disabled = false;
    }
  }

  ocrImageInput.addEventListener('change', (e) => { if (e.target.files[0]) runOcr(e.target.files[0]); });
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        runOcr(item.getAsFile());
        break;
      }
    }
  });

  btnBuildStudy.addEventListener('click', buildStudyPack);
  btnSampleNotes.addEventListener('click', () => { studyInput.value = SAMPLE_NOTES; buildStudyPack(); });
  btnShuffleCards.addEventListener('click', () => {
    const copy = [...currentCards].sort(() => Math.random() - 0.5);
    renderDeck(summaryBox.textContent, copy);
  });
  btnExportAnki.addEventListener('click', () => {
    if (!currentCards.length) return;
    const esc = s => `"${String(s).replace(/"/g, '""')}"`;
    const csv = currentCards.map(c => `${esc(c.q)},${esc(c.a)}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'anki_flashcards.csv';
    a.click();
  });

  getAiConfig();
  studyInput.value = SAMPLE_NOTES;
  const initPack = buildOfflineCards(SAMPLE_NOTES);
  renderDeck(initPack.summary, initPack.cards);
})();
