import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';

export default function Login() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(name, password);
      toast.success('Login successful');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(to bottom, #F8FAFC, #FFFFFF)' }}>
      <div className="noise-overlay" />
      
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold font-tactical mb-2 text-slate-900">Human Archive</h1>
          <p className="text-slate-600">Ops Management System</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold font-tactical text-slate-900">Login</h2>
            <p className="text-sm text-slate-600 mt-1">Access your operations dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="name" className="text-slate-700">Username</Label>
              <Input
                id="name"
                data-testid="login-username-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your username"
                required
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-slate-700">Password</Label>
              <Input
                id="password"
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="mt-2"
              />
            </div>

            <Button
              data-testid="login-submit-button"
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg"
            >
              {loading ? 'Logging in...' : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Login
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-700 mb-2 font-tactical">Demo Credentials:</p>
            <div className="text-xs text-slate-600 space-y-1 font-data">
              <p>John Deployer / password123</p>
              <p>Sarah Station / password123</p>
              <p>Mike Supervisor / password123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}