import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import Table from '../Common/Table';
import Modal from '../Common/Modal';
import CustomerLedgerModal from '../Common/CustomerLedgerModal'; 

const normalizePakistaniPhone = (phone = '') => {
    const digits = String(phone).replace(/\D/g, '');

    if (digits.startsWith('03') && digits.length === 11) return `92${digits.slice(1)}`;
    if (digits.startsWith('3') && digits.length === 10) return `92${digits}`;
    if (digits.startsWith('923') && digits.length === 12) return digits;

    return '';
};

const isValidPakistaniPhone = (phone = '') => normalizePakistaniPhone(phone) !== '';

const ClaimManagement = () => {
    const createEmptyClaimRow = () => ({
        productRef: '',
        productName: '',
        productSearch: '',
        serialNumber: '',
        processType: 'pending', // 'pending' | 'exchange'
        replacementProductRef: '',
        replacementProductName: '',
        replacementProductSearch: '',
        replacementSerial: '',
        claimFee: '',
        claimFeeComment: '',
        claimFeePaid: false
    });

    const [activeTab, setActiveTab] = useState('customer'); // 'customer' or 'supplier'
    const [claims, setClaims] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]); 
    const [loading, setLoading] = useState(true);

    // --- SEARCH & FILTER STATE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState({
        startDate: '',
        endDate: ''
    });
    const [selectedCustomerFilterId, setSelectedCustomerFilterId] = useState('');

    // --- LEDGER MODAL STATE ---
    const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
    const [selectedLedgerEntity, setSelectedLedgerEntity] = useState({ id: '', name: '' });

    // --- FORM STATE (NEW CLAIM) ---
    const [showForm, setShowForm] = useState(false);
    
    // CUSTOMER SEARCH & ADD STATE
    const [customerSearch, setCustomerSearch] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isNewCustomer, setIsNewCustomer] = useState(false);
    const [newCustomerDetails, setNewCustomerDetails] = useState({ name: '', phone: '', address: '' });
    const searchRef = useRef(null);

    const [newClaim, setNewClaim] = useState({
        customerRef: '', description: ''
    });
    const [claimRows, setClaimRows] = useState([createEmptyClaimRow()]);
    const [activeProductSearchRow, setActiveProductSearchRow] = useState(null);
    const [activeReplacementSearchRow, setActiveReplacementSearchRow] = useState(null);

    // --- EDIT STATE ---
    const [showEditModal, setShowEditModal] = useState(false);
    const [editData, setEditData] = useState({
        _id: '',
        productRef: '',
        serialNumber: '',
        description: '',
        claimFee: '',
        claimFeeComment: '',
        claimFeePaid: false,
        claimDate: '',
        status: ''
    });

    const [showResolveModal, setShowResolveModal] = useState(false);
    const [resolutionData, setResolutionData] = useState({
        claimId: null, type: 'resolve', replacementProductRef: '', replacementSerial: '', rejectionReason: '',
        resolutionType: 'exchange', deductionAmount: ''
    });

    // --- SUPPLIER ACTION STATE ---
    const [selectedForSupplier, setSelectedForSupplier] = useState([]);
    const [showSendSupplierModal, setShowSendSupplierModal] = useState(false); 
    const [targetSupplier, setTargetSupplier] = useState(''); 
    const [targetSupplierName, setTargetSupplierName] = useState(''); 
    const [selectedSupplierFilterId, setSelectedSupplierFilterId] = useState('');

    useEffect(() => {
        fetchData();
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (activeTab !== 'customer') {
            setSelectedCustomerFilterId('');
        }
        if (activeTab !== 'supplier') {
            setSelectedSupplierFilterId('');
        }
    }, [activeTab]);

    const handleClickOutside = (event) => {
        if (searchRef.current && !searchRef.current.contains(event.target)) {
            setShowSuggestions(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [claimsData, custData, prodData, suppData] = await Promise.all([
                apiClient.get('/api/claims'),
                apiClient.get('/api/customers'),
                apiClient.get('/api/products'),
                apiClient.get('/api/suppliers') 
            ]);
            setClaims(claimsData);
            setCustomers(custData);
            setProducts(prodData);
            setSuppliers(suppData);
        } catch (err) { toast.error(err.message); }
        finally { setLoading(false); }
    };

    const getProductSku = (productRef) => {
        if (!productRef) return '-';
        if (productRef.sku) return productRef.sku;
        const idToCheck = typeof productRef === 'object' ? productRef._id : productRef;
        const p = products.find(prod => prod._id === idToCheck);
        return p ? p.sku : '-';
    };

    // --- FILTERING LOGIC ---
    const getFilteredClaims = () => {
        return claims.filter(c => {
            if (dateFilter.startDate) {
                const cDate = new Date(c.claimDate).toISOString().split('T')[0];
                if (cDate < dateFilter.startDate) return false;
            }
            if (dateFilter.endDate) {
                const cDate = new Date(c.claimDate).toISOString().split('T')[0];
                if (cDate > dateFilter.endDate) return false;
            }
            if (activeTab === 'supplier') {
                if (!c.supplierRef && c.supplierStatus === 'none') return false; 
            }
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const serial = c.items[0]?.serialNumber?.toLowerCase() || '';
                const prodName = c.items[0]?.productName?.toLowerCase() || '';
                const custName = c.customerRef?.name?.toLowerCase() || '';
                const suppName = c.supplierRef?.name?.toLowerCase() || '';
                const sku = getProductSku(c.items[0]?.productRef).toLowerCase();

                const matches = serial.includes(term) || 
                                prodName.includes(term) || 
                                sku.includes(term) || 
                                custName.includes(term) ||
                                suppName.includes(term);
                
                if (!matches) return false;
            }
            return true; 
        });
    };

    const filteredList = getFilteredClaims();
    const customerFilteredClaims = filteredList.filter(c => c.customerRef?._id);
    const groupedCustomerSummaries = (() => {
        const grouped = {};

        customerFilteredClaims.forEach((claim) => {
            const customerId = claim.customerRef?._id;
            if (!customerId) return;

            if (!grouped[customerId]) {
                grouped[customerId] = {
                    id: customerId,
                    name: claim.customerRef?.name || 'Unknown',
                    phone: claim.customerRef?.phone || '-',
                    total: 0,
                    pending: 0,
                    resolved: 0,
                    rejected: 0,
                    latestClaimDate: null,
                    latestProduct: '-',
                };
            }

            const bucket = grouped[customerId];
            bucket.total += 1;
            if (claim.status === 'pending') bucket.pending += 1;
            if (claim.status === 'resolved') bucket.resolved += 1;
            if (claim.status === 'rejected') bucket.rejected += 1;

            const claimDate = claim.claimDate ? new Date(claim.claimDate) : new Date(claim.createdAt);
            if (!bucket.latestClaimDate || claimDate > bucket.latestClaimDate) {
                bucket.latestClaimDate = claimDate;
                bucket.latestProduct = claim.items?.[0]?.productName || '-';
            }
        });

        return Object.values(grouped).sort((a, b) => {
            const aTime = a.latestClaimDate ? new Date(a.latestClaimDate).getTime() : 0;
            const bTime = b.latestClaimDate ? new Date(b.latestClaimDate).getTime() : 0;
            return bTime - aTime;
        });
    })();

    const visibleCustomerClaims = selectedCustomerFilterId
        ? customerFilteredClaims.filter(c => c.customerRef?._id === selectedCustomerFilterId)
        : customerFilteredClaims;

    const supplierFilteredClaims = filteredList.filter(c => c.supplierRef?._id);
    const groupedSupplierSummaries = (() => {
        const grouped = {};

        supplierFilteredClaims.forEach((claim) => {
            const supplierId = claim.supplierRef?._id;
            if (!supplierId) return;

            if (!grouped[supplierId]) {
                grouped[supplierId] = {
                    id: supplierId,
                    name: claim.supplierRef?.name || 'Unknown',
                    phone: claim.supplierRef?.phone || '-',
                    total: 0,
                    ready: 0,
                    sent: 0,
                    received: 0,
                    rejected: 0,
                    latestClaimDate: null,
                };
            }

            const bucket = grouped[supplierId];
            bucket.total += 1;

            const suppStatus = claim.supplierStatus || 'none';
            if (suppStatus === 'none') bucket.ready += 1;
            if (suppStatus === 'sent_to_supplier') bucket.sent += 1;
            if (suppStatus === 'received_from_supplier') bucket.received += 1;
            if (suppStatus === 'rejected_by_supplier') bucket.rejected += 1;

            const claimDate = claim.claimDate ? new Date(claim.claimDate) : new Date(claim.createdAt);
            if (!bucket.latestClaimDate || claimDate > bucket.latestClaimDate) {
                bucket.latestClaimDate = claimDate;
            }
        });

        return Object.values(grouped).sort((a, b) => {
            const aTime = a.latestClaimDate ? new Date(a.latestClaimDate).getTime() : 0;
            const bTime = b.latestClaimDate ? new Date(b.latestClaimDate).getTime() : 0;
            return bTime - aTime;
        });
    })();

    const visibleSupplierClaims = selectedSupplierFilterId
        ? filteredList.filter(c => c.supplierRef?._id === selectedSupplierFilterId)
        : filteredList;

    const filteredCustomers = customers.filter(c => 
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
        c.phone.includes(customerSearch)
    );

    const batteryProducts = products.filter(p => (p.category || '').toLowerCase().includes('batter'));

    // --- DUPLICATE CHECK & CREATE LOGIC ---
    const handleCreateButton = async (e) => {
        e.preventDefault();

        if (isNewCustomer) {
            if (!newCustomerDetails.name.trim()) {
                return toast.error('Please enter customer name.');
            }

            if (!isValidPakistaniPhone(newCustomerDetails.phone)) {
                return toast.error('Enter a valid Pakistan mobile number (e.g., 03XXXXXXXXX).');
            }
        }

        const rowsToSubmit = claimRows.filter(r => r.productRef && r.serialNumber.trim());
        if (rowsToSubmit.length === 0) {
            return toast.error('Please add at least one battery claim row.');
        }

        for (const row of rowsToSubmit) {
            if (row.processType === 'exchange') {
                if (!row.replacementProductRef) {
                    return toast.error('Please select replacement battery for all exchange rows.');
                }
                if (!row.replacementSerial.trim()) {
                    return toast.error('Please enter replacement serial for all exchange rows.');
                }
            }
        }

        const toastId = toast.loading(`Creating ${rowsToSubmit.length} claims...`);
        let successCount = 0;

        try {
            for (const row of rowsToSubmit) {
                let resolutionText = '';
                if (row.processType === 'exchange') {
                    const repProd = products.find(p => p._id === row.replacementProductRef);
                    const repSku = repProd ? repProd.sku : '?';
                    const repName = repProd ? repProd.name : 'Unknown';
                    resolutionText = `Immediate Exchange with [${repSku}] ${repName} (SN: ${row.replacementSerial})`;
                }

                const payload = {
                    customerRef: isNewCustomer ? null : newClaim.customerRef,
                    newCustomer: isNewCustomer
                        ? {
                            ...newCustomerDetails,
                            phone: normalizePakistaniPhone(newCustomerDetails.phone)
                        }
                        : null,
                    items: [{
                        productRef: row.productRef,
                        productName: row.productName,
                        quantity: 1,
                        serialNumber: row.serialNumber
                    }],
                    description: newClaim.description,
                    status: row.processType === 'exchange' ? 'resolved' : 'pending',
                    resolution: resolutionText,
                    claimFee: row.claimFee,
                    claimFeeComment: row.claimFeeComment,
                    claimFeePaid: row.claimFeePaid,
                    resolutionType: 'exchange'
                };

                if (row.processType === 'exchange') {
                    payload.replacementItem = {
                        productRef: row.replacementProductRef,
                        serialNumber: row.replacementSerial
                    };
                }

                await apiClient.post('/api/claims', payload);
                successCount += 1;
            }

            setShowForm(false);
            resetForm();
            fetchData();
            toast.success(`${successCount} claim(s) created successfully`, { id: toastId });
        } catch (err) {
            toast.error(`${err.message} (${successCount} created before error)`, { id: toastId });
            fetchData();
        }
    };

    const resetForm = () => {
        setNewClaim({ 
            customerRef: '',
            description: ''
        });
        setClaimRows([createEmptyClaimRow()]);
        setCustomerSearch('');
        setIsNewCustomer(false);
        setNewCustomerDetails({ name: '', phone: '', address: '' });
    };

    const updateClaimRow = (index, key, value) => {
        setClaimRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            const updated = { ...row, [key]: value };

            if (key === 'productRef') {
                const product = products.find(p => p._id === value);
                updated.productName = product ? product.name : '';
            }

            if (key === 'processType' && value !== 'exchange') {
                updated.replacementProductRef = '';
                updated.replacementProductName = '';
                updated.replacementProductSearch = '';
                updated.replacementSerial = '';
            }

            return updated;
        }));
    };

    const selectProductForRow = (index, product) => {
        setClaimRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            return {
                ...row,
                productRef: product._id,
                productName: product.name,
                productSearch: `[${product.sku}] ${product.name}`
            };
        }));
        setActiveProductSearchRow(null);
    };

    const updateProductSearchForRow = (index, value) => {
        setClaimRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            return {
                ...row,
                productSearch: value,
                productRef: '',
                productName: ''
            };
        }));
    };

    const selectReplacementProductForRow = (index, product) => {
        setClaimRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            return {
                ...row,
                replacementProductRef: product._id,
                replacementProductName: product.name,
                replacementProductSearch: `[${product.sku}] ${product.name}`
            };
        }));
        setActiveReplacementSearchRow(null);
    };

    const updateReplacementSearchForRow = (index, value) => {
        setClaimRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            return {
                ...row,
                replacementProductSearch: value,
                replacementProductRef: '',
                replacementProductName: ''
            };
        }));
    };

    const addClaimRow = () => setClaimRows(prev => [...prev, createEmptyClaimRow()]);
    const removeClaimRow = (index) => {
        setClaimRows(prev => {
            if (prev.length === 1) return prev;
            return prev.filter((_, i) => i !== index);
        });
    };

    const selectCustomer = (customer) => {
        setNewClaim({ ...newClaim, customerRef: customer._id });
        setCustomerSearch(customer.name);
        setIsNewCustomer(false);
        setShowSuggestions(false);
    };

    const switchToNewCustomer = () => {
        setIsNewCustomer(true);
        setNewCustomerDetails({ ...newCustomerDetails, name: customerSearch });
        setShowSuggestions(false);
        setNewClaim({ ...newClaim, customerRef: '' });
    };

    // --- EDIT HANDLERS ---
    const openEditModal = (claim) => {
        const item = claim.items && claim.items[0];
        const prodId = item?.productRef?._id || item?.productRef || '';
        const claimDateFormatted = claim.claimDate ? new Date(claim.claimDate).toISOString().split('T')[0] : '';
        
        setEditData({
            _id: claim._id,
            productRef: prodId,
            serialNumber: item?.serialNumber || '',
            description: claim.description || '',
            claimFee: claim.claimFee || '',
            claimFeeComment: claim.claimFeeComment || '',
            claimFeePaid: claim.claimFeePaid || false,
            claimDate: claimDateFormatted,
            status: claim.status || 'pending'
        });
        setShowEditModal(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                items: [{
                    productRef: editData.productRef,
                    quantity: 1,
                    serialNumber: editData.serialNumber
                }],
                description: editData.description,
                claimFee: editData.claimFee,
                claimFeeComment: editData.claimFeeComment,
                claimFeePaid: editData.claimFeePaid,
                claimDate: editData.claimDate
            };

            // ✅ CHANGED: PUT instead of PATCH (Backend expects PUT for details)
            const updatedClaim = await apiClient.put(`/api/claims/${editData._id}/details`, payload);
            setClaims(claims.map(c => c._id === editData._id ? updatedClaim : c));
            setShowEditModal(false);
            toast.success("Claim Details Updated Successfully");
        } catch (err) { 
            toast.error(err.message); 
        }
    };

    const openLedger = (entityId, entityName) => {
        if (!entityId) {
            toast.error(activeTab === 'customer' ? 'No customer linked to this claim' : 'No supplier linked to this claim');
            return;
        }

        setSelectedLedgerEntity({ id: entityId, name: entityName || 'Unknown' });
        setLedgerModalOpen(true);
    };

    const openResolveModal = (claim) => {
        const prodId = claim.items[0]?.productRef?._id || claim.items[0]?.productRef;
        setResolutionData({
            claimId: claim._id, type: 'resolve', replacementProductRef: prodId, 
            replacementSerial: '', rejectionReason: '',
            resolutionType: 'exchange', deductionAmount: ''
        });
        setShowResolveModal(true);
    };

    const handleResolutionSubmit = async (e) => {
        e.preventDefault();
        const { claimId, type, replacementProductRef, replacementSerial, rejectionReason, resolutionType, deductionAmount } = resolutionData;
        try {
            let payload = {};
            if (type === 'resolve') {
                if (resolutionType === 'exchange') {
                    const repProd = products.find(p => p._id === replacementProductRef);
                    const sku = repProd ? repProd.sku : '-';
                    const name = repProd ? repProd.name : 'Unknown';
                    payload = { 
                        status: 'resolved', 
                        resolutionType: 'exchange',
                        replacementItem: { productRef: replacementProductRef, serialNumber: replacementSerial }, 
                        resolution: `Replaced with [${sku}] ${name} (SN: ${replacementSerial})` 
                    };
                } else {
                    // Ledger Deduction
                    payload = { 
                        status: 'resolved', 
                        resolutionType: 'ledger_deduction',
                        deductionAmount: deductionAmount,
                        resolution: `Ledger Deduction of Rs.${deductionAmount}` 
                    };
                }
            } else {
                payload = { status: 'rejected', resolution: `Rejected: ${rejectionReason}` };
            }
            
            // ✅ CHANGED: PUT instead of PATCH
            const updated = await apiClient.put(`/api/claims/${claimId}/status`, payload);
            
            setClaims(claims.map(c => c._id === claimId ? { ...c, ...updated } : c));
            setShowResolveModal(false);
            toast.success(`Claim ${type === 'resolve' ? 'Resolved' : 'Rejected'}`);
        } catch (err) { toast.error(err.message); }
    };

    // --- REVERT LOGIC ---
    const handleRevertClaim = async (claimId) => {
        if(!window.confirm("Are you sure? This will Revert status to Pending and ADD the replacement stock back to inventory.")) return;

        try {
            // ✅ CHANGED: PUT instead of PATCH to match backend route
            const updated = await apiClient.put(`/api/claims/${claimId}/status`, { 
                status: 'pending' 
            });
            setClaims(claims.map(c => c._id === claimId ? { ...c, ...updated } : c));
            toast.success("Claim Reverted to Pending (Stock Returned)");
        } catch(err) {
            toast.error(err.message);
        }
    };

    // --- DELETE LOGIC ---
    const handleDeleteClaim = async (claimId) => {
        if(!window.confirm("WARNING: This will permanently DELETE this claim. If a fee was charged to Ledger, it will be REMOVED from the customer balance. Continue?")) return;
        
        try {
             await apiClient.delete(`/api/claims/${claimId}`);
             setClaims(claims.filter(c => c._id !== claimId));
             toast.success("Claim Deleted Successfully");
        } catch(err) {
             toast.error(err.message);
        }
    };

    const toggleSelectClaim = (id) => {
        if (selectedForSupplier.includes(id)) setSelectedForSupplier(selectedForSupplier.filter(idx => idx !== id));
        else setSelectedForSupplier([...selectedForSupplier, id]);
    };

    const initiateBulkSend = () => {
        if (selectedForSupplier.length === 0) return toast.error("Select items first");
        const selectedClaimsData = claims.filter(c => selectedForSupplier.includes(c._id));
        const firstSupplier = selectedClaimsData[0]?.supplierRef?._id;
        const firstSupplierName = selectedClaimsData[0]?.supplierRef?.name;
        
        if (selectedClaimsData.every(c => c.supplierRef?._id === firstSupplier) && firstSupplier) {
            setTargetSupplier(firstSupplier); 
            setTargetSupplierName(firstSupplierName); 
        } else {
            setTargetSupplier(''); 
            setTargetSupplierName('');
        }
        setShowSendSupplierModal(true);
    };

    const confirmSendToSupplier = async () => {
        if (!targetSupplier) return toast.error("Please select a supplier");
        try {
            await apiClient.post('/api/claims/send-supplier', { 
                claimIds: selectedForSupplier,
                targetSupplierId: targetSupplier 
            });
            toast.success(`Sent ${selectedForSupplier.length} items to Supplier`);
            fetchData();
            setSelectedForSupplier([]);
            setShowSendSupplierModal(false);
        } catch (err) { toast.error(err.message); }
    };

    const updateSupplierStatus = async (claimId, statusType) => {
        const statusMap = { 
            'accept': 'received_from_supplier', 
            'reject': 'rejected_by_supplier',
            'undo_receive': 'sent_to_supplier' 
        };

        try {
            // ✅ CHANGED: PUT instead of PATCH
            const updated = await apiClient.put(`/api/claims/${claimId}/status`, { supplierStatus: statusMap[statusType] });
            
            setClaims(claims.map(c => c._id === claimId ? { ...c, ...updated } : c));
            
            if(statusType === 'accept') toast.success("Stock Added (Accepted)");
            else if(statusType === 'undo_receive') toast.success("Stock Reverted (Undone)");
            else toast.error("Marked Rejected");
            
        } catch(err) { toast.error(err.message); }
    };

    const StatusBadge = ({ status }) => {
        const styles = {
            resolved: 'bg-green-100 text-green-800 border-green-200',
            rejected: 'bg-red-100 text-red-800 border-red-200',
            pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
            sent_to_supplier: 'bg-purple-100 text-purple-800 border-purple-200',
            received_from_supplier: 'bg-green-100 text-green-800 border-green-200',
            rejected_by_supplier: 'bg-red-100 text-red-800 border-red-200',
            none: 'bg-gray-100 text-gray-500 border-gray-200'
        };
        const label = status ? status.replace(/_/g, ' ').toUpperCase() : 'PENDING';
        return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${styles[status] || styles.none}`}>{label}</span>;
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Warranty & Claims</h1>
                    <p className="text-sm text-gray-500">Track customer returns and supplier exchanges</p>
                </div>
                
                <div className="flex flex-wrap gap-2 items-center bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
                    <div className="relative group">
                        <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                        <input 
                            type="text" 
                            placeholder="Search Serial, SKU, Name..." 
                            className="pl-9 pr-4 py-2 text-sm border-none bg-gray-50 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none w-64 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="flex gap-6 border-b border-gray-200 mb-6">
                <button 
                    onClick={() => setActiveTab('customer')}
                    className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'customer' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Customer Claims
                </button>
                <button 
                    onClick={() => setActiveTab('supplier')}
                    className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'supplier' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Supplier Returns
                </button>
            </div>

            {activeTab === 'customer' && (
                <div className="animate-fade-in-up">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-700">Customer Claim Ledger</h2>
                            <p className="text-xs text-gray-500">One row per customer with combined claim counts.</p>
                        </div>
                        <button 
                            onClick={() => { resetForm(); setShowForm(true); }} 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-md shadow-blue-100 transition-all flex items-center gap-2"
                        >
                            <span>+</span> New Claim
                        </button>
                    </div>
                    
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-h-[26rem] overflow-y-auto">
                        <Table columns={['Customer', 'Phone', 'Total', 'Pending', 'Resolved', 'Rejected', 'Latest', 'Actions']} loading={loading}>
                            {groupedCustomerSummaries.map((row) => (
                                <tr key={row.id} className={`hover:bg-gray-50 transition-colors border-b last:border-0 ${selectedCustomerFilterId === row.id ? 'bg-blue-50/60' : ''}`}>
                                    <td className="px-6 py-4 font-bold text-gray-800">{row.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{row.phone}</td>
                                    <td className="px-6 py-4 text-sm font-semibold text-gray-700">{row.total}</td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">{row.pending}</span></td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-green-50 text-green-700 border border-green-200">{row.resolved}</span></td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-red-50 text-red-700 border border-red-200">{row.rejected}</span></td>
                                    <td className="px-6 py-4 text-xs text-gray-500">{row.latestClaimDate ? new Date(row.latestClaimDate).toLocaleDateString() : '-'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setSelectedCustomerFilterId((prev) => prev === row.id ? '' : row.id)}
                                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                                            >
                                                {selectedCustomerFilterId === row.id ? 'Show All' : 'View Claims'}
                                            </button>
                                            <button
                                                onClick={() => openLedger(row.id, row.name)}
                                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                                            >
                                                Claim Ledger
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </Table>
                    </div>

                    <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-md font-bold text-gray-700">
                                {selectedCustomerFilterId
                                    ? `Claims for ${groupedCustomerSummaries.find(c => c.id === selectedCustomerFilterId)?.name || 'Selected Customer'}`
                                    : 'All Customer Claims'}
                            </h3>
                            {selectedCustomerFilterId && (
                                <button
                                    onClick={() => setSelectedCustomerFilterId('')}
                                    className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border border-gray-200"
                                >
                                    Clear Filter
                                </button>
                            )}
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-h-[30rem] overflow-y-auto">
                            <Table columns={['Date', 'Product Details', 'Status', 'Resolution', 'Action']} loading={loading}>
                                {visibleCustomerClaims.map(claim => (
                                    <tr key={claim._id} className="hover:bg-gray-50 transition-colors border-b last:border-0 group">
                                        <td className="px-6 py-4 text-sm text-gray-500">{new Date(claim.claimDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium text-gray-800">
                                                <span className="text-blue-600 font-bold mr-1">[{getProductSku(claim.items[0]?.productRef)}]</span>
                                                {claim.items[0]?.productName}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5 bg-gray-100 inline-block px-1.5 rounded">
                                                SN: {claim.items[0]?.serialNumber}
                                            </div>
                                            {claim.claimFee > 0 && (
                                                <div className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block border ${claim.claimFeePaid ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                    {claim.claimFeePaid ? `Paid: ${claim.claimFee}` : `Debt: ${claim.claimFee}`}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4"><StatusBadge status={claim.status} /></td>
                                        <td className="px-6 py-4 text-xs max-w-xs truncate text-gray-600" title={claim.resolution}>
                                            {claim.resolution || <span className="text-gray-300 italic">No resolution yet</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(claim)}
                                                    className="bg-gray-100 text-gray-600 p-1.5 rounded-lg border border-gray-200 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                                    title="Edit Claim Details & Fees"
                                                >
                                                    ✏️
                                                </button>

                                                {claim.status === 'pending' ? (
                                                    <>
                                                        <button
                                                            onClick={() => openResolveModal(claim)}
                                                            className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                                        >
                                                            Process
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClaim(claim._id)}
                                                            className="bg-red-50 text-red-600 p-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                                                            title="Delete Claim"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-400 text-xs flex items-center gap-1">
                                                            <span className="text-green-500">✓</span> Done
                                                        </span>
                                                        <button
                                                            onClick={() => handleRevertClaim(claim._id)}
                                                            className="text-orange-500 hover:text-orange-700 bg-orange-50 p-1 rounded border border-orange-200 transition-colors text-xs"
                                                            title="Revert to Pending (Undo Resolution)"
                                                        >
                                                            ↩️
                                                        </button>
                                                    </div>
                                                )}
                                                {claim.status === 'rejected' && (
                                                    <button
                                                        onClick={() => handleDeleteClaim(claim._id)}
                                                        className="bg-red-50 text-red-600 p-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                                                        title="Delete Claim"
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </Table>
                        </div>
                    </div>
                </div>
            )}

            {/* ... Other tabs (Supplier) remain same ... */}
            {activeTab === 'supplier' && (
                <div className="animate-fade-in-up">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-700">Supplier Claim Ledger</h2>
                            <p className="text-xs text-gray-500">Manage returns sent to suppliers and update final outcomes.</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-h-[26rem] overflow-y-auto">
                        <Table columns={['Supplier', 'Phone', 'Total', 'Ready', 'Sent', 'Received', 'Rejected', 'Latest', 'Actions']} loading={loading}>
                            {groupedSupplierSummaries.map((row) => (
                                <tr key={row.id} className={`hover:bg-gray-50 transition-colors border-b last:border-0 ${selectedSupplierFilterId === row.id ? 'bg-blue-50/60' : ''}`}>
                                    <td className="px-6 py-4 font-bold text-gray-800">{row.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{row.phone}</td>
                                    <td className="px-6 py-4 text-sm font-semibold text-gray-700">{row.total}</td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-orange-50 text-orange-700 border border-orange-200">{row.ready}</span></td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-purple-50 text-purple-700 border border-purple-200">{row.sent}</span></td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-green-50 text-green-700 border border-green-200">{row.received}</span></td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-red-50 text-red-700 border border-red-200">{row.rejected}</span></td>
                                    <td className="px-6 py-4 text-xs text-gray-500">{row.latestClaimDate ? new Date(row.latestClaimDate).toLocaleDateString() : '-'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setSelectedSupplierFilterId((prev) => prev === row.id ? '' : row.id)}
                                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                                            >
                                                {selectedSupplierFilterId === row.id ? 'Show All' : 'View Claims'}
                                            </button>
                                            <button
                                                onClick={() => openLedger(row.id, row.name)}
                                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                                            >
                                                Claim Ledger
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </Table>
                    </div>

                    <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-md font-bold text-gray-700">
                                {selectedSupplierFilterId
                                    ? `Claims for ${groupedSupplierSummaries.find(s => s.id === selectedSupplierFilterId)?.name || 'Selected Supplier'}`
                                    : 'All Supplier Claims'}
                            </h3>
                            <div className="flex items-center gap-2">
                                {selectedSupplierFilterId && (
                                    <button
                                        onClick={() => setSelectedSupplierFilterId('')}
                                        className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border border-gray-200"
                                    >
                                        Clear Filter
                                    </button>
                                )}
                                {selectedForSupplier.length > 0 && (
                                    <button
                                        onClick={initiateBulkSend}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-md shadow-blue-100 transition-all flex items-center gap-2"
                                    >
                                        <span>📦</span> Send {selectedForSupplier.length} Items
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-h-[30rem] overflow-y-auto">
                            <Table columns={['Select', 'Date', 'Product Details', 'Linked Supplier', 'Status', 'Action']} loading={loading}>
                                {visibleSupplierClaims.map(claim => {
                                const canSend = claim.supplierStatus === 'none' || !claim.supplierStatus;
                                const isSent = claim.supplierStatus === 'sent_to_supplier';
                                const isCompleted = claim.supplierStatus === 'received_from_supplier' || claim.supplierStatus === 'rejected_by_supplier';
                                const sku = getProductSku(claim.items[0]?.productRef);

                                return (
                                    <tr key={claim._id} className={`hover:bg-gray-50 transition-colors border-b last:border-0 group ${isCompleted ? 'bg-gray-50/50' : ''}`}>
                                        <td className="px-6 py-4">
                                            {canSend && (
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedForSupplier.includes(claim._id)} 
                                                    onChange={() => toggleSelectClaim(claim._id)} 
                                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                />
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{new Date(claim.claimDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium text-gray-800">
                                                <span className="text-blue-600 font-bold mr-1">[{sku}]</span>
                                                {claim.items[0]?.productName}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5 bg-gray-100 inline-block px-1.5 rounded">
                                                SN: {claim.items[0]?.serialNumber}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="text-sm font-semibold text-gray-700">
                                                    {claim.supplierRef?.name || <span className="text-gray-400 italic">Unknown</span>}
                                                </div>
                                                {claim.supplierRef && (
                                                    <button 
                                                        onClick={() => openLedger(claim.supplierRef?._id, claim.supplierRef?.name)}
                                                        className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                                                    >
                                                        Claim Ledger
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4"><StatusBadge status={claim.supplierStatus || 'none'} /></td>
                                        <td className="px-6 py-4">
                                            {isSent ? (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => updateSupplierStatus(claim._id, 'accept')}
                                                        className="bg-green-50 text-green-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-100 border border-green-100 transition-colors"
                                                    >
                                                        Accept
                                                    </button>
                                                    <button
                                                        onClick={() => updateSupplierStatus(claim._id, 'reject')}
                                                        className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 border border-red-100 transition-colors"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : isCompleted ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-400 text-xs flex items-center gap-1">
                                                        <span className="text-green-500">✓</span> Done
                                                    </span>
                                                    {claim.supplierStatus === 'received_from_supplier' && (
                                                        <button
                                                            onClick={() => updateSupplierStatus(claim._id, 'undo_receive')}
                                                            className="text-orange-500 hover:text-orange-700 bg-orange-50 p-1 rounded border border-orange-200 transition-colors text-xs"
                                                        >
                                                            Undo
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-1 rounded-full">Ready</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                                })}
                            </Table>
                        </div>
                    </div>
                </div>
            )}

             {/* MODALS RENDER (Unchanged) */}
             <CustomerLedgerModal 
                isOpen={ledgerModalOpen} 
                onClose={() => setLedgerModalOpen(false)} 
                customerId={selectedLedgerEntity.id} 
                customerName={selectedLedgerEntity.name} 
                type={activeTab}       
                ledgerMode="claims"    
            />
            {/* Create Modal */}
            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="New Customer Claims (Bulk)" maxWidth="max-w-4xl">
                 <form onSubmit={handleCreateButton} className="space-y-5">
                    {/* ... Form Content from previous turn ... */}
                    <div className="relative" ref={searchRef}>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Customer</label>
                            {!isNewCustomer ? (
                                <>
                                    <input 
                                        type="text"
                                        placeholder="Search Customer..."
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={customerSearch}
                                        onChange={(e) => {
                                            setCustomerSearch(e.target.value);
                                            setShowSuggestions(true);
                                            setNewClaim({...newClaim, customerRef: ''}); 
                                        }}
                                        onFocus={() => setShowSuggestions(true)}
                                        required={!newClaim.customerRef}
                                    />
                                    {showSuggestions && customerSearch && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            {filteredCustomers.length > 0 ? (
                                                filteredCustomers.map(c => (
                                                    <div 
                                                        key={c._id} 
                                                        className="p-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 border-b last:border-0"
                                                        onClick={() => selectCustomer(c)}
                                                    >
                                                        <div className="font-bold">{c.name}</div>
                                                        <div className="text-xs text-gray-500">{c.phone}</div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div 
                                                    className="p-2 hover:bg-green-50 cursor-pointer text-sm text-green-700 font-bold border-t"
                                                    onClick={switchToNewCustomer}
                                                >
                                                    + Add New Customer: "{customerSearch}"
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="bg-green-50 p-3 rounded-lg border border-green-200 space-y-3 relative">
                                    <button type="button" onClick={() => setIsNewCustomer(false)} className="absolute top-2 right-2 text-green-400 hover:text-green-700 text-xs">✕ Cancel</button>
                                    <p className="text-xs text-green-700 font-bold uppercase tracking-wider">New Customer Details</p>
                                    <input type="text" placeholder="Full Name" className="w-full p-2 border rounded text-sm" value={newCustomerDetails.name} onChange={e => setNewCustomerDetails({...newCustomerDetails, name: e.target.value})} required />
                                    <input type="tel" placeholder="Phone Number (03XXXXXXXXX)" className="w-full p-2 border rounded text-sm" value={newCustomerDetails.phone} onChange={e => setNewCustomerDetails({...newCustomerDetails, phone: e.target.value})} pattern="^(?:03\d{9}|3\d{9}|923\d{9})$" title="Use valid Pakistan mobile format: 03XXXXXXXXX" required />
                                    <input type="text" placeholder="Address (Optional)" className="w-full p-2 border rounded text-sm" value={newCustomerDetails.address} onChange={e => setNewCustomerDetails({...newCustomerDetails, address: e.target.value})} />
                                </div>
                            )}
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="block text-sm font-bold text-gray-800">Claim Batteries</label>
                                <p className="text-xs text-gray-500">Add all defective batteries in one submission. Choose "Exchange Now" only for rows that should be replaced immediately.</p>
                            </div>
                            <button
                                type="button"
                                onClick={addClaimRow}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                            >
                                + Add Battery
                            </button>
                        </div>

                        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                            {claimRows.map((row, idx) => (
                                <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold text-gray-500 uppercase">Battery #{idx + 1}</p>
                                        <button
                                            type="button"
                                            onClick={() => removeClaimRow(idx)}
                                            className="text-xs text-red-600 hover:text-red-800 disabled:text-gray-300"
                                            disabled={claimRows.length === 1}
                                        >
                                            Remove
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Defective Battery</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                                    placeholder="Type model or SKU..."
                                                    value={row.productSearch || ''}
                                                    onChange={(e) => {
                                                        const searchValue = e.target.value;
                                                        updateProductSearchForRow(idx, searchValue);
                                                        setActiveProductSearchRow(idx);
                                                    }}
                                                    onFocus={() => setActiveProductSearchRow(idx)}
                                                    onBlur={() => setTimeout(() => setActiveProductSearchRow(null), 120)}
                                                    required
                                                />
                                                {activeProductSearchRow === idx && (
                                                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                                                        {batteryProducts
                                                            .filter((p) => {
                                                                const q = (row.productSearch || '').toLowerCase().trim();
                                                                if (!q) return true;
                                                                return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
                                                            })
                                                            .slice(0, 25)
                                                            .map((p) => (
                                                                <button
                                                                    key={p._id}
                                                                    type="button"
                                                                    onMouseDown={() => selectProductForRow(idx, p)}
                                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0"
                                                                >
                                                                    <span className="font-bold text-blue-700 mr-1">[{p.sku}]</span>
                                                                    <span className="text-gray-700">{p.name}</span>
                                                                </button>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Defective Serial</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono"
                                                placeholder="Serial Number"
                                                value={row.serialNumber}
                                                onChange={(e) => updateClaimRow(idx, 'serialNumber', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Action</label>
                                            <select
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                                value={row.processType}
                                                onChange={(e) => updateClaimRow(idx, 'processType', e.target.value)}
                                            >
                                                <option value="pending">Pending (Send later)</option>
                                                <option value="exchange">Exchange Now</option>
                                            </select>
                                        </div>
                                    </div>

                                    {row.processType === 'exchange' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                                            <div>
                                                <label className="block text-xs font-bold text-green-700 mb-1">Replacement Battery</label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        className="w-full p-2 border border-green-300 rounded-lg text-sm bg-white"
                                                        placeholder="Type replacement model or SKU..."
                                                        value={row.replacementProductSearch || ''}
                                                        onChange={(e) => {
                                                            updateReplacementSearchForRow(idx, e.target.value);
                                                            setActiveReplacementSearchRow(idx);
                                                        }}
                                                        onFocus={() => setActiveReplacementSearchRow(idx)}
                                                        onBlur={() => setTimeout(() => setActiveReplacementSearchRow(null), 120)}
                                                        required
                                                    />
                                                    {activeReplacementSearchRow === idx && (
                                                        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-green-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                                                            {batteryProducts
                                                                .filter((p) => {
                                                                    const q = (row.replacementProductSearch || '').toLowerCase().trim();
                                                                    if (!q) return true;
                                                                    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
                                                                })
                                                                .slice(0, 25)
                                                                .map((p) => (
                                                                    <button
                                                                        key={p._id}
                                                                        type="button"
                                                                        onMouseDown={() => selectReplacementProductForRow(idx, p)}
                                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-green-100 border-b last:border-0"
                                                                    >
                                                                        <span className="font-bold text-green-700 mr-1">[{p.sku}]</span>
                                                                        <span className="text-gray-700">{p.name} ({p.totalStock})</span>
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-green-700 mb-1">Replacement Serial</label>
                                                <input
                                                    type="text"
                                                    className="w-full p-2 border border-green-300 rounded-lg text-sm font-mono bg-white"
                                                    placeholder="New Serial"
                                                    value={row.replacementSerial}
                                                    onChange={(e) => updateClaimRow(idx, 'replacementSerial', e.target.value)}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-bold text-blue-800">Claim Processing Fee</label>
                                            <label className="flex items-center gap-2 text-xs font-bold text-blue-700 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                    checked={row.claimFeePaid}
                                                    onChange={(e) => updateClaimRow(idx, 'claimFeePaid', e.target.checked)}
                                                />
                                                Paid in Cash?
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-full p-2 border border-blue-200 rounded-lg text-sm placeholder-blue-300 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Amount (e.g. 500)"
                                                    value={row.claimFee}
                                                    onChange={(e) => updateClaimRow(idx, 'claimFee', e.target.value)}
                                                />
                                                <p className="text-[10px] text-blue-500 mt-1 pl-1">
                                                    {row.claimFeePaid ? '✓ Recording as Cash Payment' : '⚠ Will be added to Customer Ledger'}
                                                </p>
                                            </div>
                                            <div>
                                                <input
                                                    type="text"
                                                    className="w-full p-2 border border-blue-200 rounded-lg text-sm placeholder-blue-300 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Fee Comment (Optional)"
                                                    value={row.claimFeeComment}
                                                    onChange={(e) => updateClaimRow(idx, 'claimFeeComment', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                        <textarea 
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Describe the issue..." 
                            rows="2"
                            value={newClaim.description} 
                            onChange={e => setNewClaim({...newClaim, description: e.target.value})} 
                        />
                    </div>

                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs text-gray-600">
                        Tip: Use "Exchange Now" only for batteries being replaced immediately. Other rows will be created as pending claims.
                    </div>
                    <div className="flex justify-end pt-2">
                        <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg mr-2">Cancel</button>
                        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md">Save All Claims</button>
                    </div>
                </form>
            </Modal>

            {/* Resolve Claim Modal */}
            <Modal isOpen={showResolveModal} onClose={() => setShowResolveModal(false)} title="Process Claim" maxWidth="max-w-lg">
                <form onSubmit={handleResolutionSubmit} className="space-y-5">
                    {/* Action Type Selection */}
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Action</label>
                        <div className="flex gap-3">
                            <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${resolutionData.type === 'resolve' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <input 
                                    type="radio" 
                                    name="actionType" 
                                    value="resolve"
                                    checked={resolutionData.type === 'resolve'}
                                    onChange={(e) => setResolutionData({...resolutionData, type: e.target.value})}
                                    className="sr-only"
                                />
                                <div className="text-center">
                                    <span className="text-xl block mb-1">✅</span>
                                    <span className={`text-sm font-bold ${resolutionData.type === 'resolve' ? 'text-green-700' : 'text-gray-600'}`}>Resolve</span>
                                </div>
                            </label>
                            <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${resolutionData.type === 'reject' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <input 
                                    type="radio" 
                                    name="actionType" 
                                    value="reject"
                                    checked={resolutionData.type === 'reject'}
                                    onChange={(e) => setResolutionData({...resolutionData, type: e.target.value})}
                                    className="sr-only"
                                />
                                <div className="text-center">
                                    <span className="text-xl block mb-1">❌</span>
                                    <span className={`text-sm font-bold ${resolutionData.type === 'reject' ? 'text-red-700' : 'text-gray-600'}`}>Reject</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Resolution Options (only when resolving) */}
                    {resolutionData.type === 'resolve' && (
                        <div className="space-y-4">
                            {/* Resolution Type Selection */}
                            <div className="bg-white p-3 rounded-lg border border-gray-200">
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Customer Wants To</label>
                                <div className="flex gap-4">
                                    <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${resolutionData.resolutionType === 'exchange' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <input 
                                            type="radio" 
                                            name="resolutionType" 
                                            value="exchange"
                                            checked={resolutionData.resolutionType === 'exchange'}
                                            onChange={(e) => setResolutionData({...resolutionData, resolutionType: e.target.value})}
                                            className="sr-only"
                                        />
                                        <div className="text-center">
                                            <span className="text-2xl block mb-1">🔄</span>
                                            <span className={`text-sm font-bold ${resolutionData.resolutionType === 'exchange' ? 'text-green-700' : 'text-gray-600'}`}>Exchange Battery</span>
                                            <p className="text-[10px] text-gray-500 mt-1">Swap with new unit from stock</p>
                                        </div>
                                    </label>
                                    <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${resolutionData.resolutionType === 'ledger_deduction' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <input 
                                            type="radio" 
                                            name="resolutionType" 
                                            value="ledger_deduction"
                                            checked={resolutionData.resolutionType === 'ledger_deduction'}
                                            onChange={(e) => setResolutionData({...resolutionData, resolutionType: e.target.value})}
                                            className="sr-only"
                                        />
                                        <div className="text-center">
                                            <span className="text-2xl block mb-1">💰</span>
                                            <span className={`text-sm font-bold ${resolutionData.resolutionType === 'ledger_deduction' ? 'text-blue-700' : 'text-gray-600'}`}>Ledger Deduction</span>
                                            <p className="text-[10px] text-gray-500 mt-1">Credit amount to customer account</p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Exchange Fields */}
                            {resolutionData.resolutionType === 'exchange' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-green-50 p-3 rounded-lg border border-green-200">
                                    <div>
                                        <label className="text-xs font-bold text-green-700 uppercase">Replacement Battery</label>
                                        <select 
                                            className="w-full p-2 border border-green-300 rounded-lg text-sm mt-1 bg-white" 
                                            value={resolutionData.replacementProductRef} 
                                            onChange={e => setResolutionData({...resolutionData, replacementProductRef: e.target.value})} 
                                            required
                                        >
                                            <option value="">Select Stock...</option>
                                            {batteryProducts.map(p => <option key={p._id} value={p._id}>[{p.sku}] {p.name} ({p.totalStock})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-green-700 uppercase">New Serial Number</label>
                                        <input 
                                            type="text" 
                                            className="w-full p-2 border border-green-300 rounded-lg text-sm mt-1 font-mono bg-white" 
                                            placeholder="Scan Serial..." 
                                            value={resolutionData.replacementSerial} 
                                            onChange={e => setResolutionData({...resolutionData, replacementSerial: e.target.value})} 
                                            required 
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Ledger Deduction Fields */}
                            {resolutionData.resolutionType === 'ledger_deduction' && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                    <label className="text-xs font-bold text-blue-700 uppercase">Deduction Amount (Credit to Customer)</label>
                                    <input 
                                        type="number" 
                                        min="0"
                                        className="w-full p-2 border border-blue-300 rounded-lg text-sm mt-1 bg-white" 
                                        placeholder="Enter amount to credit..."
                                        value={resolutionData.deductionAmount || ''}
                                        onChange={e => setResolutionData({...resolutionData, deductionAmount: e.target.value})}
                                        required 
                                    />
                                    <p className="text-[10px] text-blue-600 mt-1">This amount will be credited (subtracted from balance) in customer's ledger</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Rejection Reason (only when rejecting) */}
                    {resolutionData.type === 'reject' && (
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                            <label className="text-xs font-bold text-red-700 uppercase">Rejection Reason</label>
                            <textarea 
                                className="w-full p-2 border border-red-300 rounded-lg text-sm mt-1 bg-white" 
                                placeholder="Enter reason for rejection..."
                                rows="3"
                                value={resolutionData.rejectionReason || ''}
                                onChange={e => setResolutionData({...resolutionData, rejectionReason: e.target.value})}
                                required 
                            />
                        </div>
                    )}

                    <div className="flex justify-end pt-2 border-t">
                        <button type="button" onClick={() => setShowResolveModal(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg mr-2">Cancel</button>
                        <button 
                            type="submit" 
                            className={`px-6 py-2 rounded-lg font-bold shadow-md ${resolutionData.type === 'resolve' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                        >
                            {resolutionData.type === 'resolve' ? 'Resolve Claim' : 'Reject Claim'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showSendSupplierModal} onClose={() => setShowSendSupplierModal(false)} title="Send to Supplier" maxWidth="max-w-md">
                <div className="space-y-5">
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex gap-3 items-start">
                        <span className="text-2xl">📦</span>
                        <div>
                            <h4 className="font-bold text-orange-900">Bulk Send Action</h4>
                            <p className="text-sm text-orange-700">You are about to move <strong>{selectedForSupplier.length} items</strong> to "Sent to Supplier" status.</p>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Select Target Supplier</label>
                        
                        {targetSupplierName ? (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 font-bold flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="bg-green-200 text-green-700 rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</span>
                                    {targetSupplierName}
                                </div>
                                <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Auto-Detected</span>
                            </div>
                        ) : (
                            <select 
                                className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                value={targetSupplier} 
                                onChange={(e) => setTargetSupplier(e.target.value)}
                            >
                                <option value="">-- Choose Supplier --</option>
                                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                            </select>
                        )}
                    </div>

                    <div className="flex justify-end pt-2 space-x-3 border-t">
                        <button onClick={() => setShowSendSupplierModal(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
                        <button onClick={confirmSendToSupplier} className="px-6 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 shadow-md">Confirm Send</button>
                    </div>
                </div>
            </Modal>

            {/* Edit Claim Modal */}
            <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Claim Details" maxWidth="max-w-lg">
                <form onSubmit={handleEditSubmit} className="space-y-5">
                    {editData.status === 'resolved' && (
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 flex gap-2 items-start">
                            <span className="text-lg">⚠️</span>
                            <p className="text-xs text-amber-700">This claim is <strong>Resolved</strong>. Product/Item cannot be changed. To change product, revert to Pending first.</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Claim Date</label>
                        <input 
                            type="date" 
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                            value={editData.claimDate} 
                            onChange={e => setEditData({...editData, claimDate: e.target.value})} 
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Product</label>
                        <select 
                            className={`w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow ${editData.status === 'resolved' ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            value={editData.productRef} 
                            onChange={(e) => setEditData({...editData, productRef: e.target.value})} 
                            required
                            disabled={editData.status === 'resolved'}
                        >
                            <option value="">Select Product</option>
                            {batteryProducts.map(p => <option key={p._id} value={p._id}>[{p.sku}] {p.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Serial Number</label>
                        <input 
                            type="text" 
                            className={`w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono ${editData.status === 'resolved' ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            placeholder="Enter Serial..." 
                            value={editData.serialNumber} 
                            onChange={e => setEditData({...editData, serialNumber: e.target.value})} 
                            required 
                            disabled={editData.status === 'resolved'}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                        <textarea 
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Describe the issue..." 
                            rows="2"
                            value={editData.description} 
                            onChange={e => setEditData({...editData, description: e.target.value})} 
                        />
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-bold text-blue-800">Claim Processing Fee</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="checkbox" 
                                    id="editFeePaid"
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                    checked={editData.claimFeePaid}
                                    onChange={(e) => setEditData({...editData, claimFeePaid: e.target.checked})}
                                />
                                <label htmlFor="editFeePaid" className="text-xs font-bold text-blue-700 cursor-pointer select-none">
                                    Paid in Cash?
                                </label>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full p-2 border border-blue-200 rounded-lg text-sm placeholder-blue-300 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Amount (e.g. 500)"
                                    value={editData.claimFee}
                                    onChange={(e) => setEditData({...editData, claimFee: e.target.value})}
                                />
                                <p className="text-[10px] text-blue-500 mt-1 pl-1">
                                    {editData.claimFeePaid ? "✓ Recording as Cash Payment" : "⚠ Will update Customer Ledger"}
                                </p>
                            </div>
                            <div>
                                <input 
                                    type="text" 
                                    className="w-full p-2 border border-blue-200 rounded-lg text-sm placeholder-blue-300 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Fee Comment (Optional)"
                                    value={editData.claimFeeComment}
                                    onChange={(e) => setEditData({...editData, claimFeeComment: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2 border-t">
                        <button type="button" onClick={() => setShowEditModal(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg mr-2">Cancel</button>
                        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md">Update Claim</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ClaimManagement;