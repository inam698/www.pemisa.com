/**
 * Beneficiary Lookup Page
 * Search beneficiary by phone number, view voucher history, and resend SMS.
 */

"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { apiClient } from "@/lib/utils/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { Search, Phone, Send, MessageCircle } from "lucide-react";

interface VoucherResult {
  id: string;
  name: string;
  phone: string;
  amount: number;
  voucherCode: string;
  status: string;
  batchId: string | null;
  stationName: string | null;
  redeemedAt: string | null;
  expiryDate: string;
  createdAt: string;
  smsLogs: { id: string; status: string; sentAt: string | null; createdAt: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  UNUSED: "bg-blue-100 text-blue-800",
  USED: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-800",
};

export default function BeneficiaryLookupPage() {
  const { addToast } = useToast();
  const [phone, setPhone] = useState("");
  const [vouchers, setVouchers] = useState<VoucherResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await apiClient(`/api/admin/beneficiaries?phone=${encodeURIComponent(phone.trim())}`) as any;
      if (res.success) {
        setVouchers(res.data);
      } else {
        addToast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch {
      addToast({ title: "Error", description: "Failed to search", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (voucherId: string) => {
    setResending(voucherId);
    try {
      const res = await apiClient("/api/admin/beneficiaries", {
        method: "POST",
        body: JSON.stringify({ voucherId }),
      }) as any;
      if (res.success) {
        addToast({ title: "SMS Resent", description: "Voucher SMS resent successfully", variant: "success" });
        handleSearch(); // Refresh to show new SMS log
      } else {
        addToast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResending(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Phone className="h-6 w-6" /> Beneficiary Lookup</h1>
        <p className="text-muted-foreground">Search by phone number to view voucher history and resend SMS</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter phone number (e.g., +260971234567)"
                className="pl-9"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner size="sm" /> : <><Search className="h-4 w-4 mr-2" /> Search</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      {searched && !loading && (
        <>
          {vouchers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No vouchers found for this phone number.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {vouchers[0].name} — {vouchers[0].phone}
                  <span className="text-sm font-normal text-muted-foreground ml-2">({vouchers.length} voucher{vouchers.length !== 1 ? "s" : ""})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Station</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>SMS</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.map((v) => {
                      const lastSms = v.smsLogs[v.smsLogs.length - 1];
                      return (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono font-bold">{v.voucherCode}</TableCell>
                          <TableCell className="font-medium">K{v.amount}</TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[v.status] || ""}`}>{v.status}</span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{v.batchId || "—"}</TableCell>
                          <TableCell>{v.stationName || "—"}</TableCell>
                          <TableCell className="text-sm">{new Date(v.expiryDate).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {lastSms ? (
                              <Badge variant={lastSms.status === "SENT" ? "default" : "secondary"} className="text-xs">
                                <MessageCircle className="h-3 w-3 mr-1" />
                                {lastSms.status}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">No SMS</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {v.status === "UNUSED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resending === v.id}
                                onClick={() => handleResend(v.id)}
                              >
                                <Send className="h-3 w-3 mr-1" />
                                {resending === v.id ? "Sending..." : "Resend SMS"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
