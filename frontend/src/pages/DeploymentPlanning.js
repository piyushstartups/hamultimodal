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
  DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar,
  Users,
  Package,
  MapPin,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  Building
} from 'lucide-react';
import Layout from '../components/Layout';

export default function DeploymentPlanning() {
  const { user } = useAuth();
  const [operationalDate, setOperationalDate] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekDates, setWeekDates] = useState([]);
  
  // Dialog states
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [bnbDialogOpen, setBnbDialogOpen] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    bnb_id: '',
    kit_ids: [],
    morning_team: [],
    night_team: [],
  });
  
  // BnB form data
  const [bnbFormData, setBnbFormData] = useState({
    kit_id: '',
    status: 'active',
  });
  
  // Available options
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [workers, setWorkers] = useState([]);

  // Fetch operational date on mount
  useEffect(() => {
    const init = async () => {
      try {
        const response = await api.get('/system/operational-date');
        const opDate = response.data.operational_date;
        setOperationalDate(opDate);
        setSelectedDate(opDate);
      } catch (error) {
        console.error('Failed to fetch operational date:', error);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'supervisor') {
      toast.error('Admin access required');
      window.location.href = '/dashboard';
      return;
    }
    if (selectedDate) {
      generateWeekDates(selectedDate);
      fetchSummary();
      fetchOptions();
    }
  }, [user, selectedDate]);

  const generateWeekDates = (centerDate) => {
    const center = new Date(centerDate);
    const dates = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(center);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    setWeekDates(dates);
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/deployment-summary?shift_date=${selectedDate}`);
      setSummary(response.data);
    } catch (error) {
      toast.error('Failed to load deployment summary');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [bnbsRes, kitsRes, usersRes] = await Promise.all([
        api.get('/kits'),
        api.get('/kits'),
        api.get('/users'),
      ]);
      setBnbs(bnbsRes.data.filter(k => k.type === 'bnb'));
      setKits(kitsRes.data.filter(k => k.type === 'kit'));
      setWorkers(usersRes.data.filter(u => ['deployer', 'station'].includes(u.role)));
    } catch (error) {
      console.error('Failed to fetch options:', error);
    }
  };

  const navigateDate = (direction) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + direction);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const isToday = (dateStr) => {
    return dateStr === operationalDate; // Use backend operational date
  };

  const openNewAssignment = () => {
    setEditingAssignment(null);
    setFormData({
      bnb_id: '',
      kit_ids: [],
      morning_team: [],
      night_team: [],
    });
    setAssignmentDialogOpen(true);
  };

  const openNewBnb = () => {
    setBnbFormData({
      kit_id: '',
      status: 'active',
    });
    setBnbDialogOpen(true);
  };

  const handleCreateBnb = async (e) => {
    e.preventDefault();
    
    if (!bnbFormData.kit_id) {
      toast.error('Please enter a BnB ID');
      return;
    }

    try {
      await api.post('/kits', {
        kit_id: bnbFormData.kit_id.toUpperCase(),
        type: 'bnb',
        status: bnbFormData.status,
      });
      toast.success('BnB location created');
      setBnbDialogOpen(false);
      fetchOptions();
      fetchSummary();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create BnB');
    }
  };

  const openEditAssignment = (assignment) => {
    setEditingAssignment(assignment);
    setFormData({
      bnb_id: assignment.bnb_id,
      kit_ids: assignment.kit_ids || [],
      morning_team: assignment.morning_team || [],
      night_team: assignment.night_team || [],
    });
    setAssignmentDialogOpen(true);
  };

  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    
    if (!formData.bnb_id) {
      toast.error('Please select a BnB');
      return;
    }

    try {
      if (editingAssignment) {
        await api.put(`/admin/assignments/${editingAssignment.id}`, {
          ...formData,
          shift_date: selectedDate,
        });
        toast.success('Assignment updated');
      } else {
        await api.post('/admin/assignments', {
          ...formData,
          shift_date: selectedDate,
        });
        toast.success('Assignment created');
      }
      setAssignmentDialogOpen(false);
      fetchSummary();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save assignment');
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!window.confirm('Are you sure you want to delete this assignment?')) return;
    
    try {
      await api.delete(`/admin/assignments/${assignmentId}`);
      toast.success('Assignment deleted');
      fetchSummary();
    } catch (error) {
      toast.error('Failed to delete assignment');
    }
  };

  const toggleArrayItem = (array, item) => {
    if (array.includes(item)) {
      return array.filter(i => i !== item);
    }
    return [...array, item];
  };

  // Get assigned kit IDs and worker IDs for the current date (to show availability)
  const assignedKitIds = summary?.assignments?.flatMap(a => a.kit_ids || []) || [];
  const assignedWorkerIds = summary?.assignments?.flatMap(a => [...(a.morning_team || []), ...(a.night_team || [])]) || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Deployment Planning</h1>
            <p className="text-sm text-slate-600 mt-1">Plan and manage daily BnB deployments</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={openNewBnb} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
              <Building className="w-4 h-4 mr-2" />
              Add BnB
            </Button>
            <Button onClick={openNewAssignment} className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              New Assignment
            </Button>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => navigateDate(-7)}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-500" />
              <span className="font-semibold text-lg">{formatDate(selectedDate)}</span>
              {isToday(selectedDate) && (
                <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">Today</span>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigateDate(7)}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Week View */}
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map(date => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`p-3 rounded-lg text-center transition-all ${
                  date === selectedDate 
                    ? 'bg-slate-900 text-white' 
                    : isToday(date)
                    ? 'bg-green-50 text-green-900 border border-green-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="text-xs font-medium">
                  {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="text-lg font-bold">
                  {new Date(date).getDate()}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Active BnBs</p>
                  <p className="text-2xl font-bold text-slate-900">{summary.active_bnbs} / {summary.total_bnbs}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Package className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Deployed Kits</p>
                  <p className="text-2xl font-bold text-slate-900">{summary.deployed_kits} / {summary.total_kits}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Workers Assigned</p>
                  <p className="text-2xl font-bold text-slate-900">{summary.assigned_workers} / {summary.total_workers}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Shifts Logged</p>
                  <p className="text-2xl font-bold text-slate-900">{summary.shifts_ended} / {summary.shifts_started}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assignments Grid */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Assignments for {formatDate(selectedDate)}</h2>
          
          {loading ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-600">Loading...</p>
            </div>
          ) : summary?.assignments?.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">No deployments planned for this date</p>
              <Button onClick={openNewAssignment} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Create First Assignment
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary?.assignments?.map(assignment => (
                <div key={assignment.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* BnB Header */}
                  <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span className="font-semibold">{assignment.bnb_id}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-white hover:bg-slate-800 h-8 w-8"
                        onClick={() => openEditAssignment(assignment)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-white hover:bg-red-600 h-8 w-8"
                        onClick={() => handleDeleteAssignment(assignment.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="p-4 space-y-4">
                    {/* Kits */}
                    <div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                        <Package className="w-4 h-4" />
                        <span>Kits ({assignment.kit_ids?.length || 0})</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {assignment.kit_ids?.map(kitId => (
                          <span key={kitId} className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded">
                            {kitId}
                          </span>
                        ))}
                        {(!assignment.kit_ids || assignment.kit_ids.length === 0) && (
                          <span className="text-xs text-slate-400">No kits assigned</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Morning Team */}
                    <div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                        <Clock className="w-4 h-4" />
                        <span>Morning Shift ({assignment.morning_team?.length || 0})</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {assignment.morning_team?.map(userId => {
                          const worker = workers.find(w => w.id === userId);
                          return (
                            <span key={userId} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {worker?.name || userId}
                            </span>
                          );
                        })}
                        {(!assignment.morning_team || assignment.morning_team.length === 0) && (
                          <span className="text-xs text-slate-400">No workers assigned</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Night Team */}
                    <div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                        <Clock className="w-4 h-4" />
                        <span>Night Shift ({assignment.night_team?.length || 0})</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {assignment.night_team?.map(userId => {
                          const worker = workers.find(w => w.id === userId);
                          return (
                            <span key={userId} className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                              {worker?.name || userId}
                            </span>
                          );
                        })}
                        {(!assignment.night_team || assignment.night_team.length === 0) && (
                          <span className="text-xs text-slate-400">No workers assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Add More BnBs */}
        {summary && summary.assignments && summary.assignments.length > 0 && summary.active_bnbs < summary.total_bnbs && (
          <div className="flex justify-center">
            <Button onClick={openNewAssignment} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Another BnB ({summary.total_bnbs - summary.active_bnbs} available)
            </Button>
          </div>
        )}
      </div>

      {/* Assignment Dialog */}
      <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'Edit Assignment' : 'New Assignment'}</DialogTitle>
            <DialogDescription>
              {formatDate(selectedDate)} - Assign BnB, kits, and workers
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSaveAssignment} className="space-y-6 mt-4">
            {/* BnB Selection */}
            <div>
              <Label>BnB Location *</Label>
              <Select 
                value={formData.bnb_id} 
                onValueChange={(val) => setFormData({ ...formData, bnb_id: val })}
                disabled={!!editingAssignment}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select BnB" />
                </SelectTrigger>
                <SelectContent>
                  {bnbs.map(bnb => {
                    const isAssigned = assignedKitIds.length > 0 && summary?.assignments?.some(a => a.bnb_id === bnb.kit_id && a.id !== editingAssignment?.id);
                    return (
                      <SelectItem key={bnb.kit_id} value={bnb.kit_id} disabled={isAssigned}>
                        {bnb.kit_id} {isAssigned && '(already assigned)'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Kit Selection */}
            <div>
              <Label>Kits to Deploy</Label>
              <p className="text-xs text-slate-500 mb-2">Click to select/deselect kits</p>
              <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg">
                {kits.map(kit => {
                  const isSelected = formData.kit_ids.includes(kit.kit_id);
                  const isAssignedElsewhere = assignedKitIds.includes(kit.kit_id) && !formData.kit_ids.includes(kit.kit_id);
                  return (
                    <button
                      key={kit.kit_id}
                      type="button"
                      disabled={isAssignedElsewhere}
                      onClick={() => setFormData({ 
                        ...formData, 
                        kit_ids: toggleArrayItem(formData.kit_ids, kit.kit_id) 
                      })}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                        isSelected 
                          ? 'bg-amber-500 text-white border-amber-500' 
                          : isAssignedElsewhere
                          ? 'bg-slate-200 text-slate-400 border-slate-200 cursor-not-allowed'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                      }`}
                    >
                      {kit.kit_id}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">{formData.kit_ids.length} kit(s) selected</p>
            </div>

            {/* Morning Team */}
            <div>
              <Label>Morning Shift Team</Label>
              <p className="text-xs text-slate-500 mb-2">Select workers for morning shift</p>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-blue-50 rounded-lg">
                {workers.map(worker => {
                  const isSelected = formData.morning_team.includes(worker.id);
                  const isInNightTeam = formData.night_team.includes(worker.id);
                  const isAssignedElsewhere = assignedWorkerIds.includes(worker.id) && 
                    !formData.morning_team.includes(worker.id) && 
                    !formData.night_team.includes(worker.id);
                  return (
                    <button
                      key={worker.id}
                      type="button"
                      disabled={isInNightTeam || isAssignedElsewhere}
                      onClick={() => setFormData({ 
                        ...formData, 
                        morning_team: toggleArrayItem(formData.morning_team, worker.id) 
                      })}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all text-left ${
                        isSelected 
                          ? 'bg-blue-500 text-white border-blue-500' 
                          : isInNightTeam
                          ? 'bg-purple-100 text-purple-400 border-purple-200 cursor-not-allowed'
                          : isAssignedElsewhere
                          ? 'bg-slate-200 text-slate-400 border-slate-200 cursor-not-allowed'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {worker.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">{formData.morning_team.length} worker(s) selected</p>
            </div>

            {/* Night Team */}
            <div>
              <Label>Night Shift Team</Label>
              <p className="text-xs text-slate-500 mb-2">Select workers for night shift</p>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-purple-50 rounded-lg">
                {workers.map(worker => {
                  const isSelected = formData.night_team.includes(worker.id);
                  const isInMorningTeam = formData.morning_team.includes(worker.id);
                  const isAssignedElsewhere = assignedWorkerIds.includes(worker.id) && 
                    !formData.morning_team.includes(worker.id) && 
                    !formData.night_team.includes(worker.id);
                  return (
                    <button
                      key={worker.id}
                      type="button"
                      disabled={isInMorningTeam || isAssignedElsewhere}
                      onClick={() => setFormData({ 
                        ...formData, 
                        night_team: toggleArrayItem(formData.night_team, worker.id) 
                      })}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all text-left ${
                        isSelected 
                          ? 'bg-purple-500 text-white border-purple-500' 
                          : isInMorningTeam
                          ? 'bg-blue-100 text-blue-400 border-blue-200 cursor-not-allowed'
                          : isAssignedElsewhere
                          ? 'bg-slate-200 text-slate-400 border-slate-200 cursor-not-allowed'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
                      }`}
                    >
                      {worker.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">{formData.night_team.length} worker(s) selected</p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setAssignmentDialogOpen(false)} 
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700">
                {editingAssignment ? 'Update' : 'Create'} Assignment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add BnB Dialog */}
      <Dialog open={bnbDialogOpen} onOpenChange={setBnbDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add New BnB Location</DialogTitle>
            <DialogDescription>
              Create a new BnB location for deployment
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCreateBnb} className="space-y-4 mt-4">
            <div>
              <Label>BnB ID *</Label>
              <Input
                value={bnbFormData.kit_id}
                onChange={(e) => setBnbFormData({ ...bnbFormData, kit_id: e.target.value.toUpperCase() })}
                placeholder="e.g., BNB-05"
                className="mt-2"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Unique identifier for this location</p>
            </div>

            <div>
              <Label>Status</Label>
              <Select 
                value={bnbFormData.status} 
                onValueChange={(val) => setBnbFormData({ ...bnbFormData, status: val })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setBnbDialogOpen(false)} 
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700">
                Create BnB
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
