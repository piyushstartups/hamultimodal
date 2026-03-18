import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
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
import { ArrowLeft, Package, Search, Plus, Edit, Trash2 } from 'lucide-react';

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [items, setItems] = useState([]);
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Form data
  const [formData, setFormData] = useState({
    item_name: '',
    tracking_type: 'individual',
    status: 'active',
    current_kit: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [itemsRes, kitsRes] = await Promise.all([
        api.get('/items'),
        api.get('/kits')
      ]);
      setItems(itemsRes.data);
      setKits(kitsRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item =>
    item.item_name.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'damaged': return 'bg-red-100 text-red-800';
      case 'lost': return 'bg-slate-100 text-slate-800';
      case 'repair': return 'bg-amber-100 text-amber-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const openAddDialog = () => {
    setEditingItem(null);
    setFormData({
      item_name: '',
      tracking_type: 'individual',
      status: 'active',
      current_kit: ''
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item) => {
    setEditingItem(item);
    setFormData({
      item_name: item.item_name,
      tracking_type: item.tracking_type,
      status: item.status,
      current_kit: item.current_kit || ''
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.item_name.trim()) {
      toast.error('Item name is required');
      return;
    }

    try {
      const payload = {
        item_name: formData.item_name.trim(),
        tracking_type: formData.tracking_type,
        status: formData.status,
        current_kit: formData.current_kit || null
      };

      if (editingItem) {
        await api.put(`/items/${editingItem.item_name}`, payload);
        toast.success('Item updated');
      } else {
        await api.post('/items', payload);
        toast.success('Item created');
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async (itemName) => {
    if (!confirm(`Delete item "${itemName}"?`)) return;
    try {
      await api.delete(`/items/${itemName}`);
      toast.success('Item deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Inventory</h1>
              <p className="text-sm text-slate-600">{items.length} items</p>
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openAddDialog} data-testid="add-item-btn">
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="search-input"
          />
        </div>

        {/* Items List */}
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">{search ? 'No items found' : 'No items yet'}</p>
            {isAdmin && !search && (
              <Button className="mt-4" onClick={openAddDialog}>
                <Plus className="w-4 h-4 mr-1" />
                Add First Item
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border divide-y">
            {filteredItems.map((item) => (
              <div key={item.item_name} className="px-4 py-3 flex items-center justify-between" data-testid={`item-${item.item_name}`}>
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{item.item_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500">{item.tracking_type}</span>
                    {item.current_kit && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        @ {item.current_kit}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(item.status)}`}>
                    {item.status}
                  </span>
                  {isAdmin && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)} data-testid={`edit-${item.item_name}`}>
                        <Edit className="w-4 h-4 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item.item_name)} data-testid={`delete-${item.item_name}`}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add/Edit Item Dialog (Admin Only) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <Label>Item Name *</Label>
              <Input
                value={formData.item_name}
                onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                placeholder="e.g., Camera-01, SSD-02"
                className="mt-1"
                disabled={!!editingItem}
                required
                data-testid="item-name-input"
              />
              {editingItem && <p className="text-xs text-slate-500 mt-1">Item name cannot be changed</p>}
            </div>
            
            <div>
              <Label>Tracking Type *</Label>
              <Select value={formData.tracking_type} onValueChange={(v) => setFormData({ ...formData, tracking_type: v })}>
                <SelectTrigger className="mt-1" data-testid="tracking-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual (unique items)</SelectItem>
                  <SelectItem value="quantity">Quantity (bulk items)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Status *</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1" data-testid="status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="repair">In Repair</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Current Kit (optional)</Label>
              <Select value={formData.current_kit || "none"} onValueChange={(v) => setFormData({ ...formData, current_kit: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1" data-testid="current-kit-select"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {kits.map(k => <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">Which kit is this item currently in?</p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" data-testid="submit-item-btn">
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
