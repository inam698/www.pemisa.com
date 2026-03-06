/**
 * Batch Management Page
 * View and manage voucher batches — revoke entire batches.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { apiClient } from "@/lib/utils/apiClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Package, XCircle, ChevronLeft, ChevronRight } from "lucide-react";

interface BatchRow {
  batchId: string;
  totalVouchers: number;
  totalAmount: number;
  unused: number;
  used: number;
  expired: number;
  createdAt: string;
}

export default function BatchManagementPage() {
  const { addToast } = useToast();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showRevoke, setShowRevoke] = useState(false);
  const [selected, setSelected] = useState<BatchRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient(`/api/admin/batches?page=${page}`) as any;
      if (res.success) {
        setBatches(res.data);
        setTotalPages(res.totalPages);
      }
    } catch {
      addToast({ title: "Error", description: "Failed to load batches", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, addToast]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const handleRevoke = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await apiClient("/api/admin/batches", {
        method: "POST",
        body: JSON.stringify({ batchId: selected.batchId }),
      }) as any;
      if (res.success) {
        addToast({
          title: "Batch Revoked",
          description: `${res.data.revokedCount} vouchers expired in batch ${selected.batchId}`,
          variant: "success",
        });
        setShowRevoke(false);
        fetchBatches();
      } else {
        addToast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" /> Batch Management</h1>
        <p className="text-muted-foreground">View and manage voucher upload batches</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Unused</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Expired</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.batchId}>
                  <TableCell className="font-mono text-sm">{b.batchId}</TableCell>
                  <TableCell>{b.totalVouchers}</TableCell>
                  <TableCell className="font-medium">K{b.totalAmount.toLocaleString()}</TableCell>
                  <TableCell><Badge className="bg-blue-100 text-blue-800">{b.unused}</Badge></TableCell>
                  <TableCell><Badge className="bg-green-100 text-green-800">{b.used}</Badge></TableCell>
                  <TableCell><Badge className="bg-gray-100 text-gray-800">{b.expired}</Badge></TableCell>
                  <TableCell>{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    {b.unused > 0 && (
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setSelected(b); setShowRevoke(true); }}>
                        <XCircle className="h-3 w-3 mr-1" /> Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {batches.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No batches found. Upload a CSV to create your first batch.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
          <span className="flex items-center text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      {/* Revoke Confirmation */}
      <Dialog open={showRevoke} onClose={() => setShowRevoke(false)}>
        <DialogHeader>
          <DialogTitle>Revoke Batch</DialogTitle>
          <DialogDescription>
            This will expire all {selected?.unused} unused vouchers in batch <strong>{selected?.batchId}</strong>. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setShowRevoke(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={submitting}>{submitting ? "Revoking..." : `Revoke ${selected?.unused} Vouchers`}</Button>
        </div>
      </Dialog>
    </div>
  );
}
