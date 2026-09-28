/**
 * Skyzone IT — Google Apps Script Web App
 *
 * 1. Open Google Sheets -> Extensions -> Apps Script
 * 2. Paste this file as Code.gs and save
 * 3. Deploy -> New deployment -> Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the /exec URL into SHEETS_WEBHOOK_URL in the Next.js .env
 *
 * The Next.js backend ALWAYS sends rows pre-sorted:
 *   Date ASC -> App Name ASC (-> User Name)
 * Rows whose Screenshot Link already exists in the sheet are skipped
 * (dedupe), so retries and re-approvals never create duplicates.
 */

var SHEET_NAME = 'Approved Reviews';
var HEADERS = ['Date', 'User Name', 'App Name', 'Reviewer Name', 'Gmail', 'Screenshot Link'];
var LINK_COLUMN = 6;

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var payload = JSON.parse(e.postData.contents);
    var rows = payload.rows || [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ ok: true, appended: 0 });
    }

    var sheet = getSheet();
    ensureHeader(sheet);

    var lastRow = sheet.getLastRow();
    var seen = {};
    if (lastRow >= 2) {
      var links = sheet.getRange(2, LINK_COLUMN, lastRow - 1, 1).getValues();
      for (var i = 0; i < links.length; i++) {
        if (links[i][0]) seen[String(links[i][0])] = true;
      }
      rows = rows.filter(function (row) {
        return row[LINK_COLUMN - 1] && !seen[String(row[LINK_COLUMN - 1])];
      });
    }

    if (rows.length === 0) {
      return json({ ok: true, appended: 0, deduped: true });
    }

    lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.getRange(lastRow + 1, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');

    return json({ ok: true, appended: rows.length });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json({ ok: true, service: 'skyzone-it-sheet-sync', version: 2 });
}

function getSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeader(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    return;
  }
  var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var mismatch = false;
  for (var i = 0; i < HEADERS.length; i++) {
    if (String(current[i]) !== HEADERS[i]) {
      mismatch = true;
      break;
    }
  }
  if (mismatch) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
}

function json(obj, status) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
