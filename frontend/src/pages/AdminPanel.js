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
import { ArrowLeft, Plus, Trash2, Users, MapPin, Box, Edit, Tag } from 'lucide-react';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  
  // Data
  const [users, setUsers] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [taskCategories, setTaskCategories] = useState([]);
  
  // Form data
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [usersRes, bnbsRes, kitsRes, taskCatsRes] = await Promise.all([
        api.get('/users'),
        api.get('/bnbs'),
        api.get('/kits'),
        api.get('/task-categories')
      ]);
      setUsers(usersRes.data);
      setBnbs(bnbsRes.data);
      setKits(kitsRes.data);
      setTaskCategories(taskCatsRes.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const openAddDialog = (type) => {
    setDialogType(type);
    setEditingItem(null);
    setFormData({
      status: 'active',
      role: 'deployment_manager'
    });
    setDialogOpen(true);
  };

  const openEditDialog = (type, item) => {
    setDialogType(type);
    setEditingItem(item);
    if (type === 'user') {
      setFormData({
        name: item.name,
        role: item.role,
        password: '' // Leave empty, only update if filled
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        // Update existing
        if (dialogType === 'user') {
          const updateData = {};
          if (formData.name && formData.name !== editingItem.name) {
            updateData.name = formData.name;
          }
          if (formData.password) {
            updateData.password = formData.password;
          }
          if (Object.keys(updateData).length > 0) {
            await api.put(`/users/${editingItem.id}`, updateData);
            toast.success('User updated');
          } else {
            toast.info('No changes made');
          }
        } else if (dialogType === 'task-category') {
          await api.put(`/task-categories/${editingItem.value}`, { label: formData.label });
          toast.success('Task category updated');
        }
      } else {
        // Create new
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
          case 'task-category':
            await api.post('/task-categories', {
              value: formData.value,
              label: formData.label
            });
            break;
          default:
            break;
        }
        toast.success('Created successfully');
      }
      setDialogOpen(false);
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
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
    { id: 'users', label: 'Users', icon: Users },
    { id: 'bnbs', label: 'BnBs', icon: MapPin },
    { id: 'kits', label: 'Kits', icon: Box },
    { id: 'task-categories', label: 'Task Categories', icon: Tag },
  ];

  const renderForm = () => {
    if (dialogType === 'user') {
      return (
        <>
          <div>
            <Label>Username *</Label>
            <Input 
              value={formData.name || ''} 
              onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
              className="mt-1" 
              placeholder="Enter username"
              required={!editingItem}
              data-testid="user-name-input"
            />
          </div>
          {!editingItem && (
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
          )}
          <div>
            <Label>{editingItem ? 'New Password (leave empty to keep current)' : 'Password *'}</Label>
            <Input 
              type="password" 
              value={formData.password || ''} 
              onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
              className="mt-1" 
              placeholder={editingItem ? 'Enter new password' : 'Enter password'}
              required={!editingItem}
              data-testid="user-password-input"
            />
          </div>
        </>
      );
    }
    
    if (dialogType === 'bnb') {
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
    }
    
    if (dialogType === 'kit') {
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
    }
    
    if (dialogType === 'task-category') {
      return (
        <>
          <div>
            <Label>Category ID *</Label>
            <Input 
              value={formData.value || ''} 
              onChange={(e) => setFormData({ ...formData, value: e.target.value.toLowerCase().replace(/\s+/g, '_') })} 
              className="mt-1" 
              placeholder="cooking" 
              required 
              disabled={!!editingItem}
              data-testid="task-cat-id-input"
            />
            <p className="text-xs text-slate-500 mt-1">Lowercase, no spaces (e.g., cooking, cleaning)</p>
          </div>
          <div>
            <Label>Display Name *</Label>
            <Input 
              value={formData.label || ''} 
              onChange={(e) => setFormData({ ...formData, label: e.target.value })} 
              className="mt-1" 
              placeholder="Cooking" 
              required 
              data-testid="task-cat-label-input"
            />
          </div>
        </>
      );
    }
    
    return null;
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
            <Button size="sm" onClick={() => openAddDialog(activeTab === 'task-categories' ? 'task-category' : activeTab.slice(0, -1))} data-testid={`add-${activeTab === 'task-categories' ? 'task-category' : activeTab.slice(0, -1)}-btn`}>
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
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog('user', u)} data-testid={`edit-user-${u.id}`}>
                    <Edit className="w-4 h-4 text-blue-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete('users', u.id)} data-testid={`delete-user-${u.id}`}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
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

            {activeTab === 'task-categories' && taskCategories.map((cat) => (
              <div key={cat.value} className="px-4 py-3 flex items-center justify-between" data-testid={`task-cat-${cat.value}`}>
                <div>
                  <p className="font-medium">{cat.label}</p>
                  <p className="text-xs text-slate-500">ID: {cat.value}</p>
                </div>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                      setDialogType('task-category');
                      setEditingItem(cat);
                      setFormData({ value: cat.value, label: cat.label });
                      setDialogOpen(true);
                    }}
                    data-testid={`edit-task-cat-${cat.value}`}
                  >
                    <Edit className="w-4 h-4 text-slate-500" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={async () => {
                      if (!confirm(`Delete task category "${cat.label}"?`)) return;
                      try {
                        await api.delete(`/task-categories/${cat.value}`);
                        toast.success('Task category deleted');
                        fetchAll();
                      } catch (error) {
                        toast.error(error.response?.data?.detail || 'Failed to delete');
                      }
                    }} 
                    data-testid={`delete-task-cat-${cat.value}`}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}

            {activeTab === 'users' && users.length === 0 && <p className="p-4 text-center text-slate-500">No users</p>}
            {activeTab === 'bnbs' && bnbs.length === 0 && <p className="p-4 text-center text-slate-500">No BnBs</p>}
            {activeTab === 'kits' && kits.length === 0 && <p className="p-4 text-center text-slate-500">No kits</p>}
            {activeTab === 'task-categories' && taskCategories.length === 0 && <p className="p-4 text-center text-slate-500">No task categories</p>}
          </div>
        </div>
      </main>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle>{editingItem ? 'Edit' : 'Add'} {dialogType}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {renderForm()}
            </div>
            <div className="flex gap-3 px-4 py-3 border-t bg-slate-50 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" data-testid="submit-dialog-btn">
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
