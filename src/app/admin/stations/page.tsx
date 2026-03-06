/**
 * Station Management Page
 * Admin CRUD interface for distribution stations.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { apiClient } from "@/lib/utils/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Plus, Pencil, Trash2, MapPin, Search, Building2 } from "lucide-react";

interface StationRow {
  id: string;
  stationName: string;
  location: string;
  userCount: number;
  voucherCount: number;
  createdAt: string;
}

export default function StationManagementPage() {
  const { addToast } = useToast();
  const [stations, setStations] = useState<StationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<StationRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ stationName: "", location: "" });

  const fetchStations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await apiClient(`/api/admin/stations?${params}`) as any;
      if (res.success) setStations(res.data);
    } catch {
      addToast({ title: "Error", description: "Failed to load stations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, addToast]);

  useEffect(() => { fetchStations(); }, [fetchStations]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const res = await apiClient("/api/admin/stations", { method: "POST", body: JSON.stringify(form) }) as any;
      if (res.success) {
        addToast({ title: "Station Created", description: form.stationName, variant: "success" });
        setShowCreate(false);
        setForm({ stationName: "", location: "" });
        fetchStations();
      } else {
        addToast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await apiClient(`/api/admin/stations/${selected.id}`, { method: "PUT", body: JSON.stringify(form) }) as any;
      if (res.success) {
        addToast({ title: "Station Updated", variant: "success" });
        setShowEdit(false);
        fetchStations();
      } else {
        addToast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await apiClient(`/api/admin/stations/${selected.id}`, { method: "DELETE" }) as any;
      if (res.success) {
        addToast({ title: "Station Deleted", variant: "success" });
        setShowDelete(false);
        fetchStations();
      } else {
        addToast({ title: "Error", description: res.error, variant: "destructive" });
      }
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center p-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> Station Management</h1>
          <p className="text-muted-foreground">Manage distribution stations and locations</p>
        </div>
        <Button onClick={() => { setForm({ stationName: "", location: "" }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Station
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search stations..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Station Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Vouchers</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stations.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.stationName}</TableCell>
                  <TableCell><span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{s.location}</span></TableCell>
                  <TableCell><Badge variant="secondary">{s.userCount}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{s.voucherCount}</Badge></TableCell>
                  <TableCell>{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => { setSelected(s); setForm({ stationName: s.stationName, location: s.location }); setShowEdit(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setSelected(s); setShowDelete(true); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {stations.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stations found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader><DialogTitle>Create Station</DialogTitle><DialogDescription>Add a new distribution station</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div><Label>Station Name</Label><Input value={form.stationName} onChange={(e) => setForm({ ...form, stationName: e.target.value })} placeholder="Pimisa Lusaka Main" /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Cairo Road, Lusaka" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? "Creating..." : "Create Station"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onClose={() => setShowEdit(false)}>
        <DialogHeader><DialogTitle>Edit Station</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Station Name</Label><Input value={form.stationName} onChange={(e) => setForm({ ...form, stationName: e.target.value })} /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? "Saving..." : "Save Changes"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDelete} onClose={() => setShowDelete(false)}>
        <DialogHeader><DialogTitle>Delete Station</DialogTitle><DialogDescription>Are you sure you want to delete &quot;{selected?.stationName}&quot;?</DialogDescription></DialogHeader>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting ? "Deleting..." : "Delete Station"}</Button>
        </div>
      </Dialog>
    </div>
  );
}
