import { useState, useEffect, useRef, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Database,
  Download,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Table,
  AlertTriangle,
  X,
  Check,
  Edit2,
  Terminal,
  Plus,
  ChevronDown,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/i18n";

/* ── Types ───────────────────────────────────────────────────────────── */
interface TableInfo { name: string; count: number }
interface ColInfo { column_name: string; data_type: string; is_nullable: string; column_default: string | null }
interface TableData {
  columns: ColInfo[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  limit: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatCell(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function cellDisplayValue(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    const s = JSON.stringify(val);
    return s.length > 60 ? s.slice(0, 60) + "…" : s;
  }
  const s = String(val);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

const DATA_TYPE_BADGE: Record<string, string> = {
  integer: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  "character varying": "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  text: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  boolean: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  numeric: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  jsonb: "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
  json: "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
  timestamp: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  "timestamp without time zone": "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  ARRAY: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  bigint: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
};

/* ═══════════════════════════════════════════════════════════════════ */
export default function DatabaseAdmin() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<"browse" | "query">("browse");
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM users LIMIT 10;");
  const [queryResult, setQueryResult] = useState<{ rows: any[]; fields: string[] } | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [runningQuery, setRunningQuery] = useState(false);
  const [showInsertRow, setShowInsertRow] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});

  const editInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  /* ── Debounce search ─────────────────────────────────────────────── */
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(searchDebounceRef.current);
  }, [search]);

  /* ── Queries ─────────────────────────────────────────────────────── */
  const { data: tables = [], isLoading: tablesLoading } = useQuery<TableInfo[]>({
    queryKey: ["/api/admin/db/tables"],
  });

  const { data: tableData, isLoading: dataLoading, refetch: refetchData } = useQuery<TableData>({
    queryKey: ["/api/admin/db/table", selectedTable, page, debouncedSearch],
    queryFn: () => {
      if (!selectedTable) return Promise.reject("no table");
      const params = new URLSearchParams({ page: String(page) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      return fetch(`/api/admin/db/table/${selectedTable}?${params}`, {
        credentials: "include",
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.message || "Failed to load table");
        return json;
      });
    },
    enabled: !!selectedTable,
  });

  /* ── Auto-focus edit input ──────────────────────────────────────── */
  useEffect(() => {
    if (editingCell) editInputRef.current?.focus();
  }, [editingCell]);

  /* ── Mutations ──────────────────────────────────────────────────── */
  const updateMutation = useMutation({
    mutationFn: ({ col, val, rowId }: { col: string; val: string; rowId: any }) =>
      apiRequest("POST", `/api/admin/db/table/${selectedTable}/update`, {
        id: rowId,
        changes: { [col]: val },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/db/table", selectedTable] });
      qc.invalidateQueries({ queryKey: ["/api/admin/db/tables"] });
      toast({ title: ar ? "تم الحفظ" : "Saved" });
      setEditingCell(null);
    },
    onError: (e: any) => toast({ title: e.message || "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: any) =>
      apiRequest("DELETE", `/api/admin/db/table/${selectedTable}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/db/table", selectedTable] });
      qc.invalidateQueries({ queryKey: ["/api/admin/db/tables"] });
      toast({ title: ar ? "تم الحذف" : "Deleted" });
      setDeleteConfirmId(null);
    },
    onError: (e: any) => toast({ title: e.message || "Error", variant: "destructive" }),
  });

  const insertMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/db/table/${selectedTable}/insert`, { values: insertValues }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/db/table", selectedTable] });
      qc.invalidateQueries({ queryKey: ["/api/admin/db/tables"] });
      toast({ title: ar ? "تم الإضافة" : "Row added" });
      setShowInsertRow(false);
      setInsertValues({});
    },
    onError: (e: any) => toast({ title: e.message || "Error", variant: "destructive" }),
  });

  /* ── Handlers ──────────────────────────────────────────────────── */
  const startEdit = useCallback((rowIdx: number, col: string, currentVal: any) => {
    if (col === "id") return;
    setEditingCell({ rowIdx, col });
    setEditValue(formatCell(currentVal));
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell || !tableData) return;
    const row = tableData.rows[editingCell.rowIdx];
    if (row === undefined) return;
    const rowId = row.id;
    if (rowId === undefined) { setEditingCell(null); return; }
    updateMutation.mutate({ col: editingCell.col, val: editValue, rowId });
  }, [editingCell, editValue, tableData, updateMutation]);

  const cancelEdit = () => setEditingCell(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/db/backup", { credentials: "include" });
      if (!res.ok) throw new Error("Backup failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lucerne-backup-${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: ar ? "تم تنزيل النسخة الاحتياطية" : "Backup downloaded" });
    } catch {
      toast({ title: ar ? "فشل التنزيل" : "Backup failed", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const runSqlQuery = async () => {
    setRunningQuery(true);
    setQueryError(null);
    setQueryResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/db/query", { query: sqlQuery });
      const data = await res.json();
      setQueryResult(data);
    } catch (e: any) {
      setQueryError(e.message || "Query error");
    } finally {
      setRunningQuery(false);
    }
  };

  const selectTable = (name: string) => {
    setSelectedTable(name);
    setPage(1);
    setSearch("");
    setEditingCell(null);
    setDeleteConfirmId(null);
    setShowInsertRow(false);
    setInsertValues({});
  };

  /* ── Pagination ─────────────────────────────────────────────────── */
  const totalPages = tableData ? Math.ceil(tableData.total / tableData.limit) : 1;

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <AdminLayout>
      <AdminPageHeader
        title={ar ? "إدارة قاعدة البيانات" : "Database Manager"}
        description={ar ? "تصفح وتعديل بيانات التطبيق" : "Browse and edit application data"}
        icon={Database}
        iconGradient="from-slate-700 to-slate-900"
        actions={
          <button
            onClick={downloadBackup}
            disabled={downloading}
            data-testid="button-download-backup"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {downloading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {ar ? "تنزيل نسخة احتياطية SQL" : "Download SQL Backup"}
          </button>
        }
      />

      {/* Body */}
      <div className="flex gap-4 h-[calc(100vh-14rem)] min-h-[500px]">

        {/* ── Table list sidebar ───────────────────────────────────── */}
        <div className="w-52 shrink-0 flex flex-col bg-muted/20 border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Table className="w-3.5 h-3.5" />
              {ar ? "الجداول" : "Tables"}
              <span className="ml-auto bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                {tables.length}
              </span>
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {tablesLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              tables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => selectTable(t.name)}
                  data-testid={`button-table-${t.name}`}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors hover:bg-muted/60 ${
                    selectedTable === t.name
                      ? "bg-foreground text-background font-medium"
                      : "text-foreground"
                  }`}
                >
                  <span className="truncate font-mono text-xs">{t.name}</span>
                  <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full ${
                    selectedTable === t.name
                      ? "bg-background/20 text-background/80"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {t.count.toLocaleString()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Main panel ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 border border-border rounded-xl overflow-hidden bg-background">
          {!selectedTable ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Database className="w-12 h-12 opacity-20" />
              <p className="text-sm">{ar ? "اختر جدولاً من القائمة" : "Select a table to browse its data"}</p>
            </div>
          ) : (
            <>
              {/* Panel header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20 flex-wrap gap-y-2">
                <span className="font-mono font-bold text-sm">{selectedTable}</span>
                <span className="text-xs text-muted-foreground">
                  {tableData ? `${tableData.total.toLocaleString()} ${ar ? "صف" : "rows"}` : ""}
                </span>

                {/* Tabs */}
                <div className="flex items-center gap-1 ms-auto bg-muted/60 rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveTab("browse")}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${
                      activeTab === "browse" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-tab-browse"
                  >
                    <Table className="w-3.5 h-3.5" />
                    {ar ? "تصفح" : "Browse"}
                  </button>
                  <button
                    onClick={() => setActiveTab("query")}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${
                      activeTab === "query" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-tab-query"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    {ar ? "استعلام SQL" : "SQL Query"}
                  </button>
                </div>

                <button
                  onClick={() => refetchData()}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  data-testid="button-refresh-table"
                  title={ar ? "تحديث" : "Refresh"}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${dataLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              {activeTab === "browse" ? (
                <>
                  {/* Search + Add row bar */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                    <div className="flex items-center gap-2 flex-1 bg-muted/40 border border-border rounded-lg px-3 py-1.5">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={ar ? "بحث في النصوص..." : "Search text columns..."}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        data-testid="input-db-search"
                      />
                      {search && (
                        <button onClick={() => setSearch("")}>
                          <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowInsertRow(true); setInsertValues({}); }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity font-medium"
                      data-testid="button-insert-row"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {ar ? "إضافة صف" : "Add Row"}
                    </button>
                  </div>

                  {/* Table grid */}
                  <div className="flex-1 overflow-auto">
                    {dataLoading ? (
                      <div className="flex items-center justify-center h-32">
                        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !tableData || !tableData.rows || tableData.rows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                        <Table className="w-8 h-8 opacity-20" />
                        <p className="text-sm">{ar ? "لا توجد بيانات" : "No data found"}</p>
                      </div>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground border-b border-border w-10 shrink-0">#</th>
                            {(tableData.columns || []).map((col) => (
                              <th
                                key={col.column_name}
                                className="px-3 py-2 text-left font-semibold text-foreground border-b border-border whitespace-nowrap"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono">{col.column_name}</span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                    DATA_TYPE_BADGE[col.data_type] || "bg-muted text-muted-foreground"
                                  }`}>
                                    {col.data_type.replace("character varying", "varchar").replace("timestamp without time zone", "timestamp")}
                                  </span>
                                </div>
                              </th>
                            ))}
                            <th className="px-3 py-2 border-b border-border w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {/* Insert row form */}
                          {showInsertRow && (
                            <tr className="bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-800">
                              <td className="px-3 py-1.5 text-muted-foreground text-center">
                                <Plus className="w-3 h-3 mx-auto text-blue-500" />
                              </td>
                              {(tableData.columns || []).map((col) => (
                                <td key={col.column_name} className="px-1 py-1">
                                  {col.column_name === "id" ? (
                                    <span className="px-2 text-muted-foreground italic">auto</span>
                                  ) : (
                                    <input
                                      value={insertValues[col.column_name] || ""}
                                      onChange={(e) => setInsertValues(prev => ({ ...prev, [col.column_name]: e.target.value }))}
                                      placeholder={col.column_name}
                                      className="w-full px-2 py-1 text-xs border border-blue-300 dark:border-blue-700 rounded bg-background outline-none focus:border-blue-500"
                                      data-testid={`input-insert-${col.column_name}`}
                                    />
                                  )}
                                </td>
                              ))}
                              <td className="px-2 py-1">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => insertMutation.mutate()}
                                    disabled={insertMutation.isPending}
                                    className="p-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                    data-testid="button-confirm-insert"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setShowInsertRow(false)}
                                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                                    data-testid="button-cancel-insert"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}

                          {(tableData.rows || []).map((row, rowIdx) => (
                            <tr
                              key={row.id ?? rowIdx}
                              className={`border-b border-border/50 hover:bg-muted/30 transition-colors group ${
                                deleteConfirmId === row.id ? "bg-red-50 dark:bg-red-950/20" : ""
                              }`}
                            >
                              <td className="px-3 py-1.5 text-muted-foreground text-center font-mono">
                                {(page - 1) * (tableData?.limit || 50) + rowIdx + 1}
                              </td>
                              {(tableData.columns || []).map((col) => {
                                const isEditing =
                                  editingCell?.rowIdx === rowIdx &&
                                  editingCell.col === col.column_name;
                                const val = row[col.column_name];

                                return (
                                  <td
                                    key={col.column_name}
                                    className={`px-1 py-0.5 ${
                                      col.column_name === "id"
                                        ? "text-muted-foreground font-mono px-3"
                                        : ""
                                    }`}
                                  >
                                    {isEditing ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          ref={editInputRef}
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          onKeyDown={handleKeyDown}
                                          className="w-full px-2 py-1 text-xs border border-primary/50 rounded bg-background outline-none focus:border-primary ring-1 ring-primary/20"
                                          data-testid={`input-edit-cell-${col.column_name}`}
                                        />
                                        <button
                                          onClick={commitEdit}
                                          disabled={updateMutation.isPending}
                                          className="p-1.5 rounded bg-foreground text-background hover:opacity-80 transition-opacity shrink-0"
                                          data-testid="button-confirm-edit"
                                        >
                                          <Check className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={cancelEdit}
                                          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground shrink-0"
                                          data-testid="button-cancel-edit"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div
                                        onClick={() => col.column_name !== "id" && startEdit(rowIdx, col.column_name, val)}
                                        className={`px-2 py-1.5 rounded transition-colors max-w-xs ${
                                          col.column_name === "id"
                                            ? "cursor-default select-none"
                                            : "cursor-pointer hover:bg-muted/60 group-hover:border group-hover:border-border/60"
                                        }`}
                                        data-testid={`cell-${col.column_name}-${row.id}`}
                                        title={col.column_name !== "id" ? (typeof val === "object" ? JSON.stringify(val, null, 2) : String(val ?? "")) : undefined}
                                      >
                                        {val === null || val === undefined ? (
                                          <span className="text-muted-foreground/50 italic text-[10px]">NULL</span>
                                        ) : typeof val === "boolean" ? (
                                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${val ? "text-green-600" : "text-red-500"}`}>
                                            {val ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                            {String(val)}
                                          </span>
                                        ) : (
                                          <span className="font-mono">{cellDisplayValue(val)}</span>
                                        )}
                                        {col.column_name !== "id" && (
                                          <Edit2 className="w-2.5 h-2.5 text-muted-foreground/40 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}

                              {/* Actions column */}
                              <td className="px-2 py-1">
                                {deleteConfirmId === row.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => deleteMutation.mutate(row.id)}
                                      disabled={deleteMutation.isPending}
                                      className="p-1.5 rounded bg-destructive text-destructive-foreground hover:opacity-80 transition-opacity"
                                      data-testid={`button-confirm-delete-${row.id}`}
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                                      data-testid={`button-cancel-delete-${row.id}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirmId(row.id)}
                                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                    data-testid={`button-delete-row-${row.id}`}
                                    title={ar ? "حذف الصف" : "Delete row"}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Pagination */}
                  {tableData && tableData.total > tableData.limit && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20">
                      <span className="text-xs text-muted-foreground">
                        {ar
                          ? `الصفحة ${page} من ${totalPages} · إجمالي ${tableData.total.toLocaleString()} صف`
                          : `Page ${page} of ${totalPages} · ${tableData.total.toLocaleString()} total rows`}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40"
                          data-testid="button-prev-page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const p = Math.min(Math.max(page - 2 + i, 1), totalPages - 4 + i);
                          const clamp = Math.max(1, Math.min(p, totalPages));
                          return (
                            <button
                              key={clamp}
                              onClick={() => setPage(clamp)}
                              className={`w-7 h-7 text-xs rounded transition-colors ${
                                clamp === page
                                  ? "bg-foreground text-background font-bold"
                                  : "hover:bg-muted text-muted-foreground"
                              }`}
                              data-testid={`button-page-${clamp}`}
                            >
                              {clamp}
                            </button>
                          );
                        }).filter((el, i, arr) => arr.findIndex(e => e.key === el.key) === i)}
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40"
                          data-testid="button-next-page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ── SQL Query tab ─────────────────────────────────── */
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="p-4 border-b border-border bg-muted/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">{ar ? "استعلام SQL" : "SQL Query"}</span>
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {ar ? "SELECT فقط" : "SELECT only"}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <textarea
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        rows={4}
                        className="flex-1 font-mono text-sm bg-background text-foreground border border-border rounded-lg p-3 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
                        placeholder="SELECT * FROM users LIMIT 10;"
                        data-testid="input-sql-query"
                      />
                      <button
                        onClick={runSqlQuery}
                        disabled={runningQuery}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                        data-testid="button-run-query"
                      >
                        {runningQuery ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                        {ar ? "تشغيل" : "Run"}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    {queryError && (
                      <div className="m-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <code className="font-mono text-xs">{queryError}</code>
                      </div>
                    )}
                    {queryResult && (
                      <div>
                        <div className="px-4 py-2 border-b border-border bg-muted/20">
                          <span className="text-xs text-muted-foreground">
                            {ar ? `${queryResult.rows.length} نتيجة` : `${queryResult.rows.length} result(s)`}
                          </span>
                        </div>
                        <div className="overflow-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead className="sticky top-0 bg-muted/80">
                              <tr>
                                {queryResult.fields.map((f) => (
                                  <th key={f} className="px-3 py-2 text-left font-mono font-semibold border-b border-border whitespace-nowrap">{f}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {queryResult.rows.map((row, i) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                                  {queryResult.fields.map((f) => (
                                    <td key={f} className="px-3 py-1.5 font-mono max-w-xs truncate">
                                      {row[f] === null ? (
                                        <span className="text-muted-foreground/50 italic">NULL</span>
                                      ) : (
                                        cellDisplayValue(row[f])
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {!queryResult && !queryError && (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                        <Terminal className="w-8 h-8 opacity-20" />
                        <p className="text-sm">{ar ? "اكتب استعلام SELECT وانقر تشغيل" : "Write a SELECT query and click Run"}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
