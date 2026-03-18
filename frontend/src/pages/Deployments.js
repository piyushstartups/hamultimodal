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
import { toast } from 'sonner';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Plus, Edit, Trash2, 
  MapPin, Package, Users, Play, Pause, Square, Timer, ChevronDown, ChevronUp
} from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'cooking', label: 'Cooking' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'organizing', label: 'Organizing' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'other', label: 'Other' },
];

export default function Deployments() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDeployment, setExpandedDeployment] = useState(null);
  const [kitShifts, setKitShifts] = useState({});
  
  // Shift control state
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [selectedKit, setSelectedKit] = useState(null);
  const [selectedDeployment, setSelectedDeployment] = useState(null);
  const [shiftFormData, setShiftFormData] = useState({ ssd_used: '', activity_type: '' });
  const [shiftLoading, setShiftLoading] = useState(false);
  
  // Timer state
  const [elapsedTimes, setElapsedTimes] = useState({});
  
  // Options for admin
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [managers, setManagers] = useState([]);
  const [items, setItems] = useState([]);
  
  // Deployment dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState(null);
  const [formData, setFormData] = useState({
    bnb: '',
    shift: 'morning',
    deployment_managers: [],
    assigned_kits: [],
  });

  useEffect(() => {
    fetchDeployments();
    fetchOptions();
  }, [currentMonth]);

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      const newElapsed = {};
      Object.entries(kitShifts).forEach(([kit, shift]) => {
        if (shift && shift.status === 'active') {
          const startTime = new Date(shift.start_time);
          const now = new Date();
          const pausedSeconds = shift.total_paused_seconds || 0;
          const elapsed = Math.floor((now - startTime) / 1000) - pausedSeconds;
          newElapsed[kit] = Math.max(0, elapsed);
        } else if (shift && shift.status === 'paused') {
          // Calculate time up to last pause
          const startTime = new Date(shift.start_time);
          const pauses = shift.pauses || [];
          let totalPaused = 0;
          for (const p of pauses) {
            if (p.resume_time) {
              totalPaused += (new Date(p.resume_time) - new Date(p.pause_time)) / 1000;
            }
          }
          const lastPause = pauses[pauses.length - 1];
          if (lastPause && !lastPause.resume_time) {
            const activeTime = Math.floor((new Date(lastPause.pause_time) - startTime) / 1000) - totalPaused;
            newElapsed[kit] = Math.max(0, activeTime);
          }
        }
      });
      setElapsedTimes(newElapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [kitShifts]);

  const fetchDeployments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/deployments');
      setDeployments(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [bnbsRes, kitsRes, usersRes, itemsRes] = await Promise.all([
        api.get('/bnbs'),
        api.get('/kits'),
        api.get('/users'),
        api.get('/items')
      ]);
      setBnbs(bnbsRes.data);
      setKits(kitsRes.data);
      setManagers(usersRes.data.filter(u => u.role === 'deployment_manager'));
      setItems(itemsRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchKitShifts = async (deploymentId) => {
    try {
      const response = await api.get(`/shifts/by-deployment/${deploymentId}`);
      setKitShifts(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const toggleDeploymentExpand = (dep) => {
    if (expandedDeployment === dep.id) {
      setExpandedDeployment(null);
      setKitShifts({});
    } else {
      setExpandedDeployment(dep.id);
      fetchKitShifts(dep.id);
    }
  };

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const formatDateKey = (date) => {
    if (!date) return null;
    return date.toISOString().split('T')[0];
  };

  const getDeploymentsForDate = (date) => {
    const dateKey = formatDateKey(date);
    let deps = deployments.filter(d => d.date === dateKey);
    
    if (!isAdmin) {
      deps = deps.filter(d => 
        d.deployment_managers?.includes(user?.id) || 
        d.deployment_manager === user?.id
      );
    }
    
    return deps;
  };

  const navigateMonth = (direction) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
    setSelectedDate(null);
    setExpandedDeployment(null);
  };

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '--:--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (hours) => {
    if (!hours) return '0h 0m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  // Shift control functions
  const openStartShift = (dep, kit) => {
    setSelectedDeployment(dep);
    setSelectedKit(kit);
    setShiftFormData({ ssd_used: '', activity_type: '' });
    setShiftDialogOpen(true);
  };

  const handleStartShift = async (e) => {
    e.preventDefault();
    if (!shiftFormData.ssd_used || !shiftFormData.activity_type) {
      toast.error('SSD and Activity Type are required');
      return;
    }
    
    setShiftLoading(true);
    try {
      await api.post('/shifts/start', {
        deployment_id: selectedDeployment.id,
        kit: selectedKit,
        ssd_used: shiftFormData.ssd_used,
        activity_type: shiftFormData.activity_type
      });
      toast.success('Shift started!');
      setShiftDialogOpen(false);
      fetchKitShifts(selectedDeployment.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start shift');
    } finally {
      setShiftLoading(false);
    }
  };

  const handlePauseShift = async (kit) => {
    const shift = kitShifts[kit];
    if (!shift) return;
    
    try {
      await api.post(`/shifts/${shift.id}/pause`);
      toast.success('Shift paused');
      fetchKitShifts(expandedDeployment);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to pause');
    }
  };

  const handleResumeShift = async (kit) => {
    const shift = kitShifts[kit];
    if (!shift) return;
    
    try {
      await api.post(`/shifts/${shift.id}/resume`);
      toast.success('Shift resumed');
      fetchKitShifts(expandedDeployment);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resume');
    }
  };

  const handleStopShift = async (kit) => {
    const shift = kitShifts[kit];
    if (!shift) return;
    
    if (!confirm('Stop this shift? Duration will be calculated automatically.')) return;
    
    try {
      const response = await api.post(`/shifts/${shift.id}/stop`);
      toast.success(`Shift completed! Duration: ${formatDuration(response.data.total_duration_hours)}`);
      fetchKitShifts(expandedDeployment);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to stop');
    }
  };

  // Admin deployment functions
  const openAddDialog = () => {
    if (!selectedDate) {
      toast.error('Please select a date first');
      return;
    }
    setEditingDeployment(null);
    setFormData({ bnb: '', shift: 'morning', deployment_managers: [], assigned_kits: [] });
    setDialogOpen(true);
  };

  const openEditDialog = (deployment) => {
    setEditingDeployment(deployment);
    setFormData({
      bnb: deployment.bnb,
      shift: deployment.shift,
      deployment_managers: deployment.deployment_managers || [],
      assigned_kits: deployment.assigned_kits || [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.bnb || formData.deployment_managers.length === 0) {
      toast.error('BnB and at least one manager required');
      return;
    }

    try {
      const payload = {
        date: formatDateKey(selectedDate),
        bnb: formData.bnb,
        shift: formData.shift,
        deployment_managers: formData.deployment_managers,
        assigned_kits: formData.assigned_kits,
        assigned_users: [],
      };

      if (editingDeployment) {
        await api.put(`/deployments/${editingDeployment.id}`, payload);
        toast.success('Deployment updated');
      } else {
        await api.post('/deployments', payload);
        toast.success('Deployment created');
      }
      
      setDialogOpen(false);
      fetchDeployments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
    }
  };

  const handleDelete = async (deploymentId) => {
    if (!confirm('Delete this deployment?')) return;
    try {
      await api.delete(`/deployments/${deploymentId}`);
      toast.success('Deleted');
      fetchDeployments();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const toggleKit = (kitId) => {
    const arr = formData.assigned_kits;
    setFormData({
      ...formData,
      assigned_kits: arr.includes(kitId) ? arr.filter(k => k !== kitId) : [...arr, kitId]
    });
  };

  const toggleManager = (managerId) => {
    const arr = formData.deployment_managers;
    setFormData({
      ...formData,
      deployment_managers: arr.includes(managerId) ? arr.filter(m => m !== managerId) : [...arr, managerId]
    });
  };

  const getUserName = (userId) => {
    const u = managers.find(m => m.id === userId);
    return u?.name || userId;
  };

  const getManagerNames = (dep) => {
    if (dep.deployment_managers && dep.deployment_managers.length > 0) {
      return dep.deployment_managers.map(id => getUserName(id)).join(', ');
    }
    return 'Unassigned';
  };

  const getKitStatus = (kit) => {
    const shift = kitShifts[kit];
    if (!shift) return 'not_started';
    return shift.status;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-amber-500';
      case 'completed': return 'bg-blue-500';
      default: return 'bg-slate-300';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return 'Active';
      case 'paused': return 'Paused';
      case 'completed': return 'Completed';
      default: return 'Not Started';
    }
  };

  const days = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = formatDateKey(new Date());
  const selectedDeployments = selectedDate ? getDeploymentsForDate(selectedDate) : [];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Deployments</h1>
              <p className="text-sm text-slate-600">{isAdmin ? 'Plan & manage' : 'Your assignments'}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-xl border p-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-lg font-semibold">{monthName}</h2>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">{day}</div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) return <div key={`empty-${index}`} className="aspect-square" />;
                
                const dateKey = formatDateKey(day);
                const isToday = dateKey === today;
                const isSelected = selectedDate && formatDateKey(selectedDate) === dateKey;
                const dayDeployments = getDeploymentsForDate(day);
                
                return (
                  <button
                    key={dateKey}
                    onClick={() => { setSelectedDate(day); setExpandedDeployment(null); }}
                    data-testid={`day-${dateKey}`}
                    className={`aspect-square p-1 rounded-lg border transition-all relative ${
                      isSelected ? 'bg-blue-500 text-white border-blue-500' 
                      : isToday ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-sm font-medium">{day.getDate()}</span>
                    {dayDeployments.length > 0 && (
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {dayDeployments.slice(0, 3).map((_, i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Details */}
          <div className="bg-white rounded-xl border p-4 max-h-[600px] overflow-y-auto">
            {selectedDate ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </h3>
                  {isAdmin && (
                    <Button size="sm" onClick={openAddDialog} data-testid="add-deployment-btn">
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
                
                {selectedDeployments.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p>No deployments</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDeployments.map((dep) => (
                      <div key={dep.id} className="border rounded-lg overflow-hidden" data-testid={`deployment-${dep.id}`}>
                        {/* Deployment Header */}
                        <div 
                          className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between cursor-pointer"
                          onClick={() => toggleDeploymentExpand(dep)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{dep.bnb}</span>
                            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{dep.shift}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); openEditDialog(dep); }}>
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-red-500" onClick={(e) => { e.stopPropagation(); handleDelete(dep.id); }}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {expandedDeployment === dep.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                        
                        {/* Deployment Info */}
                        <div className="px-3 py-2 border-b bg-slate-50 text-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Users className="w-4 h-4" />
                            <span>{getManagerNames(dep)}</span>
                          </div>
                        </div>
                        
                        {/* Kit Cards - Only shown when expanded */}
                        {expandedDeployment === dep.id && (
                          <div className="p-3 space-y-2">
                            <p className="text-xs font-medium text-slate-500 uppercase">Kits</p>
                            {(!dep.assigned_kits || dep.assigned_kits.length === 0) ? (
                              <p className="text-sm text-slate-400">No kits assigned</p>
                            ) : (
                              dep.assigned_kits.map(kit => {
                                const status = getKitStatus(kit);
                                const shift = kitShifts[kit];
                                
                                return (
                                  <div key={kit} className="border rounded-lg p-3" data-testid={`kit-card-${kit}`}>
                                    {/* Kit Header */}
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <Package className="w-4 h-4 text-slate-500" />
                                        <span className="font-medium">{kit}</span>
                                      </div>
                                      <span className={`text-xs px-2 py-0.5 rounded text-white ${getStatusColor(status)}`}>
                                        {getStatusLabel(status)}
                                      </span>
                                    </div>
                                    
                                    {/* Timer for active/paused */}
                                    {(status === 'active' || status === 'paused') && (
                                      <div className={`text-center py-2 mb-2 rounded ${status === 'active' ? 'bg-green-50' : 'bg-amber-50'}`}>
                                        <p className="text-2xl font-mono font-bold" data-testid={`timer-${kit}`}>
                                          {formatTime(elapsedTimes[kit])}
                                        </p>
                                        {shift && (
                                          <p className="text-xs text-slate-500 mt-1">
                                            {shift.activity_type} • {shift.ssd_used}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* Completed info */}
                                    {status === 'completed' && shift && (
                                      <div className="bg-blue-50 rounded p-2 mb-2 text-center">
                                        <p className="text-lg font-bold text-blue-600">{formatDuration(shift.total_duration_hours)}</p>
                                        <p className="text-xs text-slate-500">{shift.activity_type} • {shift.ssd_used}</p>
                                      </div>
                                    )}
                                    
                                    {/* Control Buttons */}
                                    <div className="flex gap-2">
                                      {status === 'not_started' && (
                                        <Button 
                                          size="sm" 
                                          className="flex-1 bg-green-500 hover:bg-green-600"
                                          onClick={() => openStartShift(dep, kit)}
                                          data-testid={`start-${kit}`}
                                        >
                                          <Play className="w-4 h-4 mr-1" />
                                          Start
                                        </Button>
                                      )}
                                      {status === 'active' && (
                                        <>
                                          <Button 
                                            size="sm" 
                                            className="flex-1 bg-amber-500 hover:bg-amber-600"
                                            onClick={() => handlePauseShift(kit)}
                                            data-testid={`pause-${kit}`}
                                          >
                                            <Pause className="w-4 h-4 mr-1" />
                                            Pause
                                          </Button>
                                          <Button 
                                            size="sm" 
                                            className="flex-1 bg-red-500 hover:bg-red-600"
                                            onClick={() => handleStopShift(kit)}
                                            data-testid={`stop-${kit}`}
                                          >
                                            <Square className="w-4 h-4 mr-1" />
                                            Stop
                                          </Button>
                                        </>
                                      )}
                                      {status === 'paused' && (
                                        <>
                                          <Button 
                                            size="sm" 
                                            className="flex-1 bg-green-500 hover:bg-green-600"
                                            onClick={() => handleResumeShift(kit)}
                                            data-testid={`resume-${kit}`}
                                          >
                                            <Play className="w-4 h-4 mr-1" />
                                            Resume
                                          </Button>
                                          <Button 
                                            size="sm" 
                                            className="flex-1 bg-red-500 hover:bg-red-600"
                                            onClick={() => handleStopShift(kit)}
                                            data-testid={`stop-${kit}`}
                                          >
                                            <Square className="w-4 h-4 mr-1" />
                                            Stop
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <p>Select a date to view deployments</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Start Shift Dialog */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Collection - {selectedKit}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStartShift} className="space-y-4 mt-4">
            <div>
              <Label>SSD *</Label>
              <Select value={shiftFormData.ssd_used} onValueChange={(v) => setShiftFormData({ ...shiftFormData, ssd_used: v })}>
                <SelectTrigger className="mt-1" data-testid="ssd-select"><SelectValue placeholder="Select SSD" /></SelectTrigger>
                <SelectContent>
                  {items.filter(i => i.category === 'ssd' || i.item_name.toLowerCase().includes('ssd')).length > 0 
                    ? items.filter(i => i.category === 'ssd' || i.item_name.toLowerCase().includes('ssd')).map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)
                    : items.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Activity Type *</Label>
              <Select value={shiftFormData.activity_type} onValueChange={(v) => setShiftFormData({ ...shiftFormData, activity_type: v })}>
                <SelectTrigger className="mt-1" data-testid="activity-select"><SelectValue placeholder="Select activity" /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShiftDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-green-500 hover:bg-green-600" disabled={shiftLoading} data-testid="start-shift-btn">
                {shiftLoading ? 'Starting...' : 'Start Collection'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Admin: Add/Edit Deployment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDeployment ? 'Edit Deployment' : 'Add Deployment'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <Label>BnB *</Label>
              <Select value={formData.bnb} onValueChange={(v) => setFormData({ ...formData, bnb: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select BnB" /></SelectTrigger>
                <SelectContent>
                  {bnbs.map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Shift *</Label>
              <Select value={formData.shift} onValueChange={(v) => setFormData({ ...formData, shift: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Managers *</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {managers.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleManager(m.id)}
                    className={`px-3 py-1.5 text-sm rounded border transition-all ${
                      formData.deployment_managers.includes(m.id) ? 'bg-green-500 text-white border-green-500' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <Label>Kits</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {kits.map(k => (
                  <button
                    key={k.kit_id}
                    type="button"
                    onClick={() => toggleKit(k.kit_id)}
                    className={`px-3 py-1 text-sm rounded border transition-all ${
                      formData.assigned_kits.includes(k.kit_id) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {k.kit_id}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1">{editingDeployment ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
