# File opening and exports

Preview and Source are views inside the file viewer. They do not launch another program.

Desktop **Open in** lists the applications registered with the operating system for the original file type, with its default marked first. Windows uses Shell association handlers, macOS uses NSWorkspace, and Linux uses GIO desktop MIME associations. Discovery does not launch apps or change associations. A selected handler is checked again before launch; the UI cannot supply an arbitrary executable or command line.

For convertible documents, a separate **PDF** group lists the apps associated with PDF files and a Download PDF action. Selecting a PDF app first reuses or prepares an immutable PDF rendition, then opens that PDF. It does not switch the original document's preview. Conversion errors remain visible and never cause the original file to be sent to a PDF app.

Local writable document copies retain the existing save/checkpoint workflow. Images, uploaded files, other workspace files, and remote documents open as desktop copies. Changes to those copies remain local. The original artifact remains available through the shared download action.

The browser host cannot inspect desktop associations. It offers configured browser editors when available and exports through the normal download path. It does not invent desktop app choices or copy a server path as a substitute for opening a file.

The manual fixture under `web/tests/fixtures/file-associations/` uses a read-only inventory from the native implementation to review menu presentation. Its selections do not launch programs; native tests and the Windows/macOS/Linux desktop CI matrix cover the OS integration separately.
