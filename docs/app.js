const state = {
  issues: [],
  industries: [],
  data: null,
  tab: "ops",
  industry: null,
};

const $ = (sel) => document.querySelector(sel);

async function loadIndex() {
  const [res, indRes] = await Promise.all([
    fetch("data/index.json"),
    fetch("data/industries.json"),
  ]);
  state.industries = (await indRes.json()).industries;
  const idx = await res.json();
  state.issues = idx.issues.slice().sort((a, b) => b.date.localeCompare(a.date));
  const select = $("#issue-select");
  select.innerHTML = state.issues
    .map((i) => `<option value="${i.date}">${i.date}（第 ${i.issue} 期）</option>`)
    .join("");
  select.addEventListener("change", () => loadIssue(select.value));
  await loadIssue(state.issues[0].date);
}

async function loadIssue(date) {
  const res = await fetch(`data/${date}.json`);
  state.data = await res.json();
  state.industry = null;
  $("#policy-version").textContent = ` ${state.data.policy_version} `;
  const noteEl = $("#editor-note");
  if (state.data.editor_note) {
    noteEl.hidden = false;
    $("#editor-note-text").textContent = state.data.editor_note;
  } else {
    noteEl.hidden = true;
  }
  render();
}

function scoreTotal(s) {
  return s.breadth + s.action + s.timeliness;
}

function itemCard(item) {
  const total = scoreTotal(item.score);
  const meta = [];
  meta.push(
    `<span class="score ${total >= 12 ? "high" : ""}" title="影響廣度 ${item.score.breadth}・行動性 ${item.score.action}・時效性 ${item.score.timeliness}">評分 ${total}</span>`
  );
  // 產業標籤只在市場動態 tab 顯示
  if (item.tab === "market") {
    for (const ind of item.industries) meta.push(`<span class="tag">${ind}</span>`);
  }
  for (const flag of item.flags) meta.push(`<span class="flag">⚠ ${flag}</span>`);
  const sources = item.sources
    .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`)
    .join("・");
  return `
    <article class="card">
      <div class="card-meta">${meta.join("")}</div>
      <h3>${item.title}</h3>
      <p class="summary">${item.summary}</p>
      <div class="why"><strong>對商家的意義</strong>　${item.why_it_matters}</div>
      <div class="sources">來源：${sources}</div>
    </article>`;
}

function render() {
  const items = state.data.items.filter((i) => i.tab === state.tab);
  const published = items.filter((i) => i.published);
  const unpublished = items.filter((i) => !i.published);

  // 只有市場動態 tab 分產業
  const filterEl = $("#industry-filter");
  if (state.tab === "market") {
    filterEl.hidden = false;
    filterEl.innerHTML = [
      `<button class="chip ${state.industry === null ? "active" : ""}" data-ind="">全部</button>`,
      ...state.industries.map((ind) =>
        ind.active
          ? `<button class="chip ${state.industry === ind.name ? "active" : ""}" data-ind="${ind.name}">${ind.name}</button>`
          : `<button class="chip inactive" disabled title="MVP 階段尚未納入蒐集">${ind.name}</button>`
      ),
    ].join("");
    filterEl.querySelectorAll(".chip:not([disabled])").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.industry = btn.dataset.ind || null;
        render();
      })
    );
  } else {
    filterEl.hidden = true;
  }

  const visible =
    state.tab === "market" && state.industry
      ? published.filter((i) => i.industries.includes(state.industry))
      : published;

  $("#items").innerHTML =
    visible.length > 0
      ? visible.map(itemCard).join("")
      : `<p class="empty">本期此分類沒有刊登條目</p>`;

  const unpubEl = $("#unpublished");
  unpubEl.hidden = unpublished.length === 0;
  $("#unpublished-count").textContent = unpublished.length;
  $("#unpublished-items").innerHTML = unpublished.map(itemCard).join("");
}

document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.tab = btn.dataset.tab;
    state.industry = null;
    render();
  })
);

loadIndex();
