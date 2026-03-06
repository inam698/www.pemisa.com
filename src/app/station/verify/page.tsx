/**
 * Station Verification Page
 * Simple interface for station attendants to verify and redeem vouchers.
 * Optimized for tablet/mobile with large input fields.
 *
 * Flow:
 * 1. Enter phone number and voucher code
 * 2. System verifies the voucher
 * 3. Show APPROVED with beneficiary details
 * 4. Attendant confirms redemption
 * 5. Voucher is marked as used
 */

"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/toast";
import { apiClient } from "@/lib/utils/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  Search,
  ShieldCheck,
  RotateCcw,
  User,
  Banknote,
  Hash,
  Calendar,
  Printer,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface VerifiedVoucher {
  id: string;
  name: string;
  amount: number;
  voucherCode: string;
  expiryDate: string;
}

type Step = "input" | "verifying" | "approved" | "denied" | "redeeming" | "redeemed";

export default function StationVerifyPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const receiptRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("input");
  const [phone, setPhone] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [verifiedVoucher, setVerifiedVoucher] =
    useState<VerifiedVoucher | null>(null);

  // ─── Verify Voucher ─────────────────────────────────────────

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim() || !voucherCode.trim()) {
      addToast({
        title: "Missing Fields",
        description: "Please enter both phone number and voucher code",
        variant: "destructive",
      });
      return;
    }

    // Basic client-side validation
    if (!/^\d{6}$/.test(voucherCode)) {
      addToast({
        title: "Invalid Code",
        description: "Voucher code must be exactly 6 digits",
        variant: "destructive",
      });
      return;
    }

    setStep("verifying");
    setErrorMessage("");

    try {
      const response = await apiClient<{
        success: boolean;
        data: {
          valid: boolean;
          message: string;
          voucher?: VerifiedVoucher;
        };
      }>("/api/voucher/verify", {
        method: "POST",
        body: JSON.stringify({ phone, voucherCode }),
      });

      if (response.data.valid && response.data.voucher) {
        setVerifiedVoucher(response.data.voucher);
        setStep("approved");
      } else {
        setErrorMessage(response.data.message);
        setStep("denied");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Verification failed"
      );
      setStep("denied");
    }
  };

  // ─── Redeem Voucher ─────────────────────────────────────────

  const handleRedeem = async () => {
    if (!verifiedVoucher || !user?.stationId) return;

    setStep("redeeming");

    try {
      await apiClient("/api/voucher/redeem", {
        method: "POST",
        body: JSON.stringify({
          voucherId: verifiedVoucher.id,
          stationId: user.stationId,
        }),
      });

      setStep("redeemed");
      addToast({
        title: "Voucher Redeemed!",
        description: `K${verifiedVoucher.amount} voucher for ${verifiedVoucher.name}`,
        variant: "success",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Redemption failed"
      );
      setStep("denied");
    }
  };

  // ─── Reset Form ─────────────────────────────────────────────

  const handleReset = () => {
    setStep("input");
    setPhone("");
    setVoucherCode("");
    setErrorMessage("");
    setVerifiedVoucher(null);
  };

  // ─── Print Receipt ──────────────────────────────────────────

  const handlePrintReceipt = () => {
    if (!receiptRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>Voucher Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: monospace; padding: 20px; line-height: 1.6; }
    .receipt { max-width: 300px; margin: 0 auto; border: 1px solid #000; padding: 15px; }
    .header { text-align: center; font-weight: bold; margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
    .title { font-size: 16px; margin-bottom: 5px; }
    .subtitle { font-size: 12px; color: #666; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .label { font-weight: bold; }
    .value { text-align: right; }
    .amount { font-size: 18px; font-weight: bold; margin: 10px 0; }
    .footer { text-align: center; font-size: 11px; margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px; color: #666; }
    @media print { body { padding: 0; } .receipt { border: none; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="title">PIMISA VOUCHER</div>
      <div class="subtitle">Receipt</div>
    </div>
    <div class="row">
      <span class="label">Name:</span>
      <span class="value">${verifiedVoucher?.name || "N/A"}</span>
    </div>
    <div class="row">
      <span class="label">Phone:</span>
      <span class="value">${phone}</span>
    </div>
    <div class="row">
      <span class="label">Station:</span>
      <span class="value">${user?.stationId ? "Verified" : "N/A"}</span>
    </div>
    <div class="row">
      <span class="label">Code:</span>
      <span class="value">${verifiedVoucher?.voucherCode || "N/A"}</span>
    </div>
    <div class="amount">
      K${verifiedVoucher?.amount.toFixed(0) || "0"}
    </div>
    <div class="row">
      <span class="label">Date:</span>
      <span class="value">${new Date().toLocaleDateString()}</span>
    </div>
    <div class="row">
      <span class="label">Time:</span>
      <span class="value">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="footer">
      ✓ SUCCESSFULLY REDEEMED<br/>
      Thank you for participating in<br/>
      the Pimisa Voucher Program
    </div>
  </div>
</body>
</html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Step: Input ────────────────────────────────────────── */}
      {step === "input" && (
        <Card className="shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-3">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Verify Voucher</CardTitle>
            <CardDescription className="text-base">
              Enter the beneficiary&apos;s phone number and voucher code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-5">
              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-base">
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0977123456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="h-14 text-lg"
                  autoComplete="off"
                />
              </div>

              {/* Voucher Code */}
              <div className="space-y-2">
                <Label htmlFor="voucherCode" className="text-base">
                  Voucher Code
                </Label>
                <Input
                  id="voucherCode"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  placeholder="123456"
                  maxLength={6}
                  value={voucherCode}
                  onChange={(e) =>
                    setVoucherCode(e.target.value.replace(/\D/g, ""))
                  }
                  required
                  className="h-14 text-2xl text-center tracking-[0.5em] font-mono"
                  autoComplete="off"
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                size="xl"
                className="w-full text-lg"
              >
                <Search className="h-5 w-5 mr-2" />
                Verify Voucher
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ─── Step: Verifying ────────────────────────────────────── */}
      {step === "verifying" && (
        <Card className="shadow-lg">
          <CardContent className="py-12 text-center">
            <Spinner size="lg" className="mx-auto mb-4" />
            <h3 className="text-xl font-bold">Verifying...</h3>
            <p className="text-muted-foreground mt-2">
              Checking voucher details
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── Step: Approved ─────────────────────────────────────── */}
      {step === "approved" && verifiedVoucher && (
        <Card className="shadow-lg border-green-300 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-3xl text-green-700 dark:text-green-400">
              APPROVED
            </CardTitle>
            <CardDescription className="text-base">
              Voucher is valid and ready to redeem
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white dark:bg-gray-900 rounded-xl p-5 space-y-4 shadow-inner">
              {/* Beneficiary Name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-lg font-bold">{verifiedVoucher.name}</p>
                </div>
              </div>

              {/* Amount */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                  <Banknote className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Voucher Amount
                  </p>
                  <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                    K{verifiedVoucher.amount.toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Voucher Code */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                  <Hash className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Voucher Code</p>
                  <p className="text-lg font-mono font-bold">
                    {verifiedVoucher.voucherCode}
                  </p>
                </div>
              </div>

              {/* Expiry */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="text-sm">
                    {new Date(verifiedVoucher.expiryDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 h-12" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-lg"
              onClick={handleRedeem}
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Redeem
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ─── Step: Denied ───────────────────────────────────────── */}
      {step === "denied" && (
        <Card className="shadow-lg border-red-300 bg-red-50/50 dark:bg-red-950/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mb-3">
              <XCircle className="h-10 w-10 text-red-600" />
            </div>
            <CardTitle className="text-3xl text-red-700 dark:text-red-400">
              DENIED
            </CardTitle>
            <CardDescription className="text-base text-red-600">
              {errorMessage}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" size="lg" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ─── Step: Redeeming ────────────────────────────────────── */}
      {step === "redeeming" && (
        <Card className="shadow-lg">
          <CardContent className="py-12 text-center">
            <Spinner size="lg" className="mx-auto mb-4" />
            <h3 className="text-xl font-bold">Processing Redemption...</h3>
          </CardContent>
        </Card>
      )}

      {/* ─── Step: Redeemed ─────────────────────────────────────── */}
      {step === "redeemed" && verifiedVoucher && (
        <Card className="shadow-lg border-green-300" ref={receiptRef}>
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-3 animate-bounce">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700 dark:text-green-400">
              REDEEMED SUCCESSFULLY
            </CardTitle>
            <CardDescription className="text-lg">
              <span className="font-bold">K{verifiedVoucher.amount}</span> voucher for{" "}
              <span className="font-bold">{verifiedVoucher.name}</span>
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex gap-3 flex-wrap justify-center">
            <Button variant="outline" size="lg" onClick={handlePrintReceipt}>
              <Printer className="h-4 w-4 mr-2" />
              Print Receipt
            </Button>
            <Button size="lg" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Next Voucher
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
