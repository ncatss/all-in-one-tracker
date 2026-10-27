function updateSummaryCalendarShareButton() {
  const button = document.getElementById("summaryCalendarShareButton");
  if (!button) return;
  const hasDateGroup = (state.groupByCols || []).some(value => String(value).split("|")[0] === "date");
  button.hidden = !state.summary || !hasDateGroup || !(state.aggCols || []).length;
}

function openSummaryCalendarShare() {
  if (!state.summary || !(state.groupByCols || []).some(value => String(value).split("|")[0] === "date") || !(state.aggCols || []).length) {
    return alert("Group the summary by Date and choose an aggregate column to create a calendar.");
  }
  document.getElementById("summaryCalendarShareModal")?.remove();
  const modal = document.createElement("div");
  modal.className = "modal summary-calendar-share-modal";
  modal.id = "summaryCalendarShareModal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Share calendar summary");

  const content = document.createElement("div");
  content.className = "modal-content summary-calendar-share-content";
  const header = document.createElement("div");
  header.className = "summary-calendar-share-header";
  const title = document.createElement("h2");
  title.textContent = "Calendar summary";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "✖️";
  close.setAttribute("aria-label", "Close calendar preview");
  close.onclick = () => modal.remove();
  header.append(title, close);

  const controls = document.createElement("div");
  controls.className = "summary-calendar-controls";
  const fieldSelect = document.createElement("select");
  fieldSelect.id = "summaryCalendarField";
  const fields = [...new Set((state.aggCols || []).map(value => String(value).split("|")[0]))];
  fields.forEach(field => {
    const option = document.createElement("option");
    option.value = field;
    option.textContent = getSummaryCalendarText(field, "text");
    fieldSelect.appendChild(option);
  });
  const dateField = state.formFields?.find(field => field.label === "date")?.label || "date";
  const rows = (state.filteredData || []).flatMap(group => group._details || []);
  const availableDates = rows.map(row => summaryCalendarDateKey(row[dateField])).filter(Boolean).sort();
  const earliestDate = availableDates[0] || "";
  const latestDate = availableDates[availableDates.length - 1] || "";
  const rangePreset = document.createElement("select");
  rangePreset.id = "summaryCalendarRangePreset";
  [["all", "All dates"], ["ytd", "Year to date"], ["3", "3 months"], ["6", "6 months"], ["12", "12 months"], ["custom", "Custom range"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    rangePreset.appendChild(option);
  });
  rangePreset.value = "all";
  const startDateInput = document.createElement("input");
  startDateInput.type = "date";
  startDateInput.id = "summaryCalendarStartDate";
  startDateInput.value = earliestDate;
  const endDateInput = document.createElement("input");
  endDateInput.type = "date";
  endDateInput.id = "summaryCalendarEndDate";
  endDateInput.value = latestDate;

  const displaySelect = document.createElement("select");
  displaySelect.id = "summaryCalendarDisplay";
  [["emoji", "Emoji"], ["text", "Text"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    displaySelect.appendChild(option);
  });
  const firstField = state.formFields?.find(field => field.label === fields[0]);
  const emojiSetting = firstField?.selectEmoji ?? firstField?.select_emoji ?? firstField?.emoji;
  displaySelect.value = emojiSetting === true || String(emojiSetting).toLowerCase() === "true" ? "emoji" : "text";

  [ ["Aggregate", fieldSelect], ["Range", rangePreset], ["From", startDateInput], ["To", endDateInput], ["Show as", displaySelect] ].forEach(([labelText, select]) => {
    const label = document.createElement("label");
    label.append(document.createTextNode(`${labelText} `), select);
    controls.appendChild(label);
  });

  const categoryHeader = document.createElement("div");
  categoryHeader.className = "summary-calendar-category-header";
  const categoryTitle = document.createElement("strong");
  categoryTitle.textContent = "Include values";
  const selectionActions = document.createElement("div");
  const selectAll = document.createElement("button");
  selectAll.type = "button";
  selectAll.textContent = "Select all";
  const clearAll = document.createElement("button");
  clearAll.type = "button";
  clearAll.textContent = "Clear";
  selectionActions.append(selectAll, clearAll);
  categoryHeader.append(categoryTitle, selectionActions);
  const categories = document.createElement("div");
  categories.id = "summaryCalendarCategories";
  categories.className = "summary-calendar-categories";

  const preview = document.createElement("canvas");
  preview.id = "summaryCalendarPreview";
  preview.className = "summary-calendar-preview";
  preview.setAttribute("aria-label", "Calendar share image preview");
  const status = document.createElement("p");
  status.className = "summary-calendar-status";
  status.id = "summaryCalendarStatus";
  const footer = document.createElement("div");
  footer.className = "summary-calendar-share-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "💾 Save image";
  save.onclick = () => saveSummaryCalendarImage(preview);
  const share = document.createElement("button");
  share.type = "button";
  share.textContent = "📤 Share";
  share.onclick = () => shareSummaryCalendarImage(preview);
  if (!navigator.share || !navigator.canShare) share.hidden = true;
  footer.append(save, share);

  content.append(header, controls, categoryHeader, categories, status, preview, footer);
  modal.appendChild(content);
  modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  modal.style.display = "flex";

  const populateCategories = () => {
    const field = fieldSelect.value;
    const values = [...new Set(rows.map(row => String(row[field] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    categories.replaceChildren();
    values.forEach(value => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = value;
      checkbox.checked = true;
      checkbox.addEventListener("change", drawPreview);
      const text = document.createElement("span");
      text.textContent = getSummaryCalendarText(value, "text");
      label.append(checkbox, text);
      categories.appendChild(label);
    });
    drawPreview();
  };
  selectAll.onclick = () => { categories.querySelectorAll("input").forEach(input => input.checked = true); drawPreview(); };
  clearAll.onclick = () => { categories.querySelectorAll("input").forEach(input => input.checked = false); drawPreview(); };
  fieldSelect.addEventListener("change", populateCategories);
  rangePreset.addEventListener("change", () => {
    if (rangePreset.value !== "custom") applySummaryCalendarPreset(rangePreset.value, latestDate, dateField, startDateInput, endDateInput);
    drawPreview();
  });
  let rangeRedrawTimer = 0;
  [startDateInput, endDateInput].forEach(input => {
    const updateDateRange = () => {
      rangePreset.value = "custom";
      clearTimeout(rangeRedrawTimer);
      rangeRedrawTimer = window.setTimeout(() => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return;
        drawPreview();
      }, 180);
    };
    input.addEventListener("input", updateDateRange);
    input.addEventListener("change", updateDateRange);
    input.addEventListener("blur", updateDateRange);
  });
  displaySelect.addEventListener("change", drawPreview);
  populateCategories();

  function drawPreview() {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const field = fieldSelect.value;
    const mode = displaySelect.value;
    const selected = new Set([...categories.querySelectorAll("input:checked")].map(input => input.value));
    if (startDate && endDate && startDate > endDate) {
      status.textContent = "The start date must be on or before the end date.";
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      status.textContent = "Finish entering both dates to refresh the calendar.";
      return;
    }
    drawSummaryCalendar(preview, rows, dateField, field, selected, mode, startDate, endDate);
    status.textContent = startDate && endDate
      ? `${startDate} – ${endDate} · ${selected.size} value${selected.size === 1 ? "" : "s"} selected`
      : "No dated summary rows to display.";
  }
}

function applySummaryCalendarPreset(monthCount, latestDate, dateField, startInput, endInput) {
  if (!latestDate) return;
  if (monthCount === "ytd") {
    const today = new Date();
    startInput.value = `${today.getFullYear()}-01-01`;
    endInput.value = getLocalDateString(today);
    return;
  }
  if (monthCount === "all") {
    const dates = (state.filteredData || []).flatMap(group => group._details || [])
      .map(row => summaryCalendarDateKey(row[dateField])).filter(Boolean).sort();
    startInput.value = dates[0] || latestDate;
    endInput.value = dates[dates.length - 1] || latestDate;
    return;
  }
  const [year, month] = latestDate.slice(0, 7).split("-").map(Number);
  const months = Number(monthCount);
  const firstMonth = new Date(year, month - months, 1);
  const lastMonth = new Date(year, month, 0);
  startInput.value = `${firstMonth.getFullYear()}-${String(firstMonth.getMonth() + 1).padStart(2, "0")}-01`;
  endInput.value = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${String(lastMonth.getDate()).padStart(2, "0")}`;
}

function summaryCalendarDateKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = parseLocalDate(raw);
  return Number.isFinite(date?.getTime()) ? getLocalDateString(date) : "";
}

function getSummaryCalendarText(value, mode) {
  const raw = String(value ?? "");
  const translation = JSON.parse(localStorage.getItem("translations") || "{}");
  if (mode === "text") return translation.en?.[raw] || raw.replace(/[_-]+/g, " ");
  return translation.emoji?.[raw] || ( /\p{Extended_Pictographic}/u.test(raw) ? raw : "");
}

function drawSummaryCalendar(canvas, rows, dateField, valueField, selectedValues, displayMode, rangeStart, rangeEnd) {
  const width = 1800;
  const margin = 44;
  const gapX = 24;
  const gapY = 20;
  const cardWidth = (width - margin * 2 - gapX * 2) / 3;
  const cardHeight = 420;
  const top = 112;
  if (!rangeStart || !rangeEnd) {
    canvas.width = width;
    canvas.height = 220;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f4f7fb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#667085";
    context.textAlign = "center";
    context.font = "20px system-ui, sans-serif";
    context.fillText("No dated summary rows to display", width / 2, 120);
    return;
  }
  const [startYear, startMonth] = rangeStart.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = rangeEnd.slice(0, 7).split("-").map(Number);
  const monthCount = (endYear - startYear) * 12 + endMonth - startMonth + 1;
  const paddingCount = monthCount > 3 ? (3 - monthCount % 3) % 3 : 0;
  const paddingBefore = startMonth === 1 ? 0 : Math.floor(paddingCount / 2);
  const displayedMonthCount = monthCount + paddingCount;
  const monthRows = Math.ceil(displayedMonthCount / 3);
  canvas.width = width;
  canvas.height = top + cardHeight * monthRows + gapY * (monthRows - 1) + margin;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f4f7fb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#2456a6";
  context.textAlign = "center";
  context.font = "300 72px system-ui, sans-serif";
  context.fillText(startYear === endYear ? String(startYear) : `${startYear}–${endYear}`, width / 2, 82);

  const valuesByDay = new Map();
  const timeField = state.formFields?.find(field => field.label !== dateField && /^(time|datetime|starttime)$/i.test(field.label))?.label;
  const getRowTimeOrder = row => {
    const dateValue = String(row[dateField] ?? "");
    const timeValue = String(timeField ? row[timeField] ?? "" : "").trim();
    const timeMatch = timeValue.match(/^(\d{1,2}):(\d{2})/);
    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) && timeMatch
      ? `${dateValue}T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`
      : dateValue;
  };
  const orderedRows = [...rows].sort((a, b) => {
    return getRowTimeOrder(a).localeCompare(getRowTimeOrder(b));
  });
  orderedRows.forEach(row => {
    const day = summaryCalendarDateKey(row[dateField]);
    const value = String(row[valueField] ?? "").trim();
    if (!day || day < rangeStart || day > rangeEnd || !value || !selectedValues.has(value)) return;
    if (!valuesByDay.has(day)) valuesByDay.set(day, []);
    valuesByDay.get(day).push(value);
  });

  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  for (let monthIndex = 0; monthIndex < displayedMonthCount; monthIndex++) {
    const monthDate = new Date(startYear, startMonth - 1 - paddingBefore + monthIndex, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const col = monthIndex % 3;
    const row = Math.floor(monthIndex / 3);
    const x = margin + col * (cardWidth + gapX);
    const y = top + row * (cardHeight + gapY);
    context.fillStyle = "#ffffff";
    roundCalendarRect(context, x, y, cardWidth, cardHeight, 16);
    context.fill();
    context.strokeStyle = "#dce3ec";
    context.lineWidth = 2;
    roundCalendarRect(context, x, y, cardWidth, cardHeight, 16);
    context.stroke();
    context.fillStyle = "#2456a6";
    context.textAlign = "center";
    context.font = "500 25px system-ui, sans-serif";
    const monthTitle = monthDate.toLocaleString(undefined, { month: "long" });
    const showYear = startYear !== endYear || year !== startYear;
    context.fillText(showYear ? `${monthTitle} ${year}` : monthTitle, x + cardWidth / 2, y + 42);

    const gridX = x + 15;
    const gridY = y + 74;
    const cellWidth = (cardWidth - 30) / 7;
    const cellHeight = 55;
    weekdays.forEach((day, index) => {
      context.fillStyle = "#667085";
      context.font = "600 12px system-ui, sans-serif";
      context.fillText(day, gridX + index * cellWidth + cellWidth / 2, gridY);
    });
    context.strokeStyle = "#b9c2cf";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(gridX, gridY + 10);
    context.lineTo(gridX + cellWidth * 7, gridY + 10);
    context.stroke();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const index = firstDay + day - 1;
      const dayRow = Math.floor(index / 7);
      const dayCol = index % 7;
      const cellX = gridX + dayCol * cellWidth;
      const cellY = gridY + 17 + dayRow * cellHeight;
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const items = valuesByDay.get(key) || [];
      const outsideDateRange = Boolean(rangeStart && rangeEnd && (key < rangeStart || key > rangeEnd));
      if (outsideDateRange) {
        context.fillStyle = "#e9edf2";
        roundCalendarRect(context, cellX + 1, cellY + 1, cellWidth - 2, cellHeight - 2, 7);
        context.fill();
      } else if (items.length) {
        context.fillStyle = "#edf4ff";
        roundCalendarRect(context, cellX + 1, cellY + 1, cellWidth - 2, cellHeight - 2, 7);
        context.fill();
      }
      context.fillStyle = outsideDateRange ? "#98a2b3" : "#344054";
      context.font = "600 12px system-ui, sans-serif";
      context.textAlign = "left";
      context.fillText(String(day), cellX + 5, cellY + 15);
      if (!items.length) continue;
      context.save();
      context.beginPath();
      context.rect(cellX + 2, cellY + 18, cellWidth - 4, cellHeight - 20);
      context.clip();
      if (displayMode === "emoji") {
        context.textAlign = "left";
        context.font = "13px system-ui, sans-serif";
        let itemX = cellX + 5;
        let itemRow = 0;
        let shown = 0;
        for (const value of items) {
          const emoji = getSummaryCalendarText(value, "emoji") || "•";
          const itemWidth = context.measureText(emoji).width + 1;
          if (itemX + itemWidth > cellX + cellWidth - 4) {
            itemRow++;
            itemX = cellX + 5;
          }
          if (itemRow > 1 || cellY + 31 + itemRow * 14 > cellY + cellHeight - 3) break;
          context.fillText(emoji, itemX, cellY + 31 + itemRow * 14);
          itemX += itemWidth;
          shown++;
        }
        if (items.length > shown) {
          context.textAlign = "right";
          context.font = "9px system-ui, sans-serif";
          context.fillStyle = "#667085";
          context.fillText(`+${items.length - shown}`, cellX + cellWidth - 4, cellY + cellHeight - 3);
        }
      } else {
        context.textAlign = "left";
        context.font = "10px system-ui, sans-serif";
        context.fillStyle = "#2456a6";
        items.slice(0, 2).forEach((value, itemIndex) => {
          context.fillText(clipCalendarText(context, getSummaryCalendarText(value, "text"), cellWidth - 10), cellX + 5, cellY + 31 + itemIndex * 13);
        });
        if (items.length > 2) {
          context.fillStyle = "#667085";
          context.fillText(`+${items.length - 2}`, cellX + 5, cellY + cellHeight - 3);
        }
      }
      context.restore();
    }
  }
}

function clipCalendarText(context, value, maxWidth) {
  let text = String(value || "");
  while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return context.measureText(text).width > maxWidth ? `${text}…` : text;
}

function roundCalendarRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function summaryCalendarToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not generate the calendar image.")), "image/png"));
}

async function saveSummaryCalendarImage(canvas) {
  try {
    const blob = await summaryCalendarToBlob(canvas);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const start = document.getElementById("summaryCalendarStartDate")?.value.replace(/-/g, "") || "start";
    const end = document.getElementById("summaryCalendarEndDate")?.value.replace(/-/g, "") || "end";
    link.download = `calendar-summary-${start}-${end}.png`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error("Unable to save calendar summary", error);
    alert(error.message || "Could not save the calendar image.");
  }
}

async function shareSummaryCalendarImage(canvas) {
  try {
    const blob = await summaryCalendarToBlob(canvas);
    const file = new File([blob], "calendar-summary.png", { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) return saveSummaryCalendarImage(canvas);
    await navigator.share({ files: [file], title: "Calendar summary" });
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Unable to share calendar summary", error);
      alert(error.message || "Could not share the calendar image.");
    }
  }
}
