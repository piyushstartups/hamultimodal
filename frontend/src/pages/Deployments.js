import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
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
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Plus, Edit, Trash2, 
  MapPin, Package, Users, Play, Pause, Square, Timer, 
  ChevronDown, ChevronUp, RefreshCw, ClipboardCheck, AlertCircle
} from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'cooking', label: 'Cooking' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'organizing', label: 'Organizing' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'other', label: 'Other' },
];

// Handover checklist items for each kit
const KIT_CHECKLIST_ITEMS = [
  { key: 'gloves', label: 'Gloves' },
  { key: 'usb_hub', label: 'USB Hub' },
  { key: 'imus', label: 'IMUs' },
  { key: 'head_camera', label: 'Head Camera' },
  { key: 'l_shaped_wire', label: 'L-Shaped Wire' },
  { key: 'laptop', label: 'Laptop' },
  { key: 'laptop_charger', label: 'Laptop Charger' },
  { key: 'power_bank', label: 'Power Bank' },
  { key: 'ssds', label: 'SSDs' },
];

// Shared BnB items
const BNB_CHECKLIST_ITEMS = [
  { key: 'charging_station', label: 'Charging Station' },
  { key: 'power_strip_8_port', label: '8 Port Power Strip' },
  { key: 'power_strip_4_5_port', label: '4-5 Port Strip' },
];

export default function Deployments() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'deployment_manager';
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date()); // Default to today
  const [calendarCollapsed, setCalendarCollapsed] = useState(false);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDeployment, setExpandedDeployment] = useState(null);
  const [kitShifts, setKitShifts] = useState({});
  
  // Shift control state
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [selectedKit, setSelectedKit] = useState(null);
  const [selectedDeploymentForShift, setSelectedDeploymentForShift] = useState(null);
  const [shiftFormData, setShiftFormData] = useState({ ssd_used: '', activity_type: '' });
  const [shiftLoading, setShiftLoading] = useState(false);
  
  // Handover state
  const [handoverDialogOpen, setHandoverDialogOpen] = useState(false);
  const [handoverType, setHandoverType] = useState('outgoing');
  const [handoverDeployment, setHandoverDeployment] = useState(null);
  const [kitChecklists, setKitChecklists] = useState({});
  const [bnbChecklist, setBnbChecklist] = useState({});
  const [missingItems, setMissingItems] = useState([]);
  const [handoverNotes, setHandoverNotes] = useState('');
  
  // Timer state
  const [elapsedTimes, setElapsedTimes] = useState({});
  
  // Options
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [managers, setManagers] = useState([]);
  const [items, setItems] = useState([]);
  
  // Admin deployment dialog
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

  // Auto-expand first deployment for managers when date changes
  useEffect(() => {
    if (isManager && selectedDate) {
      const dateKey = formatDateKey(selectedDate);
      const todayDeps = deployments.filter(d => d.date === dateKey);
      const myDeps = todayDeps.filter(d => 
        d.deployment_managers?.includes(user?.id) || d.deployment_manager === user?.id
      );
      if (myDeps.length === 1) {
        // Auto-expand if only one deployment for manager
        setExpandedDeployment(myDeps[0].id);
        fetchKitShifts(myDeps[0].id);
      }
    }
  }, [selectedDate, deployments, isManager, user]);

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
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  };

  const formatDateKey = (date) => {
    if (!date) return null;
    return date.toISOString().split('T')[0];
  };

  const getDeploymentsForDate = (date) => {
    const dateKey = formatDateKey(date);
    let deps = deployments.filter(d => d.date === dateKey);
    if (isManager) {
      deps = deps.filter(d => 
        d.deployment_managers?.includes(user?.id) || d.deployment_manager === user?.id
      );
    }
    return deps;
  };

  const navigateMonth = (direction) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
    setSelectedDate(null);
    setExpandedDeployment(null);
    setCalendarCollapsed(false);
  };

  const selectDate = (day) => {
    setSelectedDate(day);
    setExpandedDeployment(null);
    setKitShifts({});
    // Collapse calendar when date selected (for managers)
    if (isManager) {
      setCalendarCollapsed(true);
    }
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
    setSelectedDeploymentForShift(dep);
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
        deployment_id: selectedDeploymentForShift.id,
        kit: selectedKit,
        ssd_used: shiftFormData.ssd_used,
        activity_type: shiftFormData.activity_type
      });
      toast.success('Shift started!');
      setShiftDialogOpen(false);
      fetchKitShifts(selectedDeploymentForShift.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start shift');
    } finally {
      setShiftLoading(false);
    }
  };

  const handlePauseShift = async (kit) => {
    const shift = kitShifts[kit];
    if (!shift) {
      toast.error('No active shift found for this kit');
      return;
    }
    try {
      const response = await api.post(`/shifts/${shift.id}/pause`);
      // Immediately update local state
      setKitShifts(prev => ({
        ...prev,
        [kit]: response.data
      }));
      toast.success('Shift paused');
      
      if (expandedDeployment) {
        await fetchKitShifts(expandedDeployment);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to pause');
    }
  };

  const handleResumeShift = async (kit) => {
    const shift = kitShifts[kit];
    if (!shift) {
      toast.error('No paused shift found for this kit');
      return;
    }
    try {
      const response = await api.post(`/shifts/${shift.id}/resume`);
      // Immediately update local state
      setKitShifts(prev => ({
        ...prev,
        [kit]: response.data
      }));
      toast.success('Shift resumed');
      
      if (expandedDeployment) {
        await fetchKitShifts(expandedDeployment);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resume');
    }
  };

  const handleStopShift = async (kit) => {
    const shift = kitShifts[kit];
    if (!shift) {
      toast.error('No active shift found for this kit');
      return;
    }
    if (!confirm('Stop this shift? Duration will be calculated automatically.')) return;
    
    try {
      const response = await api.post(`/shifts/${shift.id}/stop`);
      const updatedShift = response.data;
      
      // Immediately update local state with the completed shift
      setKitShifts(prev => ({
        ...prev,
        [kit]: updatedShift
      }));
      
      toast.success(`Shift completed! Duration: ${formatDuration(updatedShift.total_duration_hours)}`);
      
      // Also refetch to ensure consistency
      if (expandedDeployment) {
        await fetchKitShifts(expandedDeployment);
      }
    } catch (error) {
      console.error('Stop shift error:', error);
      toast.error(error.response?.data?.detail || 'Failed to stop shift');
    }
  };

  // Handover functions
  const openHandoverDialog = (dep, type) => {
    setHandoverDeployment(dep);
    setHandoverType(type);
    
    // Initialize kit checklists
    const initialKitChecklists = {};
    (dep.assigned_kits || []).forEach(kit => {
      initialKitChecklists[kit] = {};
      KIT_CHECKLIST_ITEMS.forEach(item => {
        initialKitChecklists[kit][item.key] = 0;
      });
    });
    setKitChecklists(initialKitChecklists);
    
    // Initialize BnB checklist
    const initialBnbChecklist = {};
    BNB_CHECKLIST_ITEMS.forEach(item => {
      initialBnbChecklist[item.key] = 0;
    });
    setBnbChecklist(initialBnbChecklist);
    
    setMissingItems([]);
    setHandoverNotes('');
    setHandoverDialogOpen(true);
  };

  const updateKitChecklist = (kit, key, value) => {
    setKitChecklists(prev => ({
      ...prev,
      [kit]: { ...prev[kit], [key]: parseInt(value) || 0 }
    }));
  };

  const updateBnbChecklist = (key, value) => {
    setBnbChecklist(prev => ({ ...prev, [key]: parseInt(value) || 0 }));
  };

  const addMissingItem = () => {
    setMissingItems(prev => [...prev, { item: '', quantity: 1, kit_id: '', report_as_lost: false }]);
  };

  const updateMissingItem = (index, field, value) => {
    setMissingItems(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeMissingItem = (index) => {
    setMissingItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitHandover = async () => {
    try {
      const kitChecklistsArray = Object.entries(kitChecklists).map(([kit_id, values]) => ({
        kit_id,
        ...values
      }));
      
      await api.post('/handovers', {
        deployment_id: handoverDeployment.id,
        handover_type: handoverType,
        kit_checklists: kitChecklistsArray,
        bnb_checklist: bnbChecklist,
        missing_items: missingItems.filter(m => m.item),
        notes: handoverNotes || null
      });
      
      toast.success(`Handover (${handoverType}) submitted successfully`);
      setHandoverDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit handover');
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
      setExpandedDeployment(null);
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

  const getUserName = (userId) => managers.find(m => m.id === userId)?.name || userId;
  const getManagerNames = (dep) => dep.deployment_managers?.length > 0 ? dep.deployment_managers.map(getUserName).join(', ') : 'Unassigned';
  const getKitStatus = (kit) => kitShifts[kit]?.status || 'not_started';
  
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
  const ssdItems = items.filter(i => i.category === 'ssd' || i.item_name.toLowerCase().includes('ssd'));

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
              <p className="text-sm text-slate-600">
                {selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Select a date'}
              </p>
            </div>
          </div>
          {isManager && calendarCollapsed && (
            <Button variant="outline" size="sm" onClick={() => setCalendarCollapsed(false)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Change Date
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        {/* Calendar - Collapsible for managers */}
        {(!calendarCollapsed || isAdmin) && (
          <div className={`bg-white rounded-xl border p-4 mb-4 ${isManager && selectedDate ? 'border-blue-200' : ''}`}>
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
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div key={i} className="text-center text-xs font-medium text-slate-500 py-1">{day}</div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) return <div key={`empty-${index}`} className="aspect-square" />;
                const dateKey = formatDateKey(day);
                const isToday = dateKey === today;
                const isSelected = selectedDate && formatDateKey(selectedDate) === dateKey;
                const dayDeployments = getDeploymentsForDate(day);
                const hasMyDeployments = dayDeployments.length > 0;
                
                return (
                  <button
                    key={dateKey}
                    onClick={() => selectDate(day)}
                    data-testid={`day-${dateKey}`}
                    className={`aspect-square p-1 rounded-lg border transition-all relative ${
                      isSelected ? 'bg-blue-500 text-white border-blue-500 ring-2 ring-blue-300' 
                      : hasMyDeployments ? 'bg-green-50 border-green-300 font-bold'
                      : isToday ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-sm">{day.getDate()}</span>
                    {hasMyDeployments && !isSelected && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-green-500" />
                    )}
                  </button>
                );
              })}
            </div>
            
            {isManager && selectedDate && (
              <p className="text-xs text-center text-slate-500 mt-3">
                Tap a date with a green dot to see your assignments
              </p>
            )}
          </div>
        )}

        {/* Deployments for selected date */}
        {selectedDate && (
          <div className="space-y-3">
            {/* Header row for admin */}
            {isAdmin && (
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </h3>
                <Button size="sm" onClick={openAddDialog} data-testid="add-deployment-btn">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Deployment
                </Button>
              </div>
            )}

            {/* Deployment cards */}
            {selectedDeployments.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No deployments</p>
                <p className="text-sm text-slate-400 mt-1">
                  {isManager ? 'No assignments for this date' : 'Add a deployment to get started'}
                </p>
              </div>
            ) : (
              selectedDeployments.map((dep) => (
                <div 
                  key={dep.id} 
                  className={`bg-white rounded-xl border overflow-hidden transition-all ${
                    expandedDeployment === dep.id ? 'ring-2 ring-blue-400' : ''
                  }`}
                  data-testid={`deployment-${dep.id}`}
                >
                  {/* BnB Header - Clickable */}
                  <button
                    onClick={() => toggleDeploymentExpand(dep)}
                    className="w-full bg-slate-900 text-white px-4 py-3 flex items-center justify-between hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5" />
                      <span className="font-bold text-lg">{dep.bnb}</span>
                      <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{dep.shift}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); openEditDialog(dep); }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-red-500" onClick={(e) => { e.stopPropagation(); handleDelete(dep.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {expandedDeployment === dep.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>
                  
                  {/* Manager info */}
                  <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users className="w-4 h-4" />
                      <span>{getManagerNames(dep)}</span>
                    </div>
                    <span className="text-xs text-slate-400">{dep.assigned_kits?.length || 0} kits</span>
                  </div>
                  
                  {/* Expanded: Kit Cards + Handover */}
                  {expandedDeployment === dep.id && (
                    <div className="p-4 space-y-4">
                      {/* Handover buttons */}
                      {isManager && (
                        <div className="flex gap-2 mb-4">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => openHandoverDialog(dep, 'outgoing')}
                            data-testid="handover-outgoing-btn"
                          >
                            <ClipboardCheck className="w-4 h-4 mr-2" />
                            End Shift Handover
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => openHandoverDialog(dep, 'incoming')}
                            data-testid="handover-incoming-btn"
                          >
                            <ClipboardCheck className="w-4 h-4 mr-2" />
                            Start Shift Handover
                          </Button>
                        </div>
                      )}
                      
                      {/* Kit Cards */}
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Assigned Kits</p>
                        {(!dep.assigned_kits || dep.assigned_kits.length === 0) ? (
                          <p className="text-sm text-slate-400 py-4 text-center">No kits assigned to this deployment</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {dep.assigned_kits.map(kit => {
                              const status = getKitStatus(kit);
                              const shift = kitShifts[kit];
                              
                              return (
                                <div 
                                  key={kit} 
                                  className={`border-2 rounded-xl overflow-hidden ${
                                    status === 'active' ? 'border-green-400 bg-green-50' :
                                    status === 'paused' ? 'border-amber-400 bg-amber-50' :
                                    status === 'completed' ? 'border-blue-400 bg-blue-50' :
                                    'border-slate-200 bg-white'
                                  }`}
                                  data-testid={`kit-card-${kit}`}
                                >
                                  {/* Kit Header */}
                                  <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                      <Package className="w-5 h-5 text-slate-600" />
                                      <span className="font-bold text-lg">{kit}</span>
                                    </div>
                                    <span className={`text-xs px-3 py-1 rounded-full text-white font-medium ${getStatusColor(status)}`}>
                                      {getStatusLabel(status)}
                                    </span>
                                  </div>
                                  
                                  {/* Timer for active/paused */}
                                  {(status === 'active' || status === 'paused') && (
                                    <div className="px-4 py-3 text-center">
                                      <p className={`text-3xl font-mono font-bold ${status === 'active' ? 'text-green-600' : 'text-amber-600'}`} data-testid={`timer-${kit}`}>
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
                                    <div className="px-4 py-3 text-center">
                                      <p className="text-2xl font-bold text-blue-600">{formatDuration(shift.total_duration_hours)}</p>
                                      <p className="text-xs text-slate-500 mt-1">{shift.activity_type} • {shift.ssd_used}</p>
                                    </div>
                                  )}
                                  
                                  {/* Control Buttons */}
                                  <div className="px-4 py-3 bg-white border-t border-slate-100">
                                    {status === 'not_started' && (
                                      <Button 
                                        className="w-full bg-green-500 hover:bg-green-600 h-12 text-base"
                                        onClick={() => openStartShift(dep, kit)}
                                        data-testid={`start-${kit}`}
                                      >
                                        <Play className="w-5 h-5 mr-2" />
                                        Start Collection
                                      </Button>
                                    )}
                                    {status === 'active' && (
                                      <div className="flex gap-2">
                                        <Button 
                                          className="flex-1 bg-amber-500 hover:bg-amber-600 h-12"
                                          onClick={() => handlePauseShift(kit)}
                                          data-testid={`pause-${kit}`}
                                        >
                                          <Pause className="w-5 h-5 mr-1" />
                                          Pause
                                        </Button>
                                        <Button 
                                          className="flex-1 bg-red-500 hover:bg-red-600 h-12"
                                          onClick={() => handleStopShift(kit)}
                                          data-testid={`stop-${kit}`}
                                        >
                                          <Square className="w-5 h-5 mr-1" />
                                          Stop
                                        </Button>
                                      </div>
                                    )}
                                    {status === 'paused' && (
                                      <div className="flex gap-2">
                                        <Button 
                                          className="flex-1 bg-green-500 hover:bg-green-600 h-12"
                                          onClick={() => handleResumeShift(kit)}
                                          data-testid={`resume-${kit}`}
                                        >
                                          <Play className="w-5 h-5 mr-1" />
                                          Resume
                                        </Button>
                                        <Button 
                                          className="flex-1 bg-red-500 hover:bg-red-600 h-12"
                                          onClick={() => handleStopShift(kit)}
                                          data-testid={`stop-${kit}`}
                                        >
                                          <Square className="w-5 h-5 mr-1" />
                                          Stop
                                        </Button>
                                      </div>
                                    )}
                                    {status === 'completed' && (
                                      <p className="text-center text-sm text-slate-500">Shift completed</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
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
                  {ssdItems.length > 0 
                    ? ssdItems.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)
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
              <Button type="button" variant="outline" onClick={() => setShiftDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-green-500 hover:bg-green-600" disabled={shiftLoading} data-testid="start-shift-btn">
                {shiftLoading ? 'Starting...' : 'Start'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Handover Dialog */}
      <Dialog open={handoverDialogOpen} onOpenChange={setHandoverDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {handoverType === 'outgoing' ? 'End Shift Handover' : 'Start Shift Handover'} - {handoverDeployment?.bnb}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Kit-level checklists */}
            {handoverDeployment?.assigned_kits?.map(kit => (
              <div key={kit} className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {kit}
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {KIT_CHECKLIST_ITEMS.map(item => (
                    <div key={item.key}>
                      <Label className="text-xs">{item.label}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={kitChecklists[kit]?.[item.key] || 0}
                        onChange={(e) => updateKitChecklist(kit, item.key, e.target.value)}
                        className="mt-1 h-9"
                        data-testid={`kit-${kit}-${item.key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* BnB-level checklist */}
            <div className="border rounded-lg p-4 bg-slate-50">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Shared BnB Items
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {BNB_CHECKLIST_ITEMS.map(item => (
                  <div key={item.key}>
                    <Label className="text-xs">{item.label}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={bnbChecklist[item.key] || 0}
                      onChange={(e) => updateBnbChecklist(item.key, e.target.value)}
                      className="mt-1 h-9"
                      data-testid={`bnb-${item.key}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Missing items */}
            <div className="border rounded-lg p-4 border-amber-200 bg-amber-50">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Missing Items
                </h4>
                <Button variant="outline" size="sm" onClick={addMissingItem}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
              
              {missingItems.length === 0 ? (
                <p className="text-sm text-slate-500">No missing items reported</p>
              ) : (
                <div className="space-y-2">
                  {missingItems.map((mi, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border">
                      <Select value={mi.item} onValueChange={(v) => updateMissingItem(idx, 'item', v)}>
                        <SelectTrigger className="flex-1 h-9"><SelectValue placeholder="Item" /></SelectTrigger>
                        <SelectContent>
                          {items.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        value={mi.quantity}
                        onChange={(e) => updateMissingItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-16 h-9"
                        placeholder="Qty"
                      />
                      <Select value={mi.kit_id || 'bnb'} onValueChange={(v) => updateMissingItem(idx, 'kit_id', v === 'bnb' ? '' : v)}>
                        <SelectTrigger className="w-28 h-9"><SelectValue placeholder="Kit" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bnb">BnB</SelectItem>
                          {handoverDeployment?.assigned_kits?.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={mi.report_as_lost}
                          onChange={(e) => updateMissingItem(idx, 'report_as_lost', e.target.checked)}
                        />
                        Lost?
                      </label>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeMissingItem(idx)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Notes */}
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="Any additional notes..."
                className="mt-1"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setHandoverDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSubmitHandover} className="flex-1" data-testid="submit-handover-btn">
                Submit Handover
              </Button>
            </div>
          </div>
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
                  <button key={m.id} type="button" onClick={() => toggleManager(m.id)}
                    className={`px-3 py-1.5 text-sm rounded border transition-all ${
                      formData.deployment_managers.includes(m.id) ? 'bg-green-500 text-white border-green-500' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >{m.name}</button>
                ))}
              </div>
            </div>
            
            <div>
              <Label>Kits</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {kits.map(k => (
                  <button key={k.kit_id} type="button" onClick={() => toggleKit(k.kit_id)}
                    className={`px-3 py-1 text-sm rounded border transition-all ${
                      formData.assigned_kits.includes(k.kit_id) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >{k.kit_id}</button>
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
