import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { format } from 'date-fns';
import { Bell, Clock, CheckCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { toast } from 'sonner';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications(notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (error) {
      toast.error('Failed to mark as read');
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'transfer':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'damage':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'request':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'shift':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-600 mt-1">Stay updated on kit and request changes</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-slate-600">Loading notifications...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              data-testid={`notification-${notification.id}`}
              className={`bg-white rounded-xl border p-5 shadow-sm transition-all ${
                notification.read
                  ? 'border-slate-200 opacity-60'
                  : 'border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getTypeColor(notification.type)}`}>
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-900 mb-2">{notification.message}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      <span className="font-data">{format(new Date(notification.timestamp), 'MMM dd, yyyy HH:mm')}</span>
                      <span className={`px-2 py-0.5 rounded-full border font-tactical ${getTypeColor(notification.type)}`}>
                        {notification.type.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
                {!notification.read && (
                  <Button
                    data-testid={`mark-read-${notification.id}`}
                    onClick={() => markAsRead(notification.id)}
                    variant="ghost"
                    size="sm"
                    className="ml-3"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">No notifications yet</p>
        </div>
      )}
    </Layout>
  );
}