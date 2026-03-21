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
import { Plus, Edit, Trash2, Package, Search, Upload, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import Layout from '../components/Layout';

// Standard item categories for dropdown (clean list, no vague categories)
const STANDARD_CATEGORIES = [
  { value: 'glove_left', label: 'Glove Left', unique: true },
  { value: 'glove_right', label: 'Glove Right', unique: true },
  { value: 'usb_hub', label: 'USB Hub', unique: false },
  { value: 'imu', label: 'IMUs', unique: false },
  { value: 'head_camera', label: 'Head Camera', unique: true },
  { value: 'l_shaped_wire', label: 'L-Shaped Wire', unique: false },
  { value: 'wrist_camera', label: 'Wrist Camera', unique: true },
  { value: 'laptop', label: 'Laptop', unique: true },
  { value: 'laptop_charger', label: 'Laptop Charger', unique: false },
  { value: 'power_bank', label: 'Power Bank', unique: true },
  { value: 'ssd', label: 'SSD', unique: true },
  { value: 'bluetooth_adapter', label: 'Bluetooth Adapter', unique: false },
  { value: 'hdd', label: 'HDD', unique: true },
];

// Categories that require unique item IDs (individual tracking)
const UNIQUE_CATEGORIES = ['glove_left', 'glove_right', 'head_camera', 'wrist_camera', 'laptop', 'power_bank', 'ssd', 'hdd'];

// Kit Standard Composition (reference for completeness check)
const KIT_STANDARD = {
  glove_left: { required: 1, label: 'Glove Left' },
  glove_right: { required: 1, label: 'Glove Right' },
  usb_hub: { required: 1, label: 'USB Hub' },
  imu: { required: 5, label: 'IMUs' },
  head_camera: { required: 1, label: 'Head Camera' },
  l_shaped_wire: { required: 1, label: 'L-Shaped Wire' },
  wrist_camera: { required: 2, label: 'Wrist Camera' },
  laptop: { required: 1, label: 'Laptop' },
  laptop_charger: { required: 1, label: 'Laptop Charger' },
  power_bank: { required: 1, label: 'Power Bank' },
  ssd: { required: 1, label: 'SSD' },
  bluetooth_adapter: { required: 1, label: 'Bluetooth Adapter' },
};

export default function InventoryManagement() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  
  const [formData, setFormData] = useState({
    item_id: '',
    item_name: '',
    tracking_type: 'individual',
    status: 'active',
    category: '',
    current_kit: '',
    total_capacity_gb: '',
    side: '',
    description: ''
  });

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'inventory_manager') {
      toast.error('Inventory Manager access required');
      window.location.href = '/dashboard';
      return;
    }
    fetchItems();
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, filterCategory, filterStatus, items]);

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data);
    } catch (error) {
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...items];
    
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterCategory !== 'all') {
      filtered = filtered.filter(item => item.category === filterCategory);
    }
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(item => item.status === filterStatus);
    }
    
    setFilteredItems(filtered);
  };

  const resetForm = () => {
    setFormData({
      item_id: '',
      item_name: '',
      tracking_type: 'individual',
      status: 'active',
      category: '',
      current_kit: '',
      total_capacity_gb: '',
      side: '',
      description: ''
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/items', {
        ...formData,
        total_capacity_gb: formData.total_capacity_gb ? parseInt(formData.total_capacity_gb) : null
      });
      toast.success('Item added successfully');
      setAddDialogOpen(false);
      resetForm();
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add item');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/items/${selectedItem.item_id}`, {
        ...formData,
        total_capacity_gb: formData.total_capacity_gb ? parseInt(formData.total_capacity_gb) : null
      });
      toast.success('Item updated successfully');
      setEditDialogOpen(false);
      setSelectedItem(null);
      resetForm();
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update item');
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    
    try {
      await api.delete(`/items/${itemId}`);
      toast.success('Item deleted successfully');
      fetchItems();
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  const openEditDialog = (item) => {
    setSelectedItem(item);
    setFormData({
      item_id: item.item_id,
      item_name: item.item_name,
      tracking_type: item.tracking_type,
      status: item.status,
      category: item.category || '',
      current_kit: item.current_kit || '',
      total_capacity_gb: item.total_capacity_gb || '',
      side: item.side || '',
      description: item.description || ''
    });
    setEditDialogOpen(true);
  };

  const categories = [...new Set(items.map(item => item.category).filter(Boolean))];
  const statuses = ['active', 'damaged', 'repair', 'lost', 'wear_flag'];

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-tactical text-slate-900">Inventory Management</h1>
            <p className="text-sm text-slate-600 mt-1">Master inventory control - Add, edit, and manage all items</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => setAddDialogOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
            <Button
              onClick={() => setBulkAddOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Upload className="w-4 h-4 mr-2" />
              Bulk Add
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm text-slate-600">Total Items</p>
          <p className="text-2xl font-bold text-slate-900">{items.length}</p>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-4">
          <p className="text-sm text-green-700">Active</p>
          <p className="text-2xl font-bold text-green-600">{items.filter(i => i.status === 'active').length}</p>
        </div>
        <div className="bg-white border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">Damaged/Lost</p>
          <p className="text-2xl font-bold text-red-600">{items.filter(i => ['damaged', 'lost'].includes(i.status)).length}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-700">Needs Attention</p>
          <p className="text-2xl font-bold text-amber-600">{items.filter(i => ['repair', 'wear_flag'].includes(i.status)).length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-sm mb-2 block">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm mb-2 block">Category</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm mb-2 block">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Loading inventory...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Item ID</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Location</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Type</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.map((item) => (
                  <tr key={item.item_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-data font-medium text-slate-900">{item.item_id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{item.item_name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.category || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        item.status === 'active' ? 'bg-green-100 text-green-800' :
                        item.status === 'damaged' ? 'bg-red-100 text-red-800' :
                        item.status === 'lost' ? 'bg-red-100 text-red-800' :
                        item.status === 'repair' ? 'bg-amber-100 text-amber-800' :
                        item.status === 'wear_flag' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-data text-slate-600">{item.current_kit || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.tracking_type}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => openEditDialog(item)}
                          size="sm"
                          variant="ghost"
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => handleDelete(item.item_id)}
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredItems.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No items found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-tactical text-xl">Add New Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Item ID *</Label>
                <Input
                  value={formData.item_id}
                  onChange={(e) => setFormData({ ...formData, item_id: e.target.value.toUpperCase() })}
                  placeholder="e.g., SSD-001"
                  required
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Item Name *</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  placeholder="e.g., SSD Drive 1TB"
                  required
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {STANDARD_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tracking Type *</Label>
                <Select
                  value={formData.tracking_type}
                  onValueChange={(val) => setFormData({ ...formData, tracking_type: val })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="quantity">Quantity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Initial Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="wear_flag">Wear Flag</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Current Location</Label>
                <Input
                  value={formData.current_kit}
                  onChange={(e) => setFormData({ ...formData, current_kit: e.target.value })}
                  placeholder="e.g., STATION-01"
                  className="mt-2"
                />
              </div>
            </div>

            {formData.category === 'ssd' && (
              <div>
                <Label>Capacity (GB)</Label>
                <Input
                  type="number"
                  value={formData.total_capacity_gb}
                  onChange={(e) => setFormData({ ...formData, total_capacity_gb: e.target.value })}
                  placeholder="e.g., 1000"
                  className="mt-2"
                />
              </div>
            )}

            {formData.category === 'glove' && (
              <div>
                <Label>Side</Label>
                <Select
                  value={formData.side}
                  onValueChange={(val) => setFormData({ ...formData, side: val })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select side" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Additional details..."
                className="mt-2"
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700">
                Add Item
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog - Same form as Add but with update handler */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-tactical text-xl">Edit Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-4">
            {/* Same form fields as Add dialog */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Item ID</Label>
                <Input value={formData.item_id} disabled className="mt-2 bg-slate-100" />
              </div>
              <div>
                <Label>Item Name *</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  required
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {STANDARD_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="repair">Repair</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="wear_flag">Wear Flag</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Current Location</Label>
              <Input
                value={formData.current_kit}
                onChange={(e) => setFormData({ ...formData, current_kit: e.target.value })}
                className="mt-2"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-2"
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                Update Item
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Dialog */}
      <Dialog open={bulkAddOpen} onOpenChange={setBulkAddOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-tactical text-xl">Bulk Add Items</DialogTitle>
          </DialogHeader>
          <BulkAddForm 
            onSuccess={() => {
              setBulkAddOpen(false);
              fetchItems();
            }}
            onCancel={() => setBulkAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// Bulk Add Form Component
function BulkAddForm({ onSuccess, onCancel }) {
  const [bulkItems, setBulkItems] = useState([
    { item_id: '', item_name: '', category: '', tracking_type: 'individual', status: 'active', current_kit: '' }
  ]);
  const [loading, setLoading] = useState(false);

  const addRow = () => {
    setBulkItems([...bulkItems, { item_id: '', item_name: '', category: '', tracking_type: 'individual', status: 'active', current_kit: '' }]);
  };

  const removeRow = (index) => {
    if (bulkItems.length > 1) {
      setBulkItems(bulkItems.filter((_, i) => i !== index));
    }
  };

  const updateRow = (index, field, value) => {
    const updated = [...bulkItems];
    updated[index][field] = value;
    setBulkItems(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Filter out empty rows
    const validItems = bulkItems.filter(item => item.item_id && item.item_name);
    
    if (validItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/items/bulk-add', validItems);
      toast.success(`Successfully added ${response.data.items_created} items`);
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add items');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <p className="text-sm text-slate-600">Add multiple items at once. Fill in the details for each row.</p>
      
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {bulkItems.map((item, index) => (
          <div key={index} className="grid grid-cols-6 gap-2 p-3 bg-slate-50 rounded-lg items-end">
            <div>
              <Label className="text-xs">Item ID *</Label>
              <Input
                value={item.item_id}
                onChange={(e) => updateRow(index, 'item_id', e.target.value.toUpperCase())}
                placeholder="SSD-001"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Name *</Label>
              <Input
                value={item.item_name}
                onChange={(e) => updateRow(index, 'item_name', e.target.value)}
                placeholder="SSD Drive"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input
                value={item.category}
                onChange={(e) => updateRow(index, 'category', e.target.value)}
                placeholder="ssd"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={item.tracking_type} onValueChange={(val) => updateRow(index, 'tracking_type', val)}>
                <SelectTrigger className="mt-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="quantity">Quantity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Input
                value={item.current_kit}
                onChange={(e) => updateRow(index, 'current_kit', e.target.value)}
                placeholder="STATION-01"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(index)}
                className="text-red-600 hover:text-red-700"
                disabled={bulkItems.length === 1}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addRow} className="w-full">
        <Plus className="w-4 h-4 mr-2" />
        Add Another Row
      </Button>

      <div className="flex gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700" disabled={loading}>
          {loading ? 'Adding...' : `Add ${bulkItems.filter(i => i.item_id && i.item_name).length} Items`}
        </Button>
      </div>
    </form>
  );
}
