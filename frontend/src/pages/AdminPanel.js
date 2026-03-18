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
import { ArrowLeft, Plus, Trash2, Users, MapPin, Box } from 'lucide-react';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('');
  
  // Data
  const [users, setUsers] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  
  // Form data
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [usersRes, bnbsRes, kitsRes] = await Promise.all([
        api.get('/users'),
        api.get('/bnbs'),
        api.get('/kits')
      ]);
      setUsers(usersRes.data);
      setBnbs(bnbsRes.data);
      setKits(kitsRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  const openDialog = (type) => {
    setDialogType(type);
    setFormData({
      status: 'active',
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

  // Admin Panel: Only Users, BnBs, Kits (no Items, no Deployments)
  const tabs = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'bnbs', label: 'BnBs', icon: MapPin },
    { id: 'kits', label: 'Kits', icon: Box },
  ];

  const renderForm = () => {
    switch (dialogType) {
      case 'user':
        return (
          <>
            <div>
              <Label>Name *</Label>
              <Input 
                value={formData.name || ''} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                className="mt-1" 
                placeholder="John Doe"
                required 
                data-testid="user-name-input"
              />
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger className="mt-1" data-testid="user-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="deployment_manager">Deployment Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Password *</Label>
              <Input 
                type="password" 
                value={formData.password || ''} 
                onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                className="mt-1" 
                required 
                data-testid="user-password-input"
              />
            </div>
          </>
        );
      case 'bnb':
        return (
          <>
            <div>
              <Label>Name *</Label>
              <Input 
                value={formData.name || ''} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                className="mt-1" 
                placeholder="BnB-01" 
                required 
                data-testid="bnb-name-input"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1" data-testid="bnb-status-select"><SelectValue /></SelectTrigger>
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
              <Input 
                value={formData.kit_id || ''} 
                onChange={(e) => setFormData({ ...formData, kit_id: e.target.value })} 
                className="mt-1" 
                placeholder="KIT-01" 
                required 
                data-testid="kit-id-input"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1" data-testid="kit-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <a href="/dashboard">
            <Button variant="ghost" size="icon" data-testid="back-btn">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </a>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Admin Panel</h1>
            <p className="text-sm text-slate-600">Users, BnBs & Kits</p>
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
              data-testid={`tab-${tab.id}`}
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
            <Button size="sm" onClick={() => openDialog(activeTab.slice(0, -1))} data-testid={`add-${activeTab.slice(0, -1)}-btn`}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {/* List */}
          <div className="divide-y max-h-[60vh] overflow-y-auto">
            {activeTab === 'users' && users.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center justify-between" data-testid={`user-${u.id}`}>
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.role}</p>
                </div>
                {u.role !== 'admin' && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete('users', u.id)} data-testid={`delete-user-${u.id}`}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}

            {activeTab === 'bnbs' && bnbs.map((b) => (
              <div key={b.name} className="px-4 py-3 flex items-center justify-between" data-testid={`bnb-${b.name}`}>
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-slate-500">{b.status}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete('bnbs', b.name)} data-testid={`delete-bnb-${b.name}`}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}

            {activeTab === 'kits' && kits.map((k) => (
              <div key={k.kit_id} className="px-4 py-3 flex items-center justify-between" data-testid={`kit-${k.kit_id}`}>
                <div>
                  <p className="font-medium">{k.kit_id}</p>
                  <p className="text-xs text-slate-500">{k.status}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete('kits', k.kit_id)} data-testid={`delete-kit-${k.kit_id}`}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}

            {activeTab === 'users' && users.length === 0 && <p className="p-4 text-center text-slate-500">No users</p>}
            {activeTab === 'bnbs' && bnbs.length === 0 && <p className="p-4 text-center text-slate-500">No BnBs</p>}
            {activeTab === 'kits' && kits.length === 0 && <p className="p-4 text-center text-slate-500">No kits</p>}
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
              <Button type="submit" className="flex-1" data-testid="submit-dialog-btn">
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
