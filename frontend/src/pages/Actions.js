import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
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
  ArrowLeft, 
  Play, 
  Pause, 
  Square, 
  ArrowRightLeft, 
  AlertTriangle, 
  FileText,
  Clock,
  Timer
} from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'cooking', label: 'Cooking' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'organizing', label: 'Organizing' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'other', label: 'Other' },
];

export default function Actions() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [kits, setKits] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Active shift state
  const [activeShift, setActiveShift] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const [formData, setFormData] = useState({
    kit: '',
    item: '',
    to_kit: '',
    quantity: 1,
    ssd_used: '',
    activity_type: '',
    notes: ''
  });

  useEffect(() => {
    fetchOptions();
    fetchActiveShift();
  }, []);

  // Timer for active shift
  useEffect(() => {
    let interval;
    if (activeShift && activeShift.status === 'active') {
      interval = setInterval(() => {
        const startTime = new Date(activeShift.start_time);
        const now = new Date();
        const pausedSeconds = activeShift.total_paused_seconds || 0;
        
        // Calculate current pause if any ongoing
        let currentPauseSeconds = 0;
        const pauses = activeShift.pauses || [];
        const lastPause = pauses[pauses.length - 1];
        if (lastPause && !lastPause.resume_time) {
          currentPauseSeconds = (now - new Date(lastPause.pause_time)) / 1000;
        }
        
        const elapsed = Math.floor((now - startTime) / 1000) - pausedSeconds - currentPauseSeconds;
        setElapsedTime(Math.max(0, elapsed));
      }, 1000);
    } else if (activeShift && activeShift.status === 'paused') {
      // Show frozen time when paused
      const startTime = new Date(activeShift.start_time);
      const pauses = activeShift.pauses || [];
      let totalPaused = 0;
      for (const p of pauses) {
        if (p.resume_time) {
          totalPaused += (new Date(p.resume_time) - new Date(p.pause_time)) / 1000;
        }
      }
      const lastPause = pauses[pauses.length - 1];
      if (lastPause && !lastPause.resume_time) {
        const pauseStart = new Date(lastPause.pause_time);
        const elapsed = Math.floor((pauseStart - startTime) / 1000) - totalPaused + (new Date(lastPause.pause_time) - new Date(lastPause.pause_time)) / 1000;
        // Calculate time up to pause
        const activeTime = Math.floor((pauseStart - startTime) / 1000) - totalPaused;
        setElapsedTime(Math.max(0, activeTime));
      }
    }
    return () => clearInterval(interval);
  }, [activeShift]);

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

  const fetchActiveShift = async () => {
    try {
      const response = await api.get('/shifts/active');
      setActiveShift(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const openStartShift = () => {
    setActionType('start_shift');
    setFormData({ kit: '', ssd_used: '', activity_type: '', item: '', to_kit: '', quantity: 1, notes: '' });
    setDialogOpen(true);
  };

  const openAction = (type) => {
    setActionType(type);
    setFormData({ kit: '', item: '', to_kit: '', quantity: 1, ssd_used: '', activity_type: '', notes: '' });
    setDialogOpen(true);
  };

  const handleStartShift = async (e) => {
    e.preventDefault();
    
    if (!formData.kit || !formData.ssd_used || !formData.activity_type) {
      toast.error('Kit, SSD, and Activity Type are required');
      return;
    }
    
    setLoading(true);
    try {
      const response = await api.post('/shifts/start', {
        kit: formData.kit,
        ssd_used: formData.ssd_used,
        activity_type: formData.activity_type
      });
      setActiveShift(response.data);
      setElapsedTime(0);
      toast.success('Shift started!');
      setDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start shift');
    } finally {
      setLoading(false);
    }
  };

  const handlePauseShift = async () => {
    if (!activeShift) return;
    setLoading(true);
    try {
      const response = await api.post(`/shifts/${activeShift.id}/pause`);
      setActiveShift(response.data);
      toast.success('Shift paused');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to pause');
    } finally {
      setLoading(false);
    }
  };

  const handleResumeShift = async () => {
    if (!activeShift) return;
    setLoading(true);
    try {
      const response = await api.post(`/shifts/${activeShift.id}/resume`);
      setActiveShift(response.data);
      toast.success('Shift resumed');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resume');
    } finally {
      setLoading(false);
    }
  };

  const handleStopShift = async () => {
    if (!activeShift) return;
    if (!confirm('Stop this shift? Duration will be automatically calculated.')) return;
    
    setLoading(true);
    try {
      const response = await api.post(`/shifts/${activeShift.id}/stop`);
      toast.success(`Shift completed! Duration: ${response.data.total_duration_hours} hours`);
      setActiveShift(null);
      setElapsedTime(0);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to stop shift');
    } finally {
      setLoading(false);
    }
  };

  const handleOtherAction = async (e) => {
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

  const getDialogTitle = () => {
    switch (actionType) {
      case 'start_shift': return 'Start Collection';
      case 'transfer': return 'Transfer Item';
      case 'damage': return 'Report Damage';
      case 'request': return 'Request Item';
      default: return 'Action';
    }
  };

  const renderStartShiftForm = () => (
    <>
      <div>
        <Label>Kit *</Label>
        <Select value={formData.kit} onValueChange={(v) => setFormData({ ...formData, kit: v })}>
          <SelectTrigger className="mt-1" data-testid="kit-select"><SelectValue placeholder="Select kit" /></SelectTrigger>
          <SelectContent>
            {kits.map(k => <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>SSD *</Label>
        <Select value={formData.ssd_used} onValueChange={(v) => setFormData({ ...formData, ssd_used: v })}>
          <SelectTrigger className="mt-1" data-testid="ssd-select"><SelectValue placeholder="Select SSD" /></SelectTrigger>
          <SelectContent>
            {items.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>Activity Type *</Label>
        <Select value={formData.activity_type} onValueChange={(v) => setFormData({ ...formData, activity_type: v })}>
          <SelectTrigger className="mt-1" data-testid="activity-select"><SelectValue placeholder="Select activity" /></SelectTrigger>
          <SelectContent>
            {ACTIVITY_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const renderOtherForm = () => {
    switch (actionType) {
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
              <input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                className="mt-1 w-full border rounded-md px-3 py-2"
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
            <Button variant="ghost" size="icon" data-testid="back-btn">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </a>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Actions</h1>
            <p className="text-sm text-slate-600">Shift tracking & events</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Active Shift Panel */}
        {activeShift ? (
          <div className="bg-white rounded-xl border overflow-hidden" data-testid="active-shift-panel">
            <div className={`px-4 py-3 flex items-center justify-between ${
              activeShift.status === 'active' ? 'bg-green-500' : 'bg-amber-500'
            } text-white`}>
              <div className="flex items-center gap-3">
                <Timer className="w-5 h-5" />
                <span className="font-semibold">
                  {activeShift.status === 'active' ? 'Shift Active' : 'Shift Paused'}
                </span>
              </div>
              <div className="text-2xl font-mono font-bold" data-testid="elapsed-time">
                {formatTime(elapsedTime)}
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                <div>
                  <p className="text-slate-500">Kit</p>
                  <p className="font-medium">{activeShift.kit}</p>
                </div>
                <div>
                  <p className="text-slate-500">SSD</p>
                  <p className="font-medium">{activeShift.ssd_used}</p>
                </div>
                <div>
                  <p className="text-slate-500">Activity</p>
                  <p className="font-medium capitalize">{activeShift.activity_type}</p>
                </div>
              </div>
              
              {/* Shift Control Buttons */}
              <div className="flex gap-3">
                {activeShift.status === 'active' ? (
                  <>
                    <Button 
                      onClick={handlePauseShift} 
                      disabled={loading}
                      className="flex-1 bg-amber-500 hover:bg-amber-600"
                      data-testid="pause-btn"
                    >
                      <Pause className="w-5 h-5 mr-2" />
                      Pause
                    </Button>
                    <Button 
                      onClick={handleStopShift} 
                      disabled={loading}
                      className="flex-1 bg-red-500 hover:bg-red-600"
                      data-testid="stop-btn"
                    >
                      <Square className="w-5 h-5 mr-2" />
                      Stop
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      onClick={handleResumeShift} 
                      disabled={loading}
                      className="flex-1 bg-green-500 hover:bg-green-600"
                      data-testid="resume-btn"
                    >
                      <Play className="w-5 h-5 mr-2" />
                      Resume
                    </Button>
                    <Button 
                      onClick={handleStopShift} 
                      disabled={loading}
                      className="flex-1 bg-red-500 hover:bg-red-600"
                      data-testid="stop-btn"
                    >
                      <Square className="w-5 h-5 mr-2" />
                      Stop
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Start Shift Button - Only show when no active shift */
          <Button
            onClick={openStartShift}
            className="w-full bg-green-500 hover:bg-green-600 text-white h-20 text-xl"
            data-testid="start-collection-btn"
          >
            <Play className="w-8 h-8 mr-4" />
            Start Collection
          </Button>
        )}

        {/* Other Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Other Actions</h2>
          
          <Button
            onClick={() => openAction('transfer')}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white h-14 text-lg justify-start px-6"
            data-testid="action-transfer"
          >
            <ArrowRightLeft className="w-6 h-6 mr-4" />
            Transfer Item
          </Button>
          
          <Button
            onClick={() => openAction('damage')}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white h-14 text-lg justify-start px-6"
            data-testid="action-damage"
          >
            <AlertTriangle className="w-6 h-6 mr-4" />
            Report Damage
          </Button>
          
          <Button
            onClick={() => openAction('request')}
            className="w-full bg-purple-500 hover:bg-purple-600 text-white h-14 text-lg justify-start px-6"
            data-testid="action-request"
          >
            <FileText className="w-6 h-6 mr-4" />
            Request Item
          </Button>
        </div>
      </main>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <form onSubmit={actionType === 'start_shift' ? handleStartShift : handleOtherAction} className="space-y-4 mt-4">
            {actionType === 'start_shift' ? renderStartShiftForm() : renderOtherForm()}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading} data-testid="submit-btn">
                {loading ? 'Saving...' : actionType === 'start_shift' ? 'Start' : 'Submit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
