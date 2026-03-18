import { useState, useEffect } from 'react';
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
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Edit, Trash2, MapPin, Package, Users } from 'lucide-react';

export default function Deployments() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState(null);
  
  // Options
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [managers, setManagers] = useState([]);
  
  // Form data - deployment_managers is now an array
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
      const [bnbsRes, kitsRes, usersRes] = await Promise.all([
        api.get('/bnbs'),
        api.get('/kits'),
        api.get('/users')
      ]);
      setBnbs(bnbsRes.data);
      setKits(kitsRes.data);
      // Filter to deployment_manager role only for assignment
      setManagers(usersRes.data.filter(u => u.role === 'deployment_manager'));
    } catch (error) {
      console.error(error);
    }
  };

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    // Add empty slots for days before first day of month
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    
    // Add all days of month
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
    
    // Managers only see deployments where they are assigned
    if (!isAdmin) {
      deps = deps.filter(d => 
        d.deployment_managers?.includes(user?.id) || 
        d.deployment_manager === user?.id // backward compatibility
      );
    }
    
    return deps;
  };

  const navigateMonth = (direction) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
    setSelectedDate(null);
  };

  const openAddDialog = () => {
    if (!selectedDate) {
      toast.error('Please select a date first');
      return;
    }
    setEditingDeployment(null);
    setFormData({
      bnb: '',
      shift: 'morning',
      deployment_managers: [],
      assigned_kits: [],
    });
    setDialogOpen(true);
  };

  const openEditDialog = (deployment) => {
    setEditingDeployment(deployment);
    setFormData({
      bnb: deployment.bnb,
      shift: deployment.shift,
      deployment_managers: deployment.deployment_managers || 
        (deployment.deployment_manager ? [deployment.deployment_manager] : []), // backward compatibility
      assigned_kits: deployment.assigned_kits || [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.bnb) {
      toast.error('BnB is required');
      return;
    }
    
    if (formData.deployment_managers.length === 0) {
      toast.error('At least one Deployment Manager is required');
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
      toast.error(error.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async (deploymentId) => {
    if (!confirm('Delete this deployment?')) return;
    try {
      await api.delete(`/deployments/${deploymentId}`);
      toast.success('Deployment deleted');
      fetchDeployments();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const toggleKit = (kitId) => {
    const arr = formData.assigned_kits;
    if (arr.includes(kitId)) {
      setFormData({ ...formData, assigned_kits: arr.filter(k => k !== kitId) });
    } else {
      setFormData({ ...formData, assigned_kits: [...arr, kitId] });
    }
  };

  const toggleManager = (managerId) => {
    const arr = formData.deployment_managers;
    if (arr.includes(managerId)) {
      setFormData({ ...formData, deployment_managers: arr.filter(m => m !== managerId) });
    } else {
      setFormData({ ...formData, deployment_managers: [...arr, managerId] });
    }
  };

  const days = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = formatDateKey(new Date());
  const selectedDeployments = selectedDate ? getDeploymentsForDate(selectedDate) : [];

  const getUserName = (userId) => {
    const u = managers.find(m => m.id === userId);
    return u?.name || userId;
  };

  const getManagerNames = (dep) => {
    // Support both old (deployment_manager) and new (deployment_managers) format
    if (dep.deployment_managers && dep.deployment_managers.length > 0) {
      return dep.deployment_managers.map(id => getUserName(id)).join(', ');
    }
    if (dep.deployment_manager) {
      return getUserName(dep.deployment_manager);
    }
    return 'Unassigned';
  };

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
              <p className="text-sm text-slate-600">{isAdmin ? 'Plan & assign' : 'Your assignments'}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-xl border p-4">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)} data-testid="prev-month-btn">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-lg font-semibold">{monthName}</h2>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)} data-testid="next-month-btn">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }
                
                const dateKey = formatDateKey(day);
                const isToday = dateKey === today;
                const isSelected = selectedDate && formatDateKey(selectedDate) === dateKey;
                const dayDeployments = getDeploymentsForDate(day);
                
                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDate(day)}
                    data-testid={`day-${dateKey}`}
                    className={`aspect-square p-1 rounded-lg border transition-all relative ${
                      isSelected 
                        ? 'bg-blue-500 text-white border-blue-500' 
                        : isToday
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-sm font-medium">{day.getDate()}</span>
                    {dayDeployments.length > 0 && (
                      <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5`}>
                        {dayDeployments.slice(0, 3).map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} 
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Details */}
          <div className="bg-white rounded-xl border p-4">
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
                        <div className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{dep.bnb}</span>
                            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{dep.shift}</span>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-white/20" onClick={() => openEditDialog(dep)} data-testid={`edit-deployment-${dep.id}`}>
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-red-500" onClick={() => handleDelete(dep.id)} data-testid={`delete-deployment-${dep.id}`}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="p-3 space-y-2 text-sm">
                          <div className="flex items-start gap-2">
                            <Users className="w-4 h-4 text-slate-400 mt-0.5" />
                            <span className="flex-1">{getManagerNames(dep)}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <Package className="w-4 h-4 text-slate-400 mt-0.5" />
                            <div className="flex flex-wrap gap-1">
                              {dep.assigned_kits?.map(kit => (
                                <span key={kit} className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded">
                                  {kit}
                                </span>
                              ))}
                              {(!dep.assigned_kits || dep.assigned_kits.length === 0) && (
                                <span className="text-slate-400">No kits</span>
                              )}
                            </div>
                          </div>
                        </div>
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

      {/* Add/Edit Deployment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDeployment ? 'Edit Deployment' : 'Add Deployment'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <Label>BnB *</Label>
              <Select value={formData.bnb} onValueChange={(v) => setFormData({ ...formData, bnb: v })}>
                <SelectTrigger className="mt-1" data-testid="bnb-select"><SelectValue placeholder="Select BnB" /></SelectTrigger>
                <SelectContent>
                  {bnbs.map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {bnbs.length === 0 && <p className="text-xs text-amber-600 mt-1">No BnBs available. Add BnBs via Admin Panel.</p>}
            </div>
            
            <div>
              <Label>Shift *</Label>
              <Select value={formData.shift} onValueChange={(v) => setFormData({ ...formData, shift: v })}>
                <SelectTrigger className="mt-1" data-testid="shift-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Deployment Managers * <span className="text-xs text-slate-500">(select one or more)</span></Label>
              <p className="text-xs text-slate-500 mb-2">Click to select/deselect</p>
              <div className="flex flex-wrap gap-2">
                {managers.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleManager(m.id)}
                    data-testid={`manager-${m.id}`}
                    className={`px-3 py-1.5 text-sm rounded border transition-all ${
                      formData.deployment_managers.includes(m.id)
                        ? 'bg-green-500 text-white border-green-500'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-green-300'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
                {managers.length === 0 && <span className="text-sm text-amber-600">No deployment managers available. Add users via Admin Panel.</span>}
              </div>
            </div>
            
            <div>
              <Label>Kits</Label>
              <p className="text-xs text-slate-500 mb-2">Click to select</p>
              <div className="flex flex-wrap gap-2">
                {kits.map(k => (
                  <button
                    key={k.kit_id}
                    type="button"
                    onClick={() => toggleKit(k.kit_id)}
                    data-testid={`kit-${k.kit_id}`}
                    className={`px-3 py-1 text-sm rounded border transition-all ${
                      formData.assigned_kits.includes(k.kit_id)
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {k.kit_id}
                  </button>
                ))}
                {kits.length === 0 && <span className="text-sm text-slate-400">No kits available</span>}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" data-testid="submit-deployment-btn">
                {editingDeployment ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
