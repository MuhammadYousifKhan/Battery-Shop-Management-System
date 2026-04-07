import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import toast from 'react-hot-toast'; 
import { apiClient } from '../../utils/apiClient';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const formatChartData = (apiData) => {
    const labels = [];
    const dataPoints = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    const safeData = apiData || [];
    const apiDataMap = new Map(safeData.map(item => {
        const date = new Date(item.date + 'T00:00:00'); 
        const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return [label, item.sales];
    }));
    for (const label of labels) {
        dataPoints.push(apiDataMap.get(label) || 0);
    }
    return {
        labels: labels,
        datasets: [{
            label: 'Sales (Last 7 Days)',
            data: dataPoints,
            fill: true,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgb(54, 162, 235)',
            tension: 0.1
        }],
    };
};

const Dashboard = () => {
    const [stats, setStats] = useState(null); 
    const [loading, setLoading] = useState(true);
    const [chartData, setChartData] = useState({ labels: [], datasets: [] });
    
    // UPDATED: Default to 'month' instead of 'all'
    const [revenuePeriod] = useState('month'); 

    // UPDATED: Default parameter
    const fetchDashboardStats = async (period = 'month') => {
        setLoading(true);
        try {
            const data = await apiClient.get(`/api/dashboard/stats?period=${period}`);
            setStats(data); 
            if (data.salesChartData) { 
                setChartData(formatChartData(data.salesChartData)); 
            }
        } catch (err) { 
            toast.error(err.message); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => {
        fetchDashboardStats(revenuePeriod);
    }, [revenuePeriod]); 

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Manager Dashboard</h1>
            </div>

            {loading && (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            )}

            {!loading && stats && (
                <div className="space-y-6">
                    
                    {/* MAIN STATS GRID */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                            <h3 className="text-gray-400 text-xs font-bold uppercase">Total Period Orders</h3>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.totalOrders}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-purple-500">
                            <h3 className="text-gray-400 text-xs font-bold uppercase">Wholesale Customers</h3>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.wholesaleCustomers || 0}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                            <h3 className="text-gray-400 text-xs font-bold uppercase">Low Stock Alerts</h3>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.lowStockCount}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-yellow-400">
                            <h3 className="text-gray-400 text-xs font-bold uppercase">Pending Claims</h3>
                            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.pendingClaimsCount || 0}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-amber-500">
                            <h3 className="text-gray-400 text-xs font-bold uppercase">Supplier Scrap Give / Take</h3>
                            <p className="text-sm font-bold text-gray-800 mt-2">
                                Given (Sold): {Number(stats.supplierScrapFlow?.soldToSuppliersWeight || 0).toFixed(2)} Kg
                            </p>
                            <p className="text-sm font-semibold text-gray-700 mt-1">
                                Amount: Rs {Number(stats.supplierScrapFlow?.soldToSuppliersAmount || 0).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-600 mt-2">
                                Deducted from balance: Rs {Number(stats.supplierScrapFlow?.deductedFromBalance || 0).toLocaleString()} | Payment received: Rs {Number(stats.supplierScrapFlow?.paymentReceivedFromSuppliers || 0).toLocaleString()}
                            </p>
                        </div>
                    </div>

                    {/* CHARTS & LISTS */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* CHART SECTION */}
                        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Sales Trend (Last 7 Days)</h3>
                            <div className="h-64">
                                <Line data={chartData} options={{ maintainAspectRatio: false }} />
                            </div>
                        </div>

                        {/* RECENT ORDERS LIST */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Recent Transactions</h3>
                            <div className="overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                                <ul className="divide-y divide-gray-100">
                                    {stats.recentOrders && stats.recentOrders.length > 0 ? (
                                        stats.recentOrders.map(order => (
                                            <li key={order._id} className="py-3 hover:bg-gray-50 transition-colors rounded-lg px-2">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-800">
                                                            {order.items[0]?.productName || 'Order'}
                                                            {order.items.length > 1 && <span className="text-xs text-gray-400 ml-1">(+{order.items.length - 1} more)</span>}
                                                        </p>
                                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                                            {order.customerName || 'Walk-in'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold text-blue-600">Rs {order.totalAmount?.toLocaleString()}</p>
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                                            order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                            {order.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </li>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-gray-400 text-sm">No recent orders found.</div>
                                    )}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;