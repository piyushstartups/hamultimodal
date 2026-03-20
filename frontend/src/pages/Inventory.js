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
  Warehouse, Box, MapPin, History, Clock, Grid3X3
} from 'lucide-react';

const CATEGORIES = [
  { value: 'ssd', label: 'SSDs' },
  { value: 'camera', label: 'Cameras' },
  { value: 'imu', label: 'IMUs' },
  { value: 'gloves', label: 'Gloves' },
  { value: 'tools', label: 'Tools' },
  { value: 'general', label: 'General' },
];

const LOCATION_TYPES = [
  { prefix: 'kit', label: 'Kit' },
  { prefix: 'bnb', label: 'BnB' },
  { prefix: 'station', label: 'Station/Hub' },
];

const TABS = [
  { id: 'distribution', label: 'Distribution', icon: Grid3X3 },
  { id: 'hub', label: 'Hub', icon: Warehouse },
  { id: 'kits', label: 'Kit-wise', icon: Box },
  { id: 'bnbs', label: 'BnB-level', icon: MapPin },
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
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('');
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
      const [itemsRes, kitsRes, bnbsRes, eventsRes, distRes] = await Promise.all([
        api.get('/items'),
        api.get('/kits'),
        api.get('/bnbs'),
        api.get('/events?event_type=transfer'),
        api.get('/items/distribution')
      ]);
      setItems(itemsRes.data);
      setKits(kitsRes.data);
      setBnbs(bnbsRes.data);
      setEvents(eventsRes.data.slice(0, 50)); // Last 50 movements
      setDistribution(distRes.data);
      
      // Auto-expand first sections
      const sections = {};
      CATEGORIES.forEach(c => { sections[`hub-${c.value}`] = true; });
      kitsRes.data.forEach(k => { sections[`kit-${k.kit_id}`] = true; });
      setExpandedSections(sections);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
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
    return CATEGORIES.reduce((acc, cat) => {
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
        
        // For bulk transfer, item is selected from form; for transfer, it's the editingItem
        const itemName = dialogType === 'bulk-transfer' ? formData.item_name : editingItem.item_name;
        
        if (!itemName) {
          toast.error('Please select an item');
          return;
        }
        
        await api.post('/events', {
          event_type: 'transfer',
          item: itemName,
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
    
    return CATEGORIES.map(cat => {
      const categoryItems = grouped[cat.value] || [];
      if (categoryItems.length === 0) return null;
      
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
              <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{categoryItems.length}</span>
            </div>
          </button>
          {isExpanded && (
            <div className="bg-white divide-y border-t">
              {categoryItems.map(item => renderItemRow(item))}
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
              <Button size="sm" variant="outline" onClick={() => { setDialogType('bulk-transfer'); setDialogOpen(true); }} data-testid="transfer-item-btn">
                <ArrowRightLeft className="w-4 h-4 mr-1" />
                Transfer Item
              </Button>
              <Button size="sm" onClick={openAddDialog} data-testid="add-item-btn">
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
          )}
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
                            const catLabel = CATEGORIES.find(c => c.value === cat)?.label || cat;
                            
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

            {/* HUB INVENTORY TAB */}
            {activeTab === 'hub' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Warehouse className="w-5 h-5" />
                  <h2 className="font-semibold">Hub / Station Inventory</h2>
                  <span className="text-sm text-slate-500">({getHubItems().length} items)</span>
                </div>
                
                {getHubItems().length === 0 ? (
                  <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                    No items at hub/station
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    {renderCategorySection(getHubItems(), 'hub')}
                  </div>
                )}
              </div>
            )}

            {/* KIT-WISE INVENTORY TAB */}
            {activeTab === 'kits' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Box className="w-5 h-5" />
                  <h2 className="font-semibold">Kit-wise Inventory</h2>
                </div>
                
                {kits.length === 0 ? (
                  <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                    No kits configured
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {kits.map(kit => {
                      const kitItems = getKitItems(kit.kit_id);
                      const sectionKey = `kit-${kit.kit_id}`;
                      const isExpanded = expandedSections[sectionKey] !== false;
                      
                      return (
                        <div key={kit.kit_id} className="bg-white rounded-xl border overflow-hidden" data-testid={`kit-inventory-${kit.kit_id}`}>
                          <button
                            onClick={() => toggleSection(sectionKey)}
                            className="w-full px-4 py-3 flex items-center justify-between bg-slate-900 text-white hover:bg-slate-800"
                          >
                            <div className="flex items-center gap-3">
                              <Box className="w-5 h-5" />
                              <span className="font-bold">{kit.kit_id}</span>
                              <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{kitItems.length} items</span>
                            </div>
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </button>
                          
                          {isExpanded && (
                            <div>
                              {kitItems.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm">No items in this kit</div>
                              ) : (
                                <div className="divide-y">
                                  {kitItems.map(item => renderItemRow(item))}
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

            {/* BNB-LEVEL INVENTORY TAB */}
            {activeTab === 'bnbs' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin className="w-5 h-5" />
                  <h2 className="font-semibold">BnB-level Inventory</h2>
                </div>
                
                {bnbs.length === 0 ? (
                  <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                    No BnBs configured
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {bnbs.map(bnb => {
                      const bnbItems = getBnbItems(bnb.name);
                      const sectionKey = `bnb-${bnb.name}`;
                      const isExpanded = expandedSections[sectionKey] !== false;
                      
                      return (
                        <div key={bnb.name} className="bg-white rounded-xl border overflow-hidden" data-testid={`bnb-inventory-${bnb.name}`}>
                          <button
                            onClick={() => toggleSection(sectionKey)}
                            className="w-full px-4 py-3 flex items-center justify-between bg-blue-600 text-white hover:bg-blue-700"
                          >
                            <div className="flex items-center gap-3">
                              <MapPin className="w-5 h-5" />
                              <span className="font-bold">{bnb.name}</span>
                              <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{bnbItems.length} items</span>
                            </div>
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </button>
                          
                          {isExpanded && (
                            <div>
                              {bnbItems.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm">No items at this BnB</div>
                              ) : (
                                <div className="divide-y">
                                  {bnbItems.map(item => renderItemRow(item))}
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
                            <p className="mt-0.5">by {evt.user_name}</p>
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
                {isAdmin && !search && (
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogType === 'add' ? 'Add Item' : 
               dialogType === 'edit' ? 'Edit Item' : 
               dialogType === 'transfer' ? `Transfer: ${editingItem?.item_name}` : 
               dialogType === 'bulk-transfer' ? 'Transfer Item' :
               `Report Damage: ${editingItem?.item_name}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {(dialogType === 'add' || dialogType === 'edit') && (
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
            )}
            
            {dialogType === 'transfer' && (
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
            )}
            
            {/* BULK TRANSFER DIALOG - Admin can select any item */}
            {dialogType === 'bulk-transfer' && (
              <>
                <div>
                  <Label>Select Item *</Label>
                  <Select value={formData.item_name} onValueChange={(v) => setFormData({ ...formData, item_name: v })}>
                    <SelectTrigger className="mt-1" data-testid="bulk-transfer-item-select"><SelectValue placeholder="Select an item" /></SelectTrigger>
                    <SelectContent>
                      {items.map((item, idx) => <SelectItem key={`${item.item_name}-${idx}`} value={item.item_name}>{item.item_name} ({item.current_location})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
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
                    data-testid="bulk-transfer-notes"
                  />
                </div>
              </>
            )}
            
            {dialogType === 'damage' && (
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
            )}
            
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
