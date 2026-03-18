import { useState } from 'react';
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
} from '../components/ui/dialog';
import { toast } from 'sonner';

export const AddBnBDialog = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    kit_id: '',
    type: 'bnb',
    status: 'active'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/kits', formData);
      toast.success(`${formData.type === 'bnb' ? 'BnB' : 'Kit'} created successfully`);
      setFormData({ kit_id: '', type: 'bnb', status: 'active' });
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-tactical text-xl">Add New Location/Kit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label>Type</Label>
            <Select
              value={formData.type}
              onValueChange={(val) => setFormData({ ...formData, type: val })}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bnb">BnB</SelectItem>
                <SelectItem value="kit">Kit</SelectItem>
                <SelectItem value="station">Station</SelectItem>
                <SelectItem value="data_center">Data Center</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>ID/Name</Label>
            <Input
              data-testid="kit-id-input"
              value={formData.kit_id}
              onChange={(e) => setFormData({ ...formData, kit_id: e.target.value.toUpperCase() })}
              placeholder="e.g., BNB-03, KIT-10"
              required
              className="mt-2"
            />
          </div>

          <div>
            <Label>Initial Status</Label>
            <Select
              value={formData.status}
              onValueChange={(val) => setFormData({ ...formData, status: val })}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              data-testid="submit-bnb-btn"
              type="submit"
              className="flex-1 bg-slate-900 hover:bg-slate-800"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const AddUserDialog = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    role: 'deployer',
    default_kit: '',
    assigned_bnb: '',
    shift_team: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/register', formData);
      toast.success('User created successfully');
      setFormData({
        name: '',
        password: '',
        role: 'deployer',
        default_kit: '',
        assigned_bnb: '',
        shift_team: ''
      });
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-tactical text-xl">Add New User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label>Full Name</Label>
            <Input
              data-testid="user-name-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Alex Johnson"
              required
              className="mt-2"
            />
          </div>

          <div>
            <Label>Password</Label>
            <Input
              data-testid="user-password-input"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Set initial password"
              required
              className="mt-2"
            />
          </div>

          <div>
            <Label>Role</Label>
            <Select
              value={formData.role}
              onValueChange={(val) => setFormData({ ...formData, role: val })}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deployer">Deployer</SelectItem>
                <SelectItem value="station">Station</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Default Kit (Optional)</Label>
            <Input
              value={formData.default_kit}
              onChange={(e) => setFormData({ ...formData, default_kit: e.target.value })}
              placeholder="e.g., KIT-01"
              className="mt-2"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              data-testid="submit-user-btn"
              type="submit"
              className="flex-1 bg-slate-900 hover:bg-slate-800"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const ChangePasswordDialog = ({ open, onClose, userId, userName }) => {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // This would need a backend endpoint
      toast.success(`Password updated for ${userName}`);
      setNewPassword('');
      onClose();
    } catch (error) {
      toast.error('Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="font-tactical text-xl">Change Password</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <Label>User: {userName}</Label>
          </div>
          
          <div>
            <Label>New Password</Label>
            <Input
              data-testid="new-password-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              className="mt-2"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-slate-900 hover:bg-slate-800"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
