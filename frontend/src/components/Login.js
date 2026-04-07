import React, { useState } from 'react';
import toast from 'react-hot-toast';
import defaultLogo from '../assets/default-logo.svg'; 
import { apiClient } from '../utils/apiClient';
import { ROLES } from '../Constants';
import { useStoreSettings } from '../context/StoreSettingsContext';

const Login = () => {
  const { settings } = useStoreSettings();
  const logoSrc = settings.logoDataUrl || defaultLogo;
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    role: ROLES.MANAGER 
  });

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    setErrorMessage('');
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await apiClient.post('/api/auth/login', { 
        username: credentials.username, 
        password: credentials.password, 
        role: credentials.role 
      });

      toast.success("Welcome back!", {
          icon: '👋',
          style: {
            borderRadius: '10px',
            background: '#1F2937',
            color: '#fff',
          },
      });
      
      if (res.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('userRole', res.role || credentials.role);
        localStorage.setItem('isAuthenticated', 'true');
        
        const userInfo = {
            _id: res._id,
            username: res.username,
            role: res.role
        };
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
        
        if (res.role === ROLES.ADMIN) {
            window.location.href = '/admin/dashboard';
        } else {
            window.location.href = '/manager/dashboard';
        }
      }

    } catch (err) {
      console.error("Login Error:", err);
      const serverMsg = err.response?.data?.message || err.message || "";
      let displayMsg = "Login failed. Please try again.";

      // ✅ BETTER ERROR HANDLING
      if (serverMsg === 'Failed to fetch') {
          displayMsg = "Cannot connect to server. Check your internet or backend.";
      } else if (serverMsg.toLowerCase().includes('user') || serverMsg.toLowerCase().includes('password')) {
          displayMsg = "Invalid Username or Password.";
      } else if (serverMsg.toLowerCase().includes('role')) {
          displayMsg = `Incorrect Role. This user is not a ${credentials.role}.`;
      } else {
          displayMsg = serverMsg;
      }
      
      setErrorMessage(displayMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 relative overflow-hidden">
      
      {/* --- BACKGROUND LAYER --- */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600 rounded-full blur-3xl opacity-20 animate-pulse"></div>
      </div>

      {/* --- LOGIN CARD --- */}
      <div className="bg-white/95 backdrop-blur-sm p-8 md:p-10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-full max-w-md border border-white/20 relative z-10">
        
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-4 relative group">
             <div className="absolute inset-0 bg-blue-600 rounded-full blur opacity-25 group-hover:opacity-40 transition duration-300"></div>
            <img src={logoSrc} alt="Shop Logo" className="w-full h-full object-cover rounded-full border-4 border-white shadow-lg relative z-10" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Welcome Back</h2>
          <p className="text-gray-500 mt-2 text-sm font-medium">Sign in to {settings.systemName || `${settings.storeName} System`}</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1" htmlFor="username">Username</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
                <input 
                  type="text" 
                  id="username" 
                  name="username" 
                  value={credentials.username} 
                  onChange={handleChange} 
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                  placeholder="Enter your username" 
                  required 
                />
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between items-center ml-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide" htmlFor="password">Password</label>
                <a href="/forgot-password" className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">Forgot Password?</a>
            </div>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>
                <input 
                    type={showPassword ? "text" : "password"} 
                    id="password" 
                    name="password" 
                    value={credentials.password} 
                    onChange={handleChange} 
                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                    placeholder="••••••••" 
                    required 
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 transition-colors focus:outline-none"
                >
                    {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                </button>
            </div>
          </div>
          
          <div className="space-y-1">
             <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1" htmlFor="role">Select Role</label>
             <div className="relative">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                 </div>
                 <select id="role" name="role" value={credentials.role} onChange={handleChange} className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-700 appearance-none cursor-pointer">
                    <option value={ROLES.MANAGER}>Store Manager</option>
                    <option value={ROLES.ADMIN}>Administrator</option>
                 </select>
                 <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                 </div>
             </div>
          </div>
          
          <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-4" disabled={loading}>
            {loading ? (
                <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing In...</span>
                </div>
            ) : ( 'Sign In' )}
          </button>
          
          {errorMessage && (
             <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 mr-2" viewBox="0 0 20 20" fill="currentColor">
                   <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-red-700 font-bold text-sm">{errorMessage}</span>
             </div>
          )}
        </form>
      </div>
      <div className="absolute bottom-4 text-center text-slate-400 text-xs opacity-70">
        &copy; {new Date().getFullYear()} {settings.systemName || `${settings.storeName} System`}. All rights reserved.
      </div>
    </div>
  );
};

export default Login;