import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
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
import { ArrowLeft, ArrowRightLeft, AlertTriangle, XCircle } from 'lucide-react';

// Master category list (same as Inventory.js - SINGLE SOURCE OF TRUTH)
const ITEM_CATEGORIES = [
  { value: 'glove_left', label: 'Glove Left' },
  { value: 'glove_right', label: 'Glove Right' },
  { value: 'usb_hub', label: 'USB Hub' },
  { value: 'imu', label: 'IMUs' },
  { value: 'head_camera', label: 'Head Camera' },
  { value: 'l_shaped_wire', label: 'L-Shaped Wire' },
  { value: 'wrist_camera', label: 'Wrist Camera' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'laptop_charger', label: 'Laptop Charger' },
  { value: 'power_bank', label: 'Power Bank' },
  { value: 'ssd', label: 'SSD' },
  { value: 'bluetooth_adapter', label: 'Bluetooth Adapter' },
];

// Categories with UNIQUE items (require Item Code / ID)
const UNIQUE_CATEGORIES = ['glove_left', 'glove_right', 'head_camera', 'wrist_camera', 'laptop', 'power_bank', 'ssd'];

// Categories with NON-UNIQUE items (quantity-based)
const NON_UNIQUE_CATEGORIES = ['usb_hub', 'imu', 'l_shaped_wire', 'laptop_charger', 'bluetooth_adapter'];

const LOCATION_TYPES = [
  { prefix: 'kit', label: 'Kit' },
  { prefix: 'bnb', label: 'BnB' },
  { prefix: 'station', label: 'Station' },
];

export default function QuickActions() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [items, setItems] = useState([]);
  const [kits, setKits] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    item: '',
    category: '',  // NEW: Category selection for two-step flow
    from_type: 'kit',
    from_value: '',
    to_type: 'kit',
    to_value: '',
    quantity: 1,
    notes: ''
  });

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      const [itemsRes, kitsRes, bnbsRes] = await Promise.all([
        api.get('/items'),
        api.get('/kits'),
        api.get('/bnbs')
      ]);
      setItems(itemsRes.data);
      setKits(kitsRes.data);
      setBnbs(bnbsRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  const openAction = (type) => {
    setActionType(type);
    setFormData({
      item: '',
      category: '',  // Reset category for two-step flow
      from_type: 'kit',
      from_value: '',
      to_type: 'kit',
      to_value: '',
      quantity: 1,
      notes: ''
    });
    setDialogOpen(true);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.item) {
      toast.error('Please select an item');
      return;
    }
    
    setLoading(true);

    try {
      if (actionType === 'transfer') {
        if (!formData.from_value || !formData.to_value) {
          toast.error('Please select from and to locations');
          setLoading(false);
          return;
        }
        
        const from_location = `${formData.from_type}:${formData.from_value}`;
        const to_location = `${formData.to_type}:${formData.to_value}`;
        
        await api.post('/events', {
          event_type: 'transfer',
          item: formData.item,
          from_location,
          to_location,
          quantity: formData.quantity,
          notes: formData.notes || null
        });
        toast.success('Transfer recorded');
        
      } else if (actionType === 'damage') {
        await api.post('/events', {
          event_type: 'damage',
          item: formData.item,
          from_location: formData.from_value ? `${formData.from_type}:${formData.from_value}` : null,
          quantity: 1,
          notes: formData.notes || null
        });
        toast.success('Damage reported - item marked as damaged');
        
      } else if (actionType === 'lost') {
        if (!formData.from_value) {
          toast.error('Please select where the item was lost');
          setLoading(false);
          return;
        }
        
        const from_location = `${formData.from_type}:${formData.from_value}`;
        
        await api.post('/events', {
          event_type: 'lost',
          item: formData.item,
          from_location,
          quantity: formData.quantity,
          notes: formData.notes || null
        });
        toast.success('Lost item reported - inventory updated');
      }
      
      setDialogOpen(false);
      fetchOptions(); // Refresh items
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const getDialogTitle = () => {
    switch (actionType) {
      case 'transfer': return 'Transfer Item';
      case 'damage': return 'Report Damage';
      case 'lost': return 'Report Lost Item';
      default: return 'Action';
    }
  };

  const renderForm = () => {
    if (actionType === 'transfer') {
      // Get items filtered by selected category
      const categoryItems = formData.category 
        ? items.filter(i => i.category === formData.category && i.status === 'active')
        : [];
      
      const isUniqueCategory = UNIQUE_CATEGORIES.includes(formData.category);
      
      // Helper to format location for display
      const formatLocation = (location) => {
        if (!location) return 'Hub';
        if (location.includes(':')) {
          const [type, value] = location.split(':');
          return `${type.charAt(0).toUpperCase() + type.slice(1)}: ${value}`;
        }
        return location;
      };
      
      return (
        <>
          {/* STEP 1: Select Category */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Step 1: Select Category *</Label>
            <Select 
              value={formData.category} 
              onValueChange={(v) => setFormData({ ...formData, category: v, item: '', quantity: 1 })}
            >
              <SelectTrigger className="mt-1" data-testid="transfer-category-select">
                <SelectValue placeholder="Select item category" />
              </SelectTrigger>
              <SelectContent>
                {ITEM_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* STEP 2: Select Item (conditional based on category type) */}
          {formData.category && (
            <div className="bg-slate-50 p-3 rounded-lg border">
              {isUniqueCategory ? (
                // UNIQUE category: Show dropdown of specific item IDs
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Step 2: Select Item ID *</Label>
                  <Select 
                    value={formData.item} 
                    onValueChange={(v) => setFormData({ ...formData, item: v })}
                  >
                    <SelectTrigger className="mt-1" data-testid="transfer-item-select">
                      <SelectValue placeholder="Select specific item" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryItems.map((item, idx) => (
                        <SelectItem key={`${item.item_name}-${idx}`} value={item.item_name}>
                          {item.item_name} ({formatLocation(item.current_location)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {categoryItems.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No active items found in this category</p>
                  )}
                </div>
              ) : (
                // NON-UNIQUE category: Show item + quantity input
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Step 2: Select Item *</Label>
                    <Select 
                      value={formData.item} 
                      onValueChange={(v) => setFormData({ ...formData, item: v })}
                    >
                      <SelectTrigger className="mt-1" data-testid="transfer-item-select">
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryItems.map((item, idx) => (
                          <SelectItem key={`${item.item_name}-${idx}`} value={item.item_name}>
                            {item.item_name} - Qty: {item.quantity || 1} ({formatLocation(item.current_location)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Quantity to Transfer</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                      className="mt-1"
                      data-testid="transfer-quantity-input"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Location: From and To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">From Type</Label>
              <Select value={formData.from_type} onValueChange={(v) => setFormData({ ...formData, from_type: v, from_value: '' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">From *</Label>
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
              <Label className="text-xs">To Type</Label>
              <Select value={formData.to_type} onValueChange={(v) => setFormData({ ...formData, to_type: v, to_value: '' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">To *</Label>
              <Select value={formData.to_value} onValueChange={(v) => setFormData({ ...formData, to_value: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
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
              className="mt-1"
            />
          </div>
        </>
      );
    }

    if (actionType === 'damage') {
      return (
        <>
          <div>
            <Label>Item *</Label>
            <Select value={formData.item} onValueChange={(v) => setFormData({ ...formData, item: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {items.filter(i => i.status === 'active').map(i => (
                  <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Location Type</Label>
              <Select value={formData.from_type} onValueChange={(v) => setFormData({ ...formData, from_type: v, from_value: '' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={formData.from_value} onValueChange={(v) => setFormData({ ...formData, from_value: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {getLocationOptions(formData.from_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label>Description *</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Describe the damage"
              className="mt-1"
              required
            />
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            This will mark the item as "damaged" in inventory.
          </div>
        </>
      );
    }

    if (actionType === 'lost') {
      const selectedItem = items.find(i => i.item_name === formData.item);
      const isQuantityItem = selectedItem?.tracking_type === 'quantity';
      
      return (
        <>
          <div>
            <Label>Item *</Label>
            <Select value={formData.item} onValueChange={(v) => setFormData({ ...formData, item: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {items.filter(i => i.status !== 'lost').map(i => (
                  <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {isQuantityItem && (
            <div>
              <Label>Quantity Lost</Label>
              <Input
                type="number"
                min="1"
                max={selectedItem?.quantity || 100}
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">Current stock: {selectedItem?.quantity || 0}</p>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lost From (Type) *</Label>
              <Select value={formData.from_type} onValueChange={(v) => setFormData({ ...formData, from_type: v, from_value: '' })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map(t => <SelectItem key={t.prefix} value={t.prefix}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location *</Label>
              <Select value={formData.from_value} onValueChange={(v) => setFormData({ ...formData, from_value: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {getLocationOptions(formData.from_type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="How was it lost? Any details..."
              className="mt-1"
            />
          </div>
          
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            {isQuantityItem 
              ? `This will reduce the item quantity by ${formData.quantity}.`
              : 'This will mark the item as "lost" in inventory.'
            }
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
            <h1 className="text-lg font-bold text-slate-900">Quick Actions</h1>
            <p className="text-sm text-slate-600">Inventory actions</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Button
          onClick={() => openAction('transfer')}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white h-16 text-lg justify-start px-6"
          data-testid="action-transfer"
        >
          <ArrowRightLeft className="w-6 h-6 mr-4" />
          Transfer Item
        </Button>
        
        <Button
          onClick={() => openAction('damage')}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white h-16 text-lg justify-start px-6"
          data-testid="action-damage"
        >
          <AlertTriangle className="w-6 h-6 mr-4" />
          Report Damage
        </Button>
        
        <Button
          onClick={() => openAction('lost')}
          className="w-full bg-red-500 hover:bg-red-600 text-white h-16 text-lg justify-start px-6"
          data-testid="action-lost"
        >
          <XCircle className="w-6 h-6 mr-4" />
          Report Lost Item
        </Button>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
          <p className="text-sm text-blue-800">
            <strong>To start a collection shift:</strong> Go to <a href="/deployments" className="underline font-medium">Deployments</a> → select your date → click your BnB → use kit controls
          </p>
        </div>
      </main>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {renderForm()}
            </div>
            <div className="flex gap-3 px-4 py-3 border-t bg-slate-50 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button 
                type="submit" 
                className={`flex-1 ${actionType === 'lost' ? 'bg-red-500 hover:bg-red-600' : ''}`}
                disabled={loading} 
                data-testid="submit-btn"
              >
                {loading ? 'Saving...' : 'Submit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
