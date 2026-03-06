/**
 * Settings Page
 * Change password and account preferences.
 */

"use client";

import { useState, useEffect, FormEvent } from "react";
import { apiClient } from "@/lib/utils/apiClient";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Lock, User, Shield, QrCode, KeyRound } from "lucide-react";

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { addToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(!!user?.twoFactorEnabled);
  const [setupData, setSetupData] = useState<{
    qrCode: string;
    secret: string;
    backupCodes: string[];
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [is2faLoading, setIs2faLoading] = useState(false);

  useEffect(() => {
    setTwoFactorEnabled(!!user?.twoFactorEnabled);
  }, [user?.twoFactorEnabled]);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      addToast({ title: "Error", description: "New password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await apiClient("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      addToast({ title: "Success", description: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      addToast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to change password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStart2FA = async () => {
    setIs2faLoading(true);
    try {
      const response = await apiClient<{ success: boolean; data: { qrCode: string; secret: string; backupCodes: string[] } }>(
        "/api/auth/2fa/setup",
        { method: "GET" }
      );
      setSetupData(response.data);
      addToast({ title: "2FA Setup", description: "Scan the QR code and enter the verification code.", variant: "success" });
    } catch (error) {
      addToast({
        title: "2FA Setup Failed",
        description: error instanceof Error ? error.message : "Failed to start 2FA setup",
        variant: "destructive",
      });
    } finally {
      setIs2faLoading(false);
    }
  };

  const handleEnable2FA = async () => {
    if (!setupData?.secret || !verificationCode) {
      addToast({ title: "Missing Code", description: "Enter the 6-digit code from your authenticator app.", variant: "destructive" });
      return;
    }

    setIs2faLoading(true);
    try {
      await apiClient("/api/auth/2fa/setup", {
        method: "POST",
        body: JSON.stringify({
          secret: setupData.secret,
          token: verificationCode,
          backupCodes: setupData.backupCodes,
        }),
      });

      setTwoFactorEnabled(true);
      updateUser({ twoFactorEnabled: true });
      setSetupData(null);
      setVerificationCode("");

      addToast({ title: "2FA Enabled", description: "Two-factor authentication is now active.", variant: "success" });
    } catch (error) {
      addToast({
        title: "Enable 2FA Failed",
        description: error instanceof Error ? error.message : "Failed to enable 2FA",
        variant: "destructive",
      });
    } finally {
      setIs2faLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setIs2faLoading(true);
    try {
      await apiClient("/api/auth/2fa/disable", { method: "POST" });
      setTwoFactorEnabled(false);
      updateUser({ twoFactorEnabled: false });
      setSetupData(null);
      setVerificationCode("");

      addToast({ title: "2FA Disabled", description: "Two-factor authentication has been disabled.", variant: "success" });
    } catch (error) {
      addToast({
        title: "Disable 2FA Failed",
        description: error instanceof Error ? error.message : "Failed to disable 2FA",
        variant: "destructive",
      });
    } finally {
      setIs2faLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> Settings</h1>
        <p className="text-muted-foreground">Manage your account preferences</p>
      </div>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Account Information</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-muted-foreground">Name</Label>
            <p className="font-medium">{user?.name}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Email</Label>
            <p className="font-medium">{user?.email}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Role</Label>
            <p className="font-medium">{user?.role}</p>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Change Password</CardTitle>
          <CardDescription>Update your login password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <Label htmlFor="current">Current Password</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="Enter current password"
              />
            </div>
            <div>
              <Label htmlFor="new">New Password</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="At least 8 characters"
                minLength={8}
              />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm New Password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repeat new password"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Two-Factor Authentication</CardTitle>
          <CardDescription>Protect your account with an authenticator app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Status</p>
              <p className="text-sm text-muted-foreground">
                {twoFactorEnabled ? "Enabled" : "Disabled"}
              </p>
            </div>
            {twoFactorEnabled ? (
              <Button variant="outline" onClick={handleDisable2FA} disabled={is2faLoading}>
                Disable 2FA
              </Button>
            ) : (
              <Button onClick={handleStart2FA} disabled={is2faLoading}>
                Enable 2FA
              </Button>
            )}
          </div>

          {!twoFactorEnabled && setupData && (
            <div className="space-y-4 border rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="h-4 w-4" /> Scan QR Code
              </div>
              <div className="flex flex-col items-center gap-3">
                <img src={setupData.qrCode} alt="2FA QR Code" className="w-40 h-40" />
                <p className="text-xs text-muted-foreground">Secret: {setupData.secret}</p>
              </div>

              <div>
                <Label htmlFor="verification">Verification Code</Label>
                <Input
                  id="verification"
                  placeholder="6-digit code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  maxLength={6}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="h-4 w-4" /> Backup Codes
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {setupData.backupCodes.map((code) => (
                    <div key={code} className="bg-muted px-2 py-1 rounded text-center font-mono">
                      {code}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Store these codes securely. Each code can be used once.</p>
              </div>

              <Button onClick={handleEnable2FA} disabled={is2faLoading} className="w-full">
                Verify & Enable
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
