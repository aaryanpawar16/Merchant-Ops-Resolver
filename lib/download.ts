// Builds a CSV in the browser and hands it to the user as a download. Cells with commas, quotes or line
// breaks are quoted the standard way, so the file opens cleanly in a spreadsheet.
export function toCsv(rows: (string | number | boolean | null)[][]): string {
  const cell = (value: string | number | boolean | null) => {
    let text = value === null ? "" : String(value);
    // A cell that starts with = + - or @ is run as a formula by Excel and Sheets. The text in these files comes
    // from the uploaded data, so a hostile row could run code on whoever opens the download. A leading quote
    // makes the spreadsheet show it as plain text. Numbers are left alone.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
