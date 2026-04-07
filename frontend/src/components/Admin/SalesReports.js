import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';

const SalesReports = () => {
    const [reportParams, setReportParams] = useState({
        startDate: '',
        endDate: '',
        reportType: 'product_performance',
        scrapTypeFilter: 'all',
        scrapGroupBy: 'none'
    });
    const [reportResult, setReportResult] = useState(null); 
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setReportParams(prev => ({ ...prev, [name]: value }));

        // Clear stale data so schema mismatch does not crash when switching report types.
        if (reportResult) setReportResult(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // For Inventory, dates are optional, but for Performance they are required
        if (reportParams.reportType !== 'inventory' && (!reportParams.startDate || !reportParams.endDate)) { 
            toast.error("Please select both start and end dates."); return; 
        }
        
        setLoading(true); 
        setReportResult(null); 
        const toastId = toast.loading("Generating Report...");

        try {
            const data = await apiClient.post('/api/reports/generate', reportParams);
            setReportResult(data); 
            toast.success("Report Generated!", { id: toastId });
        } catch (err) { 
            toast.error(err.message, { id: toastId }); 
        } finally { 
            setLoading(false); 
        }
    };

    const handleDownloadPDF = async () => {
        if (reportParams.reportType !== 'inventory' && (!reportParams.startDate || !reportParams.endDate)) { 
            toast.error("Please select dates for PDF."); return; 
        }

        const toastId = toast.loading("Downloading PDF...");
        try {
            const blob = await apiClient.post('/api/reports/pdf', reportParams, { responseType: 'blob' });
            
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Sales_Report_${reportParams.reportType}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            toast.success("PDF Downloaded!", { id: toastId });
        } catch (err) {
            console.error(err);
            toast.error("PDF generation failed.", { id: toastId });
        }
    };
    
    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Sales Reports</h1>

            <div className="bg-white p-4 md:p-6 rounded-lg shadow-md mb-6">
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Report Type</label>
                        <div className="relative mt-1">
                            <select
                                name="reportType"
                                value={reportParams.reportType}
                                onChange={handleChange}
                                className="w-full appearance-none pl-3 pr-10 py-3 border border-gray-300 rounded-lg bg-white shadow-sm text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                <option value="product_performance">Item-wise Performance (Day by Day)</option>
                                <option value="scrap_detailed">Scrap Detailed Report (All Transactions)</option>
                                <option value="inventory">Inventory Snapshot</option>
                                <option value="customer_payments">Customer Payments Received</option>
                                <option value="supplier_payments">Supplier Payments Made</option>
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500 text-xs">▼</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Start Date</label>
                        <input type="date" name="startDate" value={reportParams.startDate} onChange={handleChange} className="w-full p-3 border rounded-lg mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">End Date</label>
                        <input type="date" name="endDate" value={reportParams.endDate} onChange={handleChange} className="w-full p-3 border rounded-lg mt-1" />
                    </div>

                    {reportParams.reportType === 'scrap_detailed' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Scrap Type</label>
                                <select
                                    name="scrapTypeFilter"
                                    value={reportParams.scrapTypeFilter}
                                    onChange={handleChange}
                                    className="w-full p-3 border rounded-lg mt-1 bg-white"
                                >
                                    <option value="all">All</option>
                                    <option value="buy">Only Buy</option>
                                    <option value="sell">Only Sell</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Group By</label>
                                <select
                                    name="scrapGroupBy"
                                    value={reportParams.scrapGroupBy}
                                    onChange={handleChange}
                                    className="w-full p-3 border rounded-lg mt-1 bg-white"
                                >
                                    <option value="none">No Grouping</option>
                                    <option value="supplier">Supplier-wise</option>
                                    <option value="customer">Customer-wise</option>
                                </select>
                            </div>
                        </>
                    )}
                    
                    <div className="flex gap-2">
                        <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                            {loading ? "Generating..." : "Generate"}
                        </button>
                        
                        {/* --- DOWNLOAD BUTTON --- */}
                        <button 
                            type="button" 
                            onClick={handleDownloadPDF} 
                            disabled={loading} 
                            className="bg-red-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center"
                            title="Download PDF"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>

            {reportResult && (
                <div className="bg-white p-4 md:p-6 rounded-lg shadow-md mb-6">
                    <h2 className="text-xl md:text-2xl font-semibold mb-4">Report Results</h2>
                    <h3 className="text-md font-medium text-gray-700 mb-4 capitalize">{reportResult.summary.reportType} Report</h3>
                    
                    {/* SUMMARY CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {reportParams.reportType === 'product_performance' ? (
                            <>
                                <div className="bg-blue-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-blue-800">Total Revenue</h4>
                                    <p className="text-2xl font-bold">Rs {Number(reportResult.summary.totalRevenue).toLocaleString()}</p>
                                </div>
                                <div className="bg-green-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-green-800">Gross Profit</h4>
                                    <p className="text-2xl font-bold">Rs {Number(reportResult.summary.grossProfit).toLocaleString()}</p>
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-gray-800">Total Items</h4>
                                    <p className="text-2xl font-bold">{reportResult.summary.totalItemsSold}</p>
                                </div>
                            </>
                        ) : reportParams.reportType === 'inventory' ? (
                            <>
                                <div className="bg-indigo-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-indigo-800">Inventory Value</h4>
                                    <p className="text-2xl font-bold">Rs {Number(reportResult.summary.totalValue).toLocaleString()}</p>
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-gray-800">Total SKUs</h4>
                                    <p className="text-2xl font-bold">{reportResult.summary.totalSKUs}</p>
                                </div>
                            </>
                        ) : reportParams.reportType === 'scrap_detailed' ? (
                            <>
                                <div className="bg-amber-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-amber-900">Opening / Closing Stock</h4>
                                    <p className="text-2xl font-bold">{Number(reportResult.summary.openingStockKg || 0).toFixed(2)} / {Number(reportResult.summary.closingStockKg || 0).toFixed(2)} Kg</p>
                                </div>
                                <div className="bg-blue-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-blue-800">Bought / Sold</h4>
                                    <p className="text-2xl font-bold">{Number(reportResult.summary.totalBoughtKg || 0).toFixed(2)} / {Number(reportResult.summary.totalSoldKg || 0).toFixed(2)} Kg</p>
                                </div>
                                <div className="bg-green-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-green-800">Buy / Sell Amount</h4>
                                    <p className="text-2xl font-bold">Rs {Number(reportResult.summary.totalBuyAmount || 0).toLocaleString()} / {Number(reportResult.summary.totalSellAmount || 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-purple-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-purple-800">Estimated Scrap Profit</h4>
                                    <p className="text-2xl font-bold">Rs {Number(reportResult.summary.estimatedProfit || 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-gray-800">Filters</h4>
                                    <p className="text-sm font-semibold mt-1">Type: {String(reportResult.summary.scrapTypeFilter || 'all').toUpperCase()}</p>
                                    <p className="text-sm font-semibold">Group: {String(reportResult.summary.scrapGroupBy || 'none').toUpperCase()}</p>
                                </div>
                            </>
                        ) : reportParams.reportType === 'customer_payments' ? (
                            <>
                                <div className="bg-green-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-green-800">Total Received</h4>
                                    <p className="text-2xl font-bold">Rs {Number(reportResult.summary.totalReceived || 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-blue-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-blue-800">No. of Payments</h4>
                                    <p className="text-2xl font-bold">{reportResult.summary.totalPayments || 0}</p>
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-gray-800">Customers</h4>
                                    <p className="text-2xl font-bold">{reportResult.summary.customerCount || 0}</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="bg-red-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-red-800">Total Paid</h4>
                                    <p className="text-2xl font-bold">Rs {Number(reportResult.summary.totalPaid || 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-blue-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-blue-800">No. of Payments</h4>
                                    <p className="text-2xl font-bold">{reportResult.summary.totalPayments || 0}</p>
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-sm text-gray-800">Suppliers</h4>
                                    <p className="text-2xl font-bold">{reportResult.summary.supplierCount || 0}</p>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                {reportParams.reportType === 'product_performance' ? (
                                    <tr>
                                        <th className="px-6 py-3 text-left whitespace-nowrap">Product / Date</th>
                                        <th className="px-6 py-3 text-center whitespace-nowrap">Qty Sold</th>
                                        <th className="px-6 py-3 text-right whitespace-nowrap">Avg Sell Price</th>
                                        <th className="px-6 py-3 text-right whitespace-nowrap">Total Revenue</th>
                                        <th className="px-6 py-3 text-right whitespace-nowrap">Total Profit</th>
                                        <th className="px-6 py-3 text-center whitespace-nowrap">Margin %</th>
                                    </tr>
                                ) : reportParams.reportType === 'inventory' ? (
                                    <tr>
                                        <th className="px-6 py-3 text-left">SKU</th>
                                        <th className="px-6 py-3 text-left">Name</th>
                                        <th className="px-6 py-3 text-left">Cat</th>
                                        <th className="px-6 py-3 text-left">Stock</th>
                                        <th className="px-6 py-3 text-left">Avg Cost</th>
                                        <th className="px-6 py-3 text-left">Total Val</th>
                                    </tr>
                                ) : reportParams.reportType === 'scrap_detailed' ? (
                                    <tr>
                                        <th className="px-6 py-3 text-left whitespace-nowrap">Date</th>
                                        <th className="px-6 py-3 text-left whitespace-nowrap">Type</th>
                                        <th className="px-6 py-3 text-left whitespace-nowrap">Party</th>
                                        <th className="px-6 py-3 text-left whitespace-nowrap">Phone</th>
                                        <th className="px-6 py-3 text-left whitespace-nowrap">Settlement</th>
                                        <th className="px-6 py-3 text-right whitespace-nowrap">Weight (Kg)</th>
                                        <th className="px-6 py-3 text-right whitespace-nowrap">Rate</th>
                                        <th className="px-6 py-3 text-right whitespace-nowrap">Amount</th>
                                        <th className="px-6 py-3 text-right whitespace-nowrap">Running Stock</th>
                                    </tr>
                                ) : (
                                    <tr>
                                        <th className="px-6 py-3 text-left">{reportParams.reportType === 'customer_payments' ? 'Customer' : 'Supplier'}</th>
                                        <th className="px-6 py-3 text-left">Phone</th>
                                        <th className="px-6 py-3 text-left">Date & Description</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                        <th className="px-6 py-3 text-right">Meta</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {(reportResult.reportData || []).map((item, idx) => (
                                    <React.Fragment key={idx}>
                                        
                                        {/* --- SCENARIO 1: PRODUCT PERFORMANCE (GROUPED) --- */}
                                        {reportParams.reportType === 'product_performance' && (
                                            <>
                                                {/* Parent Row (Product Total) */}
                                                <tr className="bg-gray-100 font-bold border-t-4 border-white">
                                                    <td className="px-6 py-4 text-blue-800">
                                                        [{item.sku}] {item.name}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">{item.qty}</td>
                                                    <td className="px-6 py-4 text-right">Rs {Number(item.avgSellPrice || 0).toFixed(0)}</td>
                                                    <td className="px-6 py-4 text-right">Rs {Number(item.revenue || 0).toLocaleString()}</td>
                                                    <td className={`px-6 py-4 text-right ${Number(item.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        Rs {Number(item.profit || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm">{Number(item.margin || 0).toFixed(1)}%</td>
                                                </tr>

                                                {/* Child Rows (Daily Breakdown) */}
                                                {item.dailyBreakdown && item.dailyBreakdown.map((day, dIdx) => (
                                                    <tr key={`${idx}-${dIdx}`} className="hover:bg-blue-50 text-sm">
                                                        <td className="px-6 py-2 pl-12 text-gray-500">
                                                            ↳ {day.date}
                                                        </td>
                                                        <td className="px-6 py-2 text-center text-gray-600">{day.qty}</td>
                                                        <td className="px-6 py-2 text-right text-gray-600">{Number(day.avgPrice || 0).toFixed(0)}</td>
                                                        <td className="px-6 py-2 text-right text-gray-600">{Number(day.revenue || 0).toLocaleString()}</td>
                                                        <td className="px-6 py-2 text-right text-gray-600">{Number(day.profit || 0).toLocaleString()}</td>
                                                        <td className="px-6 py-2 text-center text-gray-400">-</td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}

                                        {/* --- SCENARIO 2: INVENTORY SNAPSHOT --- */}
                                        {reportParams.reportType === 'inventory' && (
                                            <tr>
                                                <td className="px-6 py-4 font-mono">{item.sku}</td>
                                                <td className="px-6 py-4 font-medium">{item.name}</td>
                                                <td className="px-6 py-4 text-sm">{item.category}</td>
                                                <td className="px-6 py-4 font-bold">{item.totalStock}</td>
                                                <td className="px-6 py-4 text-sm">Rs {(item.averageCost || 0).toFixed(0)}</td>
                                                <td className="px-6 py-4 font-bold text-blue-600">Rs {(item.totalStock * (item.averageCost || 0)).toLocaleString()}</td>
                                            </tr>
                                        )}

                                        {reportParams.reportType === 'scrap_detailed' && (
                                            Array.isArray(item.transactions) ? (
                                                <>
                                                    <tr className="bg-amber-100 border-t-4 border-white">
                                                        <td className="px-6 py-4 text-sm font-bold whitespace-nowrap">Group</td>
                                                        <td className="px-6 py-4 text-sm font-bold uppercase">{item.partyType}</td>
                                                        <td className="px-6 py-4 text-sm font-semibold">{item.partyName || '-'}</td>
                                                        <td className="px-6 py-4 text-sm">{item.partyPhone || '-'}</td>
                                                        <td className="px-6 py-4 text-sm">Transactions: {item.transactionCount || 0}</td>
                                                        <td className="px-6 py-4 text-sm text-right font-semibold">{Number(item.totalWeight || 0).toFixed(2)}</td>
                                                        <td className="px-6 py-4 text-sm text-right">-</td>
                                                        <td className="px-6 py-4 text-sm text-right font-bold">Rs {Number(item.totalAmount || 0).toLocaleString()}</td>
                                                        <td className="px-6 py-4 text-sm text-right text-gray-500">-</td>
                                                    </tr>
                                                    {item.transactions.map((tx, tIdx) => (
                                                        <tr key={`${idx}-tx-${tIdx}`} className={tx.type === 'sell' ? 'bg-red-50' : 'bg-green-50'}>
                                                            <td className="px-6 py-4 text-sm whitespace-nowrap">{tx.date ? new Date(tx.date).toLocaleDateString() : '-'}</td>
                                                            <td className="px-6 py-4 text-sm font-bold uppercase">{tx.type}</td>
                                                            <td className="px-6 py-4 text-sm font-medium">{tx.partyName || '-'}</td>
                                                            <td className="px-6 py-4 text-sm">{tx.partyPhone || '-'}</td>
                                                            <td className="px-6 py-4 text-sm">
                                                                <div className="font-medium">{tx.settlementLabel || '-'}</div>
                                                                <div className="text-xs text-gray-500">{tx.customerCategory || '-'}</div>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-right font-semibold">{Number(tx.weight || 0).toFixed(2)}</td>
                                                            <td className="px-6 py-4 text-sm text-right">Rs {Number(tx.pricePerKg || 0).toFixed(0)}</td>
                                                            <td className="px-6 py-4 text-sm text-right font-bold">Rs {Number(tx.totalAmount || 0).toLocaleString()}</td>
                                                            <td className="px-6 py-4 text-sm text-right font-bold text-blue-700">{Number(tx.runningStockKg || 0).toFixed(2)} Kg</td>
                                                        </tr>
                                                    ))}
                                                </>
                                            ) : (
                                                <tr className={item.type === 'sell' ? 'bg-red-50' : 'bg-green-50'}>
                                                    <td className="px-6 py-4 text-sm whitespace-nowrap">{item.date ? new Date(item.date).toLocaleDateString() : '-'}</td>
                                                    <td className="px-6 py-4 text-sm font-bold uppercase">{item.type}</td>
                                                    <td className="px-6 py-4 text-sm font-medium">{item.partyName || '-'}</td>
                                                    <td className="px-6 py-4 text-sm">{item.partyPhone || '-'}</td>
                                                    <td className="px-6 py-4 text-sm">
                                                        <div className="font-medium">{item.settlementLabel || '-'}</div>
                                                        <div className="text-xs text-gray-500">{item.customerCategory || '-'}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-right font-semibold">{Number(item.weight || 0).toFixed(2)}</td>
                                                    <td className="px-6 py-4 text-sm text-right">Rs {Number(item.pricePerKg || 0).toFixed(0)}</td>
                                                    <td className="px-6 py-4 text-sm text-right font-bold">Rs {Number(item.totalAmount || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-sm text-right font-bold text-blue-700">{Number(item.runningStockKg || 0).toFixed(2)} Kg</td>
                                                </tr>
                                            )
                                        )}

                                        {reportParams.reportType === 'customer_payments' && (
                                            <>
                                                <tr className="bg-green-50 border-t-4 border-white">
                                                    <td className="px-6 py-4 font-semibold text-gray-800">{item.customerName}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-600">{item.customerPhone || '-'}</td>
                                                    <td className="px-6 py-4 text-sm font-medium text-gray-700">Total Payments: {item.totalPayments}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-green-700">Rs {Number(item.totalReceived || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-right text-xs text-gray-500">Last: {item.latestPaymentDate ? new Date(item.latestPaymentDate).toLocaleDateString() : '-'}</td>
                                                </tr>

                                                {item.dailyBreakdown && item.dailyBreakdown.map((day, dIdx) => (
                                                    <React.Fragment key={`${idx}-day-${dIdx}`}>
                                                        <tr className="bg-gray-50">
                                                            <td className="px-6 py-2 text-xs text-gray-400"> </td>
                                                            <td className="px-6 py-2 text-xs text-gray-400"> </td>
                                                            <td className="px-6 py-2 text-sm font-semibold text-gray-700">↳ {day.date}</td>
                                                            <td className="px-6 py-2 text-right font-semibold text-blue-700">Rs {Number(day.totalReceived || 0).toLocaleString()}</td>
                                                            <td className="px-6 py-2 text-right text-xs text-gray-500">{day.paymentCount} payments</td>
                                                        </tr>

                                                        {day.payments && day.payments.map((pay, pIdx) => (
                                                            <tr key={`${idx}-day-${dIdx}-pay-${pIdx}`} className="hover:bg-blue-50 text-sm">
                                                                <td className="px-6 py-2 text-xs text-gray-400"> </td>
                                                                <td className="px-6 py-2 text-xs text-gray-400"> </td>
                                                                <td className="px-6 py-2 text-gray-700">
                                                                    <span className="text-gray-500 mr-2">• {pay.time}</span>
                                                                    {pay.description || 'Payment Received'}
                                                                </td>
                                                                <td className="px-6 py-2 text-right font-medium text-gray-800">Rs {Number(pay.amount || 0).toLocaleString()}</td>
                                                                <td className="px-6 py-2 text-right text-xs text-gray-400">Payment</td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                ))}
                                            </>
                                        )}

                                        {reportParams.reportType === 'supplier_payments' && (
                                            <>
                                                <tr className="bg-red-50 border-t-4 border-white">
                                                    <td className="px-6 py-4 font-semibold text-gray-800">{item.supplierName}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-600">{item.supplierPhone || '-'}</td>
                                                    <td className="px-6 py-4 text-sm font-medium text-gray-700">Total Payments: {item.totalPayments}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-red-700">Rs {Number(item.totalPaid || 0).toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-right text-xs text-gray-500">Last: {item.latestPaymentDate ? new Date(item.latestPaymentDate).toLocaleDateString() : '-'}</td>
                                                </tr>

                                                {item.dailyBreakdown && item.dailyBreakdown.map((day, dIdx) => (
                                                    <React.Fragment key={`${idx}-sup-day-${dIdx}`}>
                                                        <tr className="bg-gray-50">
                                                            <td className="px-6 py-2 text-xs text-gray-400"> </td>
                                                            <td className="px-6 py-2 text-xs text-gray-400"> </td>
                                                            <td className="px-6 py-2 text-sm font-semibold text-gray-700">↳ {day.date}</td>
                                                            <td className="px-6 py-2 text-right font-semibold text-red-700">Rs {Number(day.totalPaid || 0).toLocaleString()}</td>
                                                            <td className="px-6 py-2 text-right text-xs text-gray-500">{day.paymentCount} payments</td>
                                                        </tr>

                                                        {day.payments && day.payments.map((pay, pIdx) => (
                                                            <tr key={`${idx}-sup-day-${dIdx}-pay-${pIdx}`} className="hover:bg-red-50 text-sm">
                                                                <td className="px-6 py-2 text-xs text-gray-400"> </td>
                                                                <td className="px-6 py-2 text-xs text-gray-400"> </td>
                                                                <td className="px-6 py-2 text-gray-700">
                                                                    <span className="text-gray-500 mr-2">• {pay.time}</span>
                                                                    {pay.description || 'Payment to Supplier'}
                                                                </td>
                                                                <td className="px-6 py-2 text-right font-medium text-gray-800">Rs {Number(pay.amount || 0).toLocaleString()}</td>
                                                                <td className="px-6 py-2 text-right text-xs text-gray-400">Payment</td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                ))}
                                            </>
                                        )}

                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesReports;