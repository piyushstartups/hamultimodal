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
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Package, Search, Plus, Edit, Trash2, ChevronDown, ChevronRight, ArrowRightLeft, AlertTriangle } from 'lucide-react';

const CATEGORIES = [
  { value: 'ssd', label: 'SSDs' },
  { value: 'camera', label: 'Cameras' },
  { value: 'gloves', label: 'Gloves' },
  { value: 'tools', label: 'Tools' },
  { value: 'general', label: 'General' },
];

const LOCATION_TYPES = [
  { prefix: 'kit', label: 'Kit' },
  { prefix: 'bnb', label: 'BnB' },
  { prefix: 'station', label: 'Station' },
];

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [items, setItems] = useState([]);
  const [kits, setKits] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState(''); // 'add', 'edit', 'transfer', 'damage'
  const [editingItem, setEditingItem] = useState(null);
  
  // Form data
  const [formData, setFormData] = useState({
    item_name: '',
    category: 'general',
    tracking_type: 'individual',
    status: 'active',
    location_type: 'station',
    location_value: 'Storage',
    quantity: 1,
    // Transfer fields
    from_type: 'kit',
    from_value: '',
    to_type: 'kit',
    to_value: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [itemsRes, kitsRes, bnbsRes] = await Promise.all([
        api.get('/items'),
        api.get('/kits'),
        api.get('/bnbs')
      ]);
      setItems(itemsRes.data);
      setKits(kitsRes.data);
      setBnbs(bnbsRes.data);
      
      // Auto-expand all categories
      const cats = {};
      CATEGORIES.forEach(c => { cats[c.value] = true; });
      setExpandedCategories(cats);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item =>
    item.item_name.toLowerCase().includes(search.toLowerCase())
  );

  const groupedItems = CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = filteredItems.filter(item => (item.category || 'general') === cat.value);
    return acc;
  }, {});

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'damaged': return 'bg-red-100 text-red-800';
      case 'lost': return 'bg-slate-100 text-slate-800';
      case 'repair': return 'bg-amber-100 text-amber-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const formatLocation = (location) => {
    if (!location) return 'Unknown';
    if (location.includes(':')) {
      const [type, value] = location.split(':');
      return `${type.toUpperCase()}: ${value}`;
    }
    return location;
  };

  const getLocationOptions = (type) => {
    switch (type) {
      case 'kit':
        return kits.map(k => ({ value: k.kit_id, label: k.kit_id }));
      case 'bnb':
        return bnbs.map(b => ({ value: b.name, label: b.name }));
      case 'station':
        return [
          { value: 'Main', label: 'Main Station' },
          { value: 'Storage', label: 'Storage' },
          { value: 'Office', label: 'Office' },
        ];
      default:
        return [];
    }
  };

  // Admin functions
  const openAddDialog = () => {
    setDialogType('add');
    setEditingItem(null);
    setFormData({
      item_name: '',
      category: 'general',
      tracking_type: 'individual',
      status: 'active',
      location_type: 'station',
      location_value: 'Storage',
      quantity: 1,
      from_type: 'kit',
      from_value: '',
      to_type: 'kit',
      to_value: '',
      notes: ''
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item) => {
    setDialogType('edit');
    setEditingItem(item);
    
    let locType = 'station';
    let locValue = 'Storage';
    if (item.current_location && item.current_location.includes(':')) {
      [locType, locValue] = item.current_location.split(':');
    }
    
    setFormData({
      item_name: item.item_name,
      category: item.category || 'general',
      tracking_type: item.tracking_type,
      status: item.status,
      location_type: locType,
      location_value: locValue,
      quantity: item.quantity || 1,
      from_type: 'kit',
      from_value: '',
      to_type: 'kit',
      to_value: '',
      notes: ''
    });
    setDialogOpen(true);
  };

  // Transfer / Damage (available to both admin and manager)
  const openTransferDialog = (item) => {
    setDialogType('transfer');
    setEditingItem(item);
    
    let fromType = 'station';
    let fromValue = 'Storage';
    if (item.current_location && item.current_location.includes(':')) {
      [fromType, fromValue] = item.current_location.split(':');
    }
    
    setFormData({
      ...formData,
      from_type: fromType,
      from_value: fromValue,
      to_type: 'kit',
      to_value: '',
      notes: ''
    });
    setDialogOpen(true);
  };

  const openDamageDialog = (item) => {
    setDialogType('damage');
    setEditingItem(item);
    setFormData({ ...formData, notes: '' });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (dialogType === 'add') {
        const location = `${formData.location_type}:${formData.location_value}`;
        await api.post('/items', {
          item_name: formData.item_name.trim(),
          category: formData.category,
          tracking_type: formData.tracking_type,
          status: formData.status,
          current_location: location,
          quantity: formData.tracking_type === 'quantity' ? formData.quantity : 1
        });
        toast.success('Item created');
      } else if (dialogType === 'edit') {
        const location = `${formData.location_type}:${formData.location_value}`;
        await api.put(`/items/${editingItem.item_name}`, {
          category: formData.category,
          tracking_type: formData.tracking_type,
          status: formData.status,
          current_location: location,
          quantity: formData.tracking_type === 'quantity' ? formData.quantity : null
        });
        toast.success('Item updated');
      } else if (dialogType === 'transfer') {
        const from_location = `${formData.from_type}:${formData.from_value}`;
        const to_location = `${formData.to_type}:${formData.to_value}`;
        
        await api.post('/events', {
          event_type: 'transfer',
          item: editingItem.item_name,
          from_location,
          to_location,
          quantity: 1,
          notes: formData.notes || null
        });
        toast.success('Transfer recorded');
      } else if (dialogType === 'damage') {
        await api.post('/events', {
          event_type: 'damage',
          item: editingItem.item_name,
          from_location: editingItem.current_location,
          quantity: 1,
          notes: formData.notes || null
        });
        toast.success('Damage reported');
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
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

  const getDialogTitle = () => {
    switch (dialogType) {
      case 'add': return 'Add Item';
      case 'edit': return 'Edit Item';
      case 'transfer': return `Transfer: ${editingItem?.item_name}`;
      case 'damage': return `Report Damage: ${editingItem?.item_name}`;
      default: return 'Item';
    }
  };

  const renderForm = () => {
    if (dialogType === 'add' || dialogType === 'edit') {
      return (
        <>
          <div>
            <Label>Item Name *</Label>
            <Input
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              placeholder="e.g., SSD-01, Camera-02"
              className="mt-1"
              disabled={dialogType === 'edit'}
              required
              data-testid="item-name-input"
            />
          </div>
          
          <div>
            <Label>Category</Label>
            <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Tracking Type</Label>
            <Select value={formData.tracking_type} onValueChange={(v) => setFormData({ ...formData, tracking_type: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual (unique items)</SelectItem>
                <SelectItem value="quantity">Quantity (bulk items)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {formData.tracking_type === 'quantity' && (
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                className="mt-1"
              />
            </div>
          )}
          
          <div>
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="damaged">Damaged</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="repair">In Repair</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Location Type</Label>
              <Select value={formData.location_type} onValueChange={(v) => setFormData({ ...formData, location_type: v, location_value: '' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={formData.location_value} onValueChange={(v) => setFormData({ ...formData, location_value: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {getLocationOptions(formData.location_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      );
    }
    
    if (dialogType === 'transfer') {
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From Type</Label>
              <Select value={formData.from_type} onValueChange={(v) => setFormData({ ...formData, from_type: v, from_value: '' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From</Label>
              <Select value={formData.from_value} onValueChange={(v) => setFormData({ ...formData, from_value: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {getLocationOptions(formData.from_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>To Type</Label>
              <Select value={formData.to_type} onValueChange={(v) => setFormData({ ...formData, to_type: v, to_value: '' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To</Label>
              <Select value={formData.to_value} onValueChange={(v) => setFormData({ ...formData, to_value: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {getLocationOptions(formData.to_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add transfer notes"
              className="mt-1"
            />
          </div>
        </>
      );
    }
    
    if (dialogType === 'damage') {
      return (
        <div>
          <Label>Damage Description *</Label>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Describe the damage"
            className="mt-1"
            required
          />
        </div>
      );
    }
    
    return null;
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

        {/* Items grouped by category */}
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : (
          <div className="space-y-3">
            {CATEGORIES.map(cat => {
              const categoryItems = groupedItems[cat.value] || [];
              if (categoryItems.length === 0) return null;
              
              return (
                <div key={cat.value} className="bg-white rounded-xl border overflow-hidden">
                  {/* Category Header - Collapsible */}
                  <button
                    onClick={() => toggleCategory(cat.value)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                    data-testid={`category-${cat.value}`}
                  >
                    <div className="flex items-center gap-2">
                      {expandedCategories[cat.value] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{categoryItems.length}</span>
                    </div>
                  </button>
                  
                  {/* Category Items */}
                  {expandedCategories[cat.value] && (
                    <div className="divide-y">
                      {categoryItems.map(item => (
                        <div key={item.item_name} className="px-4 py-3 flex items-center justify-between" data-testid={`item-${item.item_name}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900 truncate">{item.item_name}</p>
                              {item.tracking_type === 'quantity' && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">×{item.quantity || 1}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                              <span>{formatLocation(item.current_location)}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-1 rounded ${getStatusColor(item.status)}`}>
                              {item.status}
                            </span>
                            
                            {/* Transfer & Damage - available to all */}
                            <Button variant="ghost" size="icon" onClick={() => openTransferDialog(item)} title="Transfer" data-testid={`transfer-${item.item_name}`}>
                              <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openDamageDialog(item)} title="Report Damage" data-testid={`damage-${item.item_name}`}>
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            </Button>
                            
                            {/* Edit & Delete - Admin only */}
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
                </div>
              );
            })}
            
            {filteredItems.length === 0 && (
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
            )}
          </div>
        )}
      </main>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {renderForm()}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" data-testid="submit-btn">
                {dialogType === 'add' ? 'Create' : dialogType === 'edit' ? 'Update' : 'Submit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
