/**
 * Audit Trail Page
 * Shows all system activity logs with filtering.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { apiClient } from "@/lib/utils/apiClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-native";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Shield, Download, ChevronLeft, ChevronRight } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  actorRole: string;
  target: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-blue-100 text-blue-800",
  LOGOUT: "bg-gray-100 text-gray-800",
  UPLOAD_CSV: "bg-purple-100 text-purple-800",
  GENERATE_VOUCHERS: "bg-green-100 text-green-800",
  REDEEM: "bg-emerald-100 text-emerald-800",
  VERIFY: "bg-cyan-100 text-cyan-800",
  CREATE_USER: "bg-indigo-100 text-indigo-800",
  UPDATE_USER: "bg-yellow-100 text-yellow-800",
  DELETE_USER: "bg-red-100 text-red-800",
  CREATE_STATION: "bg-indigo-100 text-indigo-800",
  UPDATE_STATION: "bg-yellow-100 text-yellow-800",
  DELETE_STATION: "bg-red-100 text-red-800",
  REVOKE_BATCH: "bg-orange-100 text-orange-800",
  RESEND_SMS: "bg-teal-100 text-teal-800",
  CHANGE_PASSWORD: "bg-pink-100 text-pink-800",
  RESET_PASSWORD: "bg-pink-100 text-pink-800",
  EXPORT_REPORT: "bg-violet-100 text-violet-800",
};

const ALL_ACTIONS = [
  "ALL", "LOGIN", "LOGOUT", "UPLOAD_CSV", "GENERATE_VOUCHERS", "REDEEM", "VERIFY",
  "CREATE_USER", "UPDATE_USER", "DELETE_USER", "CREATE_STATION", "UPDATE_STATION",
  "DELETE_STATION", "REVOKE_BATCH", "RESEND_SMS", "CHANGE_PASSWORD", "RESET_PASSWORD", "EXPORT_REPORT",
];

export default function AuditTrailPage() {
  const { addToast } = useToast();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [actorSearch, setActorSearch] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "30" });
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (actorSearch) params.set("actor", actorSearch);
      const res = await apiClient(`/api/admin/audit-logs?${params}`) as any;
      if (res.success) {
        setLogs(res.data);
        setTotalPages(res.totalPages);
      }
    } catch {
      addToast({ title: "Error", description: "Failed to load audit logs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, actorSearch, addToast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleExport = () => {
    const token = localStorage.getItem("pimisa_token");
    window.open(`/api/admin/export?type=audit&token=${token}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" /> Audit Trail</h1>
          <p className="text-muted-foreground">Track all system activity and user actions</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Input placeholder="Search by actor email..." className="flex-1" value={actorSearch} onChange={(e) => { setActorSearch(e.target.value); setPage(1); }} />
            <Select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="w-52">
              {ALL_ACTIONS.map((a) => <option key={a} value={a}>{a === "ALL" ? "All Actions" : a.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-12"><Spinner size="lg" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${ACTION_COLORS[l.action] || "bg-gray-100 text-gray-800"}`}>
                        {l.action.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{l.actor}</TableCell>
                    <TableCell><Badge variant="secondary">{l.actorRole}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{l.target || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {l.details ? JSON.stringify(l.details) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No audit logs found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
