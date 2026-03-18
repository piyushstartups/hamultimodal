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
import { ArrowLeft, ArrowRightLeft, AlertTriangle, FileText } from 'lucide-react';

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
    setLoading(true);

    try {
      if (actionType === 'request') {
        await api.post('/requests', {
          item: formData.item,
          quantity: formData.quantity,
          notes: formData.notes
        });
        toast.success('Request submitted');
      } else if (actionType === 'transfer') {
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
        toast.success('Damage reported');
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
      case 'request': return 'Request Item';
      default: return 'Action';
    }
  };

  const renderForm = () => {
    switch (actionType) {
      case 'transfer':
        return (
          <>
            <div>
              <Label>Item *</Label>
              <Select value={formData.item} onValueChange={(v) => setFormData({ ...formData, item: v })}>
                <SelectTrigger className="mt-1" data-testid="item-select"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {items.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)}
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
                <Label>From *</Label>
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
                <Label>To *</Label>
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
                placeholder="Add notes about this transfer"
                className="mt-1"
              />
            </div>
          </>
        );

      case 'damage':
        return (
          <>
            <div>
              <Label>Item *</Label>
              <Select value={formData.item} onValueChange={(v) => setFormData({ ...formData, item: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {items.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)}
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
          </>
        );

      case 'request':
        return (
          <>
            <div>
              <Label>Item *</Label>
              <Select value={formData.item} onValueChange={(v) => setFormData({ ...formData, item: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {items.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
            <div>
              <Label>Reason</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Why do you need this item?"
                className="mt-1"
              />
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
            <h1 className="text-lg font-bold text-slate-900">Quick Actions</h1>
            <p className="text-sm text-slate-600">Transfer, damage & requests</p>
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
          onClick={() => openAction('request')}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white h-16 text-lg justify-start px-6"
          data-testid="action-request"
        >
          <FileText className="w-6 h-6 mr-4" />
          Request Item
        </Button>
        
        <p className="text-sm text-slate-500 text-center pt-4">
          To start a collection shift, go to <strong>Deployments</strong> and select your assigned BnB
        </p>
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
              <Button type="submit" className="flex-1" disabled={loading} data-testid="submit-btn">
                {loading ? 'Saving...' : 'Submit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
