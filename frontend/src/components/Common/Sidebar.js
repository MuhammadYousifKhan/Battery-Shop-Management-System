import React from 'react';
import { NavLink } from 'react-router-dom'; 
import { ROLES } from '../../Constants';
import { useStoreSettings } from '../../context/StoreSettingsContext';
import defaultLogo from '../../assets/default-logo.svg';

// --- ICONS (Inline SVGs) ---
const Icons = {
  Dashboard: <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
  Orders: <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />,
  Billing: <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  Customers: <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
  Accounts: <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  Suppliers: <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />,
  Invoices: <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  Inventory: <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
  Settings: <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />,
  Stock: <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  Control: <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />,
  Reports: <path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />,
  Scrap: <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
  Claims: <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
  Reminders: <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> // 👈 NEW ICON (Clock)
};

const Sidebar = ({ role, sidebarOpen, setSidebarOpen }) => { 
  const { settings } = useStoreSettings();
  const logoSrc = settings.logoDataUrl || defaultLogo;
  
  const adminLinks = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: Icons.Dashboard },
    { name: 'Wholesale Orders', path: '/admin/orders', icon: Icons.Orders }, 
    { name: 'Retail Bills', path: '/admin/billing', icon: Icons.Billing },
    { name: 'Remind Payment', path: '/admin/reminders', icon: Icons.Reminders }, // 👈 NEW LINK
    { name: 'Add New Wholesalers', path: '/admin/customers', icon: Icons.Customers },
    { name: 'Wholesaler Accounts', path: '/admin/accounts', icon: Icons.Accounts }, 
    { name: 'Supplier Account', path: '/admin/suppliers', icon: Icons.Suppliers }, 
    { name: 'Supplier Invoices', path: '/admin/invoices', icon: Icons.Invoices },  
    { name: 'Add New Inventory', path: '/admin/inventory', icon: Icons.Inventory },
    { name: 'Stock Check', path: '/admin/stock', icon: Icons.Stock },
    { name: 'Scrap Batteries', path: '/admin/scrap', icon: Icons.Scrap }, 
    { name: 'Claim Management', path: '/admin/claims', icon: Icons.Claims }, 
    { name: 'Sales Reports', path: '/admin/reports', icon: Icons.Reports },
    { name: 'Manager Control', path: '/admin/managers', icon: Icons.Control },
    { name: 'Settings / Profile', path: '/admin/settings', icon: Icons.Settings },
  ];

  const managerLinks = [
    { name: 'Dashboard', path: '/manager/dashboard', icon: Icons.Dashboard },
    { name: 'Wholesale Orders', path: '/manager/orders', icon: Icons.Orders }, 
    { name: 'Daily Cash Bill', path: '/manager/billing', icon: Icons.Billing },
    { name: 'Remind Payment', path: '/manager/reminders', icon: Icons.Reminders }, // 👈 NEW LINK
    { name: 'Add new Wholesalers', path: '/manager/customers', icon: Icons.Customers },
    { name: 'Wholesaler Accounts', path: '/manager/accounts', icon: Icons.Accounts }, 
    { name: 'Supplier Account', path: '/manager/suppliers', icon: Icons.Suppliers },
    { name: 'Supplier Invoices', path: '/manager/invoices', icon: Icons.Invoices },
    { name: 'Stock Check', path: '/manager/stock', icon: Icons.Stock },
    { name: 'Scrap Batteries', path: '/manager/scrap', icon: Icons.Scrap }, 
    { name: 'Claims Management', path: '/manager/claims', icon: Icons.Claims }, 
  ];

  const links = role === ROLES.ADMIN ? adminLinks : managerLinks;
  
  const handleLinkClick = () => {
    setSidebarOpen(false);
  };

  const getLinkClass = ({ isActive }) => 
    `group flex items-center px-4 py-3.5 text-base font-medium rounded-xl transition-all duration-200 ease-in-out mb-1.5
    ${isActive 
      ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-800'
    }`;

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Sidebar Container */}
      <div className={`
        bg-white h-screen shadow-xl border-r border-gray-100
        fixed inset-y-0 left-0 z-30 w-72 overflow-y-auto transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:inset-auto flex flex-col
      `}>
        
        {/* Header Area */}
        <div className="flex flex-col items-center justify-center pt-8 pb-6 border-b border-gray-100 bg-gray-50/50">
            <div className="w-20 h-20 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center overflow-hidden mb-3">
              <img src={logoSrc} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">{settings.storeName || 'My Store'}</h2>
            <div className="flex items-center gap-2 mt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${role === ROLES.ADMIN ? 'bg-purple-500' : 'bg-blue-500'}`}></span>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{role} Panel</p>
            </div>
            
            {/* Close Button (Mobile Only) */}
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 md:hidden text-gray-400 hover:text-gray-600 p-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
          {links.map((link) => (
            <NavLink key={link.name} to={link.path} className={getLinkClass} onClick={handleLinkClick}>
                <span className="w-6 h-6 mr-3 flex-shrink-0 transition-colors">
                    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {link.icon}
                    </svg>
                </span>
                <span>{link.name}</span>
                {/* Right Arrow for Active State */}
                <span className="ml-auto opacity-0 group-[.active]:opacity-100 transition-opacity">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
};

export default Sidebar;