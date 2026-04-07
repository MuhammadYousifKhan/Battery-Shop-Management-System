import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast'; 
import { apiClient } from '../../utils/apiClient';
import API_URL from '../../apiConfig'; 
import Table from '../Common/Table';
import Modal from '../Common/Modal'; 
import { handlePrintPDF, handleViewPDF } from '../../utils/printHandler'; 

// --- ICONS ---
const SearchIcon = () => <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const UserIcon = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const PrintIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>;
const EyeIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
const PlusIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const MinusIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>;
const PhoneIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>;
const CardIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
const MapIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const TrashIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const Billing = () => {
    const [bills, setBills] = useState([]);
    const [products, setProducts] = useState([]); 
    const [customers, setCustomers] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); 
    
    const [searchTerm, setSearchTerm] = useState(''); 
    const [startDate, setStartDate] = useState(''); 
    const [endDate, setEndDate] = useState('');     

    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false); 
    const [editBillId, setEditingBillId] = useState(null); 

    const [productSearch, setProductSearch] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [showProductSuggestions, setShowProductSuggestions] = useState(false);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
    
    const searchRef = useRef(null);
    const customerSearchRef = useRef(null);

    const [cart, setCart] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
    const [checkoutData, setCheckoutData] = useState({
        paidAmount: '',
        scrapWeight: '',
        scrapPricePerKg: '',
        nic: '',
        phone: '', 
        address: '',
        dueDate: ''
    });

    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedBillForPay, setSelectedBillForPay] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [sendingWhatsApp, setSendingWhatsApp] = useState(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true); 
            try {
                const [billsData, productsData, customersData] = await Promise.all([
                    apiClient.get('/api/bills'),
                    apiClient.get('/api/products'),
                    apiClient.get('/api/customers')
                ]);
                setBills(billsData);
                setProducts(productsData);
                setCustomers(customersData);
            } catch (err) { toast.error(err.message); }
            finally { setLoading(false); }
        };
        fetchInitialData();
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleClickOutside = (event) => {
        if (searchRef.current && !searchRef.current.contains(event.target)) {
            setShowProductSuggestions(false);
        }
        if (customerSearchRef.current && !customerSearchRef.current.contains(event.target)) {
            setShowCustomerSuggestions(false);
        }
    };

    const onPrintClick = (billId) => { 
        handlePrintPDF(`${API_URL}/api/bills/${billId}/pdf`); 
    };
    const onViewClick = (billId) => { 
        handleViewPDF(`${API_URL}/api/bills/${billId}/pdf`); 
    };

    const getBillId = (bill) => {
        if (!bill?._id) return '-';
        const hexSnippet = bill._id.slice(-6);
        const decimalId = parseInt(hexSnippet, 16).toString();
        return decimalId.padStart(8, '0');
    };

    const handleSendWhatsApp = async (bill) => {
        if (!window.confirm(`Send invoice to ${bill.customerName} via WhatsApp?`)) return;
        setSendingWhatsApp(bill._id);
        const toastId = toast.loading("Sending WhatsApp...");
        try {
            await apiClient.post(`/api/bills/${bill._id}/send-whatsapp`);
            toast.success("Sent successfully!", { id: toastId });
        } catch (error) {
            toast.error(error.message || "Failed to send", { id: toastId });
        } finally {
            setSendingWhatsApp(null);
        }
    };

    const addToCart = (product) => {
        if (product.totalStock <= 0) return toast.error("Out of Stock");
        
        const existing = cart.find(item => item._id === product._id);
        if (existing) {
            if (existing.qty + 1 > product.totalStock) return toast.error("Stock limit reached");
            setCart(cart.map(item => item._id === product._id ? { ...item, qty: item.qty + 1 } : item));
        } else {
            setCart([...cart, { ...product, qty: 1, salePrice: product.price }]); 
        }
        setProductSearch('');
        setShowProductSuggestions(false);
    };

    const removeFromCart = (id) => {
        setCart(cart.filter(item => item._id !== id));
    };

    const updateQty = (id, newQty) => {
        if (newQty < 1) return;
        const product = products.find(p => p._id === id);
        if (newQty > product.totalStock) return toast.error(`Only ${product.totalStock} available`);
        setCart(cart.map(item => item._id === id ? { ...item, qty: newQty } : item));
    };

    const updatePrice = (id, newPrice) => {
        setCart(cart.map(item => item._id === id ? { ...item, salePrice: parseFloat(newPrice) || 0 } : item));
    };

    const updateCartField = (id, field, value) => {
        setCart(cart.map(item => item._id === id ? { ...item, [field]: value } : item));
    };

    const calculateTotal = () => {
        return cart.reduce((acc, item) => acc + (item.qty * item.salePrice), 0);
    };

    const openBillForm = () => {
        setIsEditing(false);
        setCart([]);
        setCustomerSearch('');
        setSelectedCustomer(null);
        setBillDate(new Date().toISOString().split('T')[0]);
        setCheckoutData({ paidAmount: '', scrapWeight: '', scrapPricePerKg: '', nic: '', phone: '', address: '', dueDate: '' });
        setShowForm(true);
    };

    const handleEditBill = (bill) => {
        setIsEditing(true);
        setEditingBillId(bill._id);
        setCustomerSearch(bill.customerName);
        
        const cId = typeof bill.customerRef === 'object' ? bill.customerRef?._id : bill.customerRef;
        const custObj = customers.find(c => c._id === cId);
        
        setSelectedCustomer(custObj || { name: bill.customerName, _id: cId });

        setCheckoutData({
            paidAmount: bill.paidAmount,
            scrapWeight: bill.scrapWeight || '',
            scrapPricePerKg: bill.scrapPricePerKg || '',
            nic: bill.nic || '',
            phone: bill.customerPhone || (custObj ? custObj.phone : '') || '', 
            address: bill.address || '',
            dueDate: bill.dueDate ? new Date(bill.dueDate).toISOString().split('T')[0] : ''
        });

        const mappedItems = bill.items.map(item => {
            const pId = typeof item.productRef === 'object' ? item.productRef._id : item.productRef;
            const product = products.find(p => p._id === pId);
            return {
                _id: pId,
                name: item.productName,
                sku: product?.sku || '-',
                category: item.category || product?.category || '',
                qty: item.quantity,
                salePrice: item.price,
                totalStock: product ? product.totalStock + item.quantity : 0,
            };
        });
        setCart(mappedItems);
        setShowForm(true);
    };

    const handleSelectCustomer = (customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch(customer.name);
        setCheckoutData(prev => ({
            ...prev,
            phone: customer.phone || '', 
            address: customer.address || prev.address
        }));
        setShowCustomerSuggestions(false);
    };

    const handleCheckout = async (e) => {
        if (e) e.preventDefault(); 

        if (!selectedCustomer && !checkoutData.nic && !customerSearch) return toast.error("Please enter Customer Name");
        if (cart.length === 0) return toast.error("Cart is empty");

        if (!checkoutData.phone) {
            return toast.error("Phone Number is MANDATORY for all sales.");
        }

        const totalAmount = calculateTotal();
        const scrapWeight = parseFloat(checkoutData.scrapWeight) || 0;
        const scrapPricePerKg = parseFloat(checkoutData.scrapPricePerKg) || 0;
        const scrapAmount = scrapWeight * scrapPricePerKg;
        const paid = parseFloat(checkoutData.paidAmount) || 0;
        
        const payload = {
            customerName: selectedCustomer ? selectedCustomer.name : customerSearch,
            customerRef: selectedCustomer?._id || null,
            items: cart.map(item => ({
                productRef: item._id,
                productName: item.name,
                quantity: item.qty,
                price: item.salePrice
            })),
            totalAmount: totalAmount,
            scrapWeight: scrapWeight,
            scrapPricePerKg: scrapPricePerKg,
            scrapAmount: scrapAmount,
            paidAmount: paid,
            nic: checkoutData.nic,
            customerPhone: checkoutData.phone, 
            address: checkoutData.address,
            dueDate: checkoutData.dueDate,
            saleMode: 'battery',
            ...(!isEditing && billDate ? { createdAt: billDate } : {})
        };

        try {
            let res;
            if (isEditing) {
                res = await apiClient.put(`/api/bills/${editBillId}`, payload);
                setBills(prev => prev.map(b => b._id === editBillId ? res : b));
                toast.success("Bill Updated!");
            } else {
                res = await apiClient.post('/api/bills', payload);
                // Scrap is now automatically created by backend when bill is created
                setBills(prev => [res, ...prev]); 
                toast.success("Bill Created!");
            }
            setShowForm(false);
            
            if (!isEditing) {
                handleViewPDF(`${API_URL}/api/bills/${res._id}/pdf`);
            }
        } catch (err) {
            toast.error(err.message || "Transaction Failed");
        }
    };

    const handleCancelBill = async (billId) => {
        if (!window.confirm("Are you sure? This will void payment and revert stock.")) return;
        try {
            const res = await apiClient.put(`/api/bills/${billId}/cancel`);
            setBills(prev => prev.map(b => b._id === billId ? res.bill : b));
            toast.success("Bill Cancelled");
        } catch (err) { toast.error(err.message); }
    };

    const openPayModal = (bill) => {
        setSelectedBillForPay(bill);
        setPaymentAmount(bill.balance); 
        setShowPayModal(true);
    };

    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await apiClient.put(`/api/bills/${selectedBillForPay._id}/payment`, { amount: Number(paymentAmount) });
            setBills(bills.map(b => b._id === selectedBillForPay._id ? res : b)); 
            setShowPayModal(false);
            toast.success("Payment Added");
        } catch (err) { toast.error(err.message); }
    };

    const filteredBills = bills.filter(b => {
        const matchesStatus = filter === 'all' ? true : (filter === 'pending' ? (b.status === 'pending' || b.status === 'partial') : b.status === filter);
        const searchLower = searchTerm.toLowerCase();
        const decimalId = getBillId(b);
        const matchesSearch = b.customerName?.toLowerCase().includes(searchLower) || decimalId.includes(searchLower);
        let matchesDate = true;
        if (startDate || endDate) {
            const billDate = new Date(b.createdAt); billDate.setHours(0,0,0,0); 
            if (startDate && billDate < new Date(startDate)) matchesDate = false;
            if (endDate) { const end = new Date(endDate); end.setHours(23,59,59); if (billDate > end) matchesDate = false; }
        }
        return matchesStatus && matchesSearch && matchesDate;
    });

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()));
        const matchesMode = true;
        return matchesSearch && matchesMode;
    });

    const filteredCustomers = customers.filter(c => 
        (c.type === 'retail') && 
        (c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch))
    );

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Retail Billing</h1>
            
            {/* --- TOP BAR ACTIONS --- */}
            <div className="mb-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
                    <button onClick={openBillForm} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold w-full md:w-auto hover:bg-blue-700 whitespace-nowrap">
                        + New Bill
                    </button>
                    {/* Status Tabs */}
                    <div className="flex bg-white border border-gray-300 rounded-lg p-1 overflow-hidden shadow-sm">
                        {['all', 'pending', 'paid', 'cancelled'].map(f => (
                            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === f ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
                    {/* Date Filter */}
                    <div className="flex flex-col w-full md:w-auto">
                        <span className="text-xs text-gray-500 mb-1 ml-1">Filter by Date</span>
                        <div className="flex items-center gap-2">
                            <input type="date" className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-11 text-gray-700 bg-white shadow-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                            <span className="text-gray-400 font-bold">-</span>
                            <input type="date" className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-11 text-gray-700 bg-white shadow-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                    </div>

                    {/* Search */}
                    <div className="flex flex-col flex-grow w-full md:w-80 relative">
                        <span className="text-xs text-gray-500 mb-1 ml-1">Search</span>
                        <div className="relative">
                            <input type="text" placeholder="Search Invoice # or Name..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-11 shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            <div className="absolute left-3 top-3.5 text-gray-400"><SearchIcon /></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- BILLS TABLE --- */}
            <div className="w-full overflow-hidden border rounded-lg shadow-sm bg-white">
                <Table columns={['Bill ID', 'Date', 'Customer', 'Total', 'Paid', 'Balance', 'Status', 'Actions']} loading={loading}>
                    {filteredBills.map(bill => (
                        <tr key={bill._id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors">
                            <td className="px-6 py-4 font-mono text-sm font-bold text-gray-600">#{getBillId(bill)}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">{new Date(bill.createdAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4 font-medium text-gray-800">{bill.customerName}</td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-800">Rs {bill.amount?.toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm text-green-600">Rs {bill.paidAmount?.toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm">
                                {bill.balance > 0 ? <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded">Rs {bill.balance.toLocaleString()}</span> : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-6 py-4">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide 
                                    ${bill.status === 'paid' ? 'bg-green-100 text-green-700' : 
                                      bill.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                                      'bg-yellow-100 text-yellow-700'}`}>
                                    {bill.status}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <button onClick={() => onViewClick(bill._id, bill)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View"><EyeIcon/></button>
                                    <button onClick={() => onPrintClick(bill._id, bill)} className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors" title="Print Receipt"><PrintIcon/></button>
                                    <button onClick={() => handleSendWhatsApp(bill)} className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">WhatsApp</button>
                                    
                                    {bill.status !== 'cancelled' && (
                                        <div className="flex items-center gap-2 pl-2 border-l border-gray-200 ml-2">
                                            <button onClick={() => handleEditBill(bill)} className="text-xs font-bold text-blue-600 hover:underline">Edit</button>
                                            {bill.balance > 0 && <button onClick={() => openPayModal(bill)} className="text-xs font-bold text-green-600 hover:underline">Pay</button>}
                                            <button onClick={() => handleCancelBill(bill._id)} className="text-xs font-bold text-red-500 hover:underline">Cancel</button>
                                        </div>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </div>

            {/* --- CREATE / EDIT MODAL --- */}
            {/* Added hideHeader={true} to remove default header and avoids overlap */}
            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={isEditing ? "Edit Retail Bill" : "Create Retail Bill"} maxWidth="max-w-7xl" hideHeader={true}>
                {/* Used -m-5 to fully bleed to the edges of the p-5 modal container */}
                <div className="flex flex-col md:flex-row h-[80vh] -m-5">
                    
                    {/* LEFT SIDE: SEARCH & CART (2/3 width) */}
                    <div className="flex-1 flex flex-col border-r border-gray-100 bg-gray-50/50">
                        {/* Header */}
                        <div className="p-6 border-b border-gray-200 bg-white">
                            <h2 className="text-xl font-bold text-gray-800">Add Items</h2>
                            <div className="mt-4 relative" ref={searchRef}>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none text-lg"
                                        placeholder="Scan SKU or Search Product..."
                                        value={productSearch}
                                        onChange={(e) => { setProductSearch(e.target.value); setShowProductSuggestions(true); }}
                                        autoFocus
                                    />
                                    {/* ✅ FIXED: Centered the search icon perfectly */}
                                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
                                        <SearchIcon/>
                                    </div>
                                </div>
                                
                                {/* Suggestions Dropdown */}
                                {showProductSuggestions && productSearch && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-80 overflow-y-auto z-20">
                                        {filteredProducts.map(p => (
                                            <div key={p._id} onClick={() => addToCart(p)} className={`p-4 border-b border-gray-50 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-colors ${p.totalStock === 0 ? 'opacity-60 bg-gray-50' : ''}`}>
                                                <div>
                                                    <div className="font-bold text-gray-800">{p.name}</div>
                                                    <div className="text-xs text-gray-500 font-mono mt-0.5">SKU: {p.sku}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-blue-600">Rs {p.price}</div>
                                                    <div className={`text-xs font-bold ${p.totalStock > 0 ? 'text-green-600' : 'text-red-500'}`}>{p.totalStock} in stock</div>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredProducts.length === 0 && <div className="p-6 text-center text-gray-400 italic">No products found.</div>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Cart Table */}
                        <div className="flex-1 overflow-y-auto p-0">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-100/50 sticky top-0 z-10 backdrop-blur-sm">
                                    <tr>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center w-32">Qty</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right w-32">Price</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right w-32">Total</th>
                                        <th className="p-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {cart.map(item => (
                                        <tr key={item._id} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="p-4">
                                                <div className="font-bold text-gray-800 text-sm">{item.name}</div>
                                                <div className="text-xs text-gray-400 font-mono">{item.sku}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-center bg-gray-100 rounded-lg p-1 w-fit mx-auto">
                                                    <button onClick={() => updateQty(item._id, item.qty - 1)} className="p-1 hover:bg-white rounded shadow-sm transition-all"><MinusIcon/></button>
                                                    <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                                                    <button onClick={() => updateQty(item._id, item.qty + 1)} className="p-1 hover:bg-white rounded shadow-sm transition-all"><PlusIcon/></button>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <input 
                                                    type="number" 
                                                    value={item.salePrice} 
                                                    onChange={(e) => updatePrice(item._id, e.target.value)}
                                                    className="w-20 text-right p-1 border-b border-gray-200 focus:border-blue-500 outline-none bg-transparent font-medium text-sm"
                                                />
                                            </td>
                                            <td className="p-4 text-right font-bold text-gray-800">
                                                Rs {(item.qty * item.salePrice).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-center">
                                                <button onClick={() => removeFromCart(item._id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition-colors"><TrashIcon/></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {cart.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="p-12 text-center">
                                                <div className="text-gray-300 mb-2 text-4xl">🛒</div>
                                                <p className="text-gray-400 font-medium">Cart is empty. Start scanning!</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* RIGHT SIDE: CUSTOMER & CHECKOUT (1/3 width) */}
                    <form onSubmit={handleCheckout} className="w-full md:w-[400px] bg-white flex flex-col h-full shadow-xl z-20">
                        <div className="p-6 bg-gray-800 text-white flex justify-between items-center">
                            <h2 className="text-lg font-bold">Checkout</h2>
                            {/* ✅ ADDED: Explicit Close Button inside the Checkout Header */}
                            <button type="button" onClick={() => setShowForm(false)} className="text-white hover:text-gray-300 focus:outline-none">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto space-y-6">
                            {/* Customer Selection */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200" ref={customerSearchRef}>
                                <div className="flex items-center gap-2 mb-3 text-gray-700 font-bold text-sm">
                                    <UserIcon/> <span>Customer Details</span>
                                </div>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        className={`w-full p-3 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all ${selectedCustomer ? 'border-green-300 bg-green-50 text-green-800 font-bold' : 'border-gray-300'}`}
                                        placeholder="Search or Enter Name"
                                        value={customerSearch}
                                        onChange={(e) => { 
                                            setCustomerSearch(e.target.value); 
                                            setSelectedCustomer(null); 
                                            setShowCustomerSuggestions(true);
                                        }}
                                    />
                                    {showCustomerSuggestions && customerSearch && !selectedCustomer && (
                                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-30 max-h-40 overflow-y-auto">
                                            {filteredCustomers.map(c => (
                                                <div key={c._id} onClick={() => handleSelectCustomer(c)} className="p-3 hover:bg-blue-50 cursor-pointer border-b text-sm">
                                                    <div className="font-bold">{c.name}</div>
                                                    <div className="text-xs text-gray-500">{c.phone}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {selectedCustomer && <div className="mt-2 text-xs text-green-600 font-bold flex items-center gap-1">✓ Registered Customer Linked</div>}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><PhoneIcon/> Phone Number</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border rounded-lg text-sm outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
                                        placeholder="03XXXXXXXXX"
                                        value={checkoutData.phone} 
                                        onChange={(e) => setCheckoutData({...checkoutData, phone: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><MapIcon/> Address</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border rounded-lg text-sm outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
                                        placeholder="Enter Customer Address"
                                        value={checkoutData.address} 
                                        onChange={(e) => setCheckoutData({...checkoutData, address: e.target.value})} 
                                    />
                                </div>
                                <div className={`grid grid-cols-1 ${isEditing ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><CardIcon/> NIC Number</label>
                                        <input 
                                            type="text" 
                                            className="w-full p-2 border rounded-lg text-sm outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
                                            placeholder="XXXXX-XXXXXXX-X"
                                            value={checkoutData.nic} 
                                            onChange={(e) => setCheckoutData({...checkoutData, nic: e.target.value})} 
                                        />
                                    </div>
                                    {!isEditing && (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">Bill Date</label>
                                            <input
                                                type="date"
                                                className="w-full p-2 border rounded-lg text-sm outline-none focus:border-blue-500"
                                                value={billDate}
                                                onChange={(e) => setBillDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Due Date</label>
                                        <input type="date" className="w-full p-2 border rounded-lg text-sm outline-none focus:border-blue-500" value={checkoutData.dueDate} onChange={(e) => setCheckoutData({...checkoutData, dueDate: e.target.value})} />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <div className="flex justify-between text-sm text-gray-600">
                                    <span>Subtotal</span>
                                    <span>Rs {calculateTotal().toLocaleString()}</span>
                                </div>
                                
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                                    <div className="text-xs font-bold text-amber-700 mb-2">🔋 Scrap Battery Deduction</div>
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Weight (Kg)</label>
                                            <input 
                                                type="number" 
                                                step="0.1"
                                                className="w-full p-2 border rounded text-sm focus:border-amber-500 outline-none"
                                                placeholder="0"
                                                value={checkoutData.scrapWeight}
                                                onChange={(e) => setCheckoutData({...checkoutData, scrapWeight: e.target.value})}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Price/Kg (Rs)</label>
                                            <input 
                                                type="number" 
                                                className="w-full p-2 border rounded text-sm focus:border-amber-500 outline-none"
                                                placeholder="0"
                                                value={checkoutData.scrapPricePerKg}
                                                onChange={(e) => setCheckoutData({...checkoutData, scrapPricePerKg: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-amber-700">Scrap Total</span>
                                        <span className="font-bold text-amber-700">
                                            Rs {((parseFloat(checkoutData.scrapWeight) || 0) * (parseFloat(checkoutData.scrapPricePerKg) || 0)).toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center pt-4 border-t border-dashed border-gray-300">
                                    <span className="text-lg font-bold text-gray-800">Net Total</span>
                                    <span className="text-2xl font-black text-blue-600">Rs {(calculateTotal() - ((parseFloat(checkoutData.scrapWeight)||0) * (parseFloat(checkoutData.scrapPricePerKg)||0))).toLocaleString()}</span>
                                </div>

                                <div className="bg-gray-100 p-4 rounded-xl">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Amount Paid</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-3 text-xl font-bold text-green-700 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-right"
                                        placeholder="0"
                                        value={checkoutData.paidAmount}
                                        onChange={(e) => setCheckoutData({...checkoutData, paidAmount: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 bg-gray-50 border-t border-gray-200">
                            <button 
                                type="submit" 
                                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all transform active:scale-95 flex items-center justify-center gap-2"
                            >
                                <span>Complete Sale</span>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>

            {/* Payment Modal */}
            <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)} title="Add Payment" maxWidth="max-w-sm">
                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                    <div className="text-center py-4 bg-gray-50 rounded-xl">
                        <p className="text-xs text-gray-500 uppercase font-bold">Pending Balance</p>
                        <p className="text-3xl font-black text-red-600">Rs {selectedBillForPay?.balance?.toLocaleString()}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Amount to Pay</label>
                        <input 
                            type="number" 
                            className="w-full p-3 border rounded-lg text-lg focus:ring-2 focus:ring-green-500 outline-none font-bold" 
                            value={paymentAmount} 
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            max={selectedBillForPay?.balance}
                            min="1"
                            required 
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setShowPayModal(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-bold">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md">Confirm</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Billing;


//comments for uploading code on server