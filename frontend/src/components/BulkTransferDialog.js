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
import { CheckCircle, Circle } from 'lucide-react';

export const BulkTransferDialog = ({ open, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [kits, setKits] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  
  const [formData, setFormData] = useState({
    from_kit: user?.default_kit || '',
    to_kit: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      fetchData();
      setSelectedItems([]);
    }
  }, [open, user]);

  const fetchData = async () => {
    try {
      const [kitsRes, itemsRes] = await Promise.all([
        api.get('/kits'),
        api.get('/items'),
      ]);
      setKits(kitsRes.data);
      setItems(itemsRes.data);
      if (user?.default_kit) {
        setFormData(prev => ({ ...prev, from_kit: user.default_kit }));
      }
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  const getAvailableItems = () => {
    if (!formData.from_kit) return [];
    return items.filter(item => 
      item.current_kit === formData.from_kit && 
      item.tracking_type === 'individual' &&
      item.status === 'active'
    );
  };

  const toggleItemSelection = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectAll = () => {
    const availableItems = getAvailableItems();
    setSelectedItems(availableItems.map(item => item.item_id));
  };

  const deselectAll = () => {
    setSelectedItems([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedItems.length === 0) {
      toast.error('Please select at least one item to transfer');
      return;
    }
    
    setLoading(true);
    try {
      await api.post('/events/bulk-transfer', {
        item_ids: selectedItems,
        from_kit: formData.from_kit,
        to_kit: formData.to_kit,
        notes: formData.notes
      });
      
      toast.success(`${selectedItems.length} items transferred successfully`);
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Bulk transfer failed');
    } finally {
      setLoading(false);
    }
  };

  const availableItems = getAvailableItems();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-tactical text-xl">Bulk Transfer Items</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label>From Kit</Label>
            <Select 
              value={formData.from_kit} 
              onValueChange={(val) => {
                setFormData({ ...formData, from_kit: val });
                setSelectedItems([]);
              }}
            >
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
                {kits.filter(k => k.kit_id !== formData.from_kit).map(kit => (
                  <SelectItem key={kit.kit_id} value={kit.kit_id}>
                    {kit.kit_id} - {kit.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.from_kit && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Select Items ({selectedItems.length} of {availableItems.length})</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={selectAll}
                    className="text-xs"
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={deselectAll}
                    className="text-xs"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              
              <div className="border border-slate-200 rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                {availableItems.length > 0 ? (
                  availableItems.map(item => (
                    <div
                      key={item.item_id}
                      onClick={() => toggleItemSelection(item.item_id)}
                      className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer transition-colors"
                    >
                      {selectedItems.includes(item.item_id) ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-data font-medium text-slate-900">{item.item_id}</p>
                        <p className="text-xs text-slate-600">{item.item_name}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">No items available in this kit</p>
                )}
              </div>
            </div>
          )}

          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              data-testid="notes-input"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add any notes about this bulk transfer..."
              className="mt-2"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              data-testid="submit-bulk-transfer-btn"
              type="submit"
              className="flex-1 bg-slate-900 hover:bg-slate-800"
              disabled={loading || selectedItems.length === 0}
            >
              {loading ? 'Transferring...' : `Transfer ${selectedItems.length} Item${selectedItems.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BulkTransferDialog;
