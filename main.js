const STORAGE_KEY = "trip-timeline:trips:v1";

const categoryLabels = {
  sightseeing: "観光",
  food: "食事",
  lodging: "宿泊",
  shopping: "買い物",
  transport: "移動",
  other: "その他",
};

const state = {
  trips: [],
  currentTrip: null,
  currentDayIndex: 0,
  editingPlaceId: null,
  confirmAction: null,
  saveTimer: null,
};

const el = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  bindEvents();
  state.trips = loadTrips();
  renderTripList();
  showHome();
}

function cacheElements() {
  [
    "home-view", "editor-view", "trip-list", "save-status", "editor-title",
    "editor-subtitle", "day-tabs", "selected-day-label", "places-list",
    "warnings", "timeline", "preview-title", "preview-date", "preview-count",
    "preview-duration", "place-dialog", "place-form", "place-dialog-title",
    "place-id", "place-name", "place-name-error", "place-category",
    "place-location", "place-duration", "place-travel", "place-is-fixed",
    "place-fixed-time", "fixed-time-field", "place-memo", "confirm-dialog",
    "confirm-title", "confirm-message", "confirm-ok", "toast",
  ].forEach((id) => { el[id] = document.getElementById(id); });
}

function bindEvents() {
  ["brand-button", "header-list-button", "back-button"].forEach((id) => {
    document.getElementById(id).addEventListener("click", showHome);
  });
  ["header-new-button", "hero-new-button"].forEach((id) => {
    document.getElementById(id).addEventListener("click", createNewTrip);
  });

  document.getElementById("print-button").addEventListener("click", () => window.print());
  document.getElementById("refresh-button").addEventListener("click", () => {
    const valid = validateTrip();
    renderPreview();
    showToast(valid ? "タイムテーブルを更新しました" : "入力内容を確認してください");
  });
  document.getElementById("add-place-button").addEventListener("click", () => openPlaceDialog());
  document.getElementById("close-place-dialog").addEventListener("click", closePlaceDialog);
  document.getElementById("cancel-place-button").addEventListener("click", closePlaceDialog);
  document.getElementById("confirm-cancel").addEventListener("click", () => el["confirm-dialog"].close());
  el["confirm-ok"].addEventListener("click", executeConfirmedAction);
  el["place-is-fixed"].addEventListener("change", toggleFixedTime);
  el["place-form"].addEventListener("submit", savePlaceFromDialog);

  document.querySelectorAll("[data-trip-field]").forEach((input) => {
    input.addEventListener("input", handleTripField);
    input.addEventListener("change", handleTripField);
  });
  document.querySelectorAll("[data-day-field]").forEach((input) => {
    input.addEventListener("input", handleDayField);
    input.addEventListener("change", handleDayField);
  });

  el["day-tabs"].addEventListener("click", handleDayTabClick);
  el["places-list"].addEventListener("click", handlePlaceAction);
  el["trip-list"].addEventListener("click", handleTripListAction);
  el["place-dialog"].addEventListener("click", (event) => {
    if (event.target === el["place-dialog"]) closePlaceDialog();
  });
}

function loadTrips() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    showToast("保存データを読み込めませんでした。データは削除していません。");
    return [];
  }
}

function persistTrips() {
  if (!state.currentTrip) return;
  setSaveStatus("保存中…");
  state.currentTrip.updatedAt = new Date().toISOString();
  const index = state.trips.findIndex((trip) => trip.id === state.currentTrip.id);
  if (index >= 0) state.trips[index] = clone(state.currentTrip);
  else state.trips.unshift(clone(state.currentTrip));

  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trips));
      setSaveStatus("保存済み");
    } catch {
      setSaveStatus("保存失敗");
      showToast("保存できませんでした。ブラウザの空き容量を確認してください。");
    }
  }, 250);
}

function persistListImmediately() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trips));
  } catch {
    showToast("変更を保存できませんでした。");
  }
}

function createNewTrip() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  const now = new Date().toISOString();
  state.currentTrip = {
    id: uid("trip"),
    title: "",
    destination: "",
    startDate: toISODate(today),
    endDate: toISODate(end),
    memo: "",
    createdAt: now,
    updatedAt: now,
    days: [],
  };
  syncTripDays();
  state.currentDayIndex = 0;
  state.trips.unshift(clone(state.currentTrip));
  persistTrips();
  showEditor();
}

function openTrip(id) {
  const trip = state.trips.find((item) => item.id === id);
  if (!trip) return;
  state.currentTrip = clone(trip);
  syncTripDays();
  state.currentDayIndex = 0;
  showEditor();
}

function showHome() {
  el["editor-view"].hidden = true;
  el["home-view"].hidden = false;
  setSaveStatus("");
  renderTripList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showEditor() {
  el["home-view"].hidden = true;
  el["editor-view"].hidden = false;
  renderEditor();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTripList() {
  el["trip-list"].replaceChildren();
  if (!state.trips.length) {
    const empty = create("div", "empty-state");
    const icon = create("div", "empty-icon", "⌁");
    const title = create("strong", "", "まだ旅行がありません");
    const copy = create("p", "", "行きたい場所を思い浮かべて、最初のプランを作ってみましょう。");
    const button = create("button", "btn btn-primary", "＋ 新しい旅行");
    button.type = "button";
    button.addEventListener("click", createNewTrip);
    empty.append(icon, title, copy, button);
    el["trip-list"].append(empty);
    return;
  }

  [...state.trips]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .forEach((trip) => {
      const card = create("article", "trip-card");
      const number = daysBetween(trip.startDate, trip.endDate) + 1;
      card.append(
        create("span", "mini-chip", `${Math.max(1, number)}日間`),
        create("h3", "", trip.title.trim() || "名称未設定の旅行"),
        create("p", "", trip.destination.trim() || "目的地はまだ未設定です"),
        create("p", "date-range", `${formatDateShort(trip.startDate)} — ${formatDateShort(trip.endDate)}`),
      );
      const actions = create("div", "card-actions");
      const open = create("button", "btn btn-primary", "プランを開く");
      open.type = "button";
      open.dataset.action = "open-trip";
      open.dataset.id = trip.id;
      const remove = create("button", "btn btn-danger", "削除");
      remove.type = "button";
      remove.dataset.action = "delete-trip";
      remove.dataset.id = trip.id;
      actions.append(open, remove);
      card.append(actions);
      el["trip-list"].append(card);
    });
}

function renderEditor() {
  if (!state.currentTrip) return;
  syncTripDays();
  const trip = state.currentTrip;
  document.getElementById("trip-title").value = trip.title;
  document.getElementById("trip-destination").value = trip.destination;
  document.getElementById("trip-start-date").value = trip.startDate;
  document.getElementById("trip-end-date").value = trip.endDate;
  document.getElementById("trip-memo").value = trip.memo;
  el["editor-title"].textContent = trip.title.trim() || "新しい旅行";
  el["editor-subtitle"].textContent = trip.destination.trim()
    ? `${trip.destination}への旅を計画しています。`
    : "行き先と時間を入れて、旅の流れを作りましょう。";
  renderDayTabs();
  renderCurrentDay();
}

function renderDayTabs() {
  el["day-tabs"].replaceChildren();
  state.currentTrip.days.forEach((day, index) => {
    const button = create("button", `day-tab${index === state.currentDayIndex ? " active" : ""}`);
    button.type = "button";
    button.dataset.dayIndex = String(index);
    button.setAttribute("aria-current", index === state.currentDayIndex ? "date" : "false");
    button.append(
      create("strong", "", `${index + 1}日目`),
      document.createTextNode(formatDateWithWeekday(day.date)),
    );
    el["day-tabs"].append(button);
  });
}

function renderCurrentDay() {
  const day = getCurrentDay();
  if (!day) return;
  document.getElementById("day-start-time").value = day.startTime || "09:00";
  document.getElementById("day-end-time").value = day.targetEndTime || "18:00";
  document.getElementById("day-departure").value = day.departurePoint || "";
  el["selected-day-label"].textContent = `${state.currentDayIndex + 1}日目の予定`;
  renderPlaces();
  renderPreview();
}

function renderPlaces() {
  const day = getCurrentDay();
  el["places-list"].replaceChildren();
  if (!day.places.length) {
    const empty = create("div", "places-empty");
    empty.append(
      create("strong", "", "立ち寄る場所を追加しましょう"),
      create("div", "", "滞在時間と移動時間から、予定表を自動で計算します。"),
    );
    el["places-list"].append(empty);
    return;
  }

  day.places.forEach((place, index) => {
    const card = create("article", "place-card");
    card.append(create("div", "place-number", String(index + 1)));
    const main = create("div", "place-main");
    const name = create("div", "place-name");
    name.append(create("span", "category-dot"), create("strong", "", place.name));
    const fixed = place.isFixedTime ? ` · ${place.fixedStartTime}固定` : "";
    main.append(
      name,
      create("div", "place-meta", `${categoryLabels[place.category]} · 滞在 ${formatDuration(place.durationMinutes)} · 次へ ${formatDuration(place.travelMinutesToNext)}${fixed}`),
    );
    const actions = create("div", "place-actions");
    [
      ["↑", "up", "上へ移動"],
      ["↓", "down", "下へ移動"],
      ["複製", "duplicate", "複製"],
      ["編集", "edit", "編集"],
      ["×", "delete", "削除"],
    ].forEach(([label, action, aria]) => {
      const button = create("button", "icon-btn", label);
      button.type = "button";
      button.dataset.action = action;
      button.dataset.id = place.id;
      button.setAttribute("aria-label", `${place.name}を${aria}`);
      if ((action === "up" && index === 0) || (action === "down" && index === day.places.length - 1)) {
        button.disabled = true;
      }
      actions.append(button);
    });
    card.append(main, actions);
    el["places-list"].append(card);
  });
}

function renderPreview() {
  const day = getCurrentDay();
  if (!day) return;
  const result = calculateTimeline(day);
  el["preview-title"].textContent = `${state.currentDayIndex + 1}日目のタイムテーブル`;
  el["preview-date"].textContent = `${formatDateLong(day.date)}${day.departurePoint ? ` · ${day.departurePoint}から` : ""}`;
  el["warnings"].replaceChildren();
  result.warnings.forEach((warning) => {
    el["warnings"].append(create("div", `warning${warning.type === "error" ? " error" : ""}`, warning.message));
  });
  el["timeline"].replaceChildren();

  if (!result.items.length) {
    const empty = create("div", "timeline-empty");
    empty.append(
      create("strong", "", "予定はまだありません"),
      create("p", "", "左の「場所を追加」から、行きたい場所を登録してください。"),
    );
    el["timeline"].append(empty);
  } else {
    result.items.forEach((item) => el["timeline"].append(createTimelineRow(item)));
  }
  el["preview-count"].textContent = `予定 ${day.places.length}件`;
  el["preview-duration"].textContent = `所要時間 ${formatDuration(result.totalMinutes)}`;
}

function createTimelineRow(item) {
  const row = create("div", `timeline-row ${item.type}`);
  const time = create("div", "timeline-time");
  time.textContent = formatClock(item.start);
  if (item.type === "place") time.append(create("span", "", `〜 ${formatClock(item.end)}`));
  row.append(time, create("div", "timeline-track"));
  const content = create("div", "timeline-content");
  if (item.type === "place") {
    content.append(create("strong", "", item.place.name));
    content.append(create("p", "", `${categoryLabels[item.place.category]} · 滞在 ${formatDuration(item.place.durationMinutes)}`));
    if (item.place.location) content.append(create("p", "location", `⌖ ${item.place.location}`));
    if (item.place.memo) content.append(create("p", "", item.place.memo));
  } else if (item.type === "travel") {
    content.textContent = `移動 · ${formatDuration(item.duration)}`;
  } else {
    content.textContent = `自由時間 · ${formatDuration(item.duration)}`;
  }
  row.append(content);
  return row;
}

function calculateTimeline(day) {
  const items = [];
  const warnings = [];
  const dayStart = timeToMinutes(day.startTime || "09:00");
  const targetEnd = timeToMinutes(day.targetEndTime || "18:00");
  let current = dayStart;

  day.places.forEach((place) => {
    if (place.isFixedTime && place.fixedStartTime) {
      let fixed = timeToMinutes(place.fixedStartTime);
      if (fixed < dayStart && current >= dayStart) fixed += 1440;
      if (fixed > current) {
        items.push({ type: "free", start: current, end: fixed, duration: fixed - current });
      } else if (fixed < current) {
        warnings.push({
          type: "error",
          message: `「${place.name}」は前の予定と${formatDuration(current - fixed)}重なっています。`,
        });
      }
      current = fixed;
    }

    const end = current + Number(place.durationMinutes);
    items.push({ type: "place", start: current, end, place });
    current = end;
    const travel = Number(place.travelMinutesToNext) || 0;
    if (travel > 0) {
      items.push({ type: "travel", start: current, end: current + travel, duration: travel });
      current += travel;
    }
  });

  if (day.places.length && current > targetEnd && targetEnd >= dayStart) {
    warnings.push({
      type: "warning",
      message: `終了の目安を${formatDuration(current - targetEnd)}超えています。`,
    });
  }
  if (current >= 1440) {
    warnings.push({
      type: "warning",
      message: `予定が翌日の${formatClock(current)}まで続きます。`,
    });
  }
  return { items, warnings, totalMinutes: Math.max(0, current - dayStart) };
}

function handleTripField(event) {
  if (!state.currentTrip) return;
  const field = event.target.dataset.tripField;
  const oldStart = state.currentTrip.startDate;
  const oldEnd = state.currentTrip.endDate;
  state.currentTrip[field] = event.target.value;

  if ((field === "startDate" || field === "endDate") && validDateRange(state.currentTrip)) {
    const wouldRemove = state.currentTrip.days.some(
      (day) => day.date < state.currentTrip.startDate || day.date > state.currentTrip.endDate,
    );
    const hasPlansToRemove = state.currentTrip.days.some(
      (day) => (day.date < state.currentTrip.startDate || day.date > state.currentTrip.endDate) && day.places.length,
    );
    if (wouldRemove && hasPlansToRemove && !window.confirm("期間外になる日の予定が削除されます。日付を変更しますか？")) {
      state.currentTrip.startDate = oldStart;
      state.currentTrip.endDate = oldEnd;
      document.getElementById("trip-start-date").value = oldStart;
      document.getElementById("trip-end-date").value = oldEnd;
      return;
    }
    syncTripDays();
    state.currentDayIndex = Math.min(state.currentDayIndex, state.currentTrip.days.length - 1);
  }

  el["editor-title"].textContent = state.currentTrip.title.trim() || "新しい旅行";
  el["editor-subtitle"].textContent = state.currentTrip.destination.trim()
    ? `${state.currentTrip.destination}への旅を計画しています。`
    : "行き先と時間を入れて、旅の流れを作りましょう。";
  validateTrip();
  renderDayTabs();
  renderCurrentDay();
  persistTrips();
}

function handleDayField(event) {
  const day = getCurrentDay();
  if (!day) return;
  day[event.target.dataset.dayField] = event.target.value;
  renderPreview();
  persistTrips();
}

function handleDayTabClick(event) {
  const button = event.target.closest("[data-day-index]");
  if (!button) return;
  state.currentDayIndex = Number(button.dataset.dayIndex);
  renderDayTabs();
  renderCurrentDay();
}

function handleTripListAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "open-trip") openTrip(button.dataset.id);
  if (button.dataset.action === "delete-trip") requestTripDelete(button.dataset.id);
}

function handlePlaceAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const day = getCurrentDay();
  const index = day.places.findIndex((place) => place.id === button.dataset.id);
  if (index < 0) return;
  const action = button.dataset.action;

  if (action === "edit") {
    openPlaceDialog(day.places[index]);
    return;
  }
  if (action === "delete") {
    requestPlaceDelete(day.places[index]);
    return;
  }
  if (action === "duplicate") {
    const copy = clone(day.places[index]);
    copy.id = uid("place");
    copy.name = `${copy.name}（コピー）`;
    day.places.splice(index + 1, 0, copy);
  }
  if (action === "up" && index > 0) {
    [day.places[index - 1], day.places[index]] = [day.places[index], day.places[index - 1]];
  }
  if (action === "down" && index < day.places.length - 1) {
    [day.places[index + 1], day.places[index]] = [day.places[index], day.places[index + 1]];
  }
  renderPlaces();
  renderPreview();
  persistTrips();
}

function openPlaceDialog(place = null) {
  state.editingPlaceId = place?.id || null;
  el["place-dialog-title"].textContent = place ? "予定を編集" : "場所を追加";
  el["place-id"].value = place?.id || "";
  el["place-name"].value = place?.name || "";
  el["place-category"].value = place?.category || "sightseeing";
  el["place-location"].value = place?.location || "";
  el["place-duration"].value = place?.durationMinutes ?? 60;
  el["place-travel"].value = place?.travelMinutesToNext ?? 0;
  el["place-is-fixed"].checked = Boolean(place?.isFixedTime);
  el["place-fixed-time"].value = place?.fixedStartTime || "";
  el["place-memo"].value = place?.memo || "";
  el["place-name-error"].textContent = "";
  toggleFixedTime();
  el["place-dialog"].showModal();
  setTimeout(() => el["place-name"].focus(), 0);
}

function closePlaceDialog() {
  el["place-dialog"].close();
  state.editingPlaceId = null;
}

function toggleFixedTime() {
  const enabled = el["place-is-fixed"].checked;
  el["fixed-time-field"].hidden = !enabled;
  el["place-fixed-time"].required = enabled;
}

function savePlaceFromDialog(event) {
  event.preventDefault();
  const name = el["place-name"].value.trim();
  const duration = Number(el["place-duration"].value);
  const travel = Number(el["place-travel"].value || 0);
  const isFixed = el["place-is-fixed"].checked;
  if (!name) {
    el["place-name-error"].textContent = "場所・予定名を入力してください。";
    el["place-name"].focus();
    return;
  }
  if (!Number.isInteger(duration) || duration < 5 || duration > 1440) {
    showToast("滞在時間は5〜1,440分の整数で入力してください。");
    return;
  }
  if (!Number.isInteger(travel) || travel < 0 || travel > 1440) {
    showToast("移動時間は0〜1,440分の整数で入力してください。");
    return;
  }
  if (isFixed && !el["place-fixed-time"].value) {
    showToast("固定開始時刻を入力してください。");
    el["place-fixed-time"].focus();
    return;
  }

  const place = {
    id: state.editingPlaceId || uid("place"),
    name,
    category: el["place-category"].value,
    durationMinutes: duration,
    travelMinutesToNext: travel,
    isFixedTime: isFixed,
    fixedStartTime: isFixed ? el["place-fixed-time"].value : null,
    location: el["place-location"].value.trim(),
    memo: el["place-memo"].value.trim(),
  };
  const day = getCurrentDay();
  const index = day.places.findIndex((item) => item.id === place.id);
  if (index >= 0) day.places[index] = place;
  else day.places.push(place);
  closePlaceDialog();
  renderPlaces();
  renderPreview();
  persistTrips();
  showToast(index >= 0 ? "予定を更新しました" : "予定を追加しました");
}

function requestTripDelete(id) {
  const trip = state.trips.find((item) => item.id === id);
  if (!trip) return;
  el["confirm-title"].textContent = "旅行を削除しますか？";
  el["confirm-message"].textContent = `「${trip.title || "名称未設定の旅行"}」を削除します。この操作は元に戻せません。`;
  el["confirm-ok"].textContent = "旅行を削除";
  state.confirmAction = { type: "trip", id };
  el["confirm-dialog"].showModal();
}

function requestPlaceDelete(place) {
  el["confirm-title"].textContent = "予定を削除しますか？";
  el["confirm-message"].textContent = `「${place.name}」をこの日の予定から削除します。`;
  el["confirm-ok"].textContent = "予定を削除";
  state.confirmAction = { type: "place", id: place.id };
  el["confirm-dialog"].showModal();
}

function executeConfirmedAction() {
  if (!state.confirmAction) return;
  if (state.confirmAction.type === "trip") {
    state.trips = state.trips.filter((trip) => trip.id !== state.confirmAction.id);
    persistListImmediately();
    renderTripList();
    showToast("旅行を削除しました");
  } else {
    const day = getCurrentDay();
    day.places = day.places.filter((place) => place.id !== state.confirmAction.id);
    renderPlaces();
    renderPreview();
    persistTrips();
    showToast("予定を削除しました");
  }
  state.confirmAction = null;
  el["confirm-dialog"].close();
}

function syncTripDays() {
  const trip = state.currentTrip;
  if (!trip || !validDateRange(trip)) return;
  const existing = new Map((trip.days || []).map((day) => [day.date, day]));
  trip.days = enumerateDates(trip.startDate, trip.endDate).map((date) => {
    return existing.get(date) || {
      date,
      startTime: "09:00",
      targetEndTime: "18:00",
      departurePoint: "",
      memo: "",
      places: [],
    };
  });
}

function validateTrip() {
  if (!state.currentTrip) return false;
  const trip = state.currentTrip;
  let valid = true;
  valid = setFieldError("trip-title", !trip.title.trim() ? "旅行名を入力してください。" : "") && valid;
  valid = setFieldError("trip-destination", !trip.destination.trim() ? "目的地を入力してください。" : "") && valid;
  valid = setFieldError("trip-start-date", !trip.startDate ? "出発日を入力してください。" : "") && valid;
  let endError = !trip.endDate ? "帰着日を入力してください。" : "";
  if (!endError && trip.startDate && trip.endDate < trip.startDate) endError = "帰着日は出発日以降にしてください。";
  valid = setFieldError("trip-end-date", endError) && valid;
  return valid;
}

function setFieldError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}-error`);
  input.setAttribute("aria-invalid", String(Boolean(message)));
  if (error) error.textContent = message;
  return !message;
}

function getCurrentDay() {
  return state.currentTrip?.days?.[state.currentDayIndex] || null;
}

function validDateRange(trip) {
  return Boolean(trip.startDate && trip.endDate && trip.startDate <= trip.endDate);
}

function enumerateDates(start, end) {
  const dates = [];
  const cursor = parseISODate(start);
  const last = parseISODate(end);
  let guard = 0;
  while (cursor <= last && guard < 366) {
    dates.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatClock(totalMinutes) {
  const dayOffset = Math.floor(totalMinutes / 1440);
  const withinDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(withinDay / 60)).padStart(2, "0");
  const minutes = String(withinDay % 60).padStart(2, "0");
  return `${dayOffset > 0 ? `翌${dayOffset > 1 ? dayOffset : ""} ` : ""}${hours}:${minutes}`;
}

function formatDuration(minutes) {
  const value = Number(minutes) || 0;
  if (value < 60) return `${value}分`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateWithWeekday(value) {
  if (!value) return "日付未設定";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(parseISODate(value));
}

function formatDateShort(value) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(parseISODate(value));
}

function formatDateLong(value) {
  if (!value) return "日付未設定";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(parseISODate(value));
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  return Math.round((parseISODate(end) - parseISODate(start)) / 86400000);
}

function setSaveStatus(message) {
  el["save-status"].textContent = message;
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.add("show");
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2600);
}

function create(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix) {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
