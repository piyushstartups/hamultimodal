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
import { Users, Package, Calendar, Plus, Settings } from 'lucide-react';
import Layout from '../components/Layout';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { AddBnBDialog, AddUserDialog, ChangePasswordDialog } from '../components/AdminDialogs';

export default function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [kits, setKits] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addBnBOpen, setAddBnBOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [assignmentForm, setAssignmentForm] = useState({
    bnb_id: '',
    kit_ids: [],
    shift_date: new Date().toISOString().split('T')[0],
    morning_team: [],
    night_team: []
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
    
    if (!assignmentForm.bnb_id) {
      toast.error('Please select a BnB');
      return;
    }
    
    if (assignmentForm.kit_ids.length === 0) {
      toast.error('Please assign at least one kit');
      return;
    }
    
    if (assignmentForm.morning_team.length === 0 && assignmentForm.night_team.length === 0) {
      toast.error('Please add at least one team member to either shift');
      return;
    }
    
    try {
      await api.post('/admin/assignments', assignmentForm);
      toast.success('Assignment created successfully');
      setDialogOpen(false);
      fetchAssignments();
      fetchData();
      setAssignmentForm({
        bnb_id: '',
        kit_ids: [],
        shift_date: new Date().toISOString().split('T')[0],
        morning_team: [],
        night_team: []
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create assignment');
    }
  };

  const getAvailableKits = () => {
    return kits.filter(k => k.type === 'kit' && (!k.assigned_bnb || k.assigned_bnb === assignmentForm.bnb_id));
  };

  const getAvailableUsers = () => {
    return users.filter(u => u.role === 'deployer' || u.role === 'station');
  };

  const toggleKitSelection = (kitId) => {
    setAssignmentForm(prev => ({
      ...prev,
      kit_ids: prev.kit_ids.includes(kitId)
        ? prev.kit_ids.filter(id => id !== kitId)
        : [...prev.kit_ids, kitId]
    }));
  };

  const addToMorningTeam = (userId) => {
    if (!assignmentForm.morning_team.includes(userId)) {
      setAssignmentForm(prev => ({
        ...prev,
        morning_team: [...prev.morning_team, userId],
        night_team: prev.night_team.filter(id => id !== userId) // Remove from night if exists
      }));
    }
  };

  const removeFromMorningTeam = (userId) => {
    setAssignmentForm(prev => ({
      ...prev,
      morning_team: prev.morning_team.filter(id => id !== userId)
    }));
  };

  const addToNightTeam = (userId) => {
    if (!assignmentForm.night_team.includes(userId)) {
      setAssignmentForm(prev => ({
        ...prev,
        night_team: [...prev.night_team, userId],
        morning_team: prev.morning_team.filter(id => id !== userId) // Remove from morning if exists
      }));
    }
  };

  const removeFromNightTeam = (userId) => {
    setAssignmentForm(prev => ({
      ...prev,
      night_team: prev.night_team.filter(id => id !== userId)
    }));
  };

  const getUserName = (userId) => {
    return users.find(u => u.id === userId)?.name || userId;
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Admin Panel</h1>
        <p className="text-sm text-slate-600 mt-1">Human Archive - Daily BnB assignments and team allocation</p>
      </div>

      {/* Date Selector & Action Buttons */}
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
        <div className="flex gap-3">
          <Button
            onClick={() => setAddBnBOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add BnB/Kit
          </Button>
          <Button
            onClick={() => setAddUserOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Users className="w-4 h-4 mr-2" />
            Add User
          </Button>
          <Button
            data-testid="new-assignment-btn"
            onClick={() => setDialogOpen(true)}
            className="bg-slate-900 hover:bg-slate-800"
          >
            <Calendar className="w-4 h-4 mr-2" />
            New Assignment
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold font-tactical text-slate-900">Field Users</h3>
          </div>
          <p className="text-3xl font-bold text-blue-600">{getAvailableUsers().length}</p>
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
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                data-testid={`assignment-${assignment.id}`}
                className="border border-slate-200 rounded-lg p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900 font-tactical">{assignment.bnb_id}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Kits: <span className="font-data font-medium">{assignment.kit_ids.join(', ')}</span>
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                    <h4 className="text-sm font-semibold font-tactical text-amber-900 mb-2">MORNING SHIFT</h4>
                    {assignment.morning_team && assignment.morning_team.length > 0 ? (
                      <ul className="space-y-1">
                        {assignment.morning_team.map(userId => (
                          <li key={userId} className="text-sm text-slate-700">• {getUserName(userId)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No team assigned</p>
                    )}
                  </div>
                  
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                    <h4 className="text-sm font-semibold font-tactical text-blue-900 mb-2">NIGHT SHIFT</h4>
                    {assignment.night_team && assignment.night_team.length > 0 ? (
                      <ul className="space-y-1">
                        {assignment.night_team.map(userId => (
                          <li key={userId} className="text-sm text-slate-700">• {getUserName(userId)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No team assigned</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">No assignments for this date</p>
        )}
      </div>

      {/* New Assignment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-tactical text-xl">Create New Assignment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAssignment} className="space-y-5 mt-4">
            {/* Step 1: Select BnB */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <h3 className="font-semibold font-tactical text-slate-900 mb-3">Step 1: Select BnB</h3>
              <Select
                value={assignmentForm.bnb_id}
                onValueChange={(val) => setAssignmentForm({ ...assignmentForm, bnb_id: val, kit_ids: [] })}
                required
              >
                <SelectTrigger data-testid="bnb-select">
                  <SelectValue placeholder="Select BnB location" />
                </SelectTrigger>
                <SelectContent>
                  {bnbs.map(bnb => (
                    <SelectItem key={bnb.kit_id} value={bnb.kit_id}>{bnb.kit_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Assign Kits */}
            {assignmentForm.bnb_id && (
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <h3 className="font-semibold font-tactical text-slate-900 mb-3">Step 2: Assign Kits to BnB</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {getAvailableKits().map(kit => (
                    <label key={kit.kit_id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded">
                      <input
                        type="checkbox"
                        checked={assignmentForm.kit_ids.includes(kit.kit_id)}
                        onChange={() => toggleKitSelection(kit.kit_id)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-data">{kit.kit_id}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">{assignmentForm.kit_ids.length} kit(s) selected</p>
              </div>
            )}

            {/* Step 3: Morning Team */}
            <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
              <h3 className="font-semibold font-tactical text-amber-900 mb-3">Step 3: Morning Shift Team (Optional)</h3>
              <div className="mb-3">
                <Select onValueChange={addToMorningTeam}>
                  <SelectTrigger data-testid="morning-team-select">
                    <SelectValue placeholder="Add team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableUsers()
                      .filter(u => !assignmentForm.morning_team.includes(u.id) && !assignmentForm.night_team.includes(u.id))
                      .map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                {assignmentForm.morning_team.map(userId => (
                  <div key={userId} className="flex items-center justify-between bg-white p-2 rounded border border-amber-200">
                    <span className="text-sm">{getUserName(userId)}</span>
                    <button
                      type="button"
                      onClick={() => removeFromMorningTeam(userId)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {assignmentForm.morning_team.length === 0 && (
                  <p className="text-sm text-slate-500 italic">No team members added</p>
                )}
              </div>
            </div>

            {/* Step 4: Night Team */}
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <h3 className="font-semibold font-tactical text-blue-900 mb-3">Step 4: Night Shift Team (Optional)</h3>
              <div className="mb-3">
                <Select onValueChange={addToNightTeam}>
                  <SelectTrigger data-testid="night-team-select">
                    <SelectValue placeholder="Add team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableUsers()
                      .filter(u => !assignmentForm.morning_team.includes(u.id) && !assignmentForm.night_team.includes(u.id))
                      .map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                {assignmentForm.night_team.map(userId => (
                  <div key={userId} className="flex items-center justify-between bg-white p-2 rounded border border-blue-200">
                    <span className="text-sm">{getUserName(userId)}</span>
                    <button
                      type="button"
                      onClick={() => removeFromNightTeam(userId)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {assignmentForm.night_team.length === 0 && (
                  <p className="text-sm text-slate-500 italic">No team members added</p>
                )}
              </div>
            </div>

            {/* Date */}
            <div>
              <Label>Assignment Date</Label>
              <Input
                type="date"
                data-testid="shift-date-input"
                value={assignmentForm.shift_date}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, shift_date: e.target.value })}
                className="mt-2"
                required
              />
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

      {/* Add BnB/Kit Dialog */}
      <AddBnBDialog
        open={addBnBOpen}
        onClose={() => setAddBnBOpen(false)}
        onSuccess={() => {
          setAddBnBOpen(false);
          fetchData();
        }}
      />

      {/* Add User Dialog */}
      <AddUserDialog
        open={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        onSuccess={() => {
          setAddUserOpen(false);
          fetchData();
        }}
      />

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => {
          setChangePasswordOpen(false);
          setSelectedUser(null);
        }}
        userId={selectedUser?.id}
        userName={selectedUser?.name}
      />
    </Layout>
  );
}
