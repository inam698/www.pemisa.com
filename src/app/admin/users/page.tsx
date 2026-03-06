/**
 * User Management Page
 * Admin CRUD interface for managing system users.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/toast";
import { apiClient } from "@/lib/utils/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select-native";
import { Spinner } from "@/components/ui/spinner";
import { Plus, Pencil, Trash2, KeyRound, Users, Search } from "lucide-react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  stationId: string | null;
  stationName: string | null;
  createdAt: string;
}

interface StationOption {
  id: string;
  stationName: string;
}

export default function UserManagementPage() {
  const { token } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STATION", stationId: "" });
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      const res = await apiClient<{ success: boolean; data: typeof users }>(`/api/admin/users?${params}`);
      if (res.success) setUsers(res.data);
    } catch {
      addToast({ title: "Error", description: "Failed to load users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, addToast]);

  const fetchStations = useCallback(async () => {
    try {
      const res = await apiClient<{ success: boolean; data: typeof stations }>("/api/admin/stations?all=true");
      if (res.success) setStations(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchStations();
  }, [fetchUsers, fetchStations]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const res = await apiClient<{ success: boolean; data?: any; error?: string }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          stationId: form.stationId || null,
        }),
      });
      if ((res as any).success) {
        addToast({ title: "User Created", description: `${form.email} has been added.`, variant: "success" });
        setShowCreate(false);
        setForm({ name: "", email: "", password: "", role: "STATION", stationId: "" });
        fetchUsers();
      } else {
        addToast({ title: "Error", description: (res as any).error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const res = await apiClient<{ success: boolean; error?: string }>("/api/admin/users/" + selectedUser.id, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          role: form.role,
          stationId: form.stationId || null,
        }),
      }) as any;
      if ((res as any).success) {
        addToast({ title: "User Updated", variant: "success" });
        setShowEdit(false);
        fetchUsers();
      } else {
        addToast({ title: "Error", description: (res as any).error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const res = await apiClient(`/api/admin/users/${selectedUser.id}`, {
        method: "PUT",
        body: JSON.stringify({ newPassword }),
      }) as any;
      if (res.success) {
        addToast({ title: "Password Reset", description: `Password updated for ${selectedUser.email}`, variant: "success" });
        setShowResetPw(false);
        setNewPassword("");
      } else {
        addToast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const res = await apiClient(`/api/admin/users/${selectedUser.id}`, { method: "DELETE" }) as any;
      if (res.success) {
        addToast({ title: "User Deleted", variant: "success" });
        setShowDelete(false);
        fetchUsers();
      } else {
        addToast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (u: UserRow) => {
    setSelectedUser(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, stationId: u.stationId || "" });
    setShowEdit(true);
  };

  if (loading) return <div className="flex justify-center p-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> User Management</h1>
          <p className="text-muted-foreground">Manage admin and station user accounts</p>
        </div>
        <Button onClick={() => { setForm({ name: "", email: "", password: "", role: "STATION", stationId: "" }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add User
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-40">
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="STATION">Station</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Station</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role}</Badge>
                  </TableCell>
                  <TableCell>{u.stationName || "—"}</TableCell>
                  <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setSelectedUser(u); setNewPassword(""); setShowResetPw(true); }}>
                      <KeyRound className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setSelectedUser(u); setShowDelete(true); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader><DialogTitle>Create New User</DialogTitle><DialogDescription>Add a new admin or station user</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@pimisa.com" /></div>
          <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" /></div>
          <div><Label>Role</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="STATION">Station</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </div>
          {form.role === "STATION" && (
            <div><Label>Station</Label>
              <Select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })}>
                <option value="">-- Select Station --</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.stationName}</option>)}
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? "Creating..." : "Create User"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onClose={() => setShowEdit(false)}>
        <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Role</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="STATION">Station</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </div>
          {form.role === "STATION" && (
            <div><Label>Station</Label>
              <Select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })}>
                <option value="">-- Select Station --</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.stationName}</option>)}
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? "Saving..." : "Save Changes"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPw} onClose={() => setShowResetPw(false)}>
        <DialogHeader><DialogTitle>Reset Password</DialogTitle><DialogDescription>Set a new password for {selectedUser?.email}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label>New Password</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowResetPw(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={submitting}>{submitting ? "Resetting..." : "Reset Password"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDelete} onClose={() => setShowDelete(false)}>
        <DialogHeader><DialogTitle>Delete User</DialogTitle><DialogDescription>Are you sure you want to delete {selectedUser?.name} ({selectedUser?.email})? This cannot be undone.</DialogDescription></DialogHeader>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting ? "Deleting..." : "Delete User"}</Button>
        </div>
      </Dialog>
    </div>
  );
}
