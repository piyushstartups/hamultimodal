import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export const EventDialog = ({ open, onClose, eventType, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [kits, setKits] = useState([]);
  const [filteredKits, setFilteredKits] = useState([]);
  const [items, setItems] = useState([]);
  const [ssds, setSsds] = useState([]);
  const [filteredSsds, setFilteredSsds] = useState([]);
  
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
    // Enhanced shift logging fields
    hours_recorded: '',
    data_category: '',
    issues_faced: '',
    // Inventory health checklist
    left_glove_status: 'ok',
    right_glove_status: 'ok',
    head_cam_status: 'ok',
  });

  useEffect(() => {
    if (open) {
      fetchData();
      resetForm();
    }
  }, [open, user]);

  // Filter kits based on user's assigned BnB (for deployers/station workers)
  useEffect(() => {
    if (user?.assigned_bnb && (user?.role === 'deployer' || user?.role === 'station')) {
      // Filter to only show kits assigned to user's BnB
      const userBnbKits = kits.filter(kit => 
        kit.assigned_bnb === user.assigned_bnb || kit.kit_id === user.assigned_bnb
      );
      setFilteredKits(userBnbKits);
      
      // Filter SSDs to those in user's BnB's kits
      const bnbKitIds = userBnbKits.map(k => k.kit_id);
      bnbKitIds.push(user.assigned_bnb); // Include the BnB itself
      const userSsds = ssds.filter(ssd => bnbKitIds.includes(ssd.current_kit));
      setFilteredSsds(userSsds);
    } else {
      // Admins/supervisors see all kits
      setFilteredKits(kits);
      setFilteredSsds(ssds);
    }
  }, [kits, ssds, user]);

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
      hours_recorded: '',
      data_category: '',
      issues_faced: '',
      left_glove_status: 'ok',
      right_glove_status: 'ok',
      head_cam_status: 'ok',
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
        // Build notes with enhanced data for end_shift
        let enhancedNotes = formData.notes || '';
        if (eventType === 'end_shift') {
          const shiftData = [];
          if (formData.hours_recorded) shiftData.push(`Hours: ${formData.hours_recorded}`);
          if (formData.data_category) shiftData.push(`Category: ${formData.data_category}`);
          if (formData.issues_faced) shiftData.push(`Issues: ${formData.issues_faced}`);
          
          // Inventory health
          const healthIssues = [];
          if (formData.left_glove_status !== 'ok') healthIssues.push(`Left Glove: ${formData.left_glove_status}`);
          if (formData.right_glove_status !== 'ok') healthIssues.push(`Right Glove: ${formData.right_glove_status}`);
          if (formData.head_cam_status !== 'ok') healthIssues.push(`Head Cam: ${formData.head_cam_status}`);
          
          if (healthIssues.length > 0) {
            shiftData.push(`Inventory Issues: ${healthIssues.join(', ')}`);
          }
          
          if (shiftData.length > 0) {
            enhancedNotes = shiftData.join(' | ') + (enhancedNotes ? ` | Notes: ${enhancedNotes}` : '');
          }
        }

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
          notes: enhancedNotes,
          // Extended fields for shift logging
          hours_recorded: formData.hours_recorded ? parseFloat(formData.hours_recorded) : null,
          data_category: formData.data_category || null,
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

  // Helper to get display kits (filtered for deployers, all for admins)
  const displayKits = filteredKits.length > 0 ? filteredKits : kits;
  const displaySsds = filteredSsds.length > 0 ? filteredSsds : ssds;

  const renderFields = () => {
    switch (eventType) {
      case 'start_shift':
        return (
          <>
            <div>
              <Label>Kit {user?.assigned_bnb && <span className="text-xs text-slate-500">(Your BnB: {user.assigned_bnb})</span>}</Label>
              <Select value={formData.from_kit} onValueChange={(val) => setFormData({ ...formData, from_kit: val })}>
                <SelectTrigger data-testid="kit-select" className="mt-2">
                  <SelectValue placeholder="Select kit" />
                </SelectTrigger>
                <SelectContent>
                  {displayKits.filter(k => k.type === 'kit').map(kit => (
                    <SelectItem key={kit.kit_id} value={kit.kit_id}>
                      {kit.kit_id} {kit.assigned_bnb && `@ ${kit.assigned_bnb}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>SSD (Which SSD are you using?)</Label>
              <Select value={formData.ssd_id} onValueChange={(val) => setFormData({ ...formData, ssd_id: val })}>
                <SelectTrigger data-testid="ssd-select" className="mt-2">
                  <SelectValue placeholder="Select SSD" />
                </SelectTrigger>
                <SelectContent>
                  {displaySsds.map(ssd => (
                    <SelectItem key={ssd.item_id} value={ssd.item_id}>
                      {ssd.item_id} - {ssd.total_capacity_gb}GB ({ssd.current_kit || 'Unassigned'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        );

      case 'end_shift':
        return (
          <>
            <div>
              <Label>Kit {user?.assigned_bnb && <span className="text-xs text-slate-500">(Your BnB: {user.assigned_bnb})</span>}</Label>
              <Select value={formData.from_kit} onValueChange={(val) => setFormData({ ...formData, from_kit: val })}>
                <SelectTrigger data-testid="kit-select" className="mt-2">
                  <SelectValue placeholder="Select kit" />
                </SelectTrigger>
                <SelectContent>
                  {displayKits.filter(k => k.type === 'kit').map(kit => (
                    <SelectItem key={kit.kit_id} value={kit.kit_id}>
                      {kit.kit_id} {kit.assigned_bnb && `@ ${kit.assigned_bnb}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Shift Data Section */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-semibold text-sm mb-3 text-slate-700">Shift Data</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Hours Recorded *</Label>
                  <Input
                    data-testid="hours-input"
                    type="number"
                    step="0.5"
                    min="0"
                    max="12"
                    value={formData.hours_recorded}
                    onChange={(e) => setFormData({ ...formData, hours_recorded: e.target.value })}
                    placeholder="e.g., 4.5"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label>Data Category</Label>
                  <Select value={formData.data_category} onValueChange={(val) => setFormData({ ...formData, data_category: val })}>
                    <SelectTrigger data-testid="category-select" className="mt-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cooking">Cooking</SelectItem>
                      <SelectItem value="cleaning">Cleaning</SelectItem>
                      <SelectItem value="organizing">Organizing</SelectItem>
                      <SelectItem value="mixed">Mixed Activities</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* SSD Section */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-semibold text-sm mb-3 text-slate-700">SSD Tracking</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>SSD Used</Label>
                  <Select value={formData.ssd_id} onValueChange={(val) => setFormData({ ...formData, ssd_id: val })}>
                    <SelectTrigger data-testid="ssd-select" className="mt-1">
                      <SelectValue placeholder="Select SSD" />
                    </SelectTrigger>
                    <SelectContent>
                      {displaySsds.map(ssd => (
                        <SelectItem key={ssd.item_id} value={ssd.item_id}>
                          {ssd.item_id} ({ssd.total_capacity_gb}GB)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Space Available (GB) *</Label>
                  <Input
                    data-testid="ssd-space-input"
                    type="number"
                    min="0"
                    value={formData.ssd_space_gb}
                    onChange={(e) => setFormData({ ...formData, ssd_space_gb: e.target.value })}
                    placeholder="e.g., 750"
                    className="mt-1"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Inventory Health Section */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-semibold text-sm mb-3 text-slate-700">Inventory Health Check</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Left Glove</Label>
                  <Select value={formData.left_glove_status} onValueChange={(val) => setFormData({ ...formData, left_glove_status: val })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ok">
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> OK</span>
                      </SelectItem>
                      <SelectItem value="wear">
                        <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-600" /> Wear</span>
                      </SelectItem>
                      <SelectItem value="damaged">
                        <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-600" /> Damaged</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Right Glove</Label>
                  <Select value={formData.right_glove_status} onValueChange={(val) => setFormData({ ...formData, right_glove_status: val })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ok">
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> OK</span>
                      </SelectItem>
                      <SelectItem value="wear">
                        <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-600" /> Wear</span>
                      </SelectItem>
                      <SelectItem value="damaged">
                        <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-600" /> Damaged</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Head Camera</Label>
                  <Select value={formData.head_cam_status} onValueChange={(val) => setFormData({ ...formData, head_cam_status: val })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ok">
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> OK</span>
                      </SelectItem>
                      <SelectItem value="wear">
                        <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-600" /> Wear</span>
                      </SelectItem>
                      <SelectItem value="damaged">
                        <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-600" /> Damaged</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Issues Section */}
            <div className="border-t pt-4 mt-4">
              <Label>Issues Faced (if any)</Label>
              <Textarea
                data-testid="issues-input"
                value={formData.issues_faced}
                onChange={(e) => setFormData({ ...formData, issues_faced: e.target.value })}
                placeholder="Technical issues, hardware problems, etc."
                className="mt-1"
                rows={2}
              />
            </div>
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

      case 'check_out':
        return (
          <>
            <div>
              <Label>From Kit (Check Out From)</Label>
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

      case 'check_in':
        return (
          <>
            <div>
              <Label>To Kit (Check In To)</Label>
              <Select value={formData.to_kit} onValueChange={(val) => setFormData({ ...formData, to_kit: val })}>
                <SelectTrigger data-testid="to-kit-select" className="mt-2">
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

      case 'wear_flag':
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
              <Label>Item (showing wear)</Label>
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
      check_out: 'Check Out Item',
      check_in: 'Check In Item',
      wear_flag: 'Flag Item Wear',
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
