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
you should be given a development id that you can copy, also a URL link(not needed) that ends with `exec` that you can find your id as well: 
```https://script.google.com/macros/s/YOUR_TOKEN/exec```

you can also find the token in Deploy -> Manage deployment -> Deployment ID (Copy)

### Step5: Save to Website
go to [website](https://ncatss.github.io/life-tracker/), hit ☁️, paste in the token (only need to do this once per device), save


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
    const sheetName = payload.sheetName || "RestaurantVisits";
    const action = payload.action;
    const rowData = payload.row;

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idIndex = headers.indexOf("id");



    if (idIndex === -1) {
      throw new Error("Header row must contain 'id'");
    }

    if (action === "append") {
      const newRow = headers.map(k => rowData[k] || "");
      sheet.appendRow(newRow);
    }
    else
    {
      const rowNumber = values.findIndex((row, index) => index > 0 && row[idIndex] == rowData.id);
      if (rowNumber === -1) {
        throw new Error("❌ Row not found");
      }

      if (action === "update") {
        const newRow = headers.map(k => rowData[k] || "");
        sheet.getRange(rowNumber + 1, 1, 1, newRow.length).setValues([newRow]);
      }
      else if (action === "delete") {
        sheet.deleteRow(rowNumber + 1);
      }
      else
      {
        throw new Error("❌ Unknown action: " + action);
      }
    }

    // Example: Successful response (modify the message as needed)
    var result = {
      status: 'success',
      message: 'Data successfully processed by Apps Script.'
    };
    
    // Create a text output service object
    response = ContentService.createTextOutput(JSON.stringify(result));
  } catch (error) {
    // Example: Error response if your script failed (still need to return something)
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
  
  // 4. Return the fully configured response
  return response;
}
```
