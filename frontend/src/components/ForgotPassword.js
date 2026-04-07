import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/apiClient';
import defaultLogo from '../assets/default-logo.svg'; 
import { useStoreSettings } from '../context/StoreSettingsContext';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const { settings } = useStoreSettings();
    const logoSrc = settings.logoDataUrl || defaultLogo;
    const [step, setStep] = useState(1); // 1 = Get Question, 2 = Verify & Reset
    const [loading, setLoading] = useState(false);

    // Form State
    const [username, setUsername] = useState('');
    const [securityQuestion, setSecurityQuestion] = useState('');
    const [securityAnswer, setSecurityAnswer] = useState('');
    const [newPassword, setNewPassword] = useState('');
    
    // --- Password Visibility State ---
    const [showPassword, setShowPassword] = useState(false);

    // Step 1: Fetch the Security Question
    const handleFetchQuestion = async (e) => {
        e.preventDefault();
        if (!username) return toast.error("Please enter your username");

        setLoading(true);
        try {
            const data = await apiClient.post('/api/auth/forgot-password-question', { username });
            
            if (data.securityQuestion) {
                setSecurityQuestion(data.securityQuestion);
                setStep(2);
                toast.success("Security question found!", {
                    style: { background: '#1F2937', color: '#fff' }
                });
            } else {
                toast.error("No security question set for this user.");
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message || "User not found");
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Submit Answer and New Password
    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!securityAnswer || !newPassword) return toast.error("All fields are required");

        setLoading(true);
        try {
            await apiClient.post('/api/auth/reset-password', {
                username,
                securityAnswer,
                newPassword
            });

            toast.success("Password Reset Successful!", {
                icon: '🎉',
                style: { background: '#1F2937', color: '#fff' }
            });
            
            // Redirect to Login after 2 seconds
            setTimeout(() => {
                navigate('/login');
            }, 2000);

        } catch (err) {
            toast.error(err.message || "Incorrect answer or error resetting password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 relative overflow-hidden">
            
            {/* --- BACKGROUND LAYER --- */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Sky Effects */}
                <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600 rounded-full blur-3xl opacity-20 animate-pulse"></div>
            </div>

            {/* --- MAIN CARD --- */}
            <div className="bg-white/95 backdrop-blur-sm p-8 md:p-10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-full max-w-md border border-white/20 relative z-10">
                
                <div className="text-center mb-8">
                    <div className="w-24 h-24 mx-auto mb-4 relative group">
                        <div className="absolute inset-0 bg-blue-600 rounded-full blur opacity-25 group-hover:opacity-40 transition duration-300"></div>
                        <img 
                            src={logoSrc} 
                            alt="Logo" 
                            className="w-full h-full object-cover rounded-full border-4 border-white shadow-lg relative z-10" 
                        />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Account Recovery</h2>
                    <p className="text-gray-500 mt-2 text-sm font-medium">Reset your password securely</p>
                </div>

                {step === 1 && (
                    <form onSubmit={handleFetchQuestion} className="space-y-5">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1">Username</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <input 
                                    type="text" 
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                                    placeholder="Enter your username"
                                    required
                                />
                            </div>
                        </div>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? (
                                <div className="flex items-center justify-center space-x-2">
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Searching...</span>
                                </div>
                            ) : "Next"}
                        </button>
                    </form>
                )}

                {step === 2 && (
                    <form onSubmit={handleResetPassword} className="space-y-5 animate-fade-in-up">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm">
                            <p className="text-xs text-blue-600 font-bold uppercase mb-1 tracking-wider">Security Question</p>
                            <p className="text-gray-800 font-bold text-lg">{securityQuestion}</p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1">Your Answer</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                    </svg>
                                </div>
                                <input 
                                    type="text" 
                                    value={securityAnswer}
                                    onChange={(e) => setSecurityAnswer(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                                    placeholder="Enter your secret answer..."
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1">New Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                                    placeholder="Enter new password"
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

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? (
                                <div className="flex items-center justify-center space-x-2">
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Resetting...</span>
                                </div>
                            ) : "Reset Password"}
                        </button>
                    </form>
                )}

                <div className="mt-8 text-center">
                    <button 
                        onClick={() => navigate('/login')} 
                        type="button"
                        className="text-gray-500 hover:text-blue-600 text-sm font-semibold transition-colors flex items-center justify-center mx-auto"
                    >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        Back to Login
                    </button>
                </div>
            </div>
            
            <div className="absolute bottom-4 text-center text-slate-400 text-xs opacity-70 z-20">
                    &copy; {new Date().getFullYear()} {settings.systemName || `${settings.storeName} System`}. All rights reserved.
            </div>
        </div>
    );
};

export default ForgotPassword;