# All-in-One Tracker

A personal tracker for everyday things: meals, drinks, travel, hobbies, health, and pets. The interface is a set of emoji menus, with table views for records and summaries.

## Use the app

- On the home page, drag a section emoji to the small home emoji in the center to open that section. Menus work with mouse or touch.
- In Health, drag an action emoji to the heart in the center to record it. The current local date and time are added automatically. Use the table button at the top right for the Health summary, and the add button to manage the available actions.
- Open **🗺️ Travel Map** from Home to add a trip with its dates, country, and people. Tap the map to place its airplane stamp. Select the airplane to zoom in, then add visited spots by tapping their locations; the route connects them in date/time order. Trip records are available from the table button. The map uses OpenStreetMap tiles and needs an internet connection.
- Configure a reusable record circle in Settings → Buttons: choose **Record Values Circle**, select a sheet, choose a fixed field and value, then choose a select field. Each option in that field becomes a record action. For example, add a Bailey button fixed to `name = Bailey` and use `type` as the record field, then add an Isla button fixed to `name = Isla` with the same `type` field.
- Drag a record action to the center to save it with the configured fixed value and the current local date and time. The circle's **Add** button opens the regular add form with the fixed value filled in; **Table** opens that sheet's summary. Set **select emoji** on the record field to show its options as emoji; leave it off to show the English option text.
- Other sections have their own add, history, summary, and detail views. Their top-right controls and Settings vary by page.
- Open Settings (⚙️) to show or hide, add, edit, or delete available buttons, columns, and sheets. Some deletes require unlocking with the lock control.
- The cloud button (☁️) opens token and profile settings. Encrypt and decrypt controls let you share a token as encrypted text plus a separate four-digit code.

## Sections

- **🍽️ Restaurant** — visits, meals, filters, summaries, and the pizza countdown.
- **🧋 Drinks** — drinks and favorite flavors.
- **✈️ Travel** — flights, rental cars, hotels, activities, and reservations.
- **🎮 Hobbies** — media, projects, activities, ideas, songs, and happy moments.
- **❤️ Health** — quick action logging and a table summary.
- **🐾 Pets** — care schedules, memories, and health or behavior notes.

## Run locally

This is a static site. From the project folder, start a local server:

```powershell
py -m http.server 8080 --bind 0.0.0.0
```

On the same computer, open <http://localhost:8080/>. To test from a phone on the same Wi-Fi, open `http://<computer-LAN-IP>:8080/`. Allow Python through the private-network firewall if Windows asks. The phone and computer must be on the same local network; `localhost` on the phone points to the phone itself.

## Local and cloud data

Without a cloud token, records are stored in this browser's local storage and are not automatically shared with other devices. Configure a Google Apps Script token using the ☁️ button to use the cloud sync features; see [cloud instructions](cloud_instructions.md).

When the **default** profile token is saved, the app requests the button layout, translations, and sheet definitions in parallel and caches the returned configuration in this browser. Existing local configuration is kept in place, so saving a token does not overwrite a layout already stored on the device. Cloud-backed record data is fetched from Google Apps Script when needed; the current page session keeps an in-memory per-sheet cache for up to five minutes. This reduces repeat requests, but does not guarantee faster first loads or uploads, which still depend on the network and Apps Script response time.

## Configuration and help

The in-app Help button describes the current page. For cloud setup details, see [cloud instructions](cloud_instructions.md). Page layouts, translations, and sheet field definitions can also be adjusted in Settings; use the layout controls to export or import layouts when moving them between devices.
