/**
 * Admin Vouchers List Page
 * Searchable, filterable, paginated voucher table.
 * Displays all vouchers with status, station, and redemption info.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/utils/apiClient";
import { VoucherTableRow, PaginatedResponse } from "@/types";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Ticket,
  Plus,
  Copy,
  CheckCircle,
  Share2,
  Gift,
} from "lucide-react";

type StatusFilter = "ALL" | "UNUSED" | "USED" | "EXPIRED";

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState<VoucherTableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const { addToast } = useToast();

  // Quick Generate state
  const [showGenerate, setShowGenerate] = useState(false);
  const [genName, setGenName] = useState("");
  const [genPhone, setGenPhone] = useState("");
  const [genAmount, setGenAmount] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const fetchVouchers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        status: statusFilter,
      });
      if (search) params.set("search", search);

      const response = await apiClient<{
        success: boolean;
        data: PaginatedResponse<VoucherTableRow>;
      }>(`/api/admin/vouchers?${params}`);

      setVouchers(response.data.data);
      setTotal(response.data.total);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to load vouchers",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, statusFilter, search, addToast]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  // ── Quick Generate Handler ──────────────────────────────────
  const handleQuickGenerate = async () => {
    if (!genName.trim() || !genPhone.trim() || !genAmount.trim()) {
      addToast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    const amount = parseFloat(genAmount);
    if (isNaN(amount) || amount <= 0) {
      addToast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }
    try {
      setGenerating(true);
      const res = await apiClient<{
        success: boolean;
        data: { voucherCode: string; id: string };
        error?: string;
      }>("/api/admin/vouchers/generate", {
        method: "POST",
        body: JSON.stringify({ name: genName.trim(), phone: genPhone.trim(), amount }),
      });
      setGeneratedCode(res.data.voucherCode);
      addToast({ title: "Voucher Generated", description: `Code: ${res.data.voucherCode}` });
      fetchVouchers();
    } catch (error) {
      addToast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate voucher",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const resetGenerateForm = () => {
    setGenName("");
    setGenPhone("");
    setGenAmount("");
    setGeneratedCode(null);
    setShowGenerate(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    addToast({ title: "Copied", description: "Voucher code copied to clipboard" });
  };

  const getShareMessage = () => {
    if (!generatedCode) return "";
    const amt = parseFloat(genAmount).toFixed(0);
    return `🎉 Congratulations ${genName}! 🎉\n\n` +
      `You have won a cooking oil voucher from PIMISA!\n\n` +
      `🛢️ Your Voucher Code: ${generatedCode}\n` +
      `💰 Value: K${amt}\n\n` +
      `Visit any Pimisa outlet, enter your phone number and this code on the dispenser machine to collect your cooking oil.\n\n` +
      `Valid for 7 days. Don't share your code with anyone!\n\n` +
      `🌻 PIMISA - Quality Cooking Oil For Every Home`;
  };

  const copyShareMessage = () => {
    navigator.clipboard.writeText(getShareMessage());
    addToast({ title: "Message Copied!", description: "Share this message with the beneficiary via WhatsApp or SMS" });
  };

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1); // Reset to first page on search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Status badge variant helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "USED":
        return <Badge variant="success">Used</Badge>;
      case "EXPIRED":
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="warning">Unused</Badge>;
    }
  };

  const filterButtons: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "ALL" },
    { label: "Unused", value: "UNUSED" },
    { label: "Used", value: "USED" },
    { label: "Expired", value: "EXPIRED" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vouchers</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track all distributed vouchers
          </p>
        </div>
        <Button onClick={() => setShowGenerate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Generate Voucher
        </Button>
      </div>

      {/* Quick Generate Dialog */}
      <Dialog open={showGenerate} onClose={resetGenerateForm} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Voucher</DialogTitle>
            <DialogDescription>
              Enter the beneficiary details to generate a voucher code
            </DialogDescription>
          </DialogHeader>
          {generatedCode ? (
            <div className="space-y-5 py-4">
              {/* Celebration Header */}
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                  <Gift className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-green-700 dark:text-green-400">
                  Voucher Generated!
                </h3>
                <p className="text-sm text-muted-foreground mt-1">for {genName}</p>
              </div>

              {/* Voucher Code Display */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-5 text-center">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">Voucher Code</p>
                <div className="flex items-center justify-center gap-3">
                  <code className="text-4xl font-extrabold tracking-[0.3em] text-amber-800 dark:text-amber-300">
                    {generatedCode}
                  </code>
                  <Button variant="ghost" size="sm" onClick={() => copyCode(generatedCode)} title="Copy code">
                    <Copy className="h-5 w-5 text-amber-600" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-center gap-4 text-sm">
                  <span className="font-semibold text-amber-700 dark:text-amber-300">K{parseFloat(genAmount).toFixed(0)}</span>
                  <span className="text-amber-500">&bull;</span>
                  <span className="text-amber-600 dark:text-amber-400">{genPhone}</span>
                </div>
              </div>

              {/* Shareable Message Preview */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Message to Share</span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {getShareMessage()}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={resetGenerateForm}>
                  Close
                </Button>
                <Button variant="outline" className="flex-1" onClick={copyShareMessage}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Copy Message
                </Button>
                <Button className="flex-1" onClick={() => { setGeneratedCode(null); setGenName(""); setGenPhone(""); setGenAmount(""); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Voucher
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="gen-name">Beneficiary Name</Label>
                <Input id="gen-name" placeholder="e.g. John Mwale" value={genName} onChange={(e) => setGenName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-phone">Phone Number</Label>
                <Input id="gen-phone" placeholder="e.g. 0971234567" value={genPhone} onChange={(e) => setGenPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-amount">Amount (ZMW)</Label>
                <Input id="gen-amount" type="number" min="1" placeholder="e.g. 50" value={genAmount} onChange={(e) => setGenAmount(e.target.value)} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={resetGenerateForm}>Cancel</Button>
                <Button className="flex-1" onClick={handleQuickGenerate} disabled={generating}>
                  {generating ? <><Spinner /> Generating...</> : "Generate Voucher"}
                </Button>
              </div>
            </div>
          )}
      </Dialog>

      {/* Filters & Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or voucher code..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter Buttons */}
            <div className="flex gap-2">
              <Filter className="h-4 w-4 mt-3 text-muted-foreground" />
              {filterButtons.map((btn) => (
                <Button
                  key={btn.value}
                  variant={statusFilter === btn.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setStatusFilter(btn.value);
                    setPage(1);
                  }}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Voucher Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Vouchers
            <Badge variant="outline" className="ml-2">
              {total.toLocaleString()} total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Spinner />
            </div>
          ) : vouchers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Ticket className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No vouchers found</p>
              <p className="text-sm">
                {search
                  ? "Try a different search term"
                  : "Upload a CSV to generate vouchers"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Voucher Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Station</TableHead>
                      <TableHead>Redeemed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.map((voucher) => (
                      <TableRow key={voucher.id}>
                        <TableCell className="font-medium">
                          {voucher.name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {voucher.phone}
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">
                            K{voucher.amount.toFixed(0)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-sm">
                            {voucher.voucherCode}
                          </code>
                        </TableCell>
                        <TableCell>{getStatusBadge(voucher.status)}</TableCell>
                        <TableCell>
                          {voucher.stationName || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {voucher.redeemedAt
                            ? new Date(voucher.redeemedAt).toLocaleString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1}–
                    {Math.min(page * pageSize, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
