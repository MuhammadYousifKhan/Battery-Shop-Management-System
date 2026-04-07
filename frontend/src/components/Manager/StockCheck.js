import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast'; 
import { apiClient } from '../../utils/apiClient';
import API_URL from '../../apiConfig'; 
import Modal from '../Common/Modal';
import { PRODUCT_CATEGORIES } from '../../Constants';

const StockCheck = () => {
    const isAdmin = localStorage.getItem('userRole') === 'admin';
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(''); 
    const [categoryFilter, setCategoryFilter] = useState('all');
    
    // State for Selection & Modal
    const [selectedIds, setSelectedIds] = useState([]);
    const [viewingBatches, setViewingBatches] = useState(null);
    const [adjustItem, setAdjustItem] = useState(null);
    const [adjustData, setAdjustData] = useState({ type: 'remove', quantity: '', reason: '', costPrice: 0 });
    const [showBatchCostModal, setShowBatchCostModal] = useState(false);
    const [batchCostData, setBatchCostData] = useState({
        productId: '',
        productName: '',
        batchId: '',
        source: '',
        currentCost: 0,
        costPrice: '',
        reason: ''
    });

    useEffect(() => {
        fetchProducts();
    }, []); 

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const data = await apiClient.get('/api/products');
            setProducts(data); 
            return data;
        } catch (err) {
            toast.error(err.message);
            return [];
        } finally { setLoading(false); }
    };

    // --- Filtering Logic ---
    const filteredProducts = products
        .filter(product => {
            if (categoryFilter === 'all') return true;
            return product.category === categoryFilter;
        })
        .filter(product => {
            const searchLower = searchTerm.toLowerCase();
            return product.name.toLowerCase().includes(searchLower) || 
                   product.sku.toLowerCase().includes(searchLower);
        });
    
    // Low Stock Threshold: 5
    const lowStockCount = products.filter(p => p.totalStock <= 5).length;
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString();

    const getSortedBatches = (batches) => {
        if (!batches) return [];
        return [...batches].sort((a, b) => new Date(a.receivedDate) - new Date(b.receivedDate));
    };

    // --- Checkbox Logic ---
    const handleCheckboxChange = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(itemId => itemId !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allIds = filteredProducts.map(p => p._id);
            setSelectedIds(allIds);
        } else {
            setSelectedIds([]);
        }
    };

    const handleAdjustmentSubmit = async (e) => {
        e.preventDefault();

        if (!isAdmin) {
            toast.error('Only admin can adjust stock.');
            return;
        }

        if (!adjustData.quantity || Number(adjustData.quantity) <= 0) {
            toast.error('Enter valid quantity');
            return;
        }

        if (!adjustData.reason) {
            toast.error('Reason is required');
            return;
        }

        const toastId = toast.loading('Updating Stock...');
        try {
            await apiClient.post('/api/products/adjust', {
                productId: adjustItem._id,
                type: adjustData.type,
                quantity: Number(adjustData.quantity),
                reason: adjustData.reason,
                costPrice: adjustData.type === 'add' ? Number(adjustData.costPrice || 0) : 0
            });

            toast.success('Stock Adjusted Successfully', { id: toastId });
            setAdjustItem(null);
            fetchProducts();
        } catch (err) {
            toast.error(err.message, { id: toastId });
        }
    };

    const openBatchCostModal = (product, batch) => {
        setBatchCostData({
            productId: product._id,
            productName: product.name,
            batchId: batch._id,
            source: batch.source || 'Purchase',
            currentCost: Number(batch.costPrice || 0),
            costPrice: String(Number(batch.costPrice || 0)),
            reason: ''
        });
        setShowBatchCostModal(true);
    };

    const handleBatchCostSubmit = async (e) => {
        e.preventDefault();

        if (!isAdmin) {
            toast.error('Only admin can correct batch cost.');
            return;
        }

        const nextCost = Number(batchCostData.costPrice);
        if (!Number.isFinite(nextCost) || nextCost < 0) {
            toast.error('Enter a valid non-negative cost price.');
            return;
        }

        if (!batchCostData.reason.trim()) {
            toast.error('Reason is required for audit trail.');
            return;
        }

        const toastId = toast.loading('Correcting batch cost...');
        try {
            await apiClient.post('/api/products/batch-cost', {
                productId: batchCostData.productId,
                batchId: batchCostData.batchId,
                costPrice: nextCost,
                reason: batchCostData.reason.trim()
            });

            toast.success('Batch cost corrected successfully', { id: toastId });
            setShowBatchCostModal(false);

            const refreshedProducts = await fetchProducts();
            if (viewingBatches?._id) {
                const refreshed = refreshedProducts.find(p => p._id === viewingBatches._id);
                if (refreshed) setViewingBatches(refreshed);
            }
        } catch (err) {
            toast.error(err.message || 'Failed to correct batch cost', { id: toastId });
        }
    };


    // --- PRINT FULL INVENTORY SNAPSHOT (A4 PDF) ---
    const handlePrintSnapshot = async () => {
        const toastId = toast.loading("Generating Full Stock Report...");
        try {
            const token = localStorage.getItem('token'); 
            const url = `${API_URL}/api/products/snapshot/pdf`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to generate report');

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `Full_Stock_Check_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            toast.success("Report Downloaded!", { id: toastId });
        } catch (err) {
            toast.error("Could not generate report", { id: toastId });
            console.error(err);
        }
    };

    // --- THERMAL PRINT LOGIC (80mm) ---
    const handlePrintSelected = () => {
        if (selectedIds.length === 0) {
            toast.error("Select at least one item to print.");
            return;
        }

        const itemsToPrint = products.filter(p => selectedIds.includes(p._id));

        const printWindow = window.open('', '', 'height=600,width=400');
        printWindow.document.write('<html><head><title>Stock Verify</title>');
        
        printWindow.document.write(`
            <style>
                @page { size: 80mm auto; margin: 0; }
                body { 
                    width: 76mm; 
                    margin: 0 auto; 
                    padding: 5px; 
                    font-family: 'Courier New', monospace; 
                    font-size: 12px; 
                    color: black;
                }
                h2 { text-align: center; margin: 0 0 5px 0; font-size: 16px; border-bottom: 2px solid black; padding-bottom: 5px; }
                .meta { font-size: 10px; text-align: center; margin-bottom: 10px; }
                
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; font-size: 11px; border-bottom: 1px solid black; padding: 2px 0; }
                td { padding: 8px 0; border-bottom: 1px dashed #333; vertical-align: top; }
                
                .col-item { width: 55%; padding-right: 5px; }
                .col-sys { width: 15%; text-align: center; }
                .col-actual { width: 30%; text-align: right; }

                .sku { font-size: 10px; font-weight: bold; display: block; }
                .name { font-size: 11px; display: block; line-height: 1.2; }
                .box { 
                    border: 1px solid black; 
                    height: 20px; 
                    width: 100%; 
                    display: block; 
                    margin-top: 2px;
                }
                .footer { margin-top: 20px; border-top: 1px solid black; padding-top: 5px; text-align: center; font-size: 10px; }
            </style>
        `);
        printWindow.document.write('</head><body>');
        printWindow.document.write('<h2>STOCK CHECK</h2>');
        printWindow.document.write('<table><thead><tr><th class="col-item">Item Description</th><th class="col-sys">Sys</th><th class="col-actual">Physical</th></tr></thead><tbody>');

        itemsToPrint.forEach(item => {
            printWindow.document.write(`
                <tr>
                    <td class="col-item"><span class="name">${item.name}</span><span class="sku">SKU: ${item.sku}</span></td>
                    <td class="col-sys"><strong>${item.totalStock}</strong></td>
                    <td class="col-actual"><span class="box"></span></td>
                </tr>
            `);
        });

        printWindow.document.write('</tbody></table>');
        printWindow.document.write('<div class="footer">Verified By: ________________</div></body></html>');
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    };

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Stock Check</h1>
                
                <div className="flex flex-wrap gap-3">
                    <button 
                        onClick={handlePrintSnapshot}
                        className="bg-purple-600 text-white px-5 py-2 rounded-lg font-bold shadow-md hover:bg-purple-700 transition flex items-center gap-2"
                    >
                        <span>📄</span> Full Snapshot (PDF)
                    </button>

                    {selectedIds.length > 0 && (
                        <button 
                            onClick={handlePrintSelected}
                            className="bg-gray-800 text-white px-5 py-2 rounded-lg font-bold shadow-md hover:bg-black flex items-center transition"
                        >
                            <span>🖨️</span> Thermal List ({selectedIds.length})
                        </button>
                    )}
                </div>
            </div>

            {loading ? <p className="text-center text-blue-600">Loading stock data...</p> : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                            <h3 className="text-gray-500 text-sm font-medium uppercase">Total Product SKUs</h3>
                            <p className="text-3xl font-bold text-gray-900">{products.length}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
                            <h3 className="text-red-500 text-sm font-medium uppercase">Low Stock Items (≤ 5)</h3>
                            <p className="text-3xl font-bold text-red-600">{lowStockCount}</p>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-col md:flex-row gap-4">
                        <input
                            type="text"
                            placeholder="Search by name or SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-1/2 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full md:w-1/2 p-3 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Categories</option>
                            <option value={PRODUCT_CATEGORIES.BATTERIES}>Batteries</option>
                        </select>
                    </div>

                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left">
                                            <input 
                                                type="checkbox" 
                                                onChange={handleSelectAll} 
                                                checked={filteredProducts.length > 0 && selectedIds.length >= filteredProducts.length}
                                                className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredProducts.length === 0 ? (
                                        <tr><td colSpan="7" className="p-6 text-center text-gray-500">No products found.</td></tr>
                                    ) : (
                                        filteredProducts.map(product => (
                                            <tr key={product._id} className={`${product.totalStock <= 5 ? 'bg-red-50' : ''} ${selectedIds.includes(product._id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.includes(product._id)}
                                                        onChange={() => handleCheckboxChange(product._id)}
                                                        className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{product.sku}</td>
                                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{product.name}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.category}</td>
                                                <td className={`px-6 py-4 whitespace-nowrap font-bold ${product.totalStock <= 5 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {product.totalStock}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Rs {product.price.toLocaleString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-2">
                                                    <button 
                                                        onClick={() => setViewingBatches(product)}
                                                        className="text-blue-600 hover:text-blue-900 hover:underline"
                                                    >
                                                        View Batches
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => {
                                                                setAdjustItem(product);
                                                                setAdjustData({ type: 'remove', quantity: '', reason: '', costPrice: 0 });
                                                            }}
                                                            className="text-orange-600 hover:text-orange-900 hover:underline ml-2"
                                                        >
                                                            Adjust
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* BATCHES MODAL */}
            <Modal 
                isOpen={!!viewingBatches} 
                onClose={() => setViewingBatches(null)} 
                title={viewingBatches ? `Stock Batches: ${viewingBatches.name}` : ''}
                maxWidth="max-w-3xl"
            >
                <div className="flex flex-col h-[70vh]">
                    <div className="flex-1 overflow-y-auto p-4 bg-white">
                        <table className="min-w-full divide-y divide-gray-200 border-collapse">
                            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase border-b">Received Date (FIFO)</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase border-b">Source / Origin</th> 
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase border-b">Quantity</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase border-b">Cost Price</th>
                                    {isAdmin && <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase border-b">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {viewingBatches && viewingBatches.batches && viewingBatches.batches.length > 0 ? (
                                    getSortedBatches(viewingBatches.batches).map((batch, index) => (
                                        <tr key={batch._id || index} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-600">{formatDate(batch.receivedDate)}</td>
                                            <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                                                {batch.source || 'Purchase'}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-bold text-blue-600">{batch.quantity}</td>
                                            <td className="px-4 py-3 text-sm text-green-700">Rs {batch.costPrice ? batch.costPrice.toFixed(2) : '0.00'}</td>
                                            {isAdmin && (
                                                <td className="px-4 py-3 text-sm">
                                                    <button
                                                        onClick={() => openBatchCostModal(viewingBatches, batch)}
                                                        className="text-orange-600 hover:text-orange-900 hover:underline font-semibold"
                                                    >
                                                        Fix Cost
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan={isAdmin ? 5 : 4} className="text-center py-4 text-gray-500">No stock batches found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex-none p-4 border-t bg-gray-50 flex justify-between items-center">
                        <div>
                            <span className="text-sm text-gray-600">Total Stock Available:</span>
                            <span className="ml-2 font-bold text-xl text-blue-900">{viewingBatches?.totalStock}</span>
                        </div>
                        <button onClick={() => setViewingBatches(null)} className="bg-gray-200 px-6 py-2 rounded-lg hover:bg-gray-300 font-bold text-gray-800">Close</button>
                    </div>
                </div>
            </Modal>

            {isAdmin && (
                <Modal isOpen={!!adjustItem} onClose={() => setAdjustItem(null)} title="Adjust Stock Manually" maxWidth="max-w-md">
                    <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
                        <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800 border border-yellow-200">
                            <strong>Product:</strong> {adjustItem?.name} <br/>
                            <strong>Current Stock:</strong> {adjustItem?.totalStock}
                        </div>

                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={adjustData.type === 'remove'}
                                    onChange={() => setAdjustData({ ...adjustData, type: 'remove' })}
                                />
                                <span className="text-red-600 font-bold">Remove (Scrap/Loss)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={adjustData.type === 'add'}
                                    onChange={() => setAdjustData({ ...adjustData, type: 'add' })}
                                />
                                <span className="text-green-600 font-bold">Add (Restock)</span>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700">Quantity</label>
                            <input
                                type="number"
                                min="1"
                                required
                                className="w-full p-2 border rounded"
                                value={adjustData.quantity}
                                onChange={e => setAdjustData({ ...adjustData, quantity: e.target.value })}
                            />
                        </div>

                        {adjustData.type === 'add' && (
                            <div>
                                <label className="block text-sm font-bold text-gray-700">Cost Price (Per Unit)</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full p-2 border rounded"
                                    value={adjustData.costPrice}
                                    onChange={e => setAdjustData({ ...adjustData, costPrice: e.target.value })}
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-bold text-gray-700">Reason</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. Broken, System Correction, Found Extra"
                                className="w-full p-2 border rounded"
                                value={adjustData.reason}
                                onChange={e => setAdjustData({ ...adjustData, reason: e.target.value })}
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <button type="button" onClick={() => setAdjustItem(null)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">Confirm Adjustment</button>
                        </div>
                    </form>
                </Modal>
            )}

            {isAdmin && (
                <Modal isOpen={showBatchCostModal} onClose={() => setShowBatchCostModal(false)} title="Correct Batch Cost Price" maxWidth="max-w-md">
                    <form onSubmit={handleBatchCostSubmit} className="space-y-4">
                        <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800 border border-yellow-200">
                            <div><strong>Product:</strong> {batchCostData.productName}</div>
                            <div><strong>Current Cost:</strong> Rs {Number(batchCostData.currentCost || 0).toFixed(2)}</div>
                            <div><strong>Source:</strong> {batchCostData.source}</div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700">New Cost Price (Per Unit)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                className="w-full p-2 border rounded"
                                value={batchCostData.costPrice}
                                onChange={e => setBatchCostData({ ...batchCostData, costPrice: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700">Reason</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. Fix cancelled order wrong cost"
                                className="w-full p-2 border rounded"
                                value={batchCostData.reason}
                                onChange={e => setBatchCostData({ ...batchCostData, reason: e.target.value })}
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <button type="button" onClick={() => setShowBatchCostModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">Save Cost</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default StockCheck;