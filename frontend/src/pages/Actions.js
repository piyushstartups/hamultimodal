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
import { ArrowLeft, Play, Square, ArrowRightLeft, AlertTriangle, FileText } from 'lucide-react';

export default function Actions() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [kits, setKits] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    kit: '',
    item: '',
    to_kit: '',
    quantity: 1,
    data_collected: '',
    notes: ''
  });

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      const [kitsRes, itemsRes] = await Promise.all([
        api.get('/kits'),
        api.get('/items')
      ]);
      setKits(kitsRes.data);
      setItems(itemsRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  const openAction = (type) => {
    setActionType(type);
    setFormData({ kit: '', item: '', to_kit: '', quantity: 1, data_collected: '', notes: '' });
    setDialogOpen(true);
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
      } else {
        await api.post('/events', {
          event_type: actionType,
          kit: formData.kit,
          item: formData.item || null,
          to_kit: formData.to_kit || null,
          quantity: formData.quantity,
          data_collected: formData.data_collected ? parseFloat(formData.data_collected) : null,
          notes: formData.notes || null
        });
        toast.success('Event logged');
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const actions = [
    { type: 'shift_start', label: 'Start Shift', icon: Play, color: 'bg-green-500 hover:bg-green-600' },
    { type: 'shift_end', label: 'End Shift', icon: Square, color: 'bg-red-500 hover:bg-red-600' },
    { type: 'transfer', label: 'Transfer Item', icon: ArrowRightLeft, color: 'bg-blue-500 hover:bg-blue-600' },
    { type: 'damage', label: 'Report Damage', icon: AlertTriangle, color: 'bg-amber-500 hover:bg-amber-600' },
    { type: 'request', label: 'Request Item', icon: FileText, color: 'bg-purple-500 hover:bg-purple-600' },
  ];

  const getDialogTitle = () => {
    switch (actionType) {
      case 'shift_start': return 'Start Shift';
      case 'shift_end': return 'End Shift';
      case 'transfer': return 'Transfer Item';
      case 'damage': return 'Report Damage';
      case 'request': return 'Request Item';
      default: return 'Action';
    }
  };

  const renderForm = () => {
    switch (actionType) {
      case 'shift_start':
        return (
          <>
            <div>
              <Label>Kit *</Label>
              <Select value={formData.kit} onValueChange={(v) => setFormData({ ...formData, kit: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select kit" /></SelectTrigger>
                <SelectContent>
                  {kits.map(k => <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        );

      case 'shift_end':
        return (
          <>
            <div>
              <Label>Kit *</Label>
              <Select value={formData.kit} onValueChange={(v) => setFormData({ ...formData, kit: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select kit" /></SelectTrigger>
                <SelectContent>
                  {kits.map(k => <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data Collected (GB)</Label>
              <Input
                type="number"
                value={formData.data_collected}
                onChange={(e) => setFormData({ ...formData, data_collected: e.target.value })}
                placeholder="e.g., 150"
                className="mt-1"
              />
            </div>
          </>
        );

      case 'transfer':
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
              <Label>From Kit *</Label>
              <Select value={formData.kit} onValueChange={(v) => setFormData({ ...formData, kit: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select kit" /></SelectTrigger>
                <SelectContent>
                  {kits.map(k => <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Kit *</Label>
              <Select value={formData.to_kit} onValueChange={(v) => setFormData({ ...formData, to_kit: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select kit" /></SelectTrigger>
                <SelectContent>
                  {kits.map(k => <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <div>
              <Label>Kit</Label>
              <Select value={formData.kit} onValueChange={(v) => setFormData({ ...formData, kit: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select kit" /></SelectTrigger>
                <SelectContent>
                  {kits.map(k => <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Describe the damage"
                className="mt-1"
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
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Why do you need this?"
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
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </a>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Actions</h1>
            <p className="text-sm text-slate-600">Log shifts and events</p>
          </div>
        </div>
      </header>

      {/* Action Buttons */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-3">
          {actions.map((action) => (
            <Button
              key={action.type}
              onClick={() => openAction(action.type)}
              className={`${action.color} text-white h-16 text-lg justify-start px-6`}
            >
              <action.icon className="w-6 h-6 mr-4" />
              {action.label}
            </Button>
          ))}
        </div>
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
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? 'Saving...' : 'Submit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
