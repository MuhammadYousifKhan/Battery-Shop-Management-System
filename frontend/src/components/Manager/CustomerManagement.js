import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import Table from '../Common/Table';
import Modal from '../Common/Modal';

// Opening Balance field added to initial state
const initialCustomerState = {
    name: '', phone: '', email: '', address: '', type: 'retail', shopName: '', shopAddress: '', openingBalance: 0
};

// Helper: Format phone for display (03XX-XXXXXXX)
const formatPhoneDisplay = (phone) => {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    // Convert 92XXXXXXXXXX to 0XXXXXXXXXXX for display
    if (digits.startsWith('92') && digits.length === 12) {
        digits = '0' + digits.substring(2);
    }
    // Format as 03XX-XXXXXXX
    if (digits.length === 11 && digits.startsWith('0')) {
        return digits.slice(0, 4) + '-' + digits.slice(4);
    }
    return digits;
};

// Helper: Clean phone for sending to backend
const cleanPhone = (phone) => {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
};

const CustomerManagement = () => {
    const [customers, setCustomers] = useState([]);
    const [formData, setFormData] = useState(initialCustomerState);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    
    // --- FILTER & SEARCH STATES ---
    const [filterType, setFilterType] = useState('all'); // 'all', 'wholesale', 'retail'
    const [searchTerm, setSearchTerm] = useState(''); 
    
    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState(null);

    // Duplicate Customer Dialog State
    const [duplicateInfo, setDuplicateInfo] = useState(null);

    const fetchCustomers = async () => {
        setLoading(true); 
        try {
            const data = await apiClient.get('/api/customers');
            setCustomers(data); 
        } catch (err) {
            toast.error(err.message);
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchCustomers(); }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            // Allow only digits and dashes, max 13 chars
            const cleaned = value.replace(/[^\d-]/g, '');
            setFormData(prev => ({ ...prev, phone: cleaned }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddNew = () => {
        setFormData(initialCustomerState);
        setIsEditing(false);
        setCurrentId(null);
        setShowForm(true);
    };

    const handleEditClick = (customer) => {
        setFormData({
            name: customer.name,
            phone: formatPhoneDisplay(customer.phone),
            email: customer.email || '',
            address: customer.address || '',
            type: customer.type,
            shopName: customer.shopName || '',
            shopAddress: customer.shopAddress || '',
            // Load INITIAL balance for editing
            openingBalance: customer.initialBalance || 0 
        });
        setIsEditing(true);
        setCurrentId(customer._id);
        setShowForm(true);
    };

    // 🚀 NEW DELETE HANDLER
    const handleDeleteClick = async (customer) => {
        if (!window.confirm(`Are you sure you want to delete customer "${customer.name}"? This cannot be undone.`)) {
            return;
        }

        try {
            await apiClient.delete(`/api/customers/${customer._id}`);
            setCustomers(prev => prev.filter(c => c._id !== customer._id));
            toast.success("Customer deleted successfully");
        } catch (err) {
            toast.error(err.message || "Failed to delete customer");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); 
        
        // ✅ Phone number validation: must be exactly 11 digits (03XX-XXXXXXX)
        const digitsOnly = cleanPhone(formData.phone);
        if (!digitsOnly || digitsOnly.length !== 11 || !digitsOnly.startsWith('03')) {
            toast.error('Phone number must be exactly 11 digits starting with 03 (e.g. 0312-3456789)');
            return;
        }

        setLoading(true);
        const toastId = toast.loading(isEditing ? "Updating Customer..." : "Saving Customer...");
        
        try {
            let data;
            // Clean phone before sending to backend
            const submitData = { ...formData, phone: cleanPhone(formData.phone) };
            if (isEditing) {
                data = await apiClient.put(`/api/customers/${currentId}`, submitData);
                setCustomers(prev => prev.map(c => c._id === currentId ? data : c));
                toast.success("Customer updated!", { id: toastId });
            } else {
                data = await apiClient.post('/api/customers', submitData);
                setCustomers(prev => [data, ...prev]);
                
                // Show specific success message if it was a Wholesale Customer
                if (formData.type === 'wholesale') {
                    toast.success("Customer Created & Welcome WhatsApp Sent!", { id: toastId, duration: 5000 });
                } else {
                    toast.success("Customer created!", { id: toastId });
                }
            }
            
            setShowForm(false);
            setFormData(initialCustomerState); 
        } catch (err) {
            // Check if it's a duplicate phone error (409) with existing customer details
            if (err.response && err.response.status === 409 && err.response.data && err.response.data.duplicateOf) {
                toast.dismiss(toastId);
                setDuplicateInfo(err.response.data.duplicateOf);
            } else {
                toast.error(err.message || 'Network error.', { id: toastId });
            }
        } finally { 
            setLoading(false); 
        }
    };

    // --- FILTER LOGIC ---
    const filteredCustomers = customers.filter(customer => {
        const matchesType = filterType === 'all' ? true : customer.type === filterType;
        const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              customer.phone.includes(searchTerm);
        return matchesType && matchesSearch;
    });

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Customer Management</h1>

            {/* --- FILTER & ACTION HEADER --- */}
            <div className="flex flex-col gap-4 mb-6">
                
                {/* Top Row: Search Bar & Add Button */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <input 
                        type="text" 
                        placeholder="Search Customer by Name or Phone..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full md:w-1/2 p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />

                    <button onClick={handleAddNew} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition w-full md:w-auto shadow-md whitespace-nowrap">
                        + Add New Customer
                    </button>
                </div>

                {/* Bottom Row: Filter Tabs */}
                <div className="flex justify-start">
                    <div className="flex bg-white p-1 rounded-lg border shadow-sm">
                        {['all', 'wholesale', 'retail'].map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-6 py-2 rounded-md text-sm font-bold capitalize transition-all ${
                                    filterType === type 
                                    ? 'bg-blue-100 text-blue-700 shadow-sm' 
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <Table 
                columns={['Name', 'Phone', 'Type', 'Balance', 'Address', 'Actions']}
                loading={loading}
                title={`${filterType.charAt(0).toUpperCase() + filterType.slice(1)} Customers`}
            >
                {filteredCustomers.length > 0 ? (
                    filteredCustomers.map(customer => (
                        <tr key={customer._id}>
                            <td className="px-6 py-4 whitespace-nowrap">{customer.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{formatPhoneDisplay(customer.phone)}</td>
                            <td className="px-6 py-4 whitespace-nowrap capitalize">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${customer.type === 'wholesale' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {customer.type}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-700">
                                Rs {customer.currentBalance ? customer.currentBalance.toLocaleString() : 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">{customer.address || 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => handleEditClick(customer)}
                                        className="text-indigo-600 hover:text-indigo-900 font-bold"
                                    >
                                        Edit
                                    </button>
                                    {/* 🚀 DELETE BUTTON */}
                                    <button 
                                        onClick={() => handleDeleteClick(customer)}
                                        className="text-red-500 hover:text-red-700 font-bold"
                                        title="Delete Customer"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))
                ) : (
                    <tr>
                        <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                            No customers found matching "{searchTerm}"
                        </td>
                    </tr>
                )}
            </Table>

            {/* ===== DUPLICATE CUSTOMER WARNING DIALOG ===== */}
            {duplicateInfo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-bounce-in">
                        {/* Warning Icon */}
                        <div className="flex justify-center mb-4">
                            <div className="bg-red-100 rounded-full p-4">
                                <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>

                        {/* Title */}
                        <h2 className="text-xl font-bold text-red-700 text-center mb-2">Customer Already Exists!</h2>
                        <p className="text-gray-500 text-center text-sm mb-4">A customer with this phone number is already registered in the system.</p>

                        {/* Existing Customer Details Card */}
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Existing Customer Details</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Name:</span>
                                    <span className="text-sm font-bold text-gray-800">{duplicateInfo.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Phone:</span>
                                    <span className="text-sm font-bold text-gray-800">{formatPhoneDisplay(duplicateInfo.phone)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Type:</span>
                                    <span className={`text-sm font-bold capitalize ${duplicateInfo.type === 'wholesale' ? 'text-purple-700' : 'text-blue-700'}`}>{duplicateInfo.type}</span>
                                </div>
                                {duplicateInfo.address && (
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-500">Address:</span>
                                        <span className="text-sm font-bold text-gray-800">{duplicateInfo.address}</span>
                                    </div>
                                )}
                                <div className="flex justify-between border-t pt-2 mt-2">
                                    <span className="text-sm text-gray-500">Balance:</span>
                                    <span className="text-sm font-bold text-gray-800">Rs {duplicateInfo.currentBalance?.toLocaleString() || 0}</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Button */}
                        <button
                            onClick={() => setDuplicateInfo(null)}
                            className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all text-base"
                        >
                            OK, Got It
                        </button>
                    </div>
                </div>
            )}

            <Modal 
                isOpen={showForm} 
                onClose={() => setShowForm(false)} 
                title={isEditing ? 'Edit Customer' : 'Add New Customer'}
                maxWidth="max-w-2xl"
            >
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="name" value={formData.name} onChange={handleChange} required className="p-3 border rounded w-full" placeholder="Full Name" />
                        <div>
                            <input 
                                type="tel" 
                                name="phone" 
                                value={formData.phone} 
                                onChange={handleChange} 
                                required 
                                className="p-3 border rounded w-full" 
                                placeholder="03XX-XXXXXXX"
                                maxLength={13}
                            />
                            <p className="text-xs text-gray-400 mt-1">Format: 03XX-XXXXXXX (11 digits)</p>
                        </div>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} className="p-3 border rounded w-full" placeholder="Email (Optional)" />
                        <select name="type" value={formData.type} onChange={handleChange} required className="p-3 border rounded bg-white w-full">
                            <option value="retail">Retail (Credit/Cash)</option>
                            <option value="wholesale">Wholesale</option>
                        </select>
                    </div>

                    {/* OPENING BALANCE FIELD */}
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Opening Balance / Old Due (Rs)</label>
                        <input 
                            type="number" 
                            name="openingBalance" 
                            value={formData.openingBalance} 
                            onChange={handleChange} 
                            className="w-full p-3 border rounded bg-white font-mono text-lg" 
                            placeholder="0" 
                        />
                        <p className="text-xs text-gray-600 mt-1">
                            Set this to 0 if no previous balance exists. (Editing this will adjust the ledger)
                        </p>
                    </div>

                    <div className="mt-4">
                        <input type="text" name="address" value={formData.address} onChange={handleChange} className="w-full p-3 border rounded" placeholder="Customer Address (Optional)" />
                    </div>

                    {formData.type === 'wholesale' && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="text" name="shopName" value={formData.shopName} onChange={handleChange} className="p-3 border rounded w-full" placeholder="Shop Name" required />
                            <input type="text" name="shopAddress" value={formData.shopAddress} onChange={handleChange} className="p-3 border rounded w-full" placeholder="Shop Address" />
                        </div>
                    )}

                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={() => setShowForm(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300">Cancel</button>
                        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Customer'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default CustomerManagement;