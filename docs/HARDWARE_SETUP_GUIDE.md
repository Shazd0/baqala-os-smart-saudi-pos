# Hardware Setup Guide

This guide covers a practical baqala POS hardware setup.

## Barcode Scanner

Recommended setup:

1. Use a USB barcode scanner that supports keyboard wedge mode.
2. Plug it into the POS computer.
3. Open Notepad/TextEdit and scan a product barcode.
4. Confirm the barcode appears as typed numbers followed by Enter.
5. In Baqala OS, go to Settings > Hardware & Payments.
6. Set Barcode Scanner Mode to USB keyboard wedge scanner.
7. Set Minimum Barcode Length, usually 4 or higher.
8. In POS, scan a barcode while the sale screen is open.

Most USB scanners need no SDK. They behave like a keyboard, which is the most reliable setup for small shops.

## Receipt Printer

Recommended setup:

1. Install the official Windows/macOS driver for the receipt printer.
2. Add it as a system printer.
3. Print a test page from the operating system.
4. In Baqala OS, go to Settings > Hardware & Payments.
5. Enter the exact printer name.
6. Select 58mm or 80mm receipt width.
7. Save hardware settings.
8. Make a test sale and print the receipt.

For best results, use a thermal ESC/POS compatible printer from Epson, Xprinter, Bixolon, Rongta, Sunmi, or Star.

## Cash Drawer

Common setup:

1. Connect the cash drawer cable to the receipt printer drawer port, not directly to the computer.
2. Enable cash drawer in Settings > Hardware & Payments.
3. Use the default pulse command `27,112,0,25,250` for many ESC/POS printers.
4. Click Test Cash Drawer.
5. If it does not open, check the printer driver cash drawer settings or use the printer vendor pulse command.

Cash drawer support depends on printer driver/model support. Some Windows drivers expose drawer kicking only through printer preferences.

## Card Terminal

Current safe setup:

1. Use an external mada/card terminal from the shop bank/payment provider.
2. Complete payment on the terminal.
3. Enter the approval code/RRN/reference number in Baqala OS.
4. The reference is stored on the invoice.

Direct integration requires the payment provider SDK/API and certification approval. Do not simulate card approvals in production.

## Recommended Baqala Hardware List

- Windows mini PC or Mac mini.
- 80mm thermal receipt printer.
- USB barcode scanner.
- Cash drawer connected through receipt printer.
- External mada/card terminal.
- UPS power backup.
- Optional label printer for shelf/product barcodes.
