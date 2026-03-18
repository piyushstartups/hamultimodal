import { Bell, LogOut, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUnreadCount();
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/unread/count');
      setUnreadCount(response.data.count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="noise-overlay" />
      
      {/* Header */}
      <div className="backdrop-blur-md bg-white/80 border-b border-slate-200/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                data-testid="back-button"
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold font-tactical text-slate-900">Human Archive</h1>
                <p className="text-sm text-slate-600 mt-0.5">{user?.name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <a href="/notifications">
                <Button data-testid="notifications-button" variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </a>
              <Button data-testid="logout-button" onClick={logout} variant="ghost" size="icon">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </div>
    </div>
  );
};

export default Layout;