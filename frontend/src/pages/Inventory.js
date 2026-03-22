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
import { 
  ArrowLeft, Package, Search, Plus, Edit, Trash2, 
  ChevronDown, ChevronRight, ArrowRightLeft, AlertTriangle,
  Warehouse, Box, MapPin, History, Clock, Grid3X3, CheckCircle2, XCircle, AlertCircle, HardDrive,
  Tag, Layers, Settings
} from 'lucide-react';

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

const LOCATION_TYPES = [
  { prefix: 'kit', label: 'Kit' },
  { prefix: 'bnb', label: 'BnB' },
  { prefix: 'station', label: 'Station/Hub' },
];

const TABS = [
  { id: 'distribution', label: 'Distribution', icon: Grid3X3 },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'completeness', label: 'Kit Completeness', icon: CheckCircle2 },
  { id: 'movements', label: 'Movement Log', icon: History },
];

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [items, setItems] = useState([]);
  const [kits, setKits] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [events, setEvents] = useState([]);
  const [distribution, setDistribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('distribution');
  const [expandedSections, setExpandedSections] = useState({});
  
  // Categories from API
  const [categories, setCategories] = useState([]);
  const [uniqueCategories, setUniqueCategories] = useState([]);
  const [nonUniqueCategories, setNonUniqueCategories] = useState([]);
  const [categoryLabels, setCategoryLabels] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryItems, setCategoryItems] = useState([]);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  
  // Category form data
  const [categoryForm, setCategoryForm] = useState({ value: '', label: '', type: 'unique' });
  
  // Form data
  const [formData, setFormData] = useState({
    item_name: '',
    category: '',
    tracking_type: 'individual',
    status: 'active',
    location_type: 'station',
    location_value: 'Storage',
    quantity: 1,
    from_type: 'kit',
    from_value: '',
    to_type: 'kit',
    to_value: '',
    notes: '',
    // Transfer-specific fields
    transfer_category: '',
    transfer_item: '',
    transfer_quantity: 1,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [itemsRes, kitsRes, bnbsRes, eventsRes, distRes, catRes] = await Promise.all([
        api.get('/items'),
        api.get('/kits'),
        api.get('/bnbs'),
        api.get('/events?event_type=transfer'),
        api.get('/items/distribution'),
        api.get('/categories')
      ]);
      setItems(itemsRes.data);
      setKits(kitsRes.data);
      setBnbs(bnbsRes.data);
      setEvents(eventsRes.data.slice(0, 50)); // Last 50 movements
      setDistribution(distRes.data);
      
      // Set categories from API
      const cats = catRes.data.categories || [];
      setCategories(cats);
      setUniqueCategories(catRes.data.unique_categories || []);
      setNonUniqueCategories(catRes.data.non_unique_categories || []);
      setCategoryLabels(catRes.data.category_labels || {});
      
      // Auto-expand first sections
      const sections = {};
      cats.forEach(c => { sections[`hub-${c.value}`] = true; });
      kitsRes.data.forEach(k => { sections[`kit-${k.kit_id}`] = true; });
      setExpandedSections(sections);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch items for a specific category
  const fetchCategoryItems = async (categoryValue) => {
    try {
      const res = await api.get(`/categories/${categoryValue}/items`);
      setCategoryItems(res.data.items || []);
      setSelectedCategory(res.data.category);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load category items');
    }
  };

  const filteredItems = items.filter(item =>
    item.item_name.toLowerCase().includes(search.toLowerCase())
  );

  // Group items by location
  const getHubItems = () => {
    return filteredItems.filter(item => 
      item.current_location?.startsWith('station:') || 
      !item.current_location
    );
  };

  const getKitItems = (kitId) => {
    return filteredItems.filter(item => 
      item.current_location === `kit:${kitId}`
    );
  };

  const getBnbItems = (bnbName) => {
    return filteredItems.filter(item => 
      item.current_location === `bnb:${bnbName}`
    );
  };

  // Group by category
  const groupByCategory = (itemList) => {
    return categories.reduce((acc, cat) => {
      acc[cat.value] = itemList.filter(item => (item.category || 'general') === cat.value);
      return acc;
    }, {});
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
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

  const formatTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  };

  const formatLocation = (location) => {
    if (!location) return 'Hub';
    if (location.includes(':')) {
      const [type, value] = location.split(':');
      return `${type.charAt(0).toUpperCase() + type.slice(1)}: ${value}`;
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
          { value: 'Main', label: 'Main Hub' },
          { value: 'Storage', label: 'Storage' },
          { value: 'Office', label: 'Office' },
        ];
      default:
        return [];
    }
  };

  // Dialog functions
  const openAddDialog = () => {
    setDialogType('add');
    setEditingItem(null);
    setFormData({
      item_name: '',
      category: '',
      tracking_type: 'individual',
      status: 'active',
      location_type: 'station',
      location_value: 'Storage',
      quantity: 1,
      from_type: 'kit',
      from_value: '',
      to_type: 'kit',
      to_value: '',
      notes: '',
      transfer_category: '',
      transfer_item: '',
      transfer_quantity: 1,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item) => {
    setDialogType('edit');
    setEditingItem(item);
    
    let locType = 'station';
    let locValue = 'Storage';
    if (item.current_location?.includes(':')) {
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

  const openTransferDialog = (item) => {
    setDialogType('transfer');
    setEditingItem(item);
    
    let fromType = 'station';
    let fromValue = 'Storage';
    if (item.current_location?.includes(':')) {
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
      // Category CRUD
      if (dialogType === 'add-category') {
        if (!categoryForm.value || !categoryForm.label) {
          toast.error('Please fill in all fields');
          return;
        }
        await api.post('/categories', {
          value: categoryForm.value.toLowerCase().trim().replace(/\s+/g, '_'),
          label: categoryForm.label.trim(),
          type: categoryForm.type
        });
        toast.success('Category created');
        setDialogOpen(false);
        fetchData();
        return;
      } else if (dialogType === 'edit-category') {
        await api.put(`/categories/${categoryForm.value}`, {
          label: categoryForm.label.trim(),
          type: categoryForm.type
        });
        toast.success('Category updated');
        setDialogOpen(false);
        fetchData();
        return;
      }
      
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
      } else if (dialogType === 'transfer' || dialogType === 'bulk-transfer') {
        const from_location = `${formData.from_type}:${formData.from_value}`;
        const to_location = `${formData.to_type}:${formData.to_value}`;
        
        if (!formData.from_value || !formData.to_value) {
          toast.error('Please select From and To locations');
          return;
        }
        
        // For NON-UNIQUE bulk transfers, use category-based transfer
        const isNonUniqueTransfer = dialogType === 'bulk-transfer' && 
          nonUniqueCategories.includes(formData.transfer_category);
        
        if (isNonUniqueTransfer) {
          // Quantity-based transfer (no specific item selection)
          await api.post('/events/transfer-quantity', {
            category: formData.transfer_category,
            from_location,
            to_location,
            quantity: formData.transfer_quantity,
            notes: formData.notes || null
          });
          toast.success(`Transferred ${formData.transfer_quantity} ${categoryLabels[formData.transfer_category] || 'items'}`);
        } else {
          // Individual item transfer (UNIQUE categories or single item transfer)
          const itemName = dialogType === 'bulk-transfer' ? formData.transfer_item : editingItem.item_name;
          const transferQty = dialogType === 'bulk-transfer' ? formData.transfer_quantity : 1;
          
          if (!itemName) {
            toast.error('Please select an item');
            return;
          }
          
          // Check for SSD transfer with reason
          const isSsdTransfer = formData.transfer_category === 'ssd' || 
            (editingItem && editingItem.category === 'ssd');
          
          if (isSsdTransfer && formData.ssd_transfer_reason === 'ssd_full') {
            // Mark SSD as "ready_for_offload" when transferred due to being full
            await api.post('/events', {
              event_type: 'transfer',
              item: itemName,
              from_location,
              to_location,
              quantity: transferQty,
              notes: `SSD Full - Ready for Offload. ${formData.notes || ''}`.trim()
            });
            await api.put(`/items/${itemName}`, { status: 'ready_for_offload' });
            toast.success('SSD transferred and marked as Ready for Offload');
          } else if (isSsdTransfer && formData.ssd_transfer_reason === 'issue_damage') {
            // Mark SSD as damaged when transferred due to issue
            await api.post('/events', {
              event_type: 'transfer',
              item: itemName,
              from_location,
              to_location,
              quantity: transferQty,
              notes: `Issue/Damage. ${formData.notes || ''}`.trim()
            });
            await api.put(`/items/${itemName}`, { status: 'damaged' });
            toast.success('SSD transferred and marked as Damaged');
          } else {
            // Regular transfer
            await api.post('/events', {
              event_type: 'transfer',
              item: itemName,
              from_location,
              to_location,
              quantity: transferQty,
              notes: formData.ssd_transfer_reason 
                ? `Reason: ${formData.ssd_transfer_reason}. ${formData.notes || ''}`.trim()
                : (formData.notes || null)
            });
            toast.success('Transfer recorded');
          }
        }
      } else if (dialogType === 'damage') {
        // Single item damage report (from item row)
        await api.post('/events', {
          event_type: 'damage',
          item: editingItem.item_name,
          from_location: editingItem.current_location,
          quantity: 1,
          notes: formData.notes || null
        });
        // Update item status to 'damaged'
        await api.put(`/items/${editingItem.item_name}`, { status: 'damaged' });
        toast.success('Item marked as damaged');
      } else if (dialogType === 'report-damage' || dialogType === 'report-lost') {
        // Bulk damage/lost report with UNIQUE vs NON-UNIQUE logic
        const isUnique = uniqueCategories.includes(formData.report_category);
        const newStatus = dialogType === 'report-damage' ? 'damaged' : 'lost';
        
        if (!formData.report_category) {
          toast.error('Please select a category');
          return;
        }
        
        if (isUnique) {
          // UNIQUE: Must select specific item (location auto-detected from item)
          if (!formData.report_item) {
            toast.error('Please select an item');
            return;
          }
          const selectedItem = items.find(i => i.item_name === formData.report_item);
          await api.post('/events', {
            event_type: newStatus === 'damaged' ? 'damage' : 'lost',
            item: formData.report_item,
            from_location: selectedItem?.current_location || null,
            quantity: 1,
            notes: formData.notes || null
          });
          await api.put(`/items/${formData.report_item}`, { status: newStatus });
          toast.success(`Item marked as ${newStatus}`);
        } else {
          // NON-UNIQUE: User selects location + quantity
          const qty = formData.report_quantity || 1;
          const sourceLocation = formData.report_location_type && formData.report_location_value
            ? `${formData.report_location_type}:${formData.report_location_value}`
            : null;
          
          if (!sourceLocation) {
            toast.error('Please select a source location');
            return;
          }
          
          // Find items of this category at the specified location
          const locationItems = items.filter(i => 
            i.category === formData.report_category && 
            i.status === 'active' &&
            i.current_location === sourceLocation
          );
          
          if (locationItems.length === 0) {
            toast.error(`No active ${categoryLabels[formData.report_category] || 'items'} found at this location`);
            return;
          }
          
          // Calculate total available at location
          const totalAvailable = locationItems.reduce((sum, i) => sum + (i.quantity || 1), 0);
          if (totalAvailable < qty) {
            toast.error(`Only ${totalAvailable} available at this location`);
            return;
          }
          
          // Use the new quantity-based damage/lost endpoint
          await api.post('/events/damage-lost-quantity', {
            category: formData.report_category,
            from_location: sourceLocation,
            quantity: qty,
            status: newStatus,
            notes: formData.notes || null
          });
          toast.success(`${qty} ${categoryLabels[formData.report_category] || 'item(s)'} marked as ${newStatus}`);
        }
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

  // Render item row
  const renderItemRow = (item, showLocation = false) => (
    <div key={item.item_name} className="px-4 py-2 flex items-center justify-between hover:bg-slate-50" data-testid={`item-${item.item_name}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-900 text-sm">{item.item_name}</p>
          {item.tracking_type === 'quantity' && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">×{item.quantity || 1}</span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(item.status)}`}>
            {item.status}
          </span>
        </div>
        {showLocation && (
          <p className="text-xs text-slate-500 mt-0.5">{formatLocation(item.current_location)}</p>
        )}
      </div>
      
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTransferDialog(item)} title="Transfer">
          <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDamageDialog(item)} title="Report Damage">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        </Button>
        {isAdmin && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(item)}>
              <Edit className="w-3.5 h-3.5 text-slate-500" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.item_name)}>
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
          </>
        )}
      </div>
    </div>
  );

  // Render category section
  const renderCategorySection = (items, prefix) => {
    const grouped = groupByCategory(items);
    
    return categories.map(cat => {
      const catItems = grouped[cat.value] || [];
      if (catItems.length === 0) return null;
      
      const sectionKey = `${prefix}-${cat.value}`;
      const isExpanded = expandedSections[sectionKey];
      
      return (
        <div key={sectionKey} className="border-t first:border-t-0">
          <button
            onClick={() => toggleSection(sectionKey)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-50 text-sm"
          >
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span className="font-medium text-slate-700">{cat.label}</span>
              <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{catItems.length}</span>
            </div>
          </button>
          {isExpanded && (
            <div className="bg-white divide-y border-t">
              {catItems.map(item => renderItemRow(item))}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Inventory</h1>
              <p className="text-sm text-slate-600">{items.length} items tracked</p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <a href="/offload">
                <Button size="sm" variant="outline" data-testid="offload-btn">
                  <HardDrive className="w-4 h-4 mr-1" />
                  Data Offload
                </Button>
              </a>
            </div>
          )}
          {/* Action buttons for ALL users */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { 
              setDialogType('bulk-transfer'); 
              setFormData(prev => ({ ...prev, transfer_category: '', transfer_item: '', transfer_quantity: 1, from_type: 'station', from_value: '', to_type: 'kit', to_value: '', notes: '' }));
              setDialogOpen(true); 
            }} data-testid="transfer-item-btn">
              <ArrowRightLeft className="w-4 h-4 mr-1" />
              Transfer Item
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setDialogType('report-damage');
              setFormData(prev => ({ ...prev, report_category: '', report_item: '', report_quantity: 1, notes: '' }));
              setDialogOpen(true);
            }} data-testid="report-damage-btn">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Report Damage
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setDialogType('report-lost');
              setFormData(prev => ({ ...prev, report_category: '', report_item: '', report_quantity: 1, notes: '' }));
              setDialogOpen(true);
            }} data-testid="report-lost-btn">
              <XCircle className="w-4 h-4 mr-1" />
              Report Lost
            </Button>
            <Button size="sm" onClick={openAddDialog} data-testid="add-item-btn">
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
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

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : (
          <>
            {/* DISTRIBUTION TAB */}
            {activeTab === 'distribution' && distribution && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Grid3X3 className="w-5 h-5" />
                  <h2 className="font-semibold">Item Distribution</h2>
                  <span className="text-sm text-slate-500">(auto-calculated from inventory)</span>
                </div>
                
                {distribution.categories.length === 0 ? (
                  <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                    No items in inventory
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="distribution-table">
                        <thead>
                          <tr className="bg-slate-100 border-b">
                            <th className="text-left px-4 py-3 font-semibold text-slate-700 sticky left-0 bg-slate-100">
                              Category
                            </th>
                            {distribution.locations.map(loc => (
                              <th key={loc} className="text-center px-3 py-3 font-semibold text-slate-700 min-w-[80px]">
                                {loc}
                              </th>
                            ))}
                            <th className="text-center px-4 py-3 font-bold text-slate-900 bg-slate-200">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {distribution.categories.map(cat => {
                            const catData = distribution.distribution[cat] || {};
                            const total = Object.values(catData).reduce((sum, val) => sum + val, 0);
                            // Use backend category_labels if available, otherwise fallback to categories state
                            const catLabel = distribution.category_labels?.[cat] || categoryLabels[cat] || cat;
                            
                            return (
                              <tr key={cat} className="border-b hover:bg-slate-50" data-testid={`dist-row-${cat}`}>
                                <td className="px-4 py-3 font-medium text-slate-900 sticky left-0 bg-white">
                                  {catLabel}
                                </td>
                                {distribution.locations.map(loc => {
                                  const count = catData[loc] || 0;
                                  return (
                                    <td key={loc} className={`text-center px-3 py-3 ${count > 0 ? 'font-semibold text-blue-600' : 'text-slate-300'}`}>
                                      {count}
                                    </td>
                                  );
                                })}
                                <td className="text-center px-4 py-3 font-bold text-slate-900 bg-slate-50">
                                  {total}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-bold">
                            <td className="px-4 py-3 text-slate-900 sticky left-0 bg-slate-100">Total</td>
                            {distribution.locations.map(loc => {
                              const locTotal = distribution.categories.reduce((sum, cat) => {
                                return sum + (distribution.distribution[cat]?.[loc] || 0);
                              }, 0);
                              return (
                                <td key={loc} className={`text-center px-3 py-3 ${locTotal > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                  {locTotal}
                                </td>
                              );
                            })}
                            <td className="text-center px-4 py-3 text-slate-900 bg-slate-200">
                              {items.length}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
                
                <p className="text-xs text-slate-500 text-center">
                  This view is auto-calculated from item locations. Use transfers to move items between locations.
                </p>
              </div>
            )}

            {/* CATEGORIES TAB */}
            {activeTab === 'categories' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Tag className="w-5 h-5" />
                    <h2 className="font-semibold">Category Management</h2>
                    <span className="text-sm text-slate-500">({categories.length} categories)</span>
                  </div>
                  {isAdmin && (
                    <Button 
                      size="sm" 
                      onClick={() => {
                        setDialogType('add-category');
                        setCategoryForm({ value: '', label: '', type: 'unique' });
                        setDialogOpen(true);
                      }}
                      data-testid="add-category-btn"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Category
                    </Button>
                  )}
                </div>
                
                {categories.length === 0 ? (
                  <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                    No categories defined
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {categories.map(cat => {
                      const isExpanded = expandedSections[`cat-${cat.value}`];
                      const isUnique = cat.type === 'unique';
                      
                      return (
                        <div key={cat.value} className="bg-white rounded-xl border overflow-hidden" data-testid={`category-${cat.value}`}>
                          <div 
                            className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                            onClick={() => {
                              toggleSection(`cat-${cat.value}`);
                              if (!isExpanded) {
                                fetchCategoryItems(cat.value);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-900">{cat.label}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    isUnique ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                    {isUnique ? 'Unique' : 'Quantity-based'}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500">ID: {cat.value}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-slate-700">{cat.item_count || 0} items</span>
                              {isAdmin && (
                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setDialogType('edit-category');
                                      setCategoryForm({ value: cat.value, label: cat.label, type: cat.type });
                                      setDialogOpen(true);
                                    }}
                                  >
                                    <Edit className="w-4 h-4 text-slate-500" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={async () => {
                                      if (!confirm(`Delete category "${cat.label}"?`)) return;
                                      try {
                                        await api.delete(`/categories/${cat.value}`);
                                        toast.success('Category deleted');
                                        fetchData();
                                      } catch (err) {
                                        toast.error(err.response?.data?.detail || 'Failed to delete');
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {isExpanded && selectedCategory?.value === cat.value && (
                            <div className="border-t bg-slate-50 p-4">
                              {categoryItems.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-4">No items in this category</p>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex gap-4 text-xs text-slate-600 mb-2">
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                                      Active: {categoryItems.filter(i => i.status === 'active').length}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                                      Damaged: {categoryItems.filter(i => i.status === 'damaged').length}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <XCircle className="w-3 h-3 text-red-500" />
                                      Lost: {categoryItems.filter(i => i.status === 'lost').length}
                                    </span>
                                  </div>
                                  
                                  <div className="bg-white rounded-lg border divide-y max-h-64 overflow-y-auto">
                                    {categoryItems.map(item => (
                                      <div key={item.item_name} className="px-3 py-2 flex items-center justify-between text-sm">
                                        <div>
                                          <span className="font-medium">{item.item_name}</span>
                                          {!isUnique && <span className="text-slate-500 ml-2">×{item.quantity || 1}</span>}
                                          <span className="text-xs text-slate-500 ml-2">{formatLocation(item.current_location)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(item.status)}`}>
                                            {item.status}
                                          </span>
                                          {isAdmin && (
                                            <Select
                                              value={item.status}
                                              onValueChange={async (newStatus) => {
                                                try {
                                                  await api.put(`/items/${item.item_name}`, { status: newStatus });
                                                  toast.success(`Status updated to ${newStatus}`);
                                                  fetchCategoryItems(cat.value);
                                                  fetchData();
                                                } catch (err) {
                                                  toast.error('Failed to update status');
                                                }
                                              }}
                                            >
                                              <SelectTrigger className="h-7 w-24 text-xs">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="damaged">Damaged</SelectItem>
                                                <SelectItem value="lost">Lost</SelectItem>
                                                <SelectItem value="repair">Repair</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* KIT COMPLETENESS TAB */}
            {activeTab === 'completeness' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <h2 className="font-semibold">Kit Completeness Check</h2>
                </div>
                
                {/* Standard Reference */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 font-medium mb-2">Standard Kit Composition:</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-blue-700">
                    {Object.entries(KIT_STANDARD).map(([key, val]) => (
                      <span key={key}>{val.label}: {val.required}</span>
                    ))}
                  </div>
                </div>
                
                {kits.length === 0 ? (
                  <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                    No kits configured
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {kits.map(kit => {
                      const kitItems = getKitItems(kit.kit_id).filter(i => i.status === 'active');
                      
                      // Calculate completeness for each category
                      const completeness = Object.entries(KIT_STANDARD).map(([category, standard]) => {
                        const currentCount = kitItems.filter(item => 
                          item.category === category || 
                          item.category?.toLowerCase().replace(/[^a-z]/g, '_') === category
                        ).length;
                        
                        const status = currentCount >= standard.required 
                          ? 'complete' 
                          : currentCount > 0 
                            ? 'partial' 
                            : 'missing';
                        
                        return {
                          category,
                          label: standard.label,
                          required: standard.required,
                          current: currentCount,
                          status,
                          excess: currentCount > standard.required ? currentCount - standard.required : 0
                        };
                      });
                      
                      const completeCount = completeness.filter(c => c.status === 'complete').length;
                      const totalCategories = completeness.length;
                      const isComplete = completeCount === totalCategories;
                      
                      const sectionKey = `completeness-${kit.kit_id}`;
                      const isExpanded = expandedSections[sectionKey] !== false;
                      
                      return (
                        <div key={kit.kit_id} className="bg-white rounded-xl border overflow-hidden" data-testid={`kit-completeness-${kit.kit_id}`}>
                          <button
                            onClick={() => toggleSection(sectionKey)}
                            className={`w-full px-4 py-3 flex items-center justify-between ${
                              isComplete ? 'bg-green-600' : 'bg-amber-500'
                            } text-white hover:opacity-90`}
                          >
                            <div className="flex items-center gap-3">
                              <Box className="w-5 h-5" />
                              <span className="font-bold">{kit.kit_id}</span>
                              {isComplete ? (
                                <span className="text-xs bg-white/20 px-2 py-0.5 rounded flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Complete
                                </span>
                              ) : (
                                <span className="text-xs bg-white/20 px-2 py-0.5 rounded flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> {completeCount}/{totalCategories} categories
                                </span>
                              )}
                            </div>
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </button>
                          
                          {isExpanded && (
                            <div className="p-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {completeness.map(item => (
                                  <div 
                                    key={item.category}
                                    className={`p-3 rounded-lg border ${
                                      item.status === 'complete' 
                                        ? 'bg-green-50 border-green-200' 
                                        : item.status === 'partial'
                                          ? 'bg-amber-50 border-amber-200'
                                          : 'bg-red-50 border-red-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium text-slate-700">{item.label}</span>
                                      {item.status === 'complete' ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                                      ) : item.status === 'partial' ? (
                                        <AlertCircle className="w-4 h-4 text-amber-600" />
                                      ) : (
                                        <XCircle className="w-4 h-4 text-red-500" />
                                      )}
                                    </div>
                                    <div className="text-lg font-bold text-slate-900">
                                      {item.current} / {item.required}
                                    </div>
                                    <div className={`text-xs ${
                                      item.status === 'complete' 
                                        ? 'text-green-700' 
                                        : item.status === 'partial'
                                          ? 'text-amber-700'
                                          : 'text-red-600'
                                    }`}>
                                      {item.status === 'complete' && item.excess > 0 
                                        ? `+${item.excess} excess`
                                        : item.status === 'complete'
                                          ? 'Complete'
                                          : item.status === 'partial'
                                            ? `Missing ${item.required - item.current}`
                                            : 'Missing'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* MOVEMENT LOG TAB */}
            {activeTab === 'movements' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <History className="w-5 h-5" />
                  <h2 className="font-semibold">Recent Movements</h2>
                  <span className="text-sm text-slate-500">(Last 50 transfers)</span>
                </div>
                
                {events.length === 0 ? (
                  <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                    No movement history
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border divide-y">
                    {events.map((evt, idx) => (
                      <div key={idx} className="px-4 py-3" data-testid={`movement-${idx}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                              <span className="font-medium text-slate-900">{evt.item}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">{formatLocation(evt.from_location)}</span>
                              <span className="text-slate-400">→</span>
                              <span className="bg-green-100 px-2 py-0.5 rounded text-xs text-green-700">{formatLocation(evt.to_location)}</span>
                            </div>
                            {evt.notes && <p className="text-xs text-slate-500 mt-1">{evt.notes}</p>}
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTime(evt.timestamp)}
                            </div>
                            <p className="mt-0.5 font-medium text-slate-700">Moved by {evt.user_name || 'Unknown'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {filteredItems.length === 0 && activeTab !== 'movements' && (
              <div className="bg-white rounded-xl border p-8 text-center">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">{search ? 'No items found' : 'No items yet'}</p>
                {!search && (
                  <Button className="mt-4" onClick={openAddDialog}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add First Item
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle className="text-base">
              {dialogType === 'add' ? 'Add Item' : 
               dialogType === 'edit' ? 'Edit Item' : 
               dialogType === 'transfer' ? `Transfer: ${editingItem?.item_name}` : 
               dialogType === 'bulk-transfer' ? 'Transfer Item' :
               dialogType === 'report-damage' ? 'Report Damaged Item' :
               dialogType === 'report-lost' ? 'Report Lost Item' :
               dialogType === 'add-category' ? 'Add New Category' :
               dialogType === 'edit-category' ? 'Edit Category' :
               `Report Damage: ${editingItem?.item_name}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            
            {/* CATEGORY ADD/EDIT DIALOG */}
            {(dialogType === 'add-category' || dialogType === 'edit-category') && (
              <>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Category ID *</Label>
                  <Input
                    value={categoryForm.value}
                    onChange={(e) => setCategoryForm({ ...categoryForm, value: e.target.value })}
                    placeholder="e.g., laptop, usb_hub"
                    className="mt-1 h-9"
                    disabled={dialogType === 'edit-category'}
                    required
                    data-testid="category-value-input"
                  />
                  <p className="text-xs text-slate-500 mt-1">Unique identifier (lowercase, no spaces)</p>
                </div>
                
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Display Name *</Label>
                  <Input
                    value={categoryForm.label}
                    onChange={(e) => setCategoryForm({ ...categoryForm, label: e.target.value })}
                    placeholder="e.g., Laptop, USB Hub"
                    className="mt-1 h-9"
                    required
                    data-testid="category-label-input"
                  />
                </div>
                
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Category Type *</Label>
                  <Select value={categoryForm.type} onValueChange={(v) => setCategoryForm({ ...categoryForm, type: v })}>
                    <SelectTrigger className="mt-1 h-9" data-testid="category-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unique">Unique (Individual items with IDs)</SelectItem>
                      <SelectItem value="non_unique">Quantity-based (Tracked by count)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    {categoryForm.type === 'unique' 
                      ? 'Each item has a unique ID (e.g., Laptop-01, SSD-001)'
                      : 'Items are tracked by quantity (e.g., 5 USB Hubs)'}
                  </p>
                </div>
              </>
            )}
            
            {/* REPORT DAMAGE / LOST DIALOG - with UNIQUE vs NON-UNIQUE logic */}
            {(dialogType === 'report-damage' || dialogType === 'report-lost') && (
              <>
                <div className={`p-3 rounded-lg ${dialogType === 'report-damage' ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className="text-sm font-medium ${dialogType === 'report-damage' ? 'text-amber-700' : 'text-red-700'}">
                    {dialogType === 'report-damage' 
                      ? 'Mark item as damaged. It will be removed from usable inventory.'
                      : 'Mark item as lost. It will be removed from usable inventory.'}
                  </p>
                </div>
                
                {/* Step 1: Select Category */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Step 1: Select Category *</Label>
                  <Select 
                    value={formData.report_category} 
                    onValueChange={(v) => setFormData({ ...formData, report_category: v, report_item: '', report_quantity: 1 })}
                  >
                    <SelectTrigger className="mt-1 h-9" data-testid="report-category-select">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Step 2: Based on UNIQUE vs NON-UNIQUE */}
                {formData.report_category && (
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    {uniqueCategories.includes(formData.report_category) ? (
                      // UNIQUE: Select specific item
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Step 2: Select Item *</Label>
                        <Select 
                          value={formData.report_item} 
                          onValueChange={(v) => setFormData({ ...formData, report_item: v })}
                        >
                          <SelectTrigger className="mt-1 h-9" data-testid="report-item-select">
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items
                              .filter(i => i.category === formData.report_category && i.status === 'active')
                              .map(i => (
                                <SelectItem key={i.item_name} value={i.item_name}>
                                  {i.item_name} ({formatLocation(i.current_location)})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {items.filter(i => i.category === formData.report_category && i.status === 'active').length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">No active items found in this category</p>
                        )}
                      </div>
                    ) : (
                      // NON-UNIQUE: Select location + quantity
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs font-semibold text-slate-700">Step 2: Select Source Location *</Label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <Select 
                              value={formData.report_location_type || ''} 
                              onValueChange={(v) => setFormData({ ...formData, report_location_type: v, report_location_value: '' })}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select 
                              value={formData.report_location_value || ''} 
                              onValueChange={(v) => setFormData({ ...formData, report_location_value: v })}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Location" />
                              </SelectTrigger>
                              <SelectContent>
                                {getLocationOptions(formData.report_location_type).map(o => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs font-semibold text-slate-700">Quantity *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={formData.report_quantity}
                            onChange={(e) => setFormData({ ...formData, report_quantity: parseInt(e.target.value) || 1 })}
                            className="mt-1 h-9"
                            data-testid="report-quantity-input"
                          />
                          {formData.report_location_type && formData.report_location_value && (
                            <p className="text-xs text-slate-500 mt-1">
                              Available at {formData.report_location_type}:{formData.report_location_value}: {
                                items.filter(i => 
                                  i.category === formData.report_category && 
                                  i.status === 'active' &&
                                  i.current_location === `${formData.report_location_type}:${formData.report_location_value}`
                                ).reduce((sum, i) => sum + (i.quantity || 1), 0)
                              } items
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Notes */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Notes (optional)</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Describe the damage or circumstances..."
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </>
            )}
            
            {(dialogType === 'add' || dialogType === 'edit') && (
              <>
                {/* STEP 1: Select Category FIRST */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Step 1: Select Category *</Label>
                  <Select value={formData.category} onValueChange={(v) => {
                    // Auto-set tracking type based on category
                    const isUnique = uniqueCategories.includes(v);
                    setFormData({ 
                      ...formData, 
                      category: v, 
                      tracking_type: isUnique ? 'individual' : 'quantity',
                      item_name: isUnique ? formData.item_name : v // For non-unique, use category as item_name
                    });
                  }}>
                    <SelectTrigger className="mt-1 h-9" data-testid="category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* STEP 2: Show Item Code ONLY for UNIQUE categories */}
                {formData.category && uniqueCategories.includes(formData.category) && (
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    <Label className="text-xs font-semibold text-slate-700">Step 2: Item Code / ID *</Label>
                    <Input
                      value={formData.item_name}
                      onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                      placeholder={`e.g., ${formData.category.toUpperCase().replace('_', '-')}-01`}
                      className="mt-1 h-9"
                      disabled={dialogType === 'edit'}
                      required
                      data-testid="item-name-input"
                    />
                    <p className="text-xs text-slate-500 mt-1">Enter a unique identifier for this item</p>
                  </div>
                )}
                
                {/* For NON-UNIQUE categories, show quantity */}
                {formData.category && nonUniqueCategories.includes(formData.category) && (
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    <Label className="text-xs font-semibold text-slate-700">Step 2: Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                      className="mt-1 h-9"
                      data-testid="item-quantity-input"
                    />
                    <p className="text-xs text-slate-500 mt-1">How many {categoryLabels[formData.category] || 'items'} to add</p>
                  </div>
                )}
                
                {formData.category && (
                  <>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                          <SelectItem value="repair">In Repair</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Location Type</Label>
                        <Select value={formData.location_type} onValueChange={(v) => setFormData({ ...formData, location_type: v, location_value: '' })}>
                          <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Location</Label>
                        <Select value={formData.location_value} onValueChange={(v) => setFormData({ ...formData, location_value: v })}>
                          <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {getLocationOptions(formData.location_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            
            {dialogType === 'transfer' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">From Type</Label>
                    <Select value={formData.from_type} onValueChange={(v) => setFormData({ ...formData, from_type: v, from_value: '' })}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">From</Label>
                    <Select value={formData.from_value} onValueChange={(v) => setFormData({ ...formData, from_value: v })}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {getLocationOptions(formData.from_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">To Type</Label>
                    <Select value={formData.to_type} onValueChange={(v) => setFormData({ ...formData, to_type: v, to_value: '' })}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">To</Label>
                    <Select value={formData.to_value} onValueChange={(v) => setFormData({ ...formData, to_value: v })}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {getLocationOptions(formData.to_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add transfer notes"
                    className="mt-1 h-16 resize-none text-sm"
                  />
                </div>
              </>
            )}
            
            {/* BULK TRANSFER DIALOG - Two-step: Category -> Item (ID or Quantity) */}
            {dialogType === 'bulk-transfer' && (
              <>
                {/* Step 1: Select Category */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Step 1: Select Category *</Label>
                  <Select 
                    value={formData.transfer_category} 
                    onValueChange={(v) => setFormData({ ...formData, transfer_category: v, transfer_item: '', transfer_quantity: 1 })}
                  >
                    <SelectTrigger className="mt-1 h-9" data-testid="transfer-category-select">
                      <SelectValue placeholder="Select item category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Step 2: Select Item (UNIQUE) or Quantity + Source (NON-UNIQUE) */}
                {formData.transfer_category && (
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    {uniqueCategories.includes(formData.transfer_category) ? (
                      // UNIQUE category: Show dropdown of item IDs
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Step 2: Select Item ID *</Label>
                        <Select 
                          value={formData.transfer_item} 
                          onValueChange={(v) => setFormData({ ...formData, transfer_item: v })}
                        >
                          <SelectTrigger className="mt-1 h-9" data-testid="transfer-item-select">
                            <SelectValue placeholder="Select specific item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items
                              .filter(item => item.category === formData.transfer_category && item.status === 'active')
                              .map((item, idx) => (
                                <SelectItem key={`${item.item_name}-${idx}`} value={item.item_name}>
                                  {item.item_name} ({formatLocation(item.current_location)})
                                </SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                        {items.filter(item => item.category === formData.transfer_category && item.status === 'active').length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">No active items found in this category</p>
                        )}
                      </div>
                    ) : (
                      // NON-UNIQUE category: Only quantity (source location selected below)
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Step 2: Quantity to Transfer *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={formData.transfer_quantity}
                          onChange={(e) => setFormData({ ...formData, transfer_quantity: parseInt(e.target.value) || 1 })}
                          className="mt-1 h-9"
                          data-testid="transfer-quantity-input"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Available at source location will be shown after selecting "From" location
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                {/* SSD Transfer Reason (only for SSD category) */}
                {formData.transfer_category === 'ssd' && formData.transfer_item && (
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <Label className="text-xs font-semibold text-blue-700">Reason for SSD Transfer *</Label>
                    <Select 
                      value={formData.ssd_transfer_reason || ''} 
                      onValueChange={(v) => setFormData({ ...formData, ssd_transfer_reason: v })}
                    >
                      <SelectTrigger className="mt-1 h-9" data-testid="ssd-transfer-reason">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssd_full">SSD Full (Mark as Ready for Offload)</SelectItem>
                        <SelectItem value="routine_return">Routine Return</SelectItem>
                        <SelectItem value="issue_damage">Issue/Damage</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {formData.ssd_transfer_reason === 'ssd_full' && (
                      <p className="text-xs text-blue-600 mt-1">
                        This SSD will be marked as "Ready for Offload" and appear in the Data Offload page.
                      </p>
                    )}
                  </div>
                )}
                
                {/* Location: From and To */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">From Type</Label>
                    <Select value={formData.from_type} onValueChange={(v) => setFormData({ ...formData, from_type: v, from_value: '' })}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">From</Label>
                    <Select value={formData.from_value} onValueChange={(v) => setFormData({ ...formData, from_value: v })}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {getLocationOptions(formData.from_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">To Type</Label>
                    <Select value={formData.to_type} onValueChange={(v) => setFormData({ ...formData, to_type: v, to_value: '' })}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">To</Label>
                    <Select value={formData.to_value} onValueChange={(v) => setFormData({ ...formData, to_value: v })}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {getLocationOptions(formData.to_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add transfer notes"
                    className="mt-1 h-16 resize-none text-sm"
                    data-testid="bulk-transfer-notes"
                  />
                </div>
              </>
            )}
            
            {dialogType === 'damage' && (
              <div>
                <Label className="text-xs">Damage Description *</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Describe the damage"
                  className="mt-1 h-20 resize-none text-sm"
                  required
                />
              </div>
            )}
            </div>
            
            <div className="flex gap-3 px-4 py-3 border-t bg-slate-50 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" data-testid="submit-btn">
                {dialogType === 'add' || dialogType === 'add-category' ? 'Create' : 
                 dialogType === 'edit' || dialogType === 'edit-category' ? 'Update' : 'Submit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
