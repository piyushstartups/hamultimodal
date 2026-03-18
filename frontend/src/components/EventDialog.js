import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
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
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';

export const EventDialog = ({ open, onClose, eventType, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [kits, setKits] = useState([]);
  const [items, setItems] = useState([]);
  const [ssds, setSsds] = useState([]);
  
  const [formData, setFormData] = useState({
    from_kit: user?.default_kit || '',
    to_kit: '',
    item_id: '',
    quantity: 1,
    activity_type: '',
    damage_type: '',
    severity: '',
    ssd_id: '',
    ssd_space_gb: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      fetchData();
      resetForm();
    }
  }, [open, user]);

  const fetchData = async () => {
    try {
      const [kitsRes, itemsRes, ssdsRes] = await Promise.all([
        api.get('/kits'),
        api.get('/items'),
        api.get('/items/ssds'),
      ]);
      setKits(kitsRes.data);
      setItems(itemsRes.data);
      setSsds(ssdsRes.data);
      if (user?.default_kit) {
        setFormData(prev => ({ ...prev, from_kit: user.default_kit }));
      }
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  const resetForm = () => {
    setFormData({
      from_kit: user?.default_kit || '',
      to_kit: '',
      item_id: '',
      quantity: 1,
      activity_type: '',
      damage_type: '',
      severity: '',
      ssd_id: '',
      ssd_space_gb: '',
      notes: '',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (eventType === 'request') {
        // Create request
        await api.post('/requests', {
          requested_by: user.id,
          from_kit: formData.from_kit,
          item_id: formData.item_id,
          quantity: formData.quantity,
          notes: formData.notes,
        });
        toast.success('Request created successfully');
      } else {
        // Create event
        await api.post('/events', {
          event_type: eventType,
          user_id: user.id,
          from_kit: formData.from_kit,
          to_kit: formData.to_kit || null,
          item_id: formData.item_id || null,
          quantity: formData.quantity,
          activity_type: formData.activity_type || null,
          damage_type: formData.damage_type || null,
          severity: formData.severity || null,
          ssd_id: formData.ssd_id || null,
          ssd_space_gb: formData.ssd_space_gb ? parseInt(formData.ssd_space_gb) : null,
          notes: formData.notes,
        });
        toast.success('Event logged successfully');
      }
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const renderFields = () => {
    switch (eventType) {
      case 'start_shift':
      case 'end_shift':
        return (
          <>
            <div>
              <Label>Kit</Label>
              <Select value={formData.from_kit} onValueChange={(val) => setFormData({ ...formData, from_kit: val })}>
                <SelectTrigger data-testid="kit-select" className="mt-2">
                  <SelectValue placeholder="Select kit" />
                </SelectTrigger>
                <SelectContent>
                  {kits.map(kit => (
                    <SelectItem key={kit.kit_id} value={kit.kit_id}>
                      {kit.kit_id} - {kit.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>SSD {eventType === 'start_shift' ? '(Which SSD are you using?)' : '(Which SSD was used?)'}</Label>
              <Select value={formData.ssd_id} onValueChange={(val) => setFormData({ ...formData, ssd_id: val })}>
                <SelectTrigger data-testid="ssd-select" className="mt-2">
                  <SelectValue placeholder="Select SSD" />
                </SelectTrigger>
                <SelectContent>
                  {ssds.map(ssd => (
                    <SelectItem key={ssd.item_id} value={ssd.item_id}>
                      {ssd.item_id} - {ssd.total_capacity_gb}GB ({ssd.current_kit || 'Unassigned'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {eventType === 'end_shift' && (
              <div>
                <Label>SSD Space Available (GB)</Label>
                <Input
                  data-testid="ssd-space-input"
                  type="number"
                  min="0"
                  value={formData.ssd_space_gb}
                  onChange={(e) => setFormData({ ...formData, ssd_space_gb: e.target.value })}
                  placeholder="e.g., 750"
                  className="mt-2"
                />
              </div>
            )}
          </>
        );

      case 'activity':
        return (
          <>
            <div>
              <Label>Kit</Label>
              <Select value={formData.from_kit} onValueChange={(val) => setFormData({ ...formData, from_kit: val })}>
                <SelectTrigger data-testid="kit-select" className="mt-2">
                  <SelectValue placeholder="Select kit" />
                </SelectTrigger>
                <SelectContent>
                  {kits.map(kit => (
                    <SelectItem key={kit.kit_id} value={kit.kit_id}>
                      {kit.kit_id} - {kit.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Activity Type</Label>
              <Select value={formData.activity_type} onValueChange={(val) => setFormData({ ...formData, activity_type: val })}>
                <SelectTrigger data-testid="activity-type-select" className="mt-2">
                  <SelectValue placeholder="Select activity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cooking">Cooking</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="charging">Charging</SelectItem>
                  <SelectItem value="idle">Idle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );

      case 'transfer':
        return (
          <>
            <div>
              <Label>From Kit</Label>
              <Select value={formData.from_kit} onValueChange={(val) => setFormData({ ...formData, from_kit: val })}>
                <SelectTrigger data-testid="from-kit-select" className="mt-2">
                  <SelectValue placeholder="Select source kit" />
                </SelectTrigger>
                <SelectContent>
                  {kits.map(kit => (
                    <SelectItem key={kit.kit_id} value={kit.kit_id}>
                      {kit.kit_id} - {kit.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Kit</Label>
              <Select value={formData.to_kit} onValueChange={(val) => setFormData({ ...formData, to_kit: val })}>
                <SelectTrigger data-testid="to-kit-select" className="mt-2">
                  <SelectValue placeholder="Select destination kit" />
                </SelectTrigger>
                <SelectContent>
                  {kits.map(kit => (
                    <SelectItem key={kit.kit_id} value={kit.kit_id}>
                      {kit.kit_id} - {kit.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item</Label>
              <Select value={formData.item_id} onValueChange={(val) => setFormData({ ...formData, item_id: val })}>
                <SelectTrigger data-testid="item-select" className="mt-2">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.item_id} value={item.item_id}>
                      {item.item_id} - {item.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                data-testid="quantity-input"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                className="mt-2"
              />
            </div>
          </>
        );

      case 'damage':
        return (
          <>
            <div>
              <Label>Kit</Label>
              <Select value={formData.from_kit} onValueChange={(val) => setFormData({ ...formData, from_kit: val })}>
                <SelectTrigger data-testid="kit-select" className="mt-2">
                  <SelectValue placeholder="Select kit" />
                </SelectTrigger>
                <SelectContent>
                  {kits.map(kit => (
                    <SelectItem key={kit.kit_id} value={kit.kit_id}>
                      {kit.kit_id} - {kit.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item</Label>
              <Select value={formData.item_id} onValueChange={(val) => setFormData({ ...formData, item_id: val })}>
                <SelectTrigger data-testid="item-select" className="mt-2">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.item_id} value={item.item_id}>
                      {item.item_id} - {item.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={formData.severity} onValueChange={(val) => setFormData({ ...formData, severity: val })}>
                <SelectTrigger data-testid="severity-select" className="mt-2">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Damage Description</Label>
              <Input
                data-testid="damage-description-input"
                value={formData.damage_type}
                onChange={(e) => setFormData({ ...formData, damage_type: e.target.value })}
                placeholder="e.g., Screen cracked, Battery not charging"
                className="mt-2"
              />
            </div>
          </>
        );

      case 'request':
        return (
          <>
            <div>
              <Label>From Kit</Label>
              <Select value={formData.from_kit} onValueChange={(val) => setFormData({ ...formData, from_kit: val })}>
                <SelectTrigger data-testid="from-kit-select" className="mt-2">
                  <SelectValue placeholder="Select kit" />
                </SelectTrigger>
                <SelectContent>
                  {kits.map(kit => (
                    <SelectItem key={kit.kit_id} value={kit.kit_id}>
                      {kit.kit_id} - {kit.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item</Label>
              <Select value={formData.item_id} onValueChange={(val) => setFormData({ ...formData, item_id: val })}>
                <SelectTrigger data-testid="item-select" className="mt-2">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.item_id} value={item.item_id}>
                      {item.item_id} - {item.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                data-testid="quantity-input"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                className="mt-2"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const getTitle = () => {
    const titles = {
      start_shift: 'Start Shift',
      end_shift: 'End Shift',
      activity: 'Add Activity',
      transfer: 'Transfer Item',
      damage: 'Report Damage',
      request: 'Create Request',
    };
    return titles[eventType] || 'Event';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-tactical text-xl">{getTitle()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {renderFields()}
          
          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              data-testid="notes-input"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add any additional notes..."
              className="mt-2"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              data-testid="cancel-button"
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              data-testid="submit-button"
              type="submit"
              className="flex-1 bg-slate-900 hover:bg-slate-800"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EventDialog;
