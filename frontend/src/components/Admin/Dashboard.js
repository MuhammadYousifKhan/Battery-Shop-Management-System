import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import toast from 'react-hot-toast'; 
import { apiClient } from '../../utils/apiClient';
import Modal from '../Common/Modal';
import Table from '../Common/Table';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// Reusable Card Component
const StatCard = ({ title, value, colorClass, borderClass, subText, onClick }) => {
    const interactiveProps = onClick
        ? {
            role: 'button',
            tabIndex: 0,
            onClick,
            onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick(event);
                }
            }
        }
        : {};

    return (
        <div
            {...interactiveProps}
            className={`bg-white p-6 rounded-lg shadow-md border-l-4 ${borderClass} h-full flex flex-col justify-between min-h-[140px] text-left w-full ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2' : ''}`}
        >
            <div>
                <h3 className="text-gray-500 text-sm font-medium uppercase">{title}</h3>
                <p className={`text-2xl font-bold mt-2 ${colorClass}`}>{value}</p>
            </div>
            <div className="mt-2">
                {subText ? (
                    <span className="text-xs text-gray-500 font-medium">{subText}</span>
                ) : (
                    <span className="text-xs text-transparent select-none">&nbsp;</span>
                )}
            </div>
        </div>
    );
};

const Dashboard = () => {
    const [stats, setStats] = useState(null); 
    const [loading, setLoading] = useState(true);
    const [chartData, setChartData] = useState({ labels: [], datasets: [] });
    const navigate = useNavigate();
    
    // UPDATED: Default to 'month' instead of 'all'
    const [period, setPeriod] = useState('month');

    // --- STATES FOR MODALS ---
    const [showLowStockModal, setShowLowStockModal] = useState(false);
    const [lowStockItems, setLowStockItems] = useState([]);
    const [fetchingLowStock, setFetchingLowStock] = useState(false);

    // --- NEW: ACTIVITY TRACKER STATE ---
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [activityData, setActivityData] = useState(null);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('retail'); 

    // Fetch Main Stats
    // UPDATED: Default parameter to 'month'
    const fetchDashboardStats = async (selectedPeriod = 'month') => {
        setLoading(true);
        try {
            const data = await apiClient.get(`/api/dashboard/stats?period=${selectedPeriod}`);
            setStats(data); 
            
            // Chart Logic
            const labels = [];
            const dataPoints = [];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            }
            const apiDataMap = new Map(data.salesChartData.map(item => {
                const date = new Date(item.date + 'T00:00:00');
                const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return [label, item.sales];
            }));
            for (const label of labels) {
                dataPoints.push(apiDataMap.get(label) || 0);
            }
            setChartData({
                labels: labels,
                datasets: [{
                    label: 'Sales (Last 7 Days)',
                    data: dataPoints,
                    fill: true,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgb(54, 162, 235)',
                    tension: 0.1
                }]
            });

        } catch (err) { toast.error(err.message); } finally { setLoading(false); }
    };

    useEffect(() => {
        fetchDashboardStats(period);
    }, [period]); 

    // --- HANDLERS ---
    const handleLowStockClick = async () => {
        setFetchingLowStock(true);
        setShowLowStockModal(true); 
        try {
            const products = await apiClient.get('/api/products');
            // UPDATED: Changed threshold from 10 to 5
            const lowStock = products.filter(p => p.totalStock <= 5);
            setLowStockItems(lowStock);
        } catch (err) {
            toast.error("Failed to load low stock items");
            setShowLowStockModal(false);
        } finally {
            setFetchingLowStock(false);
        }
    };

    // --- Handle Activity Click (Forces Daily Mode) ---
    const handleActivityClick = async () => {
        setActivityLoading(true);
        setShowActivityModal(true);
        try {
            const data = await apiClient.get(`/api/dashboard/activity?period=daily`);
            setActivityData(data);
        } catch (err) {
            toast.error("Failed to load activity details");
            setShowActivityModal(false);
        } finally {
            setActivityLoading(false);
        }
    };

    const handleScrapClick = () => {
        navigate('/admin/scrap');
    };

    const formatCurrency = (val) => val ? val.toLocaleString('en-PK') : '0';

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Admin Dashboard</h1>
                    {stats && stats.lastClosingDate && (
                        <p className="text-xs text-gray-500 mt-1 bg-white px-2 py-1 rounded shadow-sm inline-block">
                            Current Period Started: <span className="font-semibold">{new Date(stats.lastClosingDate).toLocaleString()}</span>
                        </p>
                    )}
                </div>
                
                <div className="mt-4 md:mt-0">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Period</label>
                    <div className="relative">
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                            className="appearance-none min-w-[180px] pl-3 pr-10 py-2.5 border border-gray-300 rounded-lg bg-white shadow-sm text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        >
                            <option value="month">This Month</option>
                            <option value="year">This Year</option>
                            <option value="week">This Week</option>
                            <option value="all">Current Period</option>
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500 text-xs">▼</span>
                    </div>
                </div>
            </div>

            {loading && <p className="text-center text-blue-600">Loading...</p>}

            {!loading && stats && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 items-stretch">
                        <StatCard title={`Net Profit (${period})`} value={`Rs ${formatCurrency(stats.totalProfit)}`} colorClass="text-green-600" borderClass="border-green-500" subText="Retail + Wholesale + Scrap + Claims" />
                        <StatCard title="Total Stock Value" value={`Rs ${formatCurrency(stats.totalStockValue)}`} colorClass="text-emerald-700" borderClass="border-emerald-600" subText="Asset Worth" />
                        <StatCard title="Total Market Credit" value={`Rs ${formatCurrency(stats.totalCustomerCredit)}`} colorClass="text-red-700" borderClass="border-red-600" subText="Receivables" />
                        <StatCard title="Total Orders" value={stats.totalOrders?.toLocaleString()} colorClass="text-blue-600" borderClass="border-blue-500" subText="All Sales Combined" />
                        <StatCard title="Wholesale Customers" value={stats.wholesaleCustomers?.toLocaleString() || 0} colorClass="text-indigo-600" borderClass="border-indigo-500" />
                        <StatCard title="Low Stock Items" value={stats.lowStockCount?.toLocaleString()} colorClass="text-orange-600" borderClass="border-orange-500" onClick={handleLowStockClick} />
                        <StatCard title="Pending Claims" value={stats.pendingClaimsCount?.toLocaleString() || 0} colorClass="text-yellow-600" borderClass="border-yellow-400" />
                        
                        {/* --- FIXED ACTIVITY TRACKER CARD --- */}
                        <StatCard 
                            title="Daily Activity Tracker"
                            // Use Optional Chaining (?.) and fallback (|| 0) to prevent undefined errors
                            value={(stats.dailyActivity?.total || 0).toLocaleString()}
                            colorClass="text-purple-600"
                            borderClass="border-purple-500"
                            subText={`Retail: ${stats.dailyActivity?.retail || 0} | Whl: ${stats.dailyActivity?.wholesale || 0} | Claims: ${stats.dailyActivity?.claims || 0} | Scrap: ${stats.dailyActivity?.scrap || 0}`}
                            onClick={handleActivityClick}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-lg shadow-md h-full">
                            <h3 className="text-xl font-semibold mb-4">Sales Overview (Last 7 Days)</h3>
                            <Line data={chartData} />
                        </div>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={handleScrapClick}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleScrapClick();
                                }
                            }}
                            className="bg-white p-4 md:p-6 rounded-lg shadow-md h-full text-left w-full cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            <h3 className="text-xl font-semibold mb-4">Scrap Stock Summary</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Scrap Quantity In Shop</p>
                                    <p className="mt-2 text-3xl font-black text-blue-900">
                                        {Number(stats.scrapStock?.weight || 0).toFixed(2)} Kg
                                    </p>
                                    <p className="text-xs text-blue-700 mt-1">Current scrap available for resale</p>
                                </div>
                                <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-wide text-green-600">Scrap Value</p>
                                    <p className="mt-2 text-3xl font-black text-green-900">
                                        Rs {formatCurrency(stats.scrapStock?.value || 0)}
                                    </p>
                                    <p className="text-xs text-green-700 mt-1">
                                        Avg cost Rs {Number(stats.scrapStock?.avgCostPerKg || 0).toFixed(2)} / Kg
                                    </p>
                                </div>
                                <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Supplier Scrap Give / Take</p>
                                    <p className="mt-2 text-sm font-bold text-amber-900">
                                        Given (Sold): {Number(stats.supplierScrapFlow?.soldToSuppliersWeight || 0).toFixed(2)} Kg | Rs {formatCurrency(stats.supplierScrapFlow?.soldToSuppliersAmount || 0)}
                                    </p>
                                    <p className="text-xs text-amber-800 mt-1">
                                        Deducted: Rs {formatCurrency(stats.supplierScrapFlow?.deductedFromBalance || 0)} | Payment Received: Rs {formatCurrency(stats.supplierScrapFlow?.paymentReceivedFromSuppliers || 0)}
                                    </p>
                                </div>
                                <p className="text-xs font-medium text-blue-600">Click to open scrap management</p>
                            </div>
                        </div>
                    </div>

                    <Modal isOpen={showActivityModal} onClose={() => setShowActivityModal(false)} title="Daily Activity Breakdown" maxWidth="max-w-4xl">
                        {activityLoading ? (
                            <div className="text-center py-10"><p className="text-blue-600 font-bold">Loading Activities...</p></div>
                        ) : activityData ? (
                            <div className="flex flex-col h-[70vh]">
                                <div className="flex border-b mb-4">
                                    {['retail', 'wholesale', 'claims', 'scrap'].map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`flex-1 py-2 text-center font-semibold capitalize ${activeTab === tab ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-blue-400'}`}
                                        >
                                            {tab} ({activityData[tab]?.length || 0})
                                        </button>
                                    ))}
                                </div>

                                <div className="flex-1 overflow-y-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Date/Time</th>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Description</th>
                                                <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase">Amount</th>
                                                {activeTab !== 'claims' && <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase">Profit</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {activityData[activeTab]?.length > 0 ? (
                                                activityData[activeTab].map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                                            {new Date(item.createdAt || item.date).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-2 text-sm text-gray-800">
                                                            {activeTab === 'scrap' 
                                                                ? `${item.type.toUpperCase()} - ${item.description || 'Scrap'}` 
                                                                : (item.customerName || item.customer?.name || 'Walk-in')
                                                            }
                                                            <div className="text-xs text-gray-400">
                                                                {item.items?.length > 0 ? `${item.items.length} Items` : ''}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium">
                                                            Rs {(item.totalAmount || item.amount || 0).toLocaleString()}
                                                        </td>
                                                        {activeTab !== 'claims' && (
                                                            <td className={`px-4 py-2 whitespace-nowrap text-sm text-right font-bold ${(item.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                {activeTab === 'scrap' && item.type === 'buy' ? '-' : `Rs ${(item.profit || 0).toLocaleString()}`}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr><td colSpan="4" className="text-center py-4 text-gray-500">No records found for today.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mt-4 border-t pt-4 bg-gray-50 p-4 rounded-lg flex justify-between items-center">
                                    <div>
                                        <p className="text-sm text-gray-500">Total Activity Count</p>
                                        <p className="text-xl font-bold">{
                                            (activityData.retail.length + activityData.wholesale.length + activityData.claims.length + activityData.scrap.length)
                                        }</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-gray-500">Net Profit (Today)</p>
                                        <p className={`text-2xl font-bold ${activityData.summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            Rs {activityData.summary.totalProfit.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </Modal>

                    {/* UPDATED: Modal Title to show <= 5 */}
                    <Modal isOpen={showLowStockModal} onClose={() => setShowLowStockModal(false)} title="Low Stock Items (≤ 5)" maxWidth="max-w-2xl">
                        <div className="max-h-96 overflow-y-auto">
                            <Table columns={['SKU', 'Name', 'Stock', 'Price']} loading={fetchingLowStock}>
                                {lowStockItems.length > 0 ? (
                                    lowStockItems.map(item => (
                                        <tr key={item._id} className="hover:bg-red-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{item.sku}</td>
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">{item.name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap font-bold text-red-600">{item.totalStock}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">Rs {item.price.toLocaleString()}</td>
                                        </tr>
                                    ))
                                ) : ( !fetchingLowStock && <tr><td colSpan="4" className="text-center py-4 text-gray-500">No low stock items found.</td></tr> )}
                            </Table>
                        </div>
                        <div className="mt-4 flex justify-end"><button onClick={() => setShowLowStockModal(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 font-bold">Close</button></div>
                    </Modal>
                </>
            )}
        </div>
    );
};

export default Dashboard;