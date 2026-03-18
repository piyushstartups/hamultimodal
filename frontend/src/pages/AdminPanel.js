import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Users, MapPin, Package, Box, Calendar } from 'lucide-react';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('deployments');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('');
  
  // Data
  const [users, setUsers] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [items, setItems] = useState([]);
  const [deployments, setDeployments] = useState([]);
  
  // Form data
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [usersRes, bnbsRes, kitsRes, itemsRes, depsRes] = await Promise.all([
        api.get('/users'),
        api.get('/bnbs'),
        api.get('/kits'),
        api.get('/items'),
        api.get('/deployments')
      ]);
      setUsers(usersRes.data);
      setBnbs(bnbsRes.data);
      setKits(kitsRes.data);
      setItems(itemsRes.data);
      setDeployments(depsRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  const openDialog = (type) => {
    setDialogType(type);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      shift: 'morning',
      assigned_kits: [],
      assigned_users: [],
      status: 'active',
      tracking_type: 'individual',
      role: 'deployment_manager'
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      switch (dialogType) {
        case 'user':
          await api.post('/users', formData);
          break;
        case 'bnb':
          await api.post('/bnbs', formData);
          break;
        case 'kit':
          await api.post('/kits', formData);
          break;
        case 'item':
          await api.post('/items', formData);
          break;
        case 'deployment':
          await api.post('/deployments', formData);
          break;
      }
      toast.success('Created successfully');
      setDialogOpen(false);
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create');
    }
  };

  const handleDelete = async (type, id) => {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/${type}/${id}`);
      toast.success('Deleted');
      fetchAll();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const tabs = [
    { id: 'deployments', label: 'Deployments', icon: Calendar },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'bnbs', label: 'BnBs', icon: MapPin },
    { id: 'kits', label: 'Kits', icon: Box },
    { id: 'items', label: 'Items', icon: Package },
  ];

  const renderForm = () => {
    switch (dialogType) {
      case 'user':
        return (
          <>
            <div>
              <Label>Name *</Label>
              <Input value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="mt-1" required />
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="deployment_manager">Deployment Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Password *</Label>
              <Input type="password" value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="mt-1" required />
            </div>
          </>
        );
      case 'bnb':
        return (
          <>
            <div>
              <Label>Name *</Label>
              <Input value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="mt-1" placeholder="BnB-01" required />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );
      case 'kit':
        return (
          <>
            <div>
              <Label>Kit ID *</Label>
              <Input value={formData.kit_id || ''} onChange={(e) => setFormData({ ...formData, kit_id: e.target.value })} className="mt-1" placeholder="KIT-01" required />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );
      case 'item':
        return (
          <>
            <div>
              <Label>Item Name *</Label>
              <Input value={formData.item_name || ''} onChange={(e) => setFormData({ ...formData, item_name: e.target.value })} className="mt-1" placeholder="Camera-01" required />
            </div>
            <div>
              <Label>Tracking Type</Label>
              <Select value={formData.tracking_type} onValueChange={(v) => setFormData({ ...formData, tracking_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="quantity">Quantity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Current Kit (optional)</Label>
              <Select value={formData.current_kit || ''} onValueChange={(v) => setFormData({ ...formData, current_kit: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {kits.map(k => <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        );
      case 'deployment':
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="mt-1" required />
              </div>
              <div>
                <Label>Shift *</Label>
                <Select value={formData.shift} onValueChange={(v) => setFormData({ ...formData, shift: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>BnB *</Label>
              <Select value={formData.bnb || ''} onValueChange={(v) => setFormData({ ...formData, bnb: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select BnB" /></SelectTrigger>
                <SelectContent>
                  {bnbs.map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Deployment Manager *</Label>
              <Select value={formData.deployment_manager || ''} onValueChange={(v) => setFormData({ ...formData, deployment_manager: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.role === 'deployment_manager' || u.role === 'admin').map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kits</Label>
              <p className="text-xs text-slate-500 mb-2">Click to select</p>
              <div className="flex flex-wrap gap-2">
                {kits.map(k => (
                  <button
                    key={k.kit_id}
                    type="button"
                    onClick={() => {
                      const arr = formData.assigned_kits || [];
                      setFormData({
                        ...formData,
                        assigned_kits: arr.includes(k.kit_id) ? arr.filter(x => x !== k.kit_id) : [...arr, k.kit_id]
                      });
                    }}
                    className={`px-3 py-1 text-sm rounded border ${
                      (formData.assigned_kits || []).includes(k.kit_id)
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {k.kit_id}
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const getUserName = (id) => users.find(u => u.id === id)?.name || id;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <a href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </a>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Admin Panel</h1>
            <p className="text-sm text-slate-600">Manage system</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl border">
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold capitalize">{activeTab}</h2>
            <Button size="sm" onClick={() => openDialog(activeTab === 'deployments' ? 'deployment' : activeTab.slice(0, -1))}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {/* List */}
          <div className="divide-y max-h-[60vh] overflow-y-auto">
            {activeTab === 'users' && users.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.role}</p>
                </div>
                {u.role !== 'admin' && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete('users', u.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}

            {activeTab === 'bnbs' && bnbs.map((b) => (
              <div key={b.name} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-slate-500">{b.status}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete('bnbs', b.name)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}

            {activeTab === 'kits' && kits.map((k) => (
              <div key={k.kit_id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{k.kit_id}</p>
                  <p className="text-xs text-slate-500">{k.status}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete('kits', k.kit_id)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}

            {activeTab === 'items' && items.map((i) => (
              <div key={i.item_name} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{i.item_name}</p>
                  <p className="text-xs text-slate-500">{i.tracking_type} • {i.status} {i.current_kit && `• @ ${i.current_kit}`}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete('items', i.item_name)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}

            {activeTab === 'deployments' && deployments.map((d) => (
              <div key={d.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{d.bnb} • {d.shift}</p>
                  <p className="text-xs text-slate-500">{d.date} • {getUserName(d.deployment_manager)}</p>
                  <div className="flex gap-1 mt-1">
                    {d.assigned_kits?.map(k => (
                      <span key={k} className="text-xs bg-blue-100 text-blue-800 px-1 rounded">{k}</span>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete('deployments', d.id)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}

            {activeTab === 'users' && users.length === 0 && <p className="p-4 text-center text-slate-500">No users</p>}
            {activeTab === 'bnbs' && bnbs.length === 0 && <p className="p-4 text-center text-slate-500">No BnBs</p>}
            {activeTab === 'kits' && kits.length === 0 && <p className="p-4 text-center text-slate-500">No kits</p>}
            {activeTab === 'items' && items.length === 0 && <p className="p-4 text-center text-slate-500">No items</p>}
            {activeTab === 'deployments' && deployments.length === 0 && <p className="p-4 text-center text-slate-500">No deployments</p>}
          </div>
        </div>
      </main>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add {dialogType}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {renderForm()}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
