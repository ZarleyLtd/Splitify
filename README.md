# Splitify

Splitify is a bill-splitting web app with a shareable bill link flow:

1. Upload a bill image on `index.html`
2. AI extracts line items
3. Confirm total paid (including tip)
4. Get a unique link like `bill.html?billId=...`
5. Friends claim items and view live summary

## Google Sheet Setup

Create a Google Sheet with these tabs and headers:

- `Config`
  - `Name`
- `Bills`
  - `BillId`, `BillDate`, `RowIndex`, `Category`, `Description`, `Quantity`, `UnitPrice`, `TotalPrice`
- `Claims`
  - `BillId`, `UserName`, `RowIndex`, `UnitIndex`
- `BillMeta`
  - `BillId`, `BillDate`, `BillImageId`, `Open`, `TotalPaid`, `CreatedAt`

## Apps Script Setup

1. Open the sheet: **Extensions -> Apps Script**
2. Replace code with `backend/code.gs`
3. In Script Properties add:
   - `GEMINI_API_KEY` = your Gemini API key
4. Deploy as **Web app**
   - Execute as: Me
   - Access: Anyone with the link
5. Copy deployment URL

## Frontend Setup

1. Open `assets/js/config/sheets-config.js`
2. Set `API_URL` to your Apps Script web app URL
3. Serve this folder from any static host

## Drive Image Storage

Uploaded bill images are saved to Google Drive in:

- Root folder: `Splitify`
- Subfolder: `images`

The backend stores the resulting Drive file ID in `BillMeta.BillImageId`.

## Manual Verification Checklist

- Upload a bill image from `index.html`
- Confirm detected total and finalize
- Confirm share link is shown and copied
- Open `bill.html?billId=...` in another browser/session
- Enter a name and submit claims
- Open Summary tab and confirm:
  - by-user totals
  - by-item claimed vs quantity
- Confirm image exists in `Splitify/images` in Drive
