"use strict";

const els = Object.fromEntries(["progressText","progressBar","japanese","romaji","kana","chinese","words","wordsSection","answer","status","fileInput","loadButton","speakButton","revealButton","previousButton","randomButton","nextButton"].map(id => [id, document.getElementById(id)]));
let cards = [];
let index = 0;
let revealed = false;

function parseWords(raw = "") {
  const items = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    if (/^◦/.test(value)) {
      if (current) current.detail = value.replace(/^◦\s*/, "").replace(/^详细拆解[：:]\s*/, "");
      continue;
    }
    const clean = value.replace(/^[•-]\s*/, "");
    const separator = clean.search(/[：:]/);
    current = separator >= 0
      ? { term: clean.slice(0, separator).trim(), meaning: clean.slice(separator + 1).trim(), detail: "" }
      : { term: "", meaning: clean, detail: "" };
    items.push(current);
  }
  return items;
}

function parseCards(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const pattern = /([^\n]+?)\n\s*[•-]?\s*假名[：:]\s*([^\n]+(?:\n(?!\s*[•-]?\s*(?:罗马音|中文)[：:])[^\n]+)*)\n\s*[•-]?\s*罗马音[：:]\s*([^\n]+(?:\n(?!\s*[•-]?\s*中文[：:])[^\n]+)*)\n\s*[•-]?\s*中文[：:]\s*([^\n]+)(?:\n\s*单词[：:]?\s*\n((?:[ \t]*[•◦-][^\n]*\n?)+))?/g;
  const result = [];
  const seen = new Set();
  for (const match of normalized.matchAll(pattern)) {
    let jp = match[1].trim().replace(/^[•-]\s*/, "");
    if (/^\d+[.、]/.test(jp)) continue;
    const key = `${jp}\u0000${match[4].trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({jp, kana: match[2].trim(), romaji: match[3].trim(), zh: match[4].trim(), words: parseWords(match[5])});
  }
  return result;
}

function safeText(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function render() {
  if (!cards.length) return;
  const card = cards[index];
  els.japanese.textContent = card.jp;
  els.romaji.textContent = card.romaji;
  els.kana.textContent = card.kana;
  els.chinese.textContent = card.zh;
  els.progressText.textContent = `${index + 1} / ${cards.length}`;
  els.progressBar.style.width = `${((index + 1) / cards.length) * 100}%`;
  els.answer.hidden = !revealed;
  els.revealButton.textContent = revealed ? "隐藏答案" : "显示答案";
  els.words.replaceChildren();
  els.wordsSection.hidden = !card.words.length;
  card.words.forEach(item => {
    const row = safeText("div", "word", "");
    if (item.term) row.append(safeText("span", "term", item.term), safeText("span", "meaning", `— ${item.meaning}`));
    else row.append(safeText("span", "meaning", item.meaning));
    if (item.detail) row.append(safeText("span", "detail", `↳ ${item.detail}`));
    els.words.append(row);
  });
  localStorage.setItem("jp-card-index", String(index));
}

function move(amount) {
  if (!cards.length) return;
  index = (index + amount + cards.length) % cards.length;
  revealed = false;
  render();
  window.scrollTo({top: 0, behavior: "smooth"});
}

function setCards(text, source) {
  const parsed = parseCards(text);
  if (!parsed.length) throw new Error("没有找到卡片，请确认 TXT 格式与原笔记一致。");
  cards = parsed;
  index = Math.min(Number(localStorage.getItem("jp-card-index")) || 0, cards.length - 1);
  revealed = false;
  els.status.textContent = `已从 ${source} 读取 ${cards.length} 张卡片`;
  render();
}

async function loadDefault() {
  try {
    const response = await fetch("notesSample_jp.txt", {cache: "no-store"});
    if (!response.ok) throw new Error();
    setCards(await response.text(), "notesSample_jp.txt");
  } catch {
    els.progressText.textContent = "请选择笔记文件";
    els.status.textContent = "请点击“更换 TXT”，选择 notesSample_jp.txt";
  }
}

els.loadButton.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { setCards(await file.text(), file.name); } catch (error) { els.status.textContent = error.message; }
});
els.revealButton.addEventListener("click", () => { if (cards.length) { revealed = !revealed; render(); } });
els.previousButton.addEventListener("click", () => move(-1));
els.nextButton.addEventListener("click", () => move(1));
els.randomButton.addEventListener("click", () => { if (cards.length > 1) { let next; do next = Math.floor(Math.random() * cards.length); while (next === index); index = next; revealed = false; render(); } });
els.speakButton.addEventListener("click", () => {
  if (!cards.length || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cards[index].jp.replace(/\n/g, "。"));
  utterance.lang = "ja-JP";
  utterance.rate = 0.82;
  speechSynthesis.speak(utterance);
  els.status.textContent = "正在朗读…";
  utterance.onend = () => { els.status.textContent = ""; };
});
document.addEventListener("keydown", event => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); if (event.key === " ") { event.preventDefault(); els.revealButton.click(); } });
let touchStart = 0;
document.addEventListener("touchstart", event => { touchStart = event.changedTouches[0].clientX; }, {passive:true});
document.addEventListener("touchend", event => { const delta = event.changedTouches[0].clientX - touchStart; if (Math.abs(delta) > 75) move(delta > 0 ? -1 : 1); }, {passive:true});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("service-worker.js");
loadDefault();
