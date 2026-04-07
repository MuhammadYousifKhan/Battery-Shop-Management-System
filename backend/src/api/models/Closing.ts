import mongoose from 'mongoose';

const closingSchema = new mongoose.Schema({
    closedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    closingDate: { 
        type: Date, 
        default: Date.now 
    },
    periodStartDate: {
        type: Date,
        required: true
    },
    // Snapshot of stats at the time of closing
    summary: {
        totalProfit: { type: Number, default: 0 },
        totalSales: { type: Number, default: 0 },
        
        // --- Profit Breakdown ---
        retailProfit: { type: Number, default: 0 },
        wholesaleProfit: { type: Number, default: 0 },
        scrapProfit: { type: Number, default: 0 },

        // --- Activity Counts (Updated) ---
        totalOrders: { type: Number, default: 0 }, // Combined Total
        retailCount: { type: Number, default: 0 }, // Daily Bills
        wholesaleCount: { type: Number, default: 0 }, // New
        claimCount: { type: Number, default: 0 },     // New
        scrapBuyCount: { type: Number, default: 0 },  // New
        totalActivity: { type: Number, default: 0 }   // New
    },
    notes: { type: String }
}, { 
    timestamps: true 
});

export default mongoose.model('Closing', closingSchema);