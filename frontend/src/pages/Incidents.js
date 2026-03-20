import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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
  AlertTriangle, 
  Plus, 
  Search,
  DollarSign,
  User,
  Calendar,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  History,
  Package
} from 'lucide-react';
import Layout from '../components/Layout';

const INCIDENT_TYPES = [
  { value: 'damage', label: 'Damage', color: 'bg-amber-100 text-amber-800' },
  { value: 'loss', label: 'Loss', color: 'bg-red-100 text-red-800' },
  { value: 'misuse', label: 'Misuse', color: 'bg-purple-100 text-purple-800' },
];

const SEVERITY_LEVELS = [
  { value: 'low', label: 'Low', color: 'bg-green-100 text-green-800' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-100 text-amber-800' },
  { value: 'high', label: 'High', color: 'bg-red-100 text-red-800' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: 'bg-amber-100 text-amber-800' },
  { value: 'investigating', label: 'Investigating', color: 'bg-blue-100 text-blue-800' },
  { value: 'resolved', label: 'Resolved', color: 'bg-green-100 text-green-800' },
  { value: 'closed', label: 'Closed', color: 'bg-slate-100 text-slate-800' },
];

export default function Incidents() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [operationalDate, setOperationalDate] = useState('');
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [workerHistoryOpen, setWorkerHistoryOpen] = useState(false);
  const [workerHistory, setWorkerHistory] = useState(null);
  
  // Form data
  const [formData, setFormData] = useState({
    incident_type: 'damage',
    user_id: '',
    item_id: '',
    kit_id: '',
    bnb_id: '',
    shift_date: '', // Will be set from backend operational date
    description: '',
    severity: 'medium',
    penalty_amount: '',
    notes: '',
  });
  
  // Options
  const [workers, setWorkers] = useState([]);
  const [items, setItems] = useState([]);
  const [kits, setKits] = useState([]);

  // Fetch operational date from backend on mount
  useEffect(() => {
    const fetchOperationalDate = async () => {
      try {
        const response = await api.get('/system/operational-date');
        const opDate = response.data.operational_date;
        setOperationalDate(opDate);
        setFormData(prev => ({ ...prev, shift_date: opDate }));
      } catch (error) {
        console.error('Failed to fetch operational date:', error);
      }
    };
    fetchOperationalDate();
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'supervisor') {
      window.location.href = '/dashboard';
      return;
    }
    fetchIncidents();
    fetchSummary();
    fetchOptions();
  }, [user, statusFilter]);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const url = statusFilter !== 'all' ? `/incidents?status=${statusFilter}` : '/incidents';
      const response = await api.get(url);
      setIncidents(response.data);
    } catch (error) {
      toast.error('Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await api.get('/incidents/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };

  const fetchOptions = async () => {
    try {
      const [usersRes, itemsRes, kitsRes] = await Promise.all([
        api.get('/users'),
        api.get('/items'),
        api.get('/kits'),
      ]);
      setWorkers(usersRes.data.filter(u => ['deployer', 'station'].includes(u.role)));
      setItems(itemsRes.data);
      setKits(kitsRes.data);
    } catch (error) {
      console.error('Failed to fetch options:', error);
    }
  };

  const fetchWorkerHistory = async (userId) => {
    try {
      const response = await api.get(`/history/worker/${userId}`);
      setWorkerHistory(response.data);
      setWorkerHistoryOpen(true);
    } catch (error) {
      toast.error('Failed to load worker history');
    }
  };

  const handleCreateIncident = async (e) => {
    e.preventDefault();
    
    if (!formData.user_id || !formData.description) {
      toast.error('Please fill required fields');
      return;
    }

    try {
      await api.post('/incidents', {
        ...formData,
        penalty_amount: formData.penalty_amount ? parseFloat(formData.penalty_amount) : null,
      });
      toast.success('Incident created');
      setCreateDialogOpen(false);
      fetchIncidents();
      fetchSummary();
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create incident');
    }
  };

  const handleUpdateStatus = async (incidentId, newStatus, penaltyAmount = null) => {
    try {
      await api.put(`/incidents/${incidentId}?status=${newStatus}${penaltyAmount ? `&penalty_amount=${penaltyAmount}` : ''}`);
      toast.success('Incident updated');
      fetchIncidents();
      fetchSummary();
      setDetailDialogOpen(false);
    } catch (error) {
      toast.error('Failed to update incident');
    }
  };

  const resetForm = () => {
    setFormData({
      incident_type: 'damage',
      user_id: '',
      item_id: '',
      kit_id: '',
      bnb_id: '',
      shift_date: operationalDate, // Use operational date from backend
      description: '',
      severity: 'medium',
      penalty_amount: '',
      notes: '',
    });
  };

  const openDetail = (incident) => {
    setSelectedIncident(incident);
    setDetailDialogOpen(true);
  };

  const filteredIncidents = incidents.filter(inc => 
    inc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inc.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inc.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeStyle = (type) => INCIDENT_TYPES.find(t => t.value === type)?.color || 'bg-slate-100';
  const getSeverityStyle = (severity) => SEVERITY_LEVELS.find(s => s.value === severity)?.color || 'bg-slate-100';
  const getStatusStyle = (status) => STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-slate-100';

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Incidents & Penalties</h1>
            <p className="text-sm text-slate-600 mt-1">Track damage, loss, and accountability</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" />
            Report Incident
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-amber-600" />
                <div>
                  <p className="text-sm text-amber-700">Open</p>
                  <p className="text-2xl font-bold text-amber-900">{summary.by_status?.open?.count || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-600" />
                <div>
                  <p className="text-sm text-red-700">Damage</p>
                  <p className="text-2xl font-bold text-red-900">{summary.by_type?.damage || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
              <div className="flex items-center gap-3">
                <XCircle className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-purple-700">Loss</p>
                  <p className="text-2xl font-bold text-purple-900">{summary.by_type?.loss || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-green-700">Total Penalties</p>
                  <p className="text-2xl font-bold text-green-900">
                    ${Object.values(summary.by_status || {}).reduce((sum, s) => sum + (s.penalties || 0), 0).toFixed(0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search incidents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Incidents List */}
        {loading ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <p className="text-slate-600">Loading...</p>
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No incidents found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredIncidents.map(incident => (
              <div 
                key={incident.id} 
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer"
                onClick={() => openDetail(incident)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      incident.incident_type === 'damage' ? 'bg-amber-100' :
                      incident.incident_type === 'loss' ? 'bg-red-100' : 'bg-purple-100'
                    }`}>
                      <AlertTriangle className={`w-5 h-5 ${
                        incident.incident_type === 'damage' ? 'text-amber-600' :
                        incident.incident_type === 'loss' ? 'text-red-600' : 'text-purple-600'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900">{incident.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeStyle(incident.incident_type)}`}>
                          {incident.incident_type}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getSeverityStyle(incident.severity)}`}>
                          {incident.severity}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-1">{incident.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {incident.user_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {incident.shift_date}
                        </span>
                        {incident.penalty_amount > 0 && (
                          <span className="flex items-center gap-1 text-red-600">
                            <DollarSign className="w-3 h-3" />
                            ${incident.penalty_amount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusStyle(incident.status)}`}>
                    {incident.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Incident Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle>Report Incident</DialogTitle>
            <DialogDescription>Record damage, loss, or misuse</DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCreateIncident} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Incident Type *</Label>
                  <Select value={formData.incident_type} onValueChange={(val) => setFormData({ ...formData, incident_type: val })}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Severity *</Label>
                  <Select value={formData.severity} onValueChange={(val) => setFormData({ ...formData, severity: val })}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_LEVELS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Worker Responsible *</Label>
                <Select value={formData.user_id} onValueChange={(val) => setFormData({ ...formData, user_id: val })}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Select worker" />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Item</Label>
                  <Select value={formData.item_id} onValueChange={(val) => setFormData({ ...formData, item_id: val })}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {items.map(i => (
                        <SelectItem key={i.item_id} value={i.item_id}>{i.item_id} - {i.item_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Kit</Label>
                  <Select value={formData.kit_id} onValueChange={(val) => setFormData({ ...formData, kit_id: val })}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Select kit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {kits.filter(k => k.type === 'kit').map(k => (
                        <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Shift Date *</Label>
                  <Input
                    type="date"
                    value={formData.shift_date}
                    onChange={(e) => setFormData({ ...formData, shift_date: e.target.value })}
                    className="mt-1 h-9"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Penalty ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.penalty_amount}
                    onChange={(e) => setFormData({ ...formData, penalty_amount: e.target.value })}
                    placeholder="0.00"
                    className="mt-1 h-9"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Description *</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what happened..."
                  className="mt-1 h-16 resize-none text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 px-4 py-3 border-t bg-slate-50 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700">
                Create Incident
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Incident Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle>Incident Details</DialogTitle>
          </DialogHeader>
          
          {selectedIncident && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold">{selectedIncident.id}</span>
                <span className={`text-sm px-3 py-1 rounded-full ${getStatusStyle(selectedIncident.status)}`}>
                  {selectedIncident.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Type</span>
                  <p className="font-medium capitalize">{selectedIncident.incident_type}</p>
                </div>
                <div>
                  <span className="text-slate-500">Severity</span>
                  <p className="font-medium capitalize">{selectedIncident.severity}</p>
                </div>
                <div>
                  <span className="text-slate-500">Worker</span>
                  <p className="font-medium">{selectedIncident.user_name}</p>
                </div>
                <div>
                  <span className="text-slate-500">Date</span>
                  <p className="font-medium">{selectedIncident.shift_date}</p>
                </div>
              </div>

              <div>
                <span className="text-sm text-slate-500">Description</span>
                <p className="mt-1 text-slate-900">{selectedIncident.description}</p>
              </div>

              {selectedIncident.penalty_amount > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <span className="text-sm text-red-700">Penalty Assigned</span>
                  <p className="text-2xl font-bold text-red-900">${selectedIncident.penalty_amount}</p>
                </div>
              )}

              {/* Actions */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-slate-700 mb-2">Update Status</p>
                <div className="flex gap-2">
                  {selectedIncident.status !== 'resolved' && (
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleUpdateStatus(selectedIncident.id, 'resolved')}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Resolve
                    </Button>
                  )}
                  {selectedIncident.status === 'open' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleUpdateStatus(selectedIncident.id, 'investigating')}
                    >
                      Investigate
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => fetchWorkerHistory(selectedIncident.user_id)}
                  >
                    <History className="w-4 h-4 mr-1" />
                    Worker History
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Worker History Dialog */}
      <Dialog open={workerHistoryOpen} onOpenChange={setWorkerHistoryOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle>Worker History</DialogTitle>
          </DialogHeader>
          
          {workerHistory && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="font-bold">{workerHistory.worker.name}</h3>
                  <p className="text-xs text-slate-600">{workerHistory.worker.role}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <p className="text-xl font-bold text-blue-900">{workerHistory.stats.total_shifts}</p>
                  <p className="text-xs text-blue-700">Shifts</p>
                </div>
                <div className="bg-green-50 rounded-lg p-2 text-center">
                  <p className="text-xl font-bold text-green-900">{workerHistory.stats.total_hours}</p>
                  <p className="text-xs text-green-700">Hours</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2 text-center">
                  <p className="text-xl font-bold text-red-900">{workerHistory.stats.total_incidents}</p>
                  <p className="text-xs text-red-700">Incidents</p>
                </div>
              </div>

              {/* Incidents */}
              {workerHistory.incidents.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm mb-2">Incident History</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {workerHistory.incidents.map(inc => (
                      <div key={inc.id} className="bg-slate-50 rounded-lg p-2 text-sm">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-xs">{inc.incident_type} - {inc.description.slice(0, 40)}...</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusStyle(inc.status)}`}>
                            {inc.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{inc.shift_date}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Penalties Total */}
              {workerHistory.stats.total_penalties > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-red-700 text-sm">Total Penalties</span>
                    <span className="text-xl font-bold text-red-900">${workerHistory.stats.total_penalties}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
