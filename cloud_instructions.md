### Step1: Create a sheet
Make a copy of [example sheet](https://docs.google.com/spreadsheets/d/1GPLSSSAMv-NBL6CYHbaZ0UiOm-tAkGlWanolhGnAqWc/edit?usp=sharing), save to your account

### Step2: Create the app token
MenuBar -> Extensions -> Apps Script

Note: example sheet comes with necessary Get/Post function called TrackerAPI (code is attached at the bottom as well)
   
### Step3: Deploy
MenuBar -> Deploy (top right corner)

-> New Development
  - add description
  - web app select Execute as "Me"
  - who has access select "Anyone"

-> hit Deploy
-> hit Authorize access
-> go through steps to log in, authorize, trust yourself as the developer etc

### Step4: Get Token to use
you should be given a development id that you can copy, also a URL link that ends with `exec` that you can find your id as well: 
```https://script.google.com/macros/s/YOUR_TOKEN/exec```

you can also find the token in Deploy -> Manage deployment -> Deployment ID (Copy)

### Step5: Save to Website
go to [website](https://ncatss.github.io/all-in-one-tracker/), hit ☁️, paste in the token (only need to do this once per device), save
it will take a little bit to load the token & populated your table with necessary tables & headers
then you will see a popup showing token valid - then you are good to go!


### Note
It might take a little bit time to load, but it should get there
now your data should be loaded from / saved to the sheets you created in step 1
and you can access it anywhere now!!

Apps Script Code - TrackerAPI:
```
function doGet(e) {
  const sheetName = e.parameter.sheetName || "RestaurantVisits";
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const json = data.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(json)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var response;
  try {
    const payload = JSON.parse(e.parameter.payload);
    if (!payload.sheetName) throw new Error("sheetName not defined");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = payload.action;
    let result;
    
    if (action == 'addsheet'){
      result = addSheet(ss, payload);
    } else {
      const sheet = ss.getSheetByName(payload.sheetName);
      if (!sheet) throw new Error("Sheet not found: " + payload.sheetName);

      switch (action) {
        case "addcolumn":
          result = addColumn(sheet, payload);
          break;
        case "append":
        case "update":
        case "delete":
          result = updateSheet(sheet, action, payload.row);
          break;
        default:
          throw new Error("❌ Unknown action: " + action);
      }
    }
    result.status = "success";
    response = ContentService.createTextOutput(JSON.stringify(result));

  } catch (error) {
    var errorResult = {
      status: 'error',
      message: 'Script execution failed: ' + error.message
    };
    response = ContentService.createTextOutput(JSON.stringify(errorResult));
  }
  // 2. Set the content type to JSON
  response.setMimeType(ContentService.MimeType.JSON);
  // 3. CRITICAL: Append the CORS header to allow all origins
  response.append
  return response;
}

function addSheet(ss, payload) {
  const newName = payload.sheetName;
  let existing = ss.getSheetByName(newName);
  if (existing) {
    return addColumn(existing, payload)
  }

  const headers = payload.headers || [];
  if (!headers.includes("id")) {
    headers.unshift("id");
  }

  const newSheet = ss.insertSheet(newName);
  if (headers.length > 0) {
    newSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return { message: `New sheet created ${newSheet.getName()}.`, headers };
}

function addColumn(sheet, payload) {
  const newCols = payload.headers || [];
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  let updates = 0;
  newCols.forEach(colName => {
    if (!currentHeaders.includes(colName)) {
      sheet.getRange(1, currentHeaders.length + 1 + updates, 1, 1).setValue(colName);
      updates++;
    }
  });

  return { message: `Checked ${newCols.length} columns, added ${updates} new ones.` };
}

function updateSheet(sheet, action, rowData) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf("id");
  if (idIndex === -1) throw new Error("Header row must contain 'id'");

  if (action === "append") {
    const newRow = headers.map(k => rowData[k] || "");
    sheet.appendRow(newRow);
    return { message: "Row appended", data: newRow };
  }

  const rowNumber = values.findIndex((row, index) => index > 0 && row[idIndex] == rowData.id);
  if (rowNumber === -1) throw new Error("❌ Row not found with id: " + rowData.id);

  if (action === "update") {
    const newRow = headers.map(k => rowData[k] || "");
    sheet.getRange(rowNumber + 1, 1, 1, newRow.length).setValues([newRow]);
    return { message: "Row updated", id: rowData.id };
  }

  if (action === "delete") {
    sheet.deleteRow(rowNumber + 1);
    return { message: "Row deleted", id: rowData.id };
  }
  throw new Error("❌ Unsupported updateSheet action: " + action);
}
```
