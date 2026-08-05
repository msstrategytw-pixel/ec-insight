const TOPIC_LABEL = { all: "全部文章", ops: "電商經營", market: "市場動態", external: "外站趨勢", saved: "我的收藏" };

const state = {
  issues: [], // [{date, issue, title}]，新到舊
  issueData: {}, // date -> 該期完整 json
  all: [], // 攤平的 [{item, date, issue, title}]，新到舊
  industries: [],
  config: {},
  topic: "all", // all | ops | market | external | saved
  indSel: new Set(), // 市場動態的產業複選；空＝全部
  issueFilter: "all", // "all" 或某個 date；預設載入時設為最新期
  query: "",
  auth: null,
  saved: new Set(),
  subscribed: false,
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

  // 一次載入所有期別，攤平成跨期清單（新到舊）
  const jsons = await Promise.all(
    state.issues.map((i) => fetch(`data/${i.date}.json`).then((r) => r.json()))
  );
  state.issues.forEach((i, k) => {
    state.issueData[i.date] = jsons[k];
    for (const item of jsons[k].items) {
      state.all.push({ item, date: i.date, issue: i.issue, title: i.title });
    }
  });

  // 期別下拉：全部期別 + 各期
  const select = $("#issue-select");
  select.innerHTML =
    `<option value="all">全部期別</option>` +
    state.issues
      .map((i) => `<option value="${i.date}">${i.date}（第 ${i.issue} 期${i.title ? "・" + i.title : ""}）</option>`)
      .join("");
  select.addEventListener("change", () => {
    state.issueFilter = select.value;
    state.query = "";
    $("#search").value = "";
    render();
  });

  // 頁尾方針版本取最新一期
  $("#policy-version").textContent = ` ${state.issueData[state.issues[0].date].policy_version} `;

  renderNavCounts();
  // 預設 B：進站看最新一期（週報感）
  setIssueFilter(state.issues[0].date);
  initAuth();
  render();
}

function setIssueFilter(v) {
  state.issueFilter = v;
  $("#issue-select").value = v;
}

/** 全期別的刊登總數與各主題／產業計數，填進側欄。 */
function renderNavCounts() {
  const pub = state.all.filter((x) => x.item.published);
  const byTab = (t) => pub.filter((x) => x.item.tab === t).length;
  $("#count-all").textContent = pub.length;
  $("#count-ops").textContent = byTab("ops");
  $("#count-market").textContent = byTab("market");
  $("#count-external").textContent = byTab("external");
}

function scoreTotal(s) {
  return s.breadth + s.action + s.timeliness;
}

/** 產業勾選清單：固定顯示於側欄「市場動態」底下，可複選（跨期計數）。
 *  勾選任一產業＝切到市場動態主題並跨期瀏覽。 */
function renderIndustryChecks() {
  const el = $("#industry-nav");
  const marketPub = state.all.filter((x) => x.item.published && x.item.tab === "market");
  const counts = {};
  marketPub.forEach((x) => x.item.industries.forEach((n) => (counts[n] = (counts[n] || 0) + 1)));
  const onMarket = state.topic === "market";

  el.innerHTML = [
    `<label class="ind-check ${onMarket && state.indSel.size === 0 ? "checked" : ""}">
       <input type="checkbox" data-ind="" ${onMarket && state.indSel.size === 0 ? "checked" : ""}>全部
       <span class="cnt">${marketPub.length}</span></label>`,
    ...[...state.industries]
      .sort((a, b) => Number(b.active) - Number(a.active))
      .map((ind) =>
        ind.active
          ? `<label class="ind-check ${onMarket && state.indSel.has(ind.name) ? "checked" : ""}">
               <input type="checkbox" data-ind="${ind.name}" ${onMarket && state.indSel.has(ind.name) ? "checked" : ""}>${ind.name}
               <span class="cnt">${counts[ind.name] || 0}</span></label>`
          : `<label class="ind-check pending" title="尚未納入蒐集範圍">
               <input type="checkbox" disabled>${ind.name}
               <span class="soon">待開發</span></label>`
      ),
  ].join("");
  el.querySelectorAll("input:not([disabled])").forEach((cb) =>
    cb.addEventListener("change", () => {
      const name = cb.dataset.ind;
      if (!state.topic || state.topic !== "market") state.indSel = new Set();
      if (!name) state.indSel.clear(); // 勾「全部」＝清空個別選擇
      else if (cb.checked) state.indSel.add(name);
      else state.indSel.delete(name);
      // 調整產業＝切到市場動態、跨期瀏覽
      state.topic = "market";
      state.query = "";
      $("#search").value = "";
      setIssueFilter("all");
      render();
    })
  );
}

// ---- 卡片 ----

function itemCard(entry, showBadge) {
  const { item, date, issue } = entry;
  const total = scoreTotal(item.score);
  const meta = [];
  meta.push(
    `<span class="score ${total >= 12 ? "high" : ""}" title="影響廣度 ${item.score.breadth}・行動性 ${item.score.action}・時效性 ${item.score.timeliness}">評分 ${total}</span>`
  );
  if (showBadge) meta.push(`<span class="tag issue-tag">第 ${issue} 期</span>`);
  // 產業標籤只在市場動態 tab 顯示
  if (item.tab === "market") {
    for (const ind of item.industries) meta.push(`<span class="tag">${ind}</span>`);
  }
  for (const flag of item.flags) meta.push(`<span class="flag">⚠ ${flag}</span>`);

  const issueDate = date;
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
      <div class="sources">來源：${sources}${item.source_date ? `<span class="src-date">｜${item.source_date}</span>` : ""}</div>
      <div class="card-actions" data-id="${item.id}" data-issue="${issueDate}">${actions}</div>
      <div class="fb-form" hidden></div>
    </article>`;
}

// ---- 後端 ----

// Apps Script 偶爾會回傳錯誤頁而非資料（部署傳播不穩定），故失敗時重試一次
async function callBackend(payload, attempt = 0) {
  const res = await fetch(state.config.feedback_endpoint, {
    // 用預設的 text/plain 送出，避免觸發 CORS preflight
    method: "POST",
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 900));
      return callBackend(payload, attempt + 1);
    }
    const title = (text.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
    const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(
      `後端回應不是資料而是網頁（HTTP ${res.status}${title ? "，標題：" + title : ""}）：${snippet}`
    );
  }
  if (!out.ok) throw new Error(out.error || "unknown error");
  return out;
}

// ---- 登入 ----

// 內嵌線性圖示（Tabler，stroke 24×24），維持零外部依賴
const ICONS = {
  mail: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><path d="M3 7l9 6l9 -6"/></svg>`,
  logout: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/><path d="M9 12h12l-3 -3"/><path d="M18 15l3 -3"/></svg>`,
  check: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>`,
  dots: `<svg class="ico-dots" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`,
  google: `<svg class="ico-g" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/></svg>`,
};

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
        state.auth = { token: saved, email: claims.email, name: claims.name, picture: claims.picture };
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
    state.auth = { token: resp.credential, email: claims.email, name: claims.name, picture: claims.picture };
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
    const name = state.auth.name || state.auth.email;
    const initial = (name || "?").trim().charAt(0);
    const avatar = state.auth.picture
      ? `<img class="acct-avatar" src="${state.auth.picture}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'acct-avatar acct-avatar-fallback',textContent:'${initial}'}))">`
      : `<span class="acct-avatar acct-avatar-fallback">${initial}</span>`;
    const subItem = state.subscribed
      ? `${ICONS.check}已訂閱電子報`
      : `${ICONS.mail}訂閱電子報`;
    box.innerHTML = `
      <div class="acct">
        <button class="acct-chip" id="acct-chip" aria-haspopup="true" aria-expanded="false">
          ${avatar}
          <div class="acct-id">
            <div class="acct-name">${name}</div>
            <div class="acct-email" title="${state.auth.email}">${state.auth.email}</div>
          </div>
          ${ICONS.dots}
        </button>
        <div class="acct-menu" id="acct-menu" hidden>
          <button class="acct-mitem" id="sub-btn">${subItem}</button>
          <button class="acct-mitem" id="signout-btn">${ICONS.logout}登出</button>
        </div>
      </div>`;
    const chip = $("#acct-chip");
    const menu = $("#acct-menu");
    const closeMenu = () => {
      menu.hidden = true;
      chip.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onOutside);
    };
    const onOutside = (e) => {
      if (!e.target.closest("#auth")) closeMenu();
    };
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menu.hidden) {
        menu.hidden = false;
        chip.setAttribute("aria-expanded", "true");
        setTimeout(() => document.addEventListener("click", onOutside), 0);
      } else {
        closeMenu();
      }
    });
    $("#sub-btn").addEventListener("click", toggleSubscribe);
    $("#signout-btn").addEventListener("click", () => {
      state.auth = null;
      state.subscribed = false;
      state.saved = new Set();
      if (state.topic === "saved") state.topic = "all";
      localStorage.removeItem(LS_TOKEN);
      renderAuth();
      render();
    });
  } else {
    // 自訂按鈕維持整站風格；真正的 Google 按鈕透明疊在上層負責觸發登入
    box.innerHTML = `
      <p class="signin-prompt">登入以收藏條目、給予回饋</p>
      <div class="signin-wrap">
        <button class="signin-btn" type="button">${ICONS.google}使用 Google 登入</button>
        <div id="gsi-btn" class="gsi-overlay" aria-hidden="true"></div>
      </div>`;
    if (window.google?.accounts?.id) {
      google.accounts.id.renderButton($("#gsi-btn"), {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin",
        width: 220,
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

async function toggleSubscribe(e) {
  if (e) e.stopPropagation();
  const btn = $("#sub-btn");
  const next = !state.subscribed;
  btn.disabled = true;
  btn.innerHTML = "處理中…";
  try {
    await callBackend({
      action: next ? "subscribe" : "unsubscribe",
      id_token: state.auth.token,
    });
    state.subscribed = next;
  } catch (err) {
    alert("設定失敗：" + err.message);
  }
  renderAuth();
  // 重繪後沿用 chip 既有的開合邏輯把選單重新展開，讓使用者看到切換結果
  $("#acct-chip")?.click();
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

  const issue = state.issueData[issueDate];
  const item = issue ? issue.items.find((i) => i.id === id) : null;
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
  // 總覽的固定欄位，不因未登入或無收藏而隱藏
  $("#saved-count").textContent = state.saved.size;
}

// ---- 跨期搜尋 ----

function matches(item, terms) {
  const haystack = [
    item.title,
    item.summary,
    item.why_it_matters,
    item.industries.join(" "),
    item.flags.join(" "),
    item.sources.map((s) => s.name).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => haystack.includes(t));
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
      const issue = state.issueData[issueDate];
      const item = issue ? issue.items.find((i) => i.id === id) : null;
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

/** 依目前 topic × 期別 × 產業（或搜尋）算出要顯示的條目。 */
function currentEntries() {
  if (state.query) {
    const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    return state.all.filter((x) => x.item.published && matches(x.item, terms));
  }
  if (state.topic === "saved") {
    return state.all.filter((x) => state.saved.has(x.item.id));
  }
  let pool = state.all.filter((x) => x.item.published);
  if (state.topic !== "all") pool = pool.filter((x) => x.item.tab === state.topic);
  if (state.issueFilter !== "all") pool = pool.filter((x) => x.date === state.issueFilter);
  if (state.topic === "market" && state.indSel.size > 0)
    pool = pool.filter((x) => x.item.industries.some((n) => state.indSel.has(n)));
  return pool;
}

function listMetaText(count) {
  const parts = [];
  if (state.topic === "market" && state.indSel.size > 0) parts.push([...state.indSel].join("、"));
  else parts.push(TOPIC_LABEL[state.topic]);
  if (state.issueFilter === "all") parts.push("全部期別");
  else {
    const i = state.issues.find((x) => x.date === state.issueFilter);
    parts.push(`第 ${i.issue} 期${i.title ? "・" + i.title : ""}`);
  }
  parts.push(`共 ${count} 則`);
  return parts.join("・");
}

function render() {
  updateSavedCount();
  document.querySelectorAll(".nav-item[data-topic]").forEach((b) =>
    b.classList.toggle("active", !state.query && b.dataset.topic === state.topic)
  );
  renderIndustryChecks();

  const entries = currentEntries();
  // 只有在「單一期別 × 全部文章」時，才顯示該期編輯後記與未刊登示範
  const singleIssue =
    !state.query && state.topic === "all" && state.issueFilter !== "all";
  const showBadge = state.query || state.topic === "saved" || state.issueFilter === "all";

  // 清單資訊列
  if (state.query) {
    $("#list-meta").textContent = `搜尋「${state.query}」・找到 ${entries.length} 則（全部 ${state.issues.length} 期）`;
  } else {
    $("#list-meta").textContent = listMetaText(entries.length);
  }

  // 條目
  let emptyMsg = "此條件下沒有條目";
  if (state.topic === "saved") emptyMsg = state.auth ? "還沒有收藏任何條目" : "登入後即可收藏條目";
  else if (state.query) emptyMsg = `沒有符合「${state.query}」的條目`;
  $("#items").innerHTML = entries.length
    ? entries.map((e) => itemCard(e, showBadge)).join("")
    : `<p class="empty">${emptyMsg}</p>`;

  // 編輯後記
  const noteEl = $("#editor-note");
  const issueObj = singleIssue ? state.issueData[state.issueFilter] : null;
  if (issueObj && issueObj.editor_note) {
    noteEl.hidden = false;
    $("#editor-note-text").textContent = issueObj.editor_note;
  } else {
    noteEl.hidden = true;
  }

  // 未刊登示範（僅單一期別全覽時）
  const unpubEl = $("#unpublished");
  const unpub = issueObj ? issueObj.items.filter((i) => !i.published) : [];
  unpubEl.hidden = unpub.length === 0;
  $("#unpublished-count").textContent = unpub.length;
  $("#unpublished-items").innerHTML = unpub
    .map((item) => itemCard({ item, date: state.issueFilter, issue: issueObj.issue }, false))
    .join("");

  bindCardActions();
}

// 主題導覽：點了即跨期瀏覽該主題（期別重置為全部）；收藏維持切換
document.querySelectorAll(".nav-item[data-topic]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const topic = btn.dataset.topic;
    state.query = "";
    $("#search").value = "";
    if (topic === "saved" && state.topic === "saved") {
      state.topic = "all"; // 再按一次收藏＝回到全部
    } else {
      state.topic = topic;
    }
    if (state.topic !== "market") state.indSel = new Set();
    setIssueFilter("all");
    render();
  })
);

let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim();
    render();
  }, 200);
});
$("#search").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.target.value = "";
    state.query = "";
    render();
  }
});

loadIndex();
