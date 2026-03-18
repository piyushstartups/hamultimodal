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
import { toast } from 'sonner';
import { Users, Package, Calendar } from 'lucide-react';
import Layout from '../components/Layout';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

export default function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [kits, setKits] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [assignmentForm, setAssignmentForm] = useState({
    user_id: '',
    bnb_id: '',
    kit_ids: [],
    shift_date: new Date().toISOString().split('T')[0],
    shift_team: 'morning'
  });

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'supervisor') {
      toast.error('Admin access required');
      window.location.href = '/dashboard';
      return;
    }
    fetchData();
  }, [user]);

  useEffect(() => {
    if (selectedDate) {
      fetchAssignments();
    }
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      const [usersRes, kitsRes] = await Promise.all([
        api.get('/users'),
        api.get('/kits'),
      ]);
      setUsers(usersRes.data);
      setKits(kitsRes.data);
      setBnbs(kitsRes.data.filter(k => k.type === 'bnb'));
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  const fetchAssignments = async () => {
    try {
      const response = await api.get(`/admin/assignments?shift_date=${selectedDate}`);
      setAssignments(response.data);
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/assignments', assignmentForm);
      toast.success('Assignment created successfully');
      setDialogOpen(false);
      fetchAssignments();
      fetchData();
      setAssignmentForm({
        user_id: '',
        bnb_id: '',
        kit_ids: [],
        shift_date: new Date().toISOString().split('T')[0],
        shift_team: 'morning'
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create assignment');
    }
  };

  const getAvailableKits = () => {
    return kits.filter(k => k.type === 'kit' && k.assigned_bnb === assignmentForm.bnb_id);
  };

  const toggleKitSelection = (kitId) => {
    setAssignmentForm(prev => ({
      ...prev,
      kit_ids: prev.kit_ids.includes(kitId)
        ? prev.kit_ids.filter(id => id !== kitId)
        : [...prev.kit_ids, kitId]
    }));
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Admin Panel</h1>
        <p className="text-sm text-slate-600 mt-1">Manage daily assignments and team allocation</p>
      </div>

      {/* Date Selector & New Assignment Button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Label>Viewing Date:</Label>
          <Input
            type="date"
            data-testid="date-selector"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-48"
          />
        </div>
        <Button
          data-testid="new-assignment-btn"
          onClick={() => setDialogOpen(true)}
          className="bg-slate-900 hover:bg-slate-800"
        >
          <Calendar className="w-4 h-4 mr-2" />
          New Assignment
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold font-tactical text-slate-900">Total Users</h3>
          </div>
          <p className="text-3xl font-bold text-blue-600">{users.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold font-tactical text-slate-900">Total BnBs</h3>
          </div>
          <p className="text-3xl font-bold text-green-600">{bnbs.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold font-tactical text-slate-900">Today's Assignments</h3>
          </div>
          <p className="text-3xl font-bold text-amber-600">{assignments.length}</p>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold font-tactical text-slate-900 mb-4">
          Assignments for {selectedDate}
        </h2>
        {assignments.length > 0 ? (
          <div className="space-y-4">
            {assignments.map((assignment) => {
              const assignedUser = users.find(u => u.id === assignment.user_id);
              return (
                <div
                  key={assignment.id}
                  data-testid={`assignment-${assignment.id}`}
                  className="border border-slate-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{assignedUser?.name || 'Unknown User'}</h3>
                      <p className="text-sm text-slate-600 mt-1">
                        BnB: <span className="font-data font-medium">{assignment.bnb_id}</span>
                      </p>
                      <p className="text-sm text-slate-600">
                        Kits: <span className="font-data font-medium">{assignment.kit_ids.join(', ')}</span>
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      assignment.shift_team === 'morning' 
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}>
                      {assignment.shift_team.toUpperCase()} SHIFT
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">No assignments for this date</p>
        )}
      </div>

      {/* New Assignment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="font-tactical text-xl">Create New Assignment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAssignment} className="space-y-4 mt-4">
            <div>
              <Label>User</Label>
              <Select
                value={assignmentForm.user_id}
                onValueChange={(val) => setAssignmentForm({ ...assignmentForm, user_id: val })}
                required
              >
                <SelectTrigger data-testid="user-select" className="mt-2">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.role === 'deployer').map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>BnB</Label>
              <Select
                value={assignmentForm.bnb_id}
                onValueChange={(val) => setAssignmentForm({ ...assignmentForm, bnb_id: val, kit_ids: [] })}
                required
              >
                <SelectTrigger data-testid="bnb-select" className="mt-2">
                  <SelectValue placeholder="Select BnB" />
                </SelectTrigger>
                <SelectContent>
                  {bnbs.map(bnb => (
                    <SelectItem key={bnb.kit_id} value={bnb.kit_id}>{bnb.kit_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {assignmentForm.bnb_id && (
              <div>
                <Label>Assign Kits</Label>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3">
                  {getAvailableKits().map(kit => (
                    <label key={kit.kit_id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assignmentForm.kit_ids.includes(kit.kit_id)}
                        onChange={() => toggleKitSelection(kit.kit_id)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{kit.kit_id}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Shift Date</Label>
              <Input
                type="date"
                data-testid="shift-date-input"
                value={assignmentForm.shift_date}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, shift_date: e.target.value })}
                className="mt-2"
                required
              />
            </div>

            <div>
              <Label>Shift Team</Label>
              <Select
                value={assignmentForm.shift_team}
                onValueChange={(val) => setAssignmentForm({ ...assignmentForm, shift_team: val })}
                required
              >
                <SelectTrigger data-testid="shift-team-select" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning Team</SelectItem>
                  <SelectItem value="night">Night Team</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                data-testid="submit-assignment-btn"
                type="submit"
                className="flex-1 bg-slate-900 hover:bg-slate-800"
              >
                Create Assignment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
