const state = {
  issues: [],
  industries: [],
  config: {},
  data: null,
  tab: "ops",
  industry: null,
  view: "issue", // issue | saved
  auth: null, // { token, email, name }
  saved: new Set(),
  subscribed: false,
  issueCache: {},
};

const $ = (sel) => document.querySelector(sel);
const LS_TOKEN = "ec-insight-token";

async function loadIndex() {
  const [res, indRes, cfgRes] = await Promise.all([
    fetch("data/index.json"),
    fetch("data/industries.json"),
    fetch("data/config.json"),
  ]);
  state.industries = (await indRes.json()).industries;
  state.config = await cfgRes.json();
  const idx = await res.json();
  state.issues = idx.issues.slice().sort((a, b) => b.date.localeCompare(a.date));
  const select = $("#issue-select");
  select.innerHTML = state.issues
    .map((i) => `<option value="${i.date}">${i.date}（第 ${i.issue} 期）</option>`)
    .join("");
  select.addEventListener("change", () => {
    state.view = "issue";
    loadIssue(select.value);
  });

  initAuth();
  await loadIssue(state.issues[0].date);
}

async function loadIssue(date) {
  state.data = await fetchIssue(date);
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

async function fetchIssue(date) {
  if (!state.issueCache[date]) {
    state.issueCache[date] = await (await fetch(`data/${date}.json`)).json();
  }
  return state.issueCache[date];
}

function scoreTotal(s) {
  return s.breadth + s.action + s.timeliness;
}

// ---- 卡片 ----

function itemCard(item, issueDate) {
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
  if (state.view === "saved") meta.push(`<span class="tag">${issueDate}</span>`);

  const sources = item.sources
    .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`)
    .join("・");

  // 收藏與回饋都需要登入，才能對應到人
  let actions;
  if (!state.config.feedback_endpoint) {
    actions = "";
  } else if (!state.auth) {
    actions = `<span class="feedback-q">登入後可收藏與回饋</span>`;
  } else {
    const isSaved = state.saved.has(item.id);
    actions = `
      <button class="save-btn ${isSaved ? "on" : ""}" title="${isSaved ? "取消收藏" : "收藏這則"}">${isSaved ? "★ 已收藏" : "☆ 收藏"}</button>
      <span class="feedback-q">這則有用嗎？</span>
      <button class="fb-btn" data-verdict="有用">👍 有用</button>
      <button class="fb-btn" data-verdict="沒用">👎 沒用</button>`;
  }

  return `
    <article class="card">
      <div class="card-meta">${meta.join("")}</div>
      <h3>${item.title}</h3>
      <p class="summary">${item.summary}</p>
      <div class="why"><strong>對商家的意義</strong>　${item.why_it_matters}</div>
      <div class="sources">來源：${sources}</div>
      <div class="card-actions" data-id="${item.id}" data-issue="${issueDate}">${actions}</div>
      <div class="fb-form" hidden></div>
    </article>`;
}

// ---- 後端 ----

async function callBackend(payload) {
  const res = await fetch(state.config.feedback_endpoint, {
    // 用預設的 text/plain 送出，避免觸發 CORS preflight
    method: "POST",
    body: JSON.stringify(payload),
  });
  const out = await res.json();
  if (!out.ok) throw new Error(out.error || "unknown error");
  return out;
}

// ---- 登入 ----

function decodeJwt(token) {
  const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(decodeURIComponent(escape(atob(p))));
}

function initAuth() {
  const box = $("#auth");
  if (!state.config.google_client_id) {
    box.hidden = true;
    return;
  }
  box.hidden = false;

  const saved = localStorage.getItem(LS_TOKEN);
  if (saved) {
    try {
      const claims = decodeJwt(saved);
      // 憑證有效期約一小時，過期就當作未登入
      if (claims.exp * 1000 > Date.now()) {
        state.auth = { token: saved, email: claims.email, name: claims.name };
        syncFromServer();
      } else {
        localStorage.removeItem(LS_TOKEN);
      }
    } catch {
      localStorage.removeItem(LS_TOKEN);
    }
  }

  window.onGoogleCredential = (resp) => {
    const claims = decodeJwt(resp.credential);
    state.auth = { token: resp.credential, email: claims.email, name: claims.name };
    localStorage.setItem(LS_TOKEN, resp.credential);
    syncFromServer();
    renderAuth();
  };

  const ready = () => {
    if (!window.google?.accounts?.id) return setTimeout(ready, 200);
    google.accounts.id.initialize({
      client_id: state.config.google_client_id,
      callback: window.onGoogleCredential,
    });
    renderAuth();
  };
  ready();
}

function renderAuth() {
  const box = $("#auth");
  if (state.auth) {
    box.innerHTML = `
      <span class="auth-user" title="${state.auth.email}">${state.auth.name || state.auth.email}</span>
      <button class="link-btn" id="sub-btn" disabled title="電子報寄送功能尚未開放">訂閱電子報（尚未開放）</button>
      <button class="link-btn" id="signout-btn">登出</button>`;
    $("#signout-btn").addEventListener("click", () => {
      state.auth = null;
      state.subscribed = false;
      state.saved = new Set();
      state.view = "issue";
      localStorage.removeItem(LS_TOKEN);
      renderAuth();
      render();
    });
  } else {
    box.innerHTML = `<div id="gsi-btn"></div>`;
    if (window.google?.accounts?.id) {
      google.accounts.id.renderButton($("#gsi-btn"), {
        type: "standard",
        theme: "outline",
        size: "medium",
        text: "signin",
        locale: "zh_TW",
      });
    }
  }
}

async function syncFromServer() {
  if (!state.auth || !state.config.feedback_endpoint) return;
  try {
    // 收藏一律以伺服器為準，換裝置登入就看得到同一份
    const out = await callBackend({ action: "sync", id_token: state.auth.token, saved: [] });
    state.saved = new Set(out.saved || []);
    state.subscribed = !!out.subscribed;
    renderAuth();
    render();
  } catch (err) {
    console.warn("同步失敗：", err.message);
  }
}

// 電子報寄送功能開放後，把上面的 sub-btn 改回可點並綁定這個函式
async function toggleSubscribe() {
  const btn = $("#sub-btn");
  const next = !state.subscribed;
  btn.disabled = true;
  btn.textContent = "處理中…";
  try {
    await callBackend({
      action: next ? "subscribe" : "unsubscribe",
      id_token: state.auth.token,
    });
    state.subscribed = next;
  } catch (err) {
    alert("設定失敗：" + err.message);
  }
  btn.disabled = false;
  renderAuth();
}

// ---- 收藏 ----

async function toggleSave(id, issueDate, btn) {
  if (!state.auth) return;
  const nowSaved = !state.saved.has(id);
  if (nowSaved) state.saved.add(id);
  else state.saved.delete(id);
  btn.className = `save-btn ${nowSaved ? "on" : ""}`;
  btn.textContent = nowSaved ? "★ 已收藏" : "☆ 收藏";
  updateSavedCount();

  const issue = await fetchIssue(issueDate);
  const item = issue.items.find((i) => i.id === id);
  try {
    await callBackend({
      action: nowSaved ? "save" : "unsave",
      id_token: state.auth.token,
      item_id: id,
      issue: issueDate,
      title: item ? item.title : "",
    });
  } catch (err) {
    // 失敗就還原，避免畫面與伺服器不一致
    if (nowSaved) state.saved.delete(id);
    else state.saved.add(id);
    btn.className = `save-btn ${!nowSaved ? "on" : ""}`;
    btn.textContent = !nowSaved ? "★ 已收藏" : "☆ 收藏";
    updateSavedCount();
    alert("收藏失敗：" + err.message);
  }
}

function updateSavedCount() {
  $("#saved-count").textContent = state.saved.size;
  $("#saved-btn").hidden = !state.auth || (state.saved.size === 0 && state.view !== "saved");
}

async function renderSavedView() {
  const all = [];
  for (const { date } of state.issues) {
    const issue = await fetchIssue(date);
    for (const item of issue.items) {
      if (state.saved.has(item.id)) all.push({ item, date });
    }
  }
  $("#industry-filter").hidden = true;
  $("#unpublished").hidden = true;
  $("#editor-note").hidden = true;
  $("#items").innerHTML = all.length
    ? all.map(({ item, date }) => itemCard(item, date)).join("")
    : `<p class="empty">還沒有收藏任何條目</p>`;
  bindCardActions();
}

// ---- 事件綁定 ----

function bindCardActions() {
  document.querySelectorAll(".card-actions").forEach((box) => {
    const id = box.dataset.id;
    const issueDate = box.dataset.issue;

    const saveBtn = box.querySelector(".save-btn");
    if (saveBtn) saveBtn.addEventListener("click", () => toggleSave(id, issueDate, saveBtn));

    const form = box.parentElement.querySelector(".fb-form");
    box.querySelectorAll(".fb-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (!state.auth) return;
        box.querySelectorAll(".fb-btn").forEach((b) => b.classList.remove("picked"));
        btn.classList.add("picked");
        openFeedbackForm(form, box, id, issueDate, btn.dataset.verdict);
      })
    );
  });
}

/** 內嵌回饋表單：有用與沒用都必須寫原因，AI 才學得到「好在哪」與「壞在哪」。 */
function openFeedbackForm(form, box, id, issueDate, verdict) {
  const good = verdict === "有用";
  form.hidden = false;
  form.innerHTML = `
    <label class="fb-label">${good ? "這則哪裡有用？" : "為什麼沒用？"}（必填，一句話就好，會用來調整選材標準）</label>
    <textarea class="fb-note" rows="2" placeholder="${good ? "例：有明確截止日，可以直接拿去提醒商家" : "例：沒有具體數字，讀完不知道能做什麼"}"></textarea>
    <div class="fb-form-actions">
      <button class="fb-submit" disabled>送出「${good ? "👍 有用" : "👎 沒用"}」</button>
      <button class="link-btn fb-cancel">取消</button>
      <span class="fb-status"></span>
    </div>`;

  const note = form.querySelector(".fb-note");
  const submit = form.querySelector(".fb-submit");
  const status = form.querySelector(".fb-status");
  note.focus();
  note.addEventListener("input", () => {
    submit.disabled = note.value.trim().length === 0;
  });

  form.querySelector(".fb-cancel").addEventListener("click", () => {
    form.hidden = true;
    form.innerHTML = "";
    box.querySelectorAll(".fb-btn").forEach((b) => b.classList.remove("picked"));
  });

  submit.addEventListener("click", async () => {
    submit.disabled = true;
    status.className = "fb-status";
    status.textContent = "送出中…";
    try {
      const issue = await fetchIssue(issueDate);
      const item = issue.items.find((i) => i.id === id);
      // 回饋者身分由後端從登入憑證取得，不由前端傳入
      await callBackend({
        action: "feedback",
        id_token: state.auth.token,
        issue: issueDate,
        item_id: id,
        tab: item ? item.tab : "",
        title: item ? item.title : "",
        verdict,
        note: note.value.trim(),
      });
      form.innerHTML = `<span class="feedback-done">✓ 已記錄「${verdict}」，謝謝</span>`;
      box.querySelectorAll(".fb-btn").forEach((b) => (b.disabled = true));
    } catch (err) {
      status.className = "fb-status feedback-err";
      status.textContent = `送出失敗（${err.message}）`;
      submit.disabled = false;
    }
  });
}

// ---- 主畫面 ----

function render() {
  updateSavedCount();
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", state.view === "issue" && b.dataset.tab === state.tab)
  );
  $("#saved-btn").classList.toggle("active", state.view === "saved");

  if (state.view === "saved") {
    renderSavedView();
    return;
  }

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
    filterEl.innerHTML = "";
  }

  const visible =
    state.tab === "market" && state.industry
      ? published.filter((i) => i.industries.includes(state.industry))
      : published;

  $("#items").innerHTML =
    visible.length > 0
      ? visible.map((i) => itemCard(i, state.data.date)).join("")
      : `<p class="empty">本期此分類沒有刊登條目</p>`;

  const unpubEl = $("#unpublished");
  unpubEl.hidden = unpublished.length === 0;
  $("#unpublished-count").textContent = unpublished.length;
  $("#unpublished-items").innerHTML = unpublished
    .map((i) => itemCard(i, state.data.date))
    .join("");

  const noteEl = $("#editor-note");
  noteEl.hidden = !state.data.editor_note;

  bindCardActions();
}

document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    state.view = "issue";
    state.tab = btn.dataset.tab;
    state.industry = null;
    render();
  })
);

$("#saved-btn").addEventListener("click", () => {
  state.view = state.view === "saved" ? "issue" : "saved";
  render();
});

loadIndex();
