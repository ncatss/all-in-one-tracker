let tripMapInstance = null;
let tripMapLayerGroup = null;
let tripMapRouteSvg = null;
let tripMapRoadRouteKey = "";
let tripMapRoadRoute = null;
let tripMapRoadRouteRequest = 0;
const TRIP_MAP_ROUTE_COLORS = ["#e85d04", "#d97706", "#2563eb", "#16a34a", "#be185d", "#7c3aed", "#0891b2", "#ca8a04"];
let tripMapTrips = [];
let tripMapStops = [];
let tripMapSelectedTripId = null;
let tripMapPendingTrip = null;
let tripMapPendingStop = null;
let tripMapEditingStop = null;
let tripMapPendingStopCoordinates = null;
let tripMapPendingStopDate = null;

const TRIP_MAP_SHEETS = {
  TravelTripList: [
    { label: "tripname", type: "text", required: true },
    { label: "country", type: "text", required: true },
    { label: "startdate", type: "date", required: true },
    { label: "enddate", type: "date", required: true },
    { label: "people", type: "text" },
    { label: "notes", type: "textarea" },
    { label: "latitude", type: "number", hiddenInTable: true },
    { label: "longitude", type: "number", hiddenInTable: true }
  ],
  TravelStopList: [
    { label: "tripid", type: "number", hiddenInTable: true },
    { label: "tripname", type: "text" },
    { label: "location", type: "text", required: true },
    { label: "category", type: "text" },
    { label: "datetime", type: "datetime-local", required: true },
    { label: "stoporder", type: "number", hiddenInTable: true },
    { label: "latitude", type: "number", hiddenInTable: true },
    { label: "longitude", type: "number", hiddenInTable: true },
    { label: "details", type: "textarea" }
  ]
};

function disposeTripMapPage() {
  tripMapPendingTrip = null;
  tripMapPendingStop = null;
  tripMapEditingStop = null;
  tripMapPendingStopCoordinates = null;
  tripMapPendingStopDate = null;
  tripMapRouteSvg?.remove();
  tripMapRouteSvg = null;
  tripMapRoadRouteKey = "";
  tripMapRoadRoute = null;
  tripMapRoadRouteRequest++;
  if (tripMapInstance) {
    tripMapInstance.remove();
    tripMapInstance = null;
    tripMapLayerGroup = null;
  }
}

function ensureTravelMapConfig() {
  let formChanged = false;
  Object.entries(TRIP_MAP_SHEETS).forEach(([sheetName, defaults]) => {
    if (!startingForm[sheetName]) {
      startingForm[sheetName] = { baseFields: defaults.map(field => ({ ...field })), sort: sheetName === "TravelTripList" ? "startdate-asc" : "datetime-asc" };
      formChanged = true;
      return;
    }
    startingForm[sheetName].baseFields ||= [];
    defaults.forEach(field => {
      if (!startingForm[sheetName].baseFields.some(existing => existing.label === field.label)) {
        startingForm[sheetName].baseFields.push({ ...field });
        formChanged = true;
      }
    });
  });
  if (formChanged) saveStartingForm();

  startingDisplay.home ||= { buttons: {} };
  startingDisplay.home.buttons ||= {};
  const worldMapButton = startingDisplay.home.buttons.worldmap ||= {
    hidden: false,
    sheetname: "TravelTripList",
    tripMap: true,
    desc: { en: "View trips on a world map and add ordered stops.", ch: "在世界地图上查看行程并添加有序地点。" }
  };
  let displayChanged = false;
  if (worldMapButton.emoji !== "🗺️") {
    worldMapButton.emoji = "🗺️";
    displayChanged = true;
  }
  if (worldMapButton.tripMap !== true) {
    worldMapButton.tripMap = true;
    displayChanged = true;
  }
  if (displayChanged) saveStartingDisplay();

  try {
    const translations = JSON.parse(localStorage.getItem("translations") || "{}");
    translations.emoji ||= {};
    translations.en ||= {};
    translations.ch ||= {};
    if (translations.emoji.worldmap !== "\uD83D\uDDFA\uFE0F") translations.emoji.worldmap = "\uD83D\uDDFA\uFE0F";
    translations.en.worldmap ||= "Travel Map";
    translations.ch.worldmap ||= "旅行地图";
    localStorage.setItem("translations", JSON.stringify(translations));
  } catch (error) {
    console.warn("Could not initialize Travel Map translations", error);
  }
}

async function ensureTravelMapSheets() {
  for (const [sheetName, baseFields] of Object.entries(TRIP_MAP_SHEETS)) {
    const token = typeof getCurrentToken === "function" ? getCurrentToken(sheetName) : "";
    if (!token || typeof updateSheet !== "function") continue;
    const currentVersion = computeVid(startingForm[sheetName]?.baseFields);
    if (localStorage.getItem(`${sheetName}_vid`) !== currentVersion) {
      await updateSheet(sheetName, { ...startingForm[sheetName], baseFields });
    }
  }
}

async function loadLeafletMap() {
  if (window.L) return;
  const cssUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  if (!document.querySelector('link[data-trip-map-leaflet]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    link.dataset.tripMapLeaflet = "true";
    document.head.appendChild(link);
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Map library could not load."));
    document.head.appendChild(script);
  });
}

async function renderTripMapPage() {
  ensureTravelMapConfig();
  const status = document.getElementById("tripMapStatus");
  try {
    await ensureTravelMapSheets();
    const [trips, stops] = await Promise.all([
      loadFromGoogleSheet("TravelTripList"),
      loadFromGoogleSheet("TravelStopList")
    ]);
    tripMapTrips = Array.isArray(trips) ? trips : getLocalData("TravelTripList");
    tripMapStops = Array.isArray(stops) ? stops : getLocalData("TravelStopList");
    await loadLeafletMap();
    if (tripMapInstance) tripMapInstance.remove();
    tripMapInstance = L.map("tripMapCanvas", { zoomControl: true, preferCanvas: true }).setView([22, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      crossOrigin: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
    }).addTo(tripMapInstance);
    tripMapLayerGroup = L.layerGroup().addTo(tripMapInstance);
    createTripMapRouteOverlay();
    tripMapInstance.on("click", handleTripMapClick);
    tripMapInstance.on("zoomend moveend resize", renderTripMapRouteLine);
    status.textContent = tripMapTrips.length
      ? "Select an airplane to open a trip."
      : "Add a trip, then tap its country on the map to place the airplane.";
    renderTripMapPanel();
    renderTripMapLayers();
    window.setTimeout(() => tripMapInstance?.invalidateSize(), 100);
  } catch (error) {
    console.error("Unable to load the travel map", error);
    status.textContent = "The map needs an internet connection to load. Your trip records stay saved in this browser or your configured cloud sheet.";
    renderTripMapPanel();
  }
}

function openTripMapAddTrip() {
  document.getElementById("tripMapModal")?.remove();
  const today = getLocalDateString(new Date());
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal trip-map-modal" id="tripMapModal">
      <div class="modal-content">
        <h2>✈️ Add Trip</h2>
        <label>Trip name<input id="tripMapName" maxlength="100" required placeholder="Iceland"></label>
        <label>Country<input id="tripMapCountry" maxlength="100" required placeholder="Iceland"></label>
        <div class="trip-map-date-row"><label>Start date<input id="tripMapStart" type="date" value="${today}" required></label><label>End date<input id="tripMapEnd" type="date" value="${today}" required></label></div>
        <label>People<input id="tripMapPeople" maxlength="200" placeholder="Who went with you?"></label>
        <label>Details<textarea id="tripMapNotes" rows="3" placeholder="Optional trip notes"></textarea></label>
        <p>The airplane will be placed automatically at the center of the country.</p>
        <div class="trip-map-modal-actions"><button type="button" onclick="closeTripMapModal()">Cancel</button><button type="button" class="primary-button" onclick="beginTripMapPlacement()">Save trip</button></div>
      </div>
    </div>`);
  document.getElementById("tripMapModal").style.display = "flex";
}

function closeTripMapModal() {
  document.getElementById("tripMapModal")?.remove();
}

async function beginTripMapPlacement() {
  const tripname = document.getElementById("tripMapName")?.value.trim();
  const country = document.getElementById("tripMapCountry")?.value.trim();
  const startdate = document.getElementById("tripMapStart")?.value;
  const enddate = document.getElementById("tripMapEnd")?.value;
  if (!tripname || !country || !startdate || !enddate) return alert("Enter a trip name, country, and both dates.");
  if (enddate < startdate) return alert("The trip end date must be on or after the start date.");
  const draft = {
    tripname, country, startdate, enddate,
    people: document.getElementById("tripMapPeople")?.value.trim() || "",
    notes: document.getElementById("tripMapNotes")?.value.trim() || ""
  };
  const status = document.getElementById("tripMapStatus");
  status.textContent = `Finding ${country} on the map…`;
  const saveButton = document.querySelector("#tripMapModal .primary-button");
  if (saveButton) saveButton.disabled = true;
  try {
    const coordinates = await geocodeTripMapCountry(country);
    closeTripMapModal();
    await saveTripMapTrip(draft, coordinates);
  } catch (error) {
    console.error("Unable to locate trip country", error);
    if (saveButton) saveButton.disabled = false;
    status.textContent = `Could not find “${country}”. Check the country name and try again.`;
  }
}

async function geocodeTripMapCountry(country) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q: country, format: "jsonv2", limit: "1", featuretype: "country" });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
  const results = await response.json();
  const result = results.find(item => item.type === "administrative" || item.class === "boundary") || results[0];
  if (!result) throw new Error("No matching country found");
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Country coordinates are invalid");
  return { lat, lng };
}
async function handleTripMapClick(event) {
  if (tripMapPendingTrip) {
    const draft = tripMapPendingTrip;
    tripMapPendingTrip = null;
    await saveTripMapTrip(draft, event.latlng);
    return;
  }
  if (tripMapPendingStop) openTripMapStopModal(event.latlng);
}

async function saveTripMapTrip(draft, latlng) {
  try {
    const row = {
      id: await nextTripMapId("TravelTripList"),
      ...draft,
      latitude: Number(latlng.lat.toFixed(6)),
      longitude: Number(latlng.lng.toFixed(6))
    };
    addToGoogleSheet("TravelTripList", row);
    tripMapTrips.push(row);
    tripMapSelectedTripId = row.id;
    document.getElementById("tripMapStatus").textContent = `${row.tripname} saved. Add the places you visited in date/time order.`;
    renderTripMapLayers();
    renderTripMapPanel();
    tripMapInstance.flyTo([row.latitude, row.longitude], 7, { duration: 0.8 });
    showTripMapToast(`${row.tripname} saved`);
  } catch (error) {
    console.error("Unable to save trip", error);
    alert("The trip could not be saved. Please try again.");
  }
}

function selectTripMapTrip(trip) {
  tripMapSelectedTripId = trip.id;
  renderTripMapPanel();
  renderTripMapLayers();
  const stops = getStopsForTrip(trip).map(getTripMapCoordinates).filter(Boolean);
  if (stops.length > 1) {
    tripMapInstance.fitBounds(L.latLngBounds(stops.map(point => [point.lat, point.lng])), { padding: [48, 48], maxZoom: 9, animate: true });
  } else {
    const coordinates = getTripMapCoordinates(trip);
    if (coordinates) tripMapInstance.flyTo([coordinates.lat, coordinates.lng], 7, { duration: 0.8 });
  }
  document.getElementById("tripMapStatus").textContent = `${trip.tripname} · ${trip.country}`;
}

function renderTripMapPanel() {
  const panel = document.getElementById("tripMapPanel");
  if (!panel) return;
  panel.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = tripMapSelectedTripId == null ? "Your trips" : "Trip details";
  if (tripMapSelectedTripId == null) {
    panel.appendChild(title);
    const intro = document.createElement("p");
    intro.textContent = tripMapTrips.length ? "Choose a trip to zoom in and see its route." : "Your trips will appear here as airplane stamps.";
    panel.appendChild(intro);
    tripMapTrips.forEach(trip => {
      const button = document.createElement("button");
      button.className = "trip-map-trip-card";
      button.type = "button";
      button.innerHTML = "<span class=trip-map-plane>✈️</span><span class=trip-map-trip-card-copy></span>";
      const copy = button.querySelector(".trip-map-trip-card-copy");
      const name = document.createElement("strong");
      name.textContent = trip.tripname || trip.country || "Trip";
      const dates = document.createElement("small");
      dates.textContent = formatTripMapDateRange(trip.startdate, trip.enddate);
      copy.append(name, dates);
      button.addEventListener("click", () => selectTripMapTrip(trip));
      panel.appendChild(button);
    });
    return;
  }

  const trip = tripMapTrips.find(item => String(item.id) === String(tripMapSelectedTripId));
  if (!trip) {
    tripMapSelectedTripId = null;
    renderTripMapPanel();
    return;
  }
  const titleBar = document.createElement("div");
  titleBar.className = "trip-map-panel-titlebar";
  const shareButton = document.createElement("button");
  shareButton.className = "trip-map-share-button";
  shareButton.type = "button";
  shareButton.textContent = "📤";
  shareButton.title = "Share trip map";
  shareButton.setAttribute("aria-label", "Share trip map");
  shareButton.addEventListener("click", () => openTripMapShareDialog(trip));
  titleBar.append(title, shareButton);
  panel.appendChild(titleBar);
  const back = document.createElement("button");
  back.className = "trip-map-back-to-list";
  back.type = "button";
  back.textContent = "← All trips";
  back.addEventListener("click", () => { tripMapSelectedTripId = null; renderTripMapPanel(); renderTripMapLayers(); });
  panel.appendChild(back);
  const name = document.createElement("h3");
  name.textContent = `${trip.country || "Trip"} · ${trip.tripname || ""}`;
  panel.appendChild(name);
  const dates = document.createElement("p");
  dates.textContent = formatTripMapDateRange(trip.startdate, trip.enddate);
  panel.appendChild(dates);
  if (trip.people) {
    const people = document.createElement("p");
    people.textContent = `With: ${trip.people}`;
    panel.appendChild(people);
  }
  if (trip.notes) {
    const notes = document.createElement("p");
    notes.textContent = trip.notes;
    panel.appendChild(notes);
  }
  const stops = getStopsForTrip(trip);
  const itinerary = document.createElement("div");
  itinerary.className = "trip-map-itinerary";
  getTripMapDates(trip).forEach(date => {
    const day = document.createElement("section");
    day.className = "trip-map-day";
    day.dataset.date = date;
    const heading = document.createElement("div");
    heading.className = "trip-map-day-heading";
    const dayDate = document.createElement("h4");
    const routeColor = document.createElement("span");
    routeColor.className = "trip-map-day-route-color";
    routeColor.style.backgroundColor = getTripMapRouteColor(date, trip);
    routeColor.setAttribute("aria-label", `Route color for ${formatTripMapDateRange(date, date)}`);
    const dayLabel = document.createElement("span");
    dayLabel.textContent = formatTripMapDateRange(date, date);
    const routeMode = document.createElement("span");
    routeMode.className = "trip-map-day-route-mode";
    routeMode.hidden = true;
    dayDate.append(routeColor, dayLabel, routeMode);
    const addSpot = document.createElement("button");
    addSpot.className = "trip-map-add-stop primary-button";
    addSpot.type = "button";
    addSpot.textContent = "＋ Add visited spot";
    addSpot.addEventListener("click", () => openTripMapAddSpotForDate(trip, date));
    heading.append(dayDate, addSpot);
    day.appendChild(heading);
    const dayStops = stops.filter(stop => String(stop.datetime || "").slice(0, 10) === date);
    if (dayStops.length) {
      const list = document.createElement("ul");
      list.className = "trip-map-stop-list";
      dayStops.forEach(stop => {
        const item = document.createElement("li");
        item.className = "trip-map-stop-item";
        const copy = document.createElement("div");
        copy.className = "trip-map-stop-copy";
        const stopName = document.createElement("strong");
        stopName.textContent = `${getTripMapCategoryEmoji(stop.category)} ${stop.location || "Visited spot"}`;
        copy.appendChild(stopName);
        if (stop.details) {
          const details = document.createElement("small");
          details.textContent = stop.details;
          copy.appendChild(details);
        }
        const actions = document.createElement("div");
        actions.className = "trip-map-stop-actions";
        const edit = document.createElement("button");
        edit.className = "trip-map-stop-action";
        edit.type = "button";
        edit.textContent = "✏️";
        edit.title = `Edit ${stop.location || "visited spot"}`;
        edit.setAttribute("aria-label", `Edit ${stop.location || "visited spot"}`);
        edit.addEventListener("click", () => openTripMapEditStop(trip, stop));
        const remove = document.createElement("button");
        remove.className = "trip-map-stop-action trip-map-delete-stop";
        remove.type = "button";
        remove.textContent = "🗑️";
        remove.title = `Delete ${stop.location || "visited spot"}`;
        remove.setAttribute("aria-label", `Delete ${stop.location || "visited spot"}`);
        remove.addEventListener("click", () => deleteTripMapStop(stop));
        actions.append(edit, remove);
        item.append(copy, actions);
        list.appendChild(item);
      });
      day.appendChild(list);
    } else {
      const empty = document.createElement("p");
      empty.className = "trip-map-empty-stops";
      empty.textContent = "No spots added for this day yet.";
      day.appendChild(empty);
    }
    itinerary.appendChild(day);
  });
  panel.appendChild(itinerary);
}

function openTripMapAddSpotForDate(trip, date) {
  tripMapPendingStop = trip;
  tripMapEditingStop = null;
  tripMapPendingStopDate = date;
  tripMapPendingStopCoordinates = null;
  document.getElementById("tripMapStatus").textContent = `Search for the place you visited on ${formatTripMapDateRange(date, date)}.`;
  openTripMapStopModal(date);
}

function openTripMapEditStop(trip, stop) {
  const date = String(stop.datetime || "").slice(0, 10);
  tripMapPendingStop = trip;
  tripMapEditingStop = stop;
  tripMapPendingStopDate = date;
  tripMapPendingStopCoordinates = getTripMapCoordinates(stop);
  openTripMapStopModal(date, stop);
}

function deleteTripMapStop(stop) {
  const name = stop.location || "this visited spot";
  if (!window.confirm(`Delete ${name}?`)) return;
  deleteRow("TravelStopList", stop.id);
  tripMapStops = tripMapStops.filter(item => String(item.id) !== String(stop.id));
  renderTripMapPanel();
  renderTripMapLayers();
  document.getElementById("tripMapStatus").textContent = `${name} deleted.`;
  showTripMapToast(`${name} deleted`);
}

function getStopsForTrip(trip) {
  return tripMapStops
    .filter(stop => String(stop.tripid) === String(trip.id))
    .sort((a, b) => String(a.datetime || "").localeCompare(String(b.datetime || "")) || Number(a.stoporder || 0) - Number(b.stoporder || 0));
}

function getTripMapCoordinateRuns(trip) {
  const pinnedStops = getStopsForTrip(trip).flatMap(stop => {
    const coordinates = getTripMapCoordinates(stop);
    return coordinates ? [{ stop, coordinates }] : [];
  });
  return pinnedStops.length > 1 ? [pinnedStops] : [];
}

function renderTripMapLayers() {
  if (!tripMapInstance || !tripMapLayerGroup) return;
  tripMapLayerGroup.clearLayers();
  tripMapTrips.forEach(trip => {
    const coordinates = getTripMapCoordinates(trip);
    if (!coordinates) return;
    const marker = L.marker([coordinates.lat, coordinates.lng], {
      icon: L.divIcon({ className: "trip-map-airplane-icon", html: "<span>✈️</span>", iconSize: [54, 54], iconAnchor: [27, 27] }),
      title: `${trip.country || "Trip"} · ${trip.tripname || ""}`
    }).addTo(tripMapLayerGroup);
    marker.on("click", () => selectTripMapTrip(trip));
  });
  const trip = tripMapTrips.find(item => String(item.id) === String(tripMapSelectedTripId));
  const stops = trip ? getStopsForTrip(trip).map(stop => ({ stop, coordinates: getTripMapCoordinates(stop) })).filter(item => item.coordinates) : [];
  if (trip) stops.forEach(({ stop, coordinates }) => {
    const marker = L.marker([coordinates.lat, coordinates.lng], {
      icon: L.divIcon({ className: "trip-map-stop-icon", html: `<span>${getTripMapCategoryEmoji(stop.category)}</span>`, iconSize: [36, 36], iconAnchor: [18, 34] }),
      title: stop.location || "Visited spot"
    }).addTo(tripMapLayerGroup);
    marker.bindPopup(`<strong>${escapeTripMapHtml(stop.location || "Visited spot")}</strong><br>${escapeTripMapHtml(formatTripMapStopDate(stop.datetime))}${stop.details ? `<br>${escapeTripMapHtml(stop.details)}` : ""}`);
  });
  updateTripMapRoadRoute(trip);
  renderTripMapRouteLine();
}

function updateTripMapRoadRoute(trip) {
  const runs = trip ? getTripMapCoordinateRuns(trip) : [];
  const key = trip && runs.length
    ? `${trip.id}:${runs.map(run => run.map(({ stop, coordinates }) => `${String(stop.datetime || "").slice(0, 10)}@${coordinates.lat.toFixed(6)},${coordinates.lng.toFixed(6)}`).join(";")).join("|")}`
    : "";
  if (key === tripMapRoadRouteKey) return;
  tripMapRoadRouteKey = key;
  tripMapRoadRoute = null;
  updateTripMapRouteModeIndicators();
  const requestId = ++tripMapRoadRouteRequest;
  if (!key) return;
  Promise.all(runs.map(async stops => {
    const results = await Promise.allSettled([fetchTripMapDrivingLegs(stops), fetchTripMapWalkingLegs(stops)]);
    return { stops, drivingLegs: results[0].status === "fulfilled" ? results[0].value : [], walkingLegs: results[1].status === "fulfilled" ? results[1].value : [], results };
  })).then(runResults => {
    if (requestId !== tripMapRoadRouteRequest || key !== tripMapRoadRouteKey) return;
    tripMapRoadRoute = runResults.flatMap(({ stops, drivingLegs, walkingLegs, results }) => {
      if (results[1].status === "rejected") console.warn("Walking routes unavailable; using driving routes.", results[1].reason);
      if (results[0].status === "rejected") console.warn("Driving routes unavailable.", results[0].reason);
      return stops.slice(0, -1).map((item, index) => {
        const walking = walkingLegs[index];
        const driving = drivingLegs[index];
        const useWalking = walking && walking.seconds <= 3600;
        const useDriving = !useWalking && driving?.points?.length > 1;
        return {
          points: useDriving ? driving.points : [item.coordinates, stops[index + 1].coordinates],
          date: String(stops[index + 1].stop.datetime || "").slice(0, 10),
          mode: useWalking ? "walk" : useDriving ? "drive" : "direct"
        };
      });
    });
    renderTripMapRouteLine();
    updateTripMapRouteModeIndicators();
  });
}

function updateTripMapRouteModeIndicators() {
  document.querySelectorAll(".trip-map-day").forEach(day => {
    const indicator = day.querySelector(".trip-map-day-route-mode");
    if (!indicator) return;
    const modes = [...new Set((tripMapRoadRoute || []).filter(leg => leg.date === day.dataset.date).map(leg => leg.mode))];
    indicator.hidden = !modes.length;
    indicator.textContent = modes.map(mode => mode === "walk" ? "🚶" : mode === "drive" ? "🚗" : "📍").join("");
    indicator.title = modes.length ? `Route mode: ${modes.map(mode => mode === "walk" ? "walking" : mode === "drive" ? "driving" : "direct line (routing unavailable)").join(" and ")}` : "";
    indicator.setAttribute("aria-label", indicator.title);
  });
}

async function fetchTripMapDrivingLegs(stops) {
  const coordinates = stops.map(({ coordinates }) => `${coordinates.lng},${coordinates.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`OSRM returned HTTP ${response.status}`);
  const data = await response.json();
  const legs = data?.code === "Ok" ? data.routes?.[0]?.legs : null;
  if (!Array.isArray(legs) || legs.length !== stops.length - 1) throw new Error(data?.message || "No driving route found for every stop pair.");
  return legs.map(leg => ({
    seconds: Number(leg.duration),
    points: (leg.steps || []).flatMap(step => step.geometry?.coordinates || [])
      .map(([lng, lat]) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null)
      .filter(Boolean)
  }));
}

async function fetchTripMapWalkingLegs(stops) {
  const request = {
    locations: stops.map(({ coordinates }) => ({ lat: coordinates.lat, lon: coordinates.lng, type: "break" })),
    costing: "pedestrian",
    units: "kilometers"
  };
  const url = new URL("https://valhalla1.openstreetmap.de/route");
  url.searchParams.set("json", JSON.stringify(request));
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Client-Id": "all-in-one-tracker" } });
  if (!response.ok) throw new Error(`Valhalla returned HTTP ${response.status}`);
  const data = await response.json();
  const legs = data?.trip?.legs;
  if (!Array.isArray(legs) || legs.length !== stops.length - 1) throw new Error(data?.error || "No walking route found for every stop pair.");
  return legs.map(leg => ({ seconds: Number(leg.summary?.time), points: decodeTripMapPolyline(leg.shape) }));
}

function decodeTripMapPolyline(encoded) {
  if (typeof encoded !== "string" || !encoded) return [];
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: latitude / 1e6, lng: longitude / 1e6 });
  }
  return points;
}

function createTripMapRouteOverlay() {
  const mapElement = document.getElementById("tripMapCanvas");
  if (!mapElement) return;
  tripMapRouteSvg?.remove();
  tripMapRouteSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  tripMapRouteSvg.classList.add("trip-map-route-svg");
  tripMapRouteSvg.setAttribute("aria-hidden", "true");
  mapElement.appendChild(tripMapRouteSvg);
}

function renderTripMapRouteLine() {
  if (!tripMapRouteSvg || !tripMapInstance) return;
  tripMapRouteSvg.replaceChildren();
  const trip = tripMapTrips.find(item => String(item.id) === String(tripMapSelectedTripId));
  if (!trip) return;
  const runs = getTripMapCoordinateRuns(trip);
  if (!runs.length) return;
  const size = tripMapInstance.getSize();
  tripMapRouteSvg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
  tripMapRouteSvg.setAttribute("width", String(size.x));
  tripMapRouteSvg.setAttribute("height", String(size.y));
  const dots = document.createDocumentFragment();
  const routeLegs = tripMapRoadRoute || runs.flatMap(stops => stops.slice(0, -1).map((item, index) => ({
    points: [item.coordinates, stops[index + 1].coordinates],
    date: String(stops[index + 1].stop.datetime || "").slice(0, 10)
  })));
  routeLegs.forEach(leg => {
    const points = leg.points.map(point => tripMapInstance.latLngToContainerPoint([point.lat, point.lng]));
    const segments = [];
    let totalLength = 0;
    for (let index = 0; index < points.length - 1; index++) {
      const from = points[index];
      const to = points[index + 1];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length < 0.01) continue;
      segments.push({ from, to, length, start: totalLength });
      totalLength += length;
    }
    const spacing = Math.max(14, totalLength / 3000);
    let segmentIndex = 0;
    for (let distance = 0; distance <= totalLength; distance += spacing) {
      while (segmentIndex < segments.length - 1 && distance > segments[segmentIndex].start + segments[segmentIndex].length) segmentIndex++;
      const segment = segments[segmentIndex];
      if (!segment) continue;
      const progress = Math.max(0, Math.min(1, (distance - segment.start) / segment.length));
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(segment.from.x + (segment.to.x - segment.from.x) * progress));
      dot.setAttribute("cy", String(segment.from.y + (segment.to.y - segment.from.y) * progress));
      dot.setAttribute("r", "4.5");
      dot.setAttribute("fill", getTripMapRouteColor(leg.date, trip));
      dot.setAttribute("stroke", "#ffffff");
      dot.setAttribute("stroke-width", "2");
      dots.appendChild(dot);
    }
  });
  tripMapRouteSvg.appendChild(dots);
}

let tripMapShareObjectUrl = null;
let tripMapShareRequestId = 0;

function openTripMapShareDialog(trip) {
  tripMapShareRequestId++;
  document.getElementById("tripMapShareModal")?.remove();
  tripMapShareObjectUrl && URL.revokeObjectURL(tripMapShareObjectUrl);
  tripMapShareObjectUrl = null;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal trip-map-share-modal" id="tripMapShareModal" role="dialog" aria-modal="true" aria-label="Share trip map">
      <div class="modal-content">
        <h2>📤 Share trip map</h2>
        <p id="tripMapShareStatus">Preparing the trip image…</p>
        <fieldset class="trip-map-share-options" aria-label="Trip summary details">
          <legend>Include in trip summary</legend>
          <label><input type="checkbox" id="tripMapShareIncludeTime"> Time</label>
          <label><input type="checkbox" id="tripMapShareIncludeDetails"> Stop details</label>
          <label><input type="checkbox" id="tripMapShareIncludePeople"> People</label>
        </fieldset>
        <img id="tripMapSharePreview" alt="Trip map with stops summarized by date" hidden>
        <div class="trip-map-share-actions">
          <button type="button" onclick="closeTripMapShareDialog()">Close</button>
          <button type="button" class="primary-button" id="tripMapShareSaveButton" onclick="saveTripMapShareImage()" disabled>💾 Save image</button>
          <button type="button" id="tripMapShareNativeButton" onclick="shareTripMapImage()" hidden>📤 Share</button>
        </div>
      </div>
    </div>`);
  const modal = document.getElementById("tripMapShareModal");
  modal.style.display = "flex";
  const refreshPreview = () => {
    const currentRequestId = ++tripMapShareRequestId;
    if (tripMapShareObjectUrl) URL.revokeObjectURL(tripMapShareObjectUrl);
    tripMapShareObjectUrl = null;
    const preview = document.getElementById("tripMapSharePreview");
    preview.hidden = true;
    document.getElementById("tripMapShareSaveButton").disabled = true;
    document.getElementById("tripMapShareStatus").textContent = "Preparing the trip image…";
    createTripMapShareImage(trip).then(blob => {
      if (currentRequestId !== tripMapShareRequestId || !document.getElementById("tripMapShareModal")) return;
      tripMapShareObjectUrl = URL.createObjectURL(blob);
      preview.src = tripMapShareObjectUrl;
      preview.hidden = false;
      document.getElementById("tripMapShareStatus").textContent = "Your trip image is ready to save.";
      document.getElementById("tripMapShareSaveButton").disabled = false;
      const nativeButton = document.getElementById("tripMapShareNativeButton");
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], "trip-map.png", { type: "image/png" });
        nativeButton.hidden = !navigator.canShare({ files: [file] });
      }
    }).catch(error => {
      if (currentRequestId !== tripMapShareRequestId) return;
      console.error("Unable to create trip share image", error);
      const status = document.getElementById("tripMapShareStatus");
      if (status) status.textContent = "Could not prepare the map image. Please wait for the map tiles to load, then try again.";
    });
  };
  modal.querySelectorAll(".trip-map-share-options input").forEach(input => input.addEventListener("change", refreshPreview));
  refreshPreview();
}

function closeTripMapShareDialog() {
  tripMapShareRequestId++;
  document.getElementById("tripMapShareModal")?.remove();
  if (tripMapShareObjectUrl) URL.revokeObjectURL(tripMapShareObjectUrl);
  tripMapShareObjectUrl = null;
}

function createTripMapShareImage(trip) {
  const options = getTripMapShareOptions();
  const layout = getTripMapShareSummaryLayout(trip, options);
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = layout.height;
  drawTripMapShareCard(canvas, trip, true, options, layout);
  return canvasToPngBlob(canvas).catch(error => {
    console.warn("Map tiles could not be included in the share image; retrying with route and stops only.", error);
    const fallback = document.createElement("canvas");
    fallback.width = canvas.width;
    fallback.height = canvas.height;
    drawTripMapShareCard(fallback, trip, false, options, layout);
    return canvasToPngBlob(fallback);
  });
}

function getTripMapShareOptions() {
  return {
    includeTime: document.getElementById("tripMapShareIncludeTime")?.checked === true,
    includeDetails: document.getElementById("tripMapShareIncludeDetails")?.checked === true,
    includePeople: document.getElementById("tripMapShareIncludePeople")?.checked === true
  };
}

function getTripMapShareSummaryLayout(trip, options) {
  const dates = getTripMapDates(trip);
  const stops = getStopsForTrip(trip);
  const measureContext = document.createElement("canvas").getContext("2d");
  const countLines = (text, width, font) => {
    measureContext.font = font;
    let lines = 1;
    let line = "";
    String(text).split(/\s+/).forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (line && measureContext.measureText(next).width > width) {
        lines++;
        line = word;
      } else line = next;
    });
    return lines;
  };
  const peopleText = options.includePeople && trip.people ? `With: ${trip.people}` : "";
  const peopleLines = peopleText ? countLines(peopleText, 558, "17px system-ui, sans-serif") : 0;
  const dayHeight = (date, textWidth) => {
    const dayStops = stops.filter(stop => String(stop.datetime || "").slice(0, 10) === date);
    return 35 + (dayStops.length ? dayStops.reduce((total, stop) => {
      const time = options.includeTime ? `${stop.datetime?.slice(11, 16) || ""} · ` : "";
      const titleLines = countLines(`${getTripMapCategoryEmoji(stop.category)} ${time}${stop.location || "Visited spot"}`, textWidth - 18, "15px system-ui, sans-serif");
      const detailLines = options.includeDetails && stop.details ? countLines(stop.details, textWidth - 34, "13px system-ui, sans-serif") : 0;
      return total + titleLines * 20 + detailLines * 17 + 6;
    }, 0) : 23);
  };
  const singleColumnContent = dates.reduce((total, date) => total + dayHeight(date, 558), 0) + peopleLines * 22 + (peopleLines ? 8 : 0) + 80;
  const columns = singleColumnContent <= 950 ? 1 : 2;
  const splitIndex = columns === 1 ? dates.length : Math.ceil(dates.length / 2);
  const leftDates = dates.slice(0, splitIndex);
  const rightDates = columns === 1 ? [] : dates.slice(splitIndex);
  const leftContent = 80 + (peopleLines ? peopleLines * 22 + 8 : 0) + leftDates.reduce((total, date) => total + dayHeight(date, columns === 1 ? 558 : 263), 0);
  const rightContent = columns === 1 ? 0 : 80 + rightDates.reduce((total, date) => total + dayHeight(date, 263), 0);
  const contentHeight = Math.max(950, Math.ceil(Math.max(leftContent, rightContent) + 30));
  return { columns, height: contentHeight + 170, contentHeight, dates, stops };
}

function drawTripMapShareCard(canvas, trip, includeTiles, options, layout) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const contentHeight = layout.contentHeight;
  const mapBox = { x: 36, y: 132, width: 1084, height: contentHeight };
  const panelBox = { x: 1150, y: 132, width: 614, height: contentHeight };
  context.fillStyle = "#f4f7fb";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#14233b";
  context.font = "700 42px system-ui, sans-serif";
  context.fillText(trip.tripname || trip.country || "Trip", 42, 64, 1200);
  context.fillStyle = "#536174";
  context.font = "22px system-ui, sans-serif";
  context.fillText(`${trip.country || ""}  ·  ${formatTripMapDateRange(trip.startdate, trip.enddate)}`, 44, 101, 1200);

  context.save();
  roundTripMapCanvasRect(context, mapBox.x, mapBox.y, mapBox.width, mapBox.height, 24);
  context.clip();
  context.fillStyle = "#dcecf1";
  context.fillRect(mapBox.x, mapBox.y, mapBox.width, mapBox.height);
  const mapElement = document.getElementById("tripMapCanvas");
  const mapRect = mapElement?.getBoundingClientRect();
  if (includeTiles && mapElement && mapRect?.width && mapRect?.height) {
    const mapScale = Math.min(mapBox.width / mapRect.width, mapBox.height / mapRect.height);
    const offsetX = (mapBox.width - mapRect.width * mapScale) / 2;
    const offsetY = (mapBox.height - mapRect.height * mapScale) / 2;
    mapElement.querySelectorAll("img.leaflet-tile").forEach(tile => {
      if (!tile.complete || !tile.naturalWidth) return;
      const rect = tile.getBoundingClientRect();
      try {
        context.drawImage(tile, mapBox.x + offsetX + (rect.left - mapRect.left) * mapScale, mapBox.y + offsetY + (rect.top - mapRect.top) * mapScale, rect.width * mapScale, rect.height * mapScale);
      } catch (error) {
        console.warn("Could not draw one map tile", error);
      }
    });
  }
  drawTripMapShareRoute(context, mapBox, mapRect);
  drawTripMapShareMarkers(context, mapBox, mapRect, trip);
  context.restore();
  context.strokeStyle = "#d6dfeb";
  context.lineWidth = 2;
  roundTripMapCanvasRect(context, mapBox.x, mapBox.y, mapBox.width, mapBox.height, 24);
  context.stroke();
  context.fillStyle = "#64748b";
  context.font = "14px system-ui, sans-serif";
  context.fillText("© OpenStreetMap contributors", mapBox.x + 18, mapBox.y + mapBox.height - 14);

  context.save();
  roundTripMapCanvasRect(context, panelBox.x, panelBox.y, panelBox.width, panelBox.height, 20);
  context.fillStyle = "#ffffff";
  context.fill();
  context.clip();
  drawTripMapShareSummary(context, panelBox, trip, options, layout);
  context.restore();
  context.strokeStyle = "#e0e6ef";
  context.lineWidth = 2;
  roundTripMapCanvasRect(context, panelBox.x, panelBox.y, panelBox.width, panelBox.height, 20);
  context.stroke();
}

function drawTripMapShareRoute(context, mapBox, mapRect) {
  if (!mapRect?.width || !mapRect?.height || !tripMapInstance) return;
  const mapScale = Math.min(mapBox.width / mapRect.width, mapBox.height / mapRect.height);
  const offsetX = (mapBox.width - mapRect.width * mapScale) / 2;
  const offsetY = (mapBox.height - mapRect.height * mapScale) / 2;
  tripMapRouteSvg?.querySelectorAll("circle").forEach(dot => {
    const x = Number(dot.getAttribute("cx"));
    const y = Number(dot.getAttribute("cy"));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    drawTripMapShareDot(context, mapBox.x + offsetX + x * mapScale, mapBox.y + offsetY + y * mapScale,
      Number(dot.getAttribute("r") || 4) * mapScale, dot.getAttribute("fill") || "#e85d04");
  });
}

function drawTripMapShareMarkers(context, mapBox, mapRect, trip) {
  if (!mapRect?.width || !mapRect?.height || !tripMapInstance) return;
  const scale = Math.min(mapBox.width / mapRect.width, mapBox.height / mapRect.height);
  const offsetX = (mapBox.width - mapRect.width * scale) / 2;
  const offsetY = (mapBox.height - mapRect.height * scale) / 2;
  const plotPoint = point => {
    const projected = tripMapInstance.latLngToContainerPoint([point.lat, point.lng]);
    return { x: mapBox.x + offsetX + projected.x * scale, y: mapBox.y + offsetY + projected.y * scale };
  };
  const selectedTrip = tripMapTrips.find(item => String(item.id) === String(trip.id));
  const tripCoordinates = getTripMapCoordinates(selectedTrip);
  if (tripCoordinates) drawTripMapShareMarker(context, plotPoint(tripCoordinates), "✈️", 22 * scale);
  getStopsForTrip(selectedTrip || {}).forEach(stop => {
    const coordinates = getTripMapCoordinates(stop);
    if (coordinates) drawTripMapShareMarker(context, plotPoint(coordinates), getTripMapCategoryEmoji(stop.category), 17 * scale);
  });
}

function drawTripMapShareMarker(context, point, emoji, radius) {
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.stroke();
  context.font = `${Math.max(18, radius * 1.5)}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(emoji, point.x, point.y);
}

function drawTripMapShareDot(context, x, y, radius, color) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.stroke();
}

function drawTripMapShareSummary(context, box, trip, options, layout) {
  const padding = 28;
  const gap = 18;
  const columnWidth = layout.columns === 1 ? box.width - padding * 2 : (box.width - padding * 2 - gap) / 2;
  const columns = layout.columns === 1 ? [box.x + padding] : [box.x + padding, box.x + padding + columnWidth + gap];
  const splitIndex = layout.columns === 1 ? layout.dates.length : Math.ceil(layout.dates.length / 2);
  const dateColumns = layout.columns === 1 ? [layout.dates] : [layout.dates.slice(0, splitIndex), layout.dates.slice(splitIndex)];
  context.fillStyle = "#14233b";
  context.font = "700 25px system-ui, sans-serif";
  context.fillText("TRIP SUMMARY", columns[0], box.y + 42);
  dateColumns.forEach((dates, columnIndex) => {
    const left = columns[columnIndex];
    let y = box.y + 80;
    if (columnIndex === 0 && options.includePeople && trip.people) {
      context.font = "17px system-ui, sans-serif";
      context.fillStyle = "#536174";
      y = drawTripMapWrappedText(context, `With: ${trip.people}`, left, y, columnWidth, 22) + 8;
    }
    dates.forEach(date => {
      const color = getTripMapRouteColor(date, trip);
      context.beginPath();
      context.arc(left + 6, y - 6, 6, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.fillStyle = "#14233b";
      context.font = "700 18px system-ui, sans-serif";
      context.fillText(formatTripMapDateRange(date, date), left + 20, y);
      y += 28;
      const dayStops = layout.stops.filter(stop => String(stop.datetime || "").slice(0, 10) === date);
      context.font = "15px system-ui, sans-serif";
      context.fillStyle = "#344054";
      if (!dayStops.length) {
        context.fillText("No stops", left + 18, y);
        y += 23;
      } else dayStops.forEach(stop => {
        const time = options.includeTime ? stop.datetime?.slice(11, 16) : "";
        const summary = `${getTripMapCategoryEmoji(stop.category)} ${time ? `${time} · ` : ""}${stop.location || "Visited spot"}`;
        y = drawTripMapWrappedText(context, summary, left + 18, y, columnWidth - 18, 20);
        if (options.includeDetails && stop.details) {
          context.fillStyle = "#64748b";
          context.font = "13px system-ui, sans-serif";
          y = drawTripMapWrappedText(context, stop.details, left + 34, y, columnWidth - 34, 17);
          context.fillStyle = "#344054";
          context.font = "15px system-ui, sans-serif";
        }
        y += 6;
      });
      y += 7;
    });
  });
}

function drawTripMapWrappedText(context, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  let line = "";
  words.forEach(word => {
    const testLine = line ? `${line} ${word}` : word;
    if (line && context.measureText(testLine).width > maxWidth) {
      context.fillText(line, x, y, maxWidth);
      y += lineHeight;
      line = word;
    } else line = testLine;
  });
  if (line) {
    context.fillText(line, x, y, maxWidth);
    y += lineHeight;
  }
  return y;
}

function roundTripMapCanvasRect(context, x, y, width, height, radius) {
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

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The image could not be generated.")), "image/png");
    } catch (error) { reject(error); }
  });
}

function saveTripMapShareImage() {
  if (!tripMapShareObjectUrl) return;
  const trip = tripMapTrips.find(item => String(item.id) === String(tripMapSelectedTripId));
  const name = (trip?.tripname || "trip-map").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "trip-map";
  const link = document.createElement("a");
  link.href = tripMapShareObjectUrl;
  link.download = `${name}-map.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function shareTripMapImage() {
  if (!tripMapShareObjectUrl || !navigator.share) return;
  const blob = await fetch(tripMapShareObjectUrl).then(response => response.blob());
  const file = new File([blob], "trip-map.png", { type: "image/png" });
  if (!navigator.canShare || navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "Trip map" });
  }
}

function getTripMapRouteColor(date, trip) {
  const dayIndex = getTripMapDates(trip).indexOf(date);
  return TRIP_MAP_ROUTE_COLORS[(dayIndex < 0 ? 0 : dayIndex) % TRIP_MAP_ROUTE_COLORS.length];
}

function getTripMapCoordinates(record) {
  const rawLatitude = record?.latitude ?? record?.lat;
  const rawLongitude = record?.longitude ?? record?.lng ?? record?.lon;
  if (rawLatitude === null || rawLatitude === undefined || String(rawLatitude).trim() === "" ||
      rawLongitude === null || rawLongitude === undefined || String(rawLongitude).trim() === "") return null;
  const lat = Number(rawLatitude);
  const lng = Number(rawLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

function openTripMapStopModal(date = tripMapPendingStopDate, stop = null) {
  document.getElementById("tripMapStopModal")?.remove();
  const [, currentTime] = getLocalDateTimeString(new Date()).split("T");
  const time = stop?.datetime?.slice(11, 16) || currentTime;
  const categories = [["sightseeing", "🏞️ Sightseeing"], ["hotel", "🏨 Hotel"], ["restaurant", "🍽️ Restaurant"], ["transport", "🚗 Transport"], ["shopping", "🛍️ Shopping"], ["other", "📍 Other"]];
  const categoryOptions = categories.map(([value, label]) => `<option value="${value}"${stop?.category === value ? " selected" : ""}>${label}</option>`).join("");
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal trip-map-modal" id="tripMapStopModal">
      <div class="modal-content">
        <h2>${stop ? "✏️ Edit visited spot" : "📍 Add visited spot"}</h2>
        <label>Place<input id="tripMapStopName" maxlength="120" required placeholder="Blue Lagoon, Iceland…" value="${escapeTripMapHtml(stop?.location || "")}"></label>
        <button type="button" onclick="findTripMapStopLocation()">🔎 Find on map</button>
        <label id="tripMapStopResultsLabel" hidden>Choose a location<select id="tripMapStopResults"></select></label>
        <small id="tripMapStopSearchStatus">Search OpenStreetMap for a map pin, or save the stop without a pin if no match is found.</small>
        <p class="trip-map-prefilled-date">📅 Visit date: <strong>${formatTripMapDateRange(date, date)}</strong></p>
        <div class="trip-map-date-row"><label>Visit time<input id="tripMapStopTime" type="time" value="${time}" required></label><button type="button" onclick="setTripMapStopTimeToNow()">🕒 Now</button></div>
        <label>Category<select id="tripMapStopCategory">${categoryOptions}</select></label>
        <label>Details<textarea id="tripMapStopDetails" rows="3" placeholder="Optional notes">${escapeTripMapHtml(stop?.details || "")}</textarea></label>
        <div class="trip-map-modal-actions"><button type="button" onclick="cancelTripMapStop()">Cancel</button><button type="button" class="primary-button" id="tripMapSaveStopButton" onclick="saveTripMapStop()">${stop ? (tripMapPendingStopCoordinates ? "Save changes" : "Save changes without pin") : (tripMapPendingStopCoordinates ? "Save spot" : "Save spot without pin")}</button></div>
      </div>
    </div>`);
  document.getElementById("tripMapStopModal").style.display = "flex";
}

function getTripMapDates(trip) {
  const start = trip?.startdate ?? trip?.startDate ?? trip?.start_date;
  const end = trip?.enddate ?? trip?.endDate ?? trip?.end_date ?? start;
  if (!start) return [getLocalDateString(new Date())];
  const startDate = parseTripMapDate(start);
  const endDate = parseTripMapDate(end, startDate?.getFullYear());
  if (!startDate || !endDate || endDate < startDate) return [normalizeTripMapDate(start) || String(start)];
  const dates = [];
  for (const date = new Date(startDate); date <= endDate && dates.length < 366; date.setDate(date.getDate() + 1)) {
    dates.push(getLocalDateString(date));
  }
  return dates.length ? dates : [getLocalDateString(startDate)];
}

function parseTripMapDate(value, fallbackYear = new Date().getFullYear()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return buildTripMapDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s+.*)?$/);
  if (slash) {
    let year = slash[3] ? Number(slash[3]) : fallbackYear;
    if (year < 100) year += 2000;
    return buildTripMapDate(year, Number(slash[1]), Number(slash[2]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function buildTripMapDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function normalizeTripMapDate(value) {
  const date = parseTripMapDate(value);
  return date ? getLocalDateString(date) : "";
}

function setTripMapStopTimeToNow() {
  const currentTime = getLocalDateTimeString(new Date()).split("T")[1];
  const timeInput = document.getElementById("tripMapStopTime");
  if (timeInput) timeInput.value = currentTime;
}

function getTripMapCategoryEmoji(category) {
  return ({ hotel: "🏨", restaurant: "🍽️", sightseeing: "🏞️", transport: "🚗", shopping: "🛍️", other: "📍" })[category] || "📍";
}

async function findTripMapStopLocation() {
  const input = document.getElementById("tripMapStopName");
  const trip = tripMapPendingStop;
  const place = input?.value.trim();
  const status = document.getElementById("tripMapStopSearchStatus");
  const findButton = document.querySelector("#tripMapStopModal button[onclick=\"findTripMapStopLocation()\"]");
  const saveButton = document.getElementById("tripMapSaveStopButton");
  if (!trip || !place) return alert("Enter a place name to search for.");

  tripMapPendingStopCoordinates = null;
  if (saveButton) saveButton.disabled = true;
  if (findButton) findButton.disabled = true;
  if (status) status.textContent = `Searching for ${place} near ${trip.country}…`;
  try {
    let results = [];
    try { results = await searchTripMapPhoton(place, trip, true); }
    catch (error) { console.warn("Photon country-context search failed", error); }
    if (!results.length) {
      try { results = await searchTripMapPhoton(place, trip, false); }
      catch (error) { console.warn("Photon fallback search failed", error); }
    }
    if (!results.length) results = await searchTripMapNominatim(place, trip);
    const resultSelect = document.getElementById("tripMapStopResults");
    const resultLabel = document.getElementById("tripMapStopResultsLabel");
    resultSelect.replaceChildren();
    if (!results.length) {
      if (resultLabel) resultLabel.hidden = true;
      if (status) status.textContent = `No map match found for “${place}”. You can still save this stop without a pin.`;
      updateTripMapSaveStopButton();
      return;
    }
    results.forEach((result, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = result.display_name;
      option.dataset.latitude = result.lat;
      option.dataset.longitude = result.lon;
      option.dataset.placeName = result.name || result.display_name.split(",")[0];
      resultSelect.appendChild(option);
    });
    resultSelect.onchange = updateTripMapStopCoordinates;
    if (resultLabel) resultLabel.hidden = false;
    updateTripMapStopCoordinates();
    if (status) status.textContent = `Found ${results.length} location${results.length === 1 ? "" : "s"}. Choose the right one, then save to pin it.`;
  } catch (error) {
    console.error("Unable to search for visited spot", error);
    if (status) status.textContent = "Could not search for that place. You can still save it without a pin.";
  } finally {
    if (findButton) findButton.disabled = false;
    updateTripMapSaveStopButton();
  }
}

async function searchTripMapPhoton(place, trip, includeCountry) {
  const url = new URL("https://photon.komoot.io/api/");
  const query = includeCountry ? `${place}, ${trip.country}` : place;
  const params = { q: query, limit: "10", lang: "en" };
  const tripCoordinates = getTripMapCoordinates(trip);
  if (tripCoordinates) {
    params.lat = String(tripCoordinates.lat);
    params.lon = String(tripCoordinates.lng);
    params.zoom = "8";
    params.location_bias_scale = "0.2";
  }
  url.search = new URLSearchParams(params);
  const response = await fetch(url, { headers: { Accept: "application/geo+json, application/json" } });
  if (!response.ok) throw new Error(`Photon search returned ${response.status}`);
  const data = await response.json();
  return (data.features || []).map(feature => {
    const properties = feature.properties || {};
    const name = properties.name || properties.street || "Unnamed place";
    const context = [properties.street && properties.name ? properties.street : "", properties.city || properties.district || properties.county, properties.state, properties.country]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index && value !== name);
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    return {
      name,
      display_name: [name, ...context].join(", "),
      lat: latitude,
      lon: longitude
    };
  }).filter(result => Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon)));
}

async function searchTripMapNominatim(place, trip) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q: `${place}, ${trip.country}`, format: "jsonv2", limit: "10", addressdetails: "1" });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`OpenStreetMap search returned ${response.status}`);
  return response.json();
}

function updateTripMapStopCoordinates() {
  const option = document.getElementById("tripMapStopResults")?.selectedOptions[0];
  const latitude = Number(option?.dataset.latitude);
  const longitude = Number(option?.dataset.longitude);
  tripMapPendingStopCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { lat: latitude, lng: longitude }
    : null;
  const nameInput = document.getElementById("tripMapStopName");
  if (nameInput && option?.dataset.placeName) nameInput.value = option.dataset.placeName;
  const saveButton = document.getElementById("tripMapSaveStopButton");
  if (saveButton) saveButton.disabled = false;
  updateTripMapSaveStopButton();
}

function updateTripMapSaveStopButton() {
  const saveButton = document.getElementById("tripMapSaveStopButton");
  if (!saveButton) return;
  saveButton.disabled = false;
  const editing = Boolean(tripMapEditingStop);
  saveButton.textContent = editing
    ? (tripMapPendingStopCoordinates ? "Save changes" : "Save changes without pin")
    : (tripMapPendingStopCoordinates ? "Save spot" : "Save spot without pin");
}

function cancelTripMapStop() {
  tripMapPendingStop = null;
  tripMapEditingStop = null;
  tripMapPendingStopCoordinates = null;
  tripMapPendingStopDate = null;
  document.getElementById("tripMapStopModal")?.remove();
  document.getElementById("tripMapStatus").textContent = "Spot placement canceled.";
}

async function saveTripMapStop() {
  const trip = tripMapPendingStop;
  const location = document.getElementById("tripMapStopName")?.value.trim();
  const date = tripMapPendingStopDate;
  const time = document.getElementById("tripMapStopTime")?.value;
  const datetime = date && time ? `${date}T${time}` : "";
  const category = document.getElementById("tripMapStopCategory")?.value || "other";
  const coordinates = tripMapPendingStopCoordinates;
  if (!trip || !location || !datetime) return alert("Enter a place name and visit time first.");
  const orderedStops = getStopsForTrip(trip);
  const row = {
    ...(tripMapEditingStop || {}),
    id: tripMapEditingStop?.id ?? await nextTripMapId("TravelStopList"),
    tripid: tripMapEditingStop?.tripid ?? Number(trip.id),
    tripname: tripMapEditingStop?.tripname ?? trip.tripname,
    location,
    category,
    datetime,
    stoporder: tripMapEditingStop?.stoporder ?? orderedStops.length + 1,
    latitude: coordinates ? Number(coordinates.lat.toFixed(6)) : null,
    longitude: coordinates ? Number(coordinates.lng.toFixed(6)) : null,
    details: document.getElementById("tripMapStopDetails")?.value.trim() || ""
  };
  const editing = Boolean(tripMapEditingStop);
  if (editing) {
    updateRow("TravelStopList", row);
    tripMapStops = tripMapStops.map(stop => stop.id === row.id ? row : stop);
  } else {
    addToGoogleSheet("TravelStopList", row);
    tripMapStops.push(row);
  }
  tripMapPendingStop = null;
  tripMapEditingStop = null;
  tripMapPendingStopCoordinates = null;
  tripMapPendingStopDate = null;
  document.getElementById("tripMapStopModal")?.remove();
  renderTripMapPanel();
  renderTripMapLayers();
  const routeMessage = coordinates ? " Route is ordered by date and time." : " Saved without a map pin, so it is not connected by the route.";
  document.getElementById("tripMapStatus").textContent = editing
    ? `${location} updated.${coordinates ? " Route is ordered by date and time." : routeMessage}`
    : `${location} added to ${trip.tripname}.${routeMessage}`;
  showTripMapToast(`${location} ${editing ? "updated" : "saved"}${coordinates ? "" : " without a pin"}`);
}

async function nextTripMapId(sheetName) {
  const rows = sheetName === "TravelTripList" ? tripMapTrips : tripMapStops;
  const saved = await loadFromGoogleSheet(sheetName);
  const data = Array.isArray(saved) ? saved : rows;
  return data.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

async function openTripMapTable() {
  const returnPageKey = state.pageKey || "worldmap";
  const routeKey = `_tripList${Date.now()}`;
  startingDisplay.home.buttons[routeKey] = {
    hidden: true,
    sheetname: "TravelTripList",
    tableType: "filter",
    desc: { en: "Travel Map trips", ch: "旅行地图行程" }
  };
  try {
    await renderPage(routeKey);
    const backButton = document.querySelector(".topleftbutton");
    if (backButton) backButton.onclick = () => renderPage(returnPageKey);
  } finally {
    delete startingDisplay.home.buttons[routeKey];
  }
}

function formatTripMapCompactDate(value) {
  const date = value instanceof Date ? value : parseTripMapDate(value);
  if (!date) return String(value ?? "");
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function formatTripMapDateRange(start, end) {
  const format = value => {
    if (!value) return "";
    const parsed = parseTripMapDate(value);
    return !parsed ? value : formatTripMapCompactDate(parsed);
  };
  const formattedStart = format(start);
  const formattedEnd = format(end);
  if (formattedStart && formattedStart === formattedEnd) return formattedStart;
  return [formattedStart, formattedEnd].filter(Boolean).join(" – ");
}

function formatTripMapDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : `${formatTripMapCompactDate(parsed)} ${parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function formatTripMapStopDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).split("T")[0] : formatTripMapCompactDate(parsed);
}

function escapeTripMapHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function showTripMapToast(message) {
  let toast = document.getElementById("tripMapToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "tripMapToast";
    toast.className = "trip-map-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.textContent = `✓ ${message}`;
  toast.classList.add("trip-map-toast-visible");
  clearTimeout(toast.hideTimer);
  toast.hideTimer = window.setTimeout(() => toast.classList.remove("trip-map-toast-visible"), 2200);
}



