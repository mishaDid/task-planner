/* ==========================================================================
   Планировщик задач — логика приложения
   Данные хранятся локально на устройстве (localStorage), сервер не нужен.
   ========================================================================== */

const STORAGE_KEY = "plannerState_v1";
const YEAR_MIN = Math.min(new Date().getFullYear() - 1, 2024);
const YEAR_MAX = 2030;
const EMOJI_SET = ["🙂","😎","🦉","🐼","🚀","🌱","⭐","🔥","🎯","📚","🧠","☕"];

let lastAddedId = null; // для точечной анимации появления новой задачи

/* ---------------- State ---------------- */

function defaultState(){
  return {
    settings:{
      theme:"light",
      lang:"ru",
      animations:true,
      confetti:true,
      sound:true,
      avatar:{type:"emoji", value:"🙂"}
    },
    tasksByDate:{},   // "YYYY-MM-DD" -> [{id,text,done}]
    weeklyTasks:{},   // "YYYY-Www"   -> [{id,text,done}]
  };
}

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      settings:Object.assign(base.settings, parsed.settings||{}),
      tasksByDate: parsed.tasksByDate || {},
      weeklyTasks: parsed.weeklyTasks || {}
    };
  }catch(e){
    console.warn("Не удалось прочитать сохранённые данные:", e);
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function t(key){
  const dict = I18N[state.settings.lang] || I18N.ru;
  return dict[key] !== undefined ? dict[key] : (I18N.ru[key] || key);
}

/* ---------------- Date helpers ---------------- */

function pad2(n){ return String(n).padStart(2,"0"); }

function dateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

function parseDateKey(key){
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y, m-1, d);
}

function getMonday(d){
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (dt.getDay()+6)%7; // 0 = Monday
  dt.setDate(dt.getDate()-day);
  return dt;
}

function isoWeekInfo(d){
  const monday = getMonday(d);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate()+3);
  const firstJan = new Date(thursday.getFullYear(),0,1);
  const week = Math.ceil((((thursday - firstJan)/86400000) + 1)/7);
  return { key:`${thursday.getFullYear()}-W${pad2(week)}`, monday };
}

function weekKeyOf(d){ return isoWeekInfo(d).key; }

function weekKeyToMonday(weekKey){
  const [yearStr, wStr] = weekKey.split("-W");
  const year = Number(yearStr), week = Number(wStr);
  const jan4 = new Date(year,0,4);
  const jan4Monday = getMonday(jan4);
  const monday = new Date(jan4Monday);
  monday.setDate(jan4Monday.getDate() + (week-1)*7);
  return monday;
}

function sameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function newId(){ return `${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

/* ---------------- Week stats ---------------- */

function computeWeekStats(weekKey){
  const monday = weekKeyToMonday(weekKey);
  let total = 0, done = 0;
  for(let i=0;i<7;i++){
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    const list = state.tasksByDate[dateKey(d)];
    if(list){ total += list.length; done += list.filter(t=>t.done).length; }
  }
  const wl = state.weeklyTasks[weekKey];
  if(wl){ total += wl.length; done += wl.filter(t=>t.done).length; }
  const percent = total ? Math.round((done/total)*100) : 0;
  return { total, done, percent, monday };
}

function allKnownWeekKeys(){
  const keys = new Set(Object.keys(state.weeklyTasks));
  Object.keys(state.tasksByDate).forEach(k=>{
    if(state.tasksByDate[k] && state.tasksByDate[k].length){
      keys.add(weekKeyOf(parseDateKey(k)));
    }
  });
  return Array.from(keys);
}

/* ---------------- App state (UI) ---------------- */

const ui = {
  activeView:"calendar",
  calYear:new Date().getFullYear(),
  calMonth:new Date().getMonth(),
  openDayKey:null
};

/* ---------------- Rendering: header ---------------- */

function renderHeader(){
  const now = new Date();
  const hour = now.getHours();
  let greetKey = "greetingDay";
  if(hour < 5) greetKey = "greetingNight";
  else if(hour < 12) greetKey = "greetingMorning";
  else if(hour < 18) greetKey = "greetingDay";
  else if(hour < 23) greetKey = "greetingEvening";
  else greetKey = "greetingNight";
  document.getElementById("greetingText").textContent = t(greetKey);

  const months = t("monthNames");
  document.getElementById("headerDate").textContent =
    `${now.getDate()} ${months[now.getMonth()].toLowerCase()}`;

  renderAvatarInto(document.getElementById("avatarBtn"));

  const wk = weekKeyOf(now);
  const stats = computeWeekStats(wk);
  setRing(document.getElementById("headerRingFg"), 19, stats.percent);
  document.getElementById("headerRingLabel").textContent = stats.percent + "%";
}

function renderAvatarInto(el){
  const av = state.settings.avatar;
  if(av.type === "photo" && av.value){
    el.innerHTML = `<img src="${av.value}" alt="avatar">`;
  }else{
    el.innerHTML = "";
    el.textContent = av.value || "🙂";
  }
}

function setRing(circle, r, percent){
  const c = 2*Math.PI*r;
  circle.style.strokeDasharray = `${c}`;
  circle.style.strokeDashoffset = `${c - (Math.min(100,Math.max(0,percent))/100)*c}`;
}

/* ---------------- Rendering: week goals ---------------- */

function renderWeekGoals(){
  const wk = weekKeyOf(new Date());
  const list = state.weeklyTasks[wk] || [];
  const ul = document.getElementById("weekGoalsList");
  ul.innerHTML = "";
  if(!list.length){
    const p = document.createElement("p");
    p.className = "empty-note";
    p.textContent = t("noTasks");
    ul.appendChild(p);
  }
  list.forEach(task=>{
    ul.appendChild(buildTaskItem(task, ()=>toggleWeekTask(wk, task.id), ()=>deleteWeekTask(wk, task.id)));
  });
}

function buildTaskItem(task, onToggle, onDelete){
  const li = document.createElement("li");
  li.className = "task-item" + (task.done ? " done" : "") + (task.id===lastAddedId ? " enter" : "");
  li.innerHTML = `
    <button class="check" aria-label="toggle">
      <svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 4.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <span class="task-text"></span>
    <button class="task-del" aria-label="delete">×</button>
  `;
  li.querySelector(".task-text").textContent = task.text;
  li.querySelector(".check").addEventListener("click", onToggle);
  li.querySelector(".task-del").addEventListener("click", onDelete);
  return li;
}

function toggleWeekTask(wk, id){
  const list = state.weeklyTasks[wk]; if(!list) return;
  const item = list.find(x=>x.id===id); if(!item) return;
  item.done = !item.done;
  if(item.done) playSound(); 
  saveState();
  afterTaskChange();
}

function deleteWeekTask(wk, id){
  state.weeklyTasks[wk] = (state.weeklyTasks[wk]||[]).filter(x=>x.id!==id);
  saveState();
  afterTaskChange();
}

function addWeekTask(text){
  const wk = weekKeyOf(new Date());
  if(!state.weeklyTasks[wk]) state.weeklyTasks[wk] = [];
  const task = {id:newId(), text, done:false};
  state.weeklyTasks[wk].push(task);
  lastAddedId = task.id;
  saveState();
  afterTaskChange();
}

/* ---------------- Rendering: calendar ---------------- */

function renderCalendarNav(){
  document.getElementById("calMonthLabel").textContent = t("monthNames")[ui.calMonth];
  const sel = document.getElementById("calYearSelect");
  sel.innerHTML = "";
  for(let y=YEAR_MIN; y<=YEAR_MAX; y++){
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    if(y===ui.calYear) opt.selected = true;
    sel.appendChild(opt);
  }
  document.getElementById("calPrevBtn").disabled = (ui.calYear===YEAR_MIN && ui.calMonth===0);
  document.getElementById("calNextBtn").disabled = (ui.calYear===YEAR_MAX && ui.calMonth===11);
}

function renderCalendarWeekdays(){
  const el = document.getElementById("calWeekdays");
  el.innerHTML = "";
  t("weekDaysShort").forEach(w=>{
    const span = document.createElement("span");
    span.textContent = w;
    el.appendChild(span);
  });
}

function renderCalendarGrid(){
  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";
  const year = ui.calYear, month = ui.calMonth;
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay()+6)%7; // Monday = 0
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = new Date();

  const cellsTotal = Math.ceil((startOffset+daysInMonth)/7)*7;
  const startDate = new Date(year, month, 1-startOffset);

  for(let i=0;i<cellsTotal;i++){
    const d = new Date(startDate);
    d.setDate(startDate.getDate()+i);
    const key = dateKey(d);
    const btn = document.createElement("button");
    btn.className = "cal-day";
    if(d.getMonth()!==month) btn.classList.add("other-month");
    if(sameDay(d, today)) btn.classList.add("is-today");
    if(ui.openDayKey===key) btn.classList.add("has-selected");

    const num = document.createElement("span");
    num.textContent = d.getDate();
    btn.appendChild(num);

    const tasks = state.tasksByDate[key];
    if(tasks && tasks.length){
      const allDone = tasks.every(x=>x.done);
      const dot = document.createElement("span");
      dot.className = "cal-dot" + (allDone ? " full" : "");
      btn.appendChild(dot);
    }

    btn.addEventListener("click", ()=>openDaySheet(key));
    grid.appendChild(btn);
  }
}

function renderCalendar(){
  renderCalendarNav();
  renderCalendarWeekdays();
  renderCalendarGrid();
}

function changeMonth(delta){
  let m = ui.calMonth + delta;
  let y = ui.calYear;
  if(m<0){ m=11; y--; }
  if(m>11){ m=0; y++; }
  if(y<YEAR_MIN || y>YEAR_MAX) return;
  ui.calMonth = m; ui.calYear = y;
  renderCalendar();
}

/* ---------------- Day sheet ---------------- */

function openDaySheet(key){
  ui.openDayKey = key;
  const d = parseDateKey(key);
  const months = t("monthNames");
  document.getElementById("sheetDate").textContent = `${d.getDate()} ${months[d.getMonth()].toLowerCase()}`;
  renderDayTasks();
  document.getElementById("sheetBackdrop").classList.add("open");
  document.getElementById("daySheet").classList.add("open");
  renderCalendarGrid();
}

function closeDaySheet(){
  document.getElementById("sheetBackdrop").classList.remove("open");
  document.getElementById("daySheet").classList.remove("open");
  ui.openDayKey = null;
  renderCalendarGrid();
}

function renderDayTasks(){
  const key = ui.openDayKey;
  const list = state.tasksByDate[key] || [];
  const ul = document.getElementById("dayTaskList");
  ul.innerHTML = "";
  if(!list.length){
    const p = document.createElement("p");
    p.className = "empty-note";
    p.textContent = t("noTasks");
    ul.appendChild(p);
  }
  list.forEach(task=>{
    ul.appendChild(buildTaskItem(task, ()=>toggleDayTask(key, task.id), ()=>deleteDayTask(key, task.id)));
  });
}

function toggleDayTask(key, id){
  const list = state.tasksByDate[key]; if(!list) return;
  const item = list.find(x=>x.id===id); if(!item) return;
  item.done = !item.done;
  if(item.done) playSound();
  saveState();
  renderDayTasks();
  afterTaskChange(true);
}

function deleteDayTask(key, id){
  state.tasksByDate[key] = (state.tasksByDate[key]||[]).filter(x=>x.id!==id);
  saveState();
  renderDayTasks();
  afterTaskChange(true);
}

function addDayTask(text){
  const key = ui.openDayKey;
  if(!state.tasksByDate[key]) state.tasksByDate[key] = [];
  const task = {id:newId(), text, done:false};
  state.tasksByDate[key].push(task);
  lastAddedId = task.id;
  saveState();
  renderDayTasks();
  afterTaskChange(true);
}

/* ---------------- Rendering: stats ---------------- */

function renderStats(){
  const wk = weekKeyOf(new Date());
  const stats = computeWeekStats(wk);
  setRing(document.getElementById("statsRingFg"), 62, stats.percent);
  document.getElementById("statsPct").textContent = stats.percent + "%";
  document.getElementById("statsSub").textContent = `${stats.done}/${stats.total} · ${t("tasksDone")}`;

  const badge = document.getElementById("statsBadge");
  if(stats.total>0 && stats.percent>=100){
    badge.textContent = "🎉 " + t("weekPerfect");
    badge.classList.remove("pending");
  }else{
    badge.textContent = t("weekKeepGoing");
    badge.classList.add("pending");
  }

  const historyList = document.getElementById("historyList");
  const emptyNote = document.getElementById("historyEmpty");
  historyList.innerHTML = "";
  const keys = allKnownWeekKeys().filter(k=>k!==wk);
  keys.sort((a,b)=> weekKeyToMonday(b) - weekKeyToMonday(a));
  const top = keys.slice(0,10);
  if(!top.length){
    emptyNote.style.display = "block";
  }else{
    emptyNote.style.display = "none";
    top.forEach(k=>{
      const s = computeWeekStats(k);
      const monday = s.monday;
      const row = document.createElement("div");
      row.className = "history-item";
      const label = `${monday.getDate()}.${pad2(monday.getMonth()+1)}`;
      row.innerHTML = `
        <span class="history-week">${label}</span>
        <span class="history-bar-track"><span class="history-bar-fill" style="width:${s.percent}%"></span></span>
        <span class="history-pct">${s.percent}%</span>
      `;
      historyList.appendChild(row);
    });
  }
}

/* ---------------- Celebration / feedback ---------------- */

let celebratedWeek = null;

function afterTaskChange(skipCalendarDotRefresh){
  lastAddedId = null;
  renderHeader();
  renderWeekGoals();
  if(!skipCalendarDotRefresh) renderCalendarGrid(); else renderCalendarGrid();
  renderStats();

  const wk = weekKeyOf(new Date());
  const stats = computeWeekStats(wk);
  if(stats.total>0 && stats.percent>=100 && celebratedWeek!==wk){
    celebratedWeek = wk;
    if(state.settings.confetti) spawnConfetti();
    showToast(t("weekPerfect"));
  }
}

function spawnConfetti(){
  const colors = ["#5B7FDE","#58B38A","#F2A65A","#E2685F","#7C9AF0"];
  for(let i=0;i<48;i++){
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random()*100 + "vw";
    piece.style.background = colors[Math.floor(Math.random()*colors.length)];
    piece.style.animationDelay = (Math.random()*0.4) + "s";
    piece.style.animationDuration = (2000 + Math.random()*900) + "ms";
    piece.style.opacity = String(0.7 + Math.random()*0.3);
    document.body.appendChild(piece);
    setTimeout(()=>piece.remove(), 3600);
  }
}

let toastTimer = null;
function showToast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove("show"), 2600);
}

/* gentle synthesized chime, no audio files needed */
function playSound(){
  if(!state.settings.sound) return;
  try{
    const ctx = playSound._ctx || (playSound._ctx = new (window.AudioContext||window.webkitAudioContext)());
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i*0.08);
      gain.gain.linearRampToValueAtTime(0.08, now + i*0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i*0.08 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i*0.08);
      osc.stop(now + i*0.08 + 0.3);
    });
  }catch(e){ /* тихо игнорируем, если звук недоступен */ }
}

/* ---------------- Settings rendering ---------------- */

function renderSettings(){
  // theme
  document.querySelectorAll("#themeSeg button").forEach(b=>{
    b.classList.toggle("active", b.dataset.val === state.settings.theme);
  });
  // lang
  document.querySelectorAll("#langSeg button").forEach(b=>{
    b.classList.toggle("active", b.dataset.val === state.settings.lang);
  });
  // switches
  document.getElementById("animSwitch").classList.toggle("on", state.settings.animations);
  document.getElementById("confettiSwitch").classList.toggle("on", state.settings.confetti);
  document.getElementById("soundSwitch").classList.toggle("on", state.settings.sound);
  // emoji grid
  const grid = document.getElementById("emojiGrid");
  grid.innerHTML = "";
  EMOJI_SET.forEach(e=>{
    const b = document.createElement("button");
    b.className = "emoji-opt" + ((state.settings.avatar.type==="emoji" && state.settings.avatar.value===e) ? " active" : "");
    b.textContent = e;
    b.addEventListener("click", ()=>{
      state.settings.avatar = {type:"emoji", value:e};
      saveState();
      renderSettings();
      renderHeader();
    });
    grid.appendChild(b);
  });
}

/* ---------------- i18n application ---------------- */

function applyStaticTexts(){
  document.documentElement.lang = state.settings.lang;
  document.title = t("appName");

  document.getElementById("weekGoalsTitle").textContent = t("weekGoalsTitle");
  document.getElementById("weekGoalsHint").textContent = t("weekGoalsHint");
  document.getElementById("weekGoalInput").placeholder = t("addWeekGoalPlaceholder");
  document.getElementById("weekGoalAddBtn").textContent = t("add");
  document.getElementById("dayTaskInput").placeholder = t("addDayTaskPlaceholder");
  document.getElementById("dayTaskAddBtn").textContent = t("add");

  document.getElementById("weekProgressTitle").textContent = t("weekProgress");
  document.getElementById("weekHistoryTitle").textContent = t("weekHistoryTitle");

  document.getElementById("settingsAvatarTitle").textContent = t("settingsAvatar");
  document.getElementById("settingsThemeLabel").textContent = t("settingsTheme");
  document.getElementById("settingsLangLabel").textContent = t("settingsLang");
  document.getElementById("settingsAnimLabel").textContent = t("settingsAnimations");
  document.getElementById("settingsConfettiLabel").textContent = t("settingsConfetti");
  document.getElementById("settingsSoundLabel").textContent = t("settingsSound");
  document.getElementById("settingsDangerLabel").textContent = t("settingsDanger");
  document.getElementById("settingsDangerHint").textContent = t("settingsDangerHint");
  document.getElementById("resetBtn").textContent = t("reset");
  document.getElementById("avatarUploadBtn").textContent = "📷 " + t("uploadPhoto");

  document.querySelector('#themeSeg button[data-val="light"]').textContent = "☀️ " + t("themeLight");
  document.querySelector('#themeSeg button[data-val="dark"]').textContent = "🌙 " + t("themeDark");

  document.getElementById("navCalLabel").textContent = t("tabCalendar");
  document.getElementById("navStatsLabel").textContent = t("tabStats");
  document.getElementById("navSettingsLabel").textContent = t("tabSettings");
}

/* ---------------- View switching ---------------- */

function switchView(name){
  ui.activeView = name;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById("view-"+name).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.view===name);
  });
  if(name==="stats") renderStats();
  if(name==="settings") renderSettings();
  if(name==="calendar") renderCalendar();
}

/* ---------------- Theme / animations application ---------------- */

function applyTheme(){
  document.documentElement.setAttribute("data-theme", state.settings.theme);
}
function applyAnimations(){
  document.body.classList.toggle("no-anim", !state.settings.animations);
}

/* ---------------- Avatar upload (resized to keep storage small) ---------------- */

function handleAvatarFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    const img = new Image();
    img.onload = ()=>{
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width-minSide)/2, sy = (img.height-minSide)/2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      state.settings.avatar = {type:"photo", value:dataUrl};
      saveState();
      renderSettings();
      renderHeader();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------------- Reset ---------------- */

function resetAllData(){
  if(!confirm(t("resetConfirm"))) return;
  const lang = state.settings.lang;
  state = defaultState();
  state.settings.lang = lang;
  saveState();
  celebratedWeek = null;
  initAfterStateChange();
}

/* ---------------- Wiring ---------------- */

function wireEvents(){
  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.addEventListener("click", ()=>switchView(b.dataset.view));
  });

  document.getElementById("calPrevBtn").addEventListener("click", ()=>changeMonth(-1));
  document.getElementById("calNextBtn").addEventListener("click", ()=>changeMonth(1));
  document.getElementById("calYearSelect").addEventListener("change", (e)=>{
    ui.calYear = Number(e.target.value);
    renderCalendar();
  });

  document.getElementById("sheetBackdrop").addEventListener("click", closeDaySheet);
  document.getElementById("sheetCloseBtn").addEventListener("click", closeDaySheet);

  const weekInput = document.getElementById("weekGoalInput");
  const weekAdd = ()=>{
    const v = weekInput.value.trim();
    if(!v) return;
    addWeekTask(v);
    weekInput.value = "";
  };
  document.getElementById("weekGoalAddBtn").addEventListener("click", weekAdd);
  weekInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter") weekAdd(); });

  const dayInput = document.getElementById("dayTaskInput");
  const dayAdd = ()=>{
    const v = dayInput.value.trim();
    if(!v || !ui.openDayKey) return;
    addDayTask(v);
    dayInput.value = "";
  };
  document.getElementById("dayTaskAddBtn").addEventListener("click", dayAdd);
  dayInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter") dayAdd(); });

  document.querySelectorAll("#themeSeg button").forEach(b=>{
    b.addEventListener("click", ()=>{
      state.settings.theme = b.dataset.val;
      saveState(); applyTheme(); renderSettings();
    });
  });
  document.querySelectorAll("#langSeg button").forEach(b=>{
    b.addEventListener("click", ()=>{
      state.settings.lang = b.dataset.val;
      saveState();
      applyStaticTexts();
      renderHeader(); renderWeekGoals(); renderCalendar(); renderStats(); renderSettings();
    });
  });

  const bindSwitch = (id, key)=>{
    document.getElementById(id).addEventListener("click", ()=>{
      state.settings[key] = !state.settings[key];
      saveState();
      if(key==="animations") applyAnimations();
      renderSettings();
    });
  };
  bindSwitch("animSwitch","animations");
  bindSwitch("confettiSwitch","confetti");
  bindSwitch("soundSwitch","sound");

  document.getElementById("avatarBtn").addEventListener("click", ()=>switchView("settings"));
  document.getElementById("avatarUploadBtn").addEventListener("click", ()=>{
    document.getElementById("avatarUpload").click();
  });
  document.getElementById("avatarUpload").addEventListener("change", (e)=>{
    handleAvatarFile(e.target.files[0]);
  });

  document.getElementById("resetBtn").addEventListener("click", resetAllData);
}

/* ---------------- Init ---------------- */

function initAfterStateChange(){
  applyTheme();
  applyAnimations();
  applyStaticTexts();
  renderHeader();
  renderWeekGoals();
  renderCalendar();
  renderSettings();
  switchView(ui.activeView);
}

function init(){
  wireEvents();
  initAfterStateChange();

  // автообновление заголовка/прогресса при наступлении нового дня, пока открыто приложение
  setInterval(()=>{
    renderHeader();
    if(ui.activeView==="stats") renderStats();
    if(ui.activeView==="calendar") renderCalendarGrid();
  }, 60000);

  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{
      navigator.serviceWorker.register("service-worker.js").catch(()=>{});
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
