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
 *   Date ASC -> App Name ASC (-> User ID)
 * so bulk approvals never interleave apps inside the same date block.
 */

var SHEET_NAME = 'Approved Reviews';
var HEADERS = ['Date', 'User ID', 'App Name', 'Reviewer Name', 'Gmail', 'Screenshot Link'];

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
    var lastRow = sheet.getLastRow();

    if (lastRow === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      lastRow = 1;
    }

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
  return json({ ok: true, service: 'skyzone-it-sheet-sync' });
}

function getSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function json(obj, status) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
