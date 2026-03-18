import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle, Circle, ClipboardCheck, User } from 'lucide-react';
import Layout from '../components/Layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

export default function Handover() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [handoverForm, setHandoverForm] = useState({
    to_user_id: '',
    shift_number: 1,
    notes: '',
    kit_checklist: [],
    bnb_checklist: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [dashboardRes, usersRes, itemsRes] = await Promise.all([
        api.get('/my-bnb/dashboard'),
        api.get('/users'),
        api.get('/items'),
      ]);
      
      setDashboard(dashboardRes.data);
      setUsers(usersRes.data.filter(u => u.id !== user.id));
      setItems(itemsRes.data);
      
      // Initialize checklist
      if (dashboardRes.data) {
        const kitChecklist = dashboardRes.data.kits.map(kit => ({
          kit_id: kit.kit_id,
          items: itemsRes.data
            .filter(item => item.current_kit === kit.kit_id)
            .map(item => ({
              item_id: item.item_id,
              item_name: item.item_name,
              checked: false,
              notes: ''
            }))
        }));
        
        const bnbChecklist = itemsRes.data
          .filter(item => item.current_kit === dashboardRes.data.bnb.kit_id)
          .map(item => ({
            item_id: item.item_id,
            item_name: item.item_name,
            checked: false,
            notes: ''
          }));
        
        setHandoverForm(prev => ({
          ...prev,
          kit_checklist: kitChecklist,
          bnb_checklist: bnbChecklist
        }));
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load handover data');
    }
  };

  const toggleKitItem = (kitIndex, itemIndex) => {
    setHandoverForm(prev => {
      const newChecklist = [...prev.kit_checklist];
      newChecklist[kitIndex].items[itemIndex].checked = !newChecklist[kitIndex].items[itemIndex].checked;
      return { ...prev, kit_checklist: newChecklist };
    });
  };

  const toggleBnbItem = (itemIndex) => {
    setHandoverForm(prev => {
      const newChecklist = [...prev.bnb_checklist];
      newChecklist[itemIndex].checked = !newChecklist[itemIndex].checked;
      return { ...prev, bnb_checklist: newChecklist };
    });
  };

  const updateKitItemNotes = (kitIndex, itemIndex, notes) => {
    setHandoverForm(prev => {
      const newChecklist = [...prev.kit_checklist];
      newChecklist[kitIndex].items[itemIndex].notes = notes;
      return { ...prev, kit_checklist: newChecklist };
    });
  };

  const updateBnbItemNotes = (itemIndex, notes) => {
    setHandoverForm(prev => {
      const newChecklist = [...prev.bnb_checklist];
      newChecklist[itemIndex].notes = notes;
      return { ...prev, bnb_checklist: newChecklist };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!handoverForm.to_user_id) {
      toast.error('Please select who you are handing over to');
      return;
    }
    
    // Check if all items are checked
    const allKitItemsChecked = handoverForm.kit_checklist.every(kit =>
      kit.items.every(item => item.checked)
    );
    const allBnbItemsChecked = handoverForm.bnb_checklist.every(item => item.checked);
    
    if (!allKitItemsChecked || !allBnbItemsChecked) {
      toast.error('Please verify all items in the checklist');
      return;
    }
    
    setLoading(true);
    try {
      await api.post('/handovers', {
        from_user_id: user.id,
        to_user_id: handoverForm.to_user_id,
        bnb_id: dashboard.bnb.kit_id,
        shift_date: new Date().toISOString().split('T')[0],
        shift_number: parseInt(handoverForm.shift_number),
        kit_checklist: handoverForm.kit_checklist,
        bnb_checklist: handoverForm.bnb_checklist,
        notes: handoverForm.notes
      });
      
      toast.success('Handover completed successfully!');
      window.location.href = '/my-bnb';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create handover');
    } finally {
      setLoading(false);
    }
  };

  const getCompletionStats = () => {
    const totalKitItems = handoverForm.kit_checklist.reduce((sum, kit) => sum + kit.items.length, 0);
    const checkedKitItems = handoverForm.kit_checklist.reduce((sum, kit) =>
      sum + kit.items.filter(item => item.checked).length, 0
    );
    const checkedBnbItems = handoverForm.bnb_checklist.filter(item => item.checked).length;
    const totalBnbItems = handoverForm.bnb_checklist.length;
    
    return {
      totalItems: totalKitItems + totalBnbItems,
      checkedItems: checkedKitItems + checkedBnbItems,
      percentage: Math.round(((checkedKitItems + checkedBnbItems) / (totalKitItems + totalBnbItems)) * 100) || 0
    };
  };

  if (!dashboard) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-slate-600">Loading handover data...</p>
        </div>
      </Layout>
    );
  }

  const stats = getCompletionStats();

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Shift Handover</h1>
        <p className="text-sm text-slate-600 mt-1">{dashboard.bnb.kit_id} - Human Archive Inventory Verification</p>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-700">Checklist Progress</span>
          <span className="text-2xl font-bold text-slate-900">{stats.percentage}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-3">
          <div
            className="bg-green-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {stats.checkedItems} of {stats.totalItems} items verified
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Handover Details */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold font-tactical text-slate-900 mb-4">Handover Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Handing Over To</Label>
              <Select
                value={handoverForm.to_user_id}
                onValueChange={(val) => setHandoverForm({ ...handoverForm, to_user_id: val })}
                required
              >
                <SelectTrigger data-testid="to-user-select" className="mt-2">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.assigned_bnb === dashboard.bnb.kit_id && u.shift_team !== user.shift_team).map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.shift_team} shift)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Shift Number (1-4)</Label>
              <Select
                value={handoverForm.shift_number.toString()}
                onValueChange={(val) => setHandoverForm({ ...handoverForm, shift_number: parseInt(val) })}
              >
                <SelectTrigger data-testid="shift-number-select" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Shift 1 (0-4h)</SelectItem>
                  <SelectItem value="2">Shift 2 (4-8h)</SelectItem>
                  <SelectItem value="3">Shift 3 (8-12h)</SelectItem>
                  <SelectItem value="4">Shift 4 (12-16h)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Kit-Level Checklist */}
        <div className="space-y-6 mb-6">
          {handoverForm.kit_checklist.map((kit, kitIndex) => (
            <div key={kit.kit_id} className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold font-tactical text-slate-900 mb-4">
                {kit.kit_id} - Equipment Checklist ({kit.items.filter(i => i.checked).length}/{kit.items.length})
              </h3>
              <div className="space-y-3">
                {kit.items.map((item, itemIndex) => (
                  <div key={item.item_id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleKitItem(kitIndex, itemIndex)}
                        className="mt-1"
                        data-testid={`check-${kit.kit_id}-${item.item_id}`}
                      >
                        {item.checked ? (
                          <CheckCircle className="w-6 h-6 text-green-600" />
                        ) : (
                          <Circle className="w-6 h-6 text-slate-400" />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${item.checked ? 'text-slate-900' : 'text-slate-600'}`}>
                            {item.item_name}
                          </span>
                          <span className="text-xs font-data text-slate-500">{item.item_id}</span>
                        </div>
                        {item.checked && (
                          <input
                            type="text"
                            placeholder="Add notes (optional)"
                            value={item.notes}
                            onChange={(e) => updateKitItemNotes(kitIndex, itemIndex, e.target.value)}
                            className="mt-2 w-full text-sm border border-slate-200 rounded px-3 py-2"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* BnB-Level Checklist */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-semibold font-tactical text-slate-900 mb-4">
            {dashboard.bnb.kit_id} - BnB Equipment ({handoverForm.bnb_checklist.filter(i => i.checked).length}/{handoverForm.bnb_checklist.length})
          </h3>
          <div className="space-y-3">
            {handoverForm.bnb_checklist.map((item, itemIndex) => (
              <div key={item.item_id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleBnbItem(itemIndex)}
                    className="mt-1"
                    data-testid={`check-bnb-${item.item_id}`}
                  >
                    {item.checked ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <Circle className="w-6 h-6 text-slate-400" />
                    )}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${item.checked ? 'text-slate-900' : 'text-slate-600'}`}>
                        {item.item_name}
                      </span>
                      <span className="text-xs font-data text-slate-500">{item.item_id}</span>
                    </div>
                    {item.checked && (
                      <input
                        type="text"
                        placeholder="Add notes (optional)"
                        value={item.notes}
                        onChange={(e) => updateBnbItemNotes(itemIndex, e.target.value)}
                        className="mt-2 w-full text-sm border border-slate-200 rounded px-3 py-2"
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* General Notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <Label>Handover Notes</Label>
          <Textarea
            data-testid="handover-notes"
            value={handoverForm.notes}
            onChange={(e) => setHandoverForm({ ...handoverForm, notes: e.target.value })}
            placeholder="Any issues, observations, or important information for the next shift..."
            className="mt-2"
            rows={4}
          />
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.href = '/my-bnb'}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            data-testid="submit-handover-btn"
            type="submit"
            disabled={loading || stats.percentage !== 100}
            className="flex-1 bg-slate-900 hover:bg-slate-800"
          >
            {loading ? 'Submitting...' : (
              <>
                <ClipboardCheck className="w-4 h-4 mr-2" />
                Complete Handover
              </>
            )}
          </Button>
        </div>
      </form>
    </Layout>
  );
}
