import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/lib/theme";
import { Logo } from "@/components/Logo";
import {
  Moon,
  Sun,
  Download,
  Loader2,
  ArrowUp,
  FileSpreadsheet,
  FileText,
  Plus,
  X,
  Paperclip,
  Search,
} from "lucide-react";

type ExportResult = {
  fileBase64: string;
  fileName: string;
  mimeType: string;
  columns: string[];
  rows: Record<string, string | number>[];
  rowCount: number;
};

type TemplateRow = {
  id: string;
  values: Record<string, string>;
};

type SearchBlock = {
  id: string;
  search: string;
  templateRows: TemplateRow[];
};

type ParsedTable = {
  columns: string[];
  rows: Record<string, string | number>[];
};

// Hand-rolled CSV split instead of a library: quoted fields (which may contain
// commas or escaped double-quotes) are the only edge case that actually shows
// up in these exports, so a small parser covers it without adding a dependency.
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ParsedTable {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    const row: Record<string, string | number> = {};
    columns.forEach((col, i) => {
      const v = vals[i] ?? "";
      // Coerce numeric-looking cells (QTY, prices) to actual numbers so the
      // exported spreadsheet doesn't show them as text; anything else stays a string.
      const n = Number(v);
      row[col] = v !== "" && !isNaN(n) ? n : v;
    });
    return row;
  });
  return { columns, rows };
}

function uid() {
  return String(Date.now() + Math.random());
}

export default function Home() {
  const { theme, toggle } = useTheme();
  const { toast } = useToast();

  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [searchBlocks, setSearchBlocks] = useState<SearchBlock[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  const csvParsed = csvText.trim() ? parseCSV(csvText) : { columns: [], rows: [] };
  const csvColumns = csvParsed.columns;

  // A block's search term is matched against every column, not a specific one
  // (e.g. "SKU") — the term is usually a stock code, but it could just as
  // easily be a product name or customer reference, and this keeps the tool
  // working regardless of how a given customer's CSV happens to be laid out.
  function getMatches(search: string) {
    const s = search.toLowerCase().trim();
    if (!s) return [];
    return csvParsed.rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => Object.values(row).some((v) => String(v).toLowerCase().includes(s)));
  }

  function addBlock() {
    setSearchBlocks((b) => [...b, { id: uid(), search: "", templateRows: [] }]);
  }

  function removeBlock(id: string) {
    setSearchBlocks((b) => b.filter((x) => x.id !== id));
  }

  function setBlockSearch(id: string, search: string) {
    setSearchBlocks((b) => b.map((x) => (x.id === id ? { ...x, search, templateRows: [] } : x)));
  }

  function addTemplateRow(blockId: string) {
    // Pre-fill one empty value per CSV column (rather than an empty object) so
    // the template-row form always has an input for every column up front,
    // even ones the user never ends up typing into.
    const values = Object.fromEntries(csvColumns.map((col) => [col, ""]));
    setSearchBlocks((b) =>
      b.map((x) =>
        x.id === blockId
          ? { ...x, templateRows: [...x.templateRows, { id: uid(), values }] }
          : x,
      ),
    );
  }

  function removeTemplateRow(blockId: string, rowId: string) {
    setSearchBlocks((b) =>
      b.map((x) =>
        x.id === blockId
          ? { ...x, templateRows: x.templateRows.filter((r) => r.id !== rowId) }
          : x,
      ),
    );
  }

  function setTemplateRowValue(blockId: string, rowId: string, col: string, value: string) {
    setSearchBlocks((b) =>
      b.map((x) => {
        if (x.id !== blockId) return x;
        return {
          ...x,
          templateRows: x.templateRows.map((r) =>
            r.id === rowId ? { ...r, values: { ...r.values, [col]: value } } : r,
          ),
        };
      }),
    );
  }

  function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(String(ev.target?.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  }

  function clearCsv() {
    setCsvText("");
    setCsvFileName(null);
    setSearchBlocks([]);
  }

  // This is the core "linked item / delivery fee" logic: walk the pasted CSV
  // row by row, keep it, then check it against every search block. On a match,
  // insert that block's template row(s) directly after it — this is what
  // replaces the manual "add a row for the charger / delivery fee" step.
  function buildTable(): ParsedTable | null {
    if (csvColumns.length === 0) return null;

    const columns = [...csvColumns];
    const outputRows: Record<string, string | number>[] = [];

    for (let i = 0; i < csvParsed.rows.length; i++) {
      outputRows.push({ ...csvParsed.rows[i] });

      for (const block of searchBlocks) {
        if (!block.search.trim() || block.templateRows.length === 0) continue;
        const s = block.search.toLowerCase();
        const isMatch = Object.values(csvParsed.rows[i]).some((v) =>
          String(v).toLowerCase().includes(s),
        );
        if (isMatch) {
          for (const tpl of block.templateRows) {
            const row: Record<string, string | number> = {};
            for (const col of columns) {
              // A blank template field inherits the triggering row's value
              // (e.g. PO number, delivery address) instead of being left
              // empty, so only the fields that actually differ — like the
              // linked item's SKU — need to be typed in.
              const tplVal = tpl.values[col] ?? "";
              row[col] = tplVal !== "" ? tplVal : (csvParsed.rows[i][col] ?? "");
            }
            outputRows.push(row);
          }
        }
      }
    }

    return { columns, rows: outputRows };
  }

  const handleSubmit = async () => {
    const table = buildTable();
    if (!table || table.rows.length === 0) {
      toast({ title: "Nothing to export", description: "Paste a CSV first." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await apiRequest("POST", "/api/export", table);
      setResult(await res.json());
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message ?? "Something went wrong.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    // A data-URI anchor rather than an object URL / blob: no server-side file
    // to clean up afterward, and it works the same way in every environment
    // this gets embedded in, not just a plain browser tab.
    const a = document.createElement("a");
    a.href = `data:${result.mimeType};base64,${result.fileBase64}`;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 sm:px-6 h-16 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7 text-foreground" />
          <div className="leading-tight">
            <div className="font-semibold text-sm">Sales Order Importer</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
            {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 flex flex-col">

        <div className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">

          {/* CSV input */}
          {csvFileName ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 truncate">{csvFileName}</span>
              {csvParsed.rows.length > 0 && (
                <span className="text-xs text-muted-foreground shrink-0">{csvParsed.rows.length} rows</span>
              )}
              <button
                type="button"
                onClick={clearCsv}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Paste CSV here, or click the paperclip to attach a file…"
                className="min-h-[120px] resize-y border border-border rounded-lg bg-background text-sm leading-relaxed pr-10"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground transition-colors"
                title="Attach CSV file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileAttach} />

          {/* Search blocks */}
          {searchBlocks.map((block) => {
            const matchCount = getMatches(block.search).length;

            return (
              <div key={block.id} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">

                {/* Search field */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search CSV for a value…"
                      value={block.search}
                      onChange={(e) => setBlockSearch(block.id, e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                  {block.search.trim() && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {matchCount} {matchCount === 1 ? "row" : "rows"} match
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeBlock(block.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    aria-label="Remove block"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Template rows */}
                {block.templateRows.length > 0 && csvColumns.length > 0 && (
                  <div className="overflow-x-auto rounded border border-border">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/40">
                          {csvColumns.map((col) => (
                            <th key={col} className="text-left font-medium text-muted-foreground whitespace-nowrap px-2 py-1.5 border-b border-border">
                              {col}
                            </th>
                          ))}
                          <th className="w-7 border-b border-border" />
                        </tr>
                      </thead>
                      <tbody>
                        {block.templateRows.map((tpl) => (
                          <tr key={tpl.id} className="border-b border-border last:border-0">
                            {csvColumns.map((col) => (
                              <td key={col} className="px-1 py-1">
                                <Input
                                  value={tpl.values[col] ?? ""}
                                  onChange={(e) => setTemplateRowValue(block.id, tpl.id, col, e.target.value)}
                                  className="h-7 text-xs min-w-[90px]"
                                />
                              </td>
                            ))}
                            <td className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => removeTemplateRow(block.id, tpl.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add row button */}
                <button
                  type="button"
                  onClick={() => addTemplateRow(block.id)}
                  disabled={csvColumns.length === 0}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3 w-3" /> Add row
                </button>
              </div>
            );
          })}

          {/* Add search block */}
          <button
            type="button"
            onClick={addBlock}
            className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-dashed border-border py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add entry
          </button>

          {/* Action bar */}
          <div className="flex items-center justify-end pt-1">
            <Button
              onClick={handleSubmit}
              disabled={submitting || !csvText.trim()}
              size="sm"
              className="gap-1.5"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</>
                : <>Export <ArrowUp className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium text-sm">
                    {result.rowCount} {result.rowCount === 1 ? "row" : "rows"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Sheet "Purchase Order" · {result.columns.length} columns
                  </div>
                </div>
              </div>
              <Button onClick={handleDownload} className="gap-1.5">
                <Download className="h-4 w-4" /> Download .xlsm
              </Button>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/60">
                      {result.columns.map((col) => (
                        <th key={col} className="text-left font-medium text-muted-foreground whitespace-nowrap px-3 py-2 border-b border-border">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="hover-elevate">
                        {result.columns.map((col) => (
                          <td key={col} className="px-3 py-2 border-b border-border whitespace-nowrap max-w-[220px] truncate" title={String(row[col] ?? "")}>
                            {row[col] === "" || row[col] === undefined
                              ? <span className="text-muted-foreground/40">—</span>
                              : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { setResult(null); clearCsv(); }}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground hover-elevate rounded px-2 py-1"
            >
              ← Start a new import
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
