import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { PlayCircle, PauseCircle, StopCircle, Package, Activity } from 'lucide-react';
import Layout from '../components/Layout';
import EventDialog from '../components/EventDialog';

export default function MyBnB() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventType, setEventType] = useState('');

  useEffect(() => {
    fetchDashboard();
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await api.get('/my-bnb/dashboard');
      setDashboard(response.data);
    } catch (error) {
      console.error('Failed to fetch BnB dashboard:', error);
      toast.error('Failed to load BnB dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handlePauseKit = async (kitId) => {
    try {
      await api.post('/events', {
        event_type: 'pause_kit',
        user_id: user.id,
        from_kit: kitId,
        notes: 'Break time'
      });
      toast.success('Kit paused');
      fetchDashboard();
    } catch (error) {
      toast.error('Failed to pause kit');
    }
  };

  const handleResumeKit = async (kitId) => {
    try {
      await api.post('/events', {
        event_type: 'resume_kit',
        user_id: user.id,
        from_kit: kitId,
        notes: 'Resumed from break'
      });
      toast.success('Kit resumed');
      fetchDashboard();
    } catch (error) {
      toast.error('Failed to resume kit');
    }
  };

  const openEventDialog = (type) => {
    setEventType(type);
    setDialogOpen(true);
  };

  const handleEventCreated = () => {
    setDialogOpen(false);
    fetchDashboard();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'paused':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'idle':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-slate-600">Loading your BnB dashboard...</p>
        </div>
      </Layout>
    );
  }

  if (!dashboard) {
    return (
      <Layout>
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">No BnB assigned to you</p>
          <p className="text-sm text-slate-500 mt-2">Contact your supervisor for assignment</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">
          {dashboard.bnb.kit_id} - My BnB Dashboard
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {dashboard.shift_team} Team • {dashboard.kits.length} Kits Assigned
        </p>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold font-tactical text-slate-900 mb-4">Shift Actions</h2>
        <div className="flex gap-4">
          <Button
            data-testid="start-shift-btn"
            onClick={() => openEventDialog('start_shift')}
            className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
            variant="outline"
          >
            <PlayCircle className="w-5 h-5 mr-2" />
            Start Shift
          </Button>
          <Button
            data-testid="end-shift-btn"
            onClick={() => openEventDialog('end_shift')}
            className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
            variant="outline"
          >
            <StopCircle className="w-5 h-5 mr-2" />
            End Shift
          </Button>
          <a href="/handover">
            <Button
              data-testid="handover-btn"
              className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
              variant="outline"
            >
              <Activity className="w-5 h-5 mr-2" />
              Shift Handover
            </Button>
          </a>
        </div>
      </div>

      {/* Kits Grid */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold font-tactical text-slate-900 mb-4">Your Kits</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboard.kits.map((kit) => (
            <div
              key={kit.kit_id}
              data-testid={`kit-card-${kit.kit_id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold font-tactical text-slate-900">{kit.kit_id}</h3>
                  <p className="text-sm text-slate-600">{kit.type}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getStatusColor(kit.status)}`}>
                  {kit.status.toUpperCase()}
                </span>
              </div>

              <div className="flex gap-2 mt-4">
                {kit.status === 'active' && (
                  <Button
                    data-testid={`pause-${kit.kit_id}`}
                    onClick={() => handlePauseKit(kit.kit_id)}
                    size="sm"
                    className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"
                    variant="outline"
                  >
                    <PauseCircle className="w-4 h-4 mr-1" />
                    Pause
                  </Button>
                )}
                {kit.status === 'paused' && (
                  <Button
                    data-testid={`resume-${kit.kit_id}`}
                    onClick={() => handleResumeKit(kit.kit_id)}
                    size="sm"
                    className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
                    variant="outline"
                  >
                    <PlayCircle className="w-4 h-4 mr-1" />
                    Resume
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold font-tactical text-slate-900 mb-4">Recent Activity</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {dashboard.recent_events.length > 0 ? (
            <div className="space-y-3">
              {dashboard.recent_events.slice(0, 10).map((event) => (
                <div key={event.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-slate-900 font-tactical">
                      {event.event_type.replace('_', ' ').toUpperCase()}
                    </span>
                    {event.from_kit && (
                      <span className="text-sm text-slate-600 ml-2">• {event.from_kit}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 font-data">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-4">No recent activity</p>
          )}
        </div>
      </div>

      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        eventType={eventType}
        onSuccess={handleEventCreated}
      />
    </Layout>
  );
}
