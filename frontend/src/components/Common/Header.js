import React, { useState, useEffect } from "react";
import { ROLES } from '../../Constants';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import defaultLogo from '../../assets/default-logo.svg';

const Header = ({ setSidebarOpen }) => {
  const userRole = localStorage.getItem("userRole");
  const [currentTime, setCurrentTime] = useState(new Date());
  const { settings } = useStoreSettings();
  const logoSrc = settings.logoDataUrl || defaultLogo;

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    localStorage.clear(); // Clears token, role, and isAuthenticated
    window.location.href = "/login";
  };

  return (
    <header className="bg-blue-600 text-white p-4 flex justify-between items-center shadow-md hover:shadow-lg transition-shadow duration-300 sticky top-0 z-10">
      <div className="flex items-center space-x-3">
        {/* Hamburger Menu Button (Mobile Only) */}
        <button 
            onClick={() => setSidebarOpen(true)} 
            className="md:hidden text-white focus:outline-none mr-2 transform hover:scale-110 hover:text-blue-200 transition-all duration-200"
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
        </button>

        {/* Logo Container with Hover Glow and Scale */}
        <div className="w-10 h-10 md:w-16 md:h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center overflow-hidden shadow-sm hover:shadow-xl hover:bg-opacity-30 hover:scale-105 transition-all duration-300 cursor-pointer">
          <img src={logoSrc} alt="Shop Logo" className="h-full w-full object-cover"  />
        </div>
        
        <div className="cursor-default">
          <h1 className="text-lg md:text-2xl font-bold leading-tight drop-shadow-sm">{settings.systemName || `${settings.storeName} Management System`}</h1>
          <p className="text-xs md:text-sm text-blue-100 hidden md:block opacity-90 hover:opacity-100 transition-opacity">
            Inventory Management System
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 md:space-x-4">
        {/* --- Date & Time (Hidden on Mobile) --- */}
        <div className="hidden md:flex flex-col items-end mr-2 cursor-default hover:text-blue-100 transition-colors duration-300">
            <span className="text-lg font-bold leading-none drop-shadow-sm">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-xs text-blue-100">
              {currentTime.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
        </div>

        {/* User Role Badge with Hover Highlight */}
        <span className="bg-white bg-opacity-20 px-2 py-1 md:px-3 md:py-1 rounded-full text-xs md:text-sm shadow-sm hover:shadow-md hover:bg-opacity-30 transition-all duration-300 cursor-default border border-transparent hover:border-blue-300">
          {userRole === ROLES.ADMIN ? "Administrator" : "Shop Manager"}
        </span>

        {/* Logout Button with Lift and Shadow Effect */}
        <button
          onClick={handleLogout}
          className="bg-white text-blue-600 px-3 py-1 md:px-4 md:py-2 rounded-lg font-semibold hover:bg-blue-50 hover:text-blue-700 hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200 text-sm md:text-base flex items-center space-x-2 border border-transparent hover:border-blue-200"
        >
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Header;