import { useState, useEffect } from 'react';
import api from '../lib/api';
import { format } from 'date-fns';
import { AlertTriangle, Clock, User, Package } from 'lucide-react';
import Layout from '../components/Layout';

export default function Damage() {
  const [damageEvents, setDamageEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [eventsRes, usersRes] = await Promise.all([
        api.get('/events?event_type=damage'),
        api.get('/users'),
      ]);
      setDamageEvents(eventsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Failed to fetch damage events:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'low':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.name || userId;
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Damage Tracking</h1>
        <p className="text-sm text-slate-600 mt-1">Monitor and manage equipment damage reports</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-slate-600">Loading damage reports...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {damageEvents.map((event) => (
            <div
              key={event.id}
              data-testid={`damage-event-${event.id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getSeverityColor(event.severity)}`}>
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border font-tactical ${getSeverityColor(event.severity)}`}>
                      {event.severity?.toUpperCase()} SEVERITY
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="w-4 h-4" />
                  <span className="font-data">{format(new Date(event.timestamp), 'MMM dd, yyyy HH:mm')}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Package className="w-4 h-4" />
                  <span>Item: <span className="font-data font-medium text-slate-900">{event.item_id}</span></span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User className="w-4 h-4" />
                  <span>Reported by: <span className="font-medium text-slate-900">{getUserName(event.user_id)}</span></span>
                </div>
                {event.from_kit && (
                  <div className="text-sm text-slate-600">
                    Kit: <span className="font-data font-medium text-slate-900">{event.from_kit}</span>
                  </div>
                )}
                {event.damage_type && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-700 mb-1">Damage Description:</p>
                    <p className="text-sm text-slate-600">{event.damage_type}</p>
                  </div>
                )}
                {event.notes && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-700 mb-1">Additional Notes:</p>
                    <p className="text-sm text-slate-600">{event.notes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && damageEvents.length === 0 && (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">No damage reports found</p>
        </div>
      )}
    </Layout>
  );
}