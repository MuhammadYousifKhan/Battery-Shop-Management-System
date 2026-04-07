// 1. CRITICAL FIX: Environment variables MUST be loaded before any route imports.
import 'dotenv/config'; 

import express, { Request, Response } from "express";
import path from 'path';
import cors from 'cors';
import helmet from 'helmet'; // 🛡️ Security Headers
import { connectDB } from "./config/database";

// --- Route Imports ---
import authRoutes from './components/auth/authRoutes';
import claimRoutes from './components/claims/claimRoutes';
import salesReportRoutes from './components/reports/salesReportRoutes';
import scrapBatteryRoutes from './components/scrapBatteries/scrapBatteryRoutes';
import billingRoutes from "./components/bills/billingRoutes";
import invoiceRoutes from './components/invoices/invoiceRoutes'; 
import customerInvoiceRoutes from './components/customerInvoices/customerInvoiceRoutes';
import customerRoutes from './components/customers/customerRoutes';
import productRoutes from './components/products/productRoutes';
import orderRoutes from './components/orders/orderRoutes';
import userRoutes from './components/users/userRoutes';
import dashboardRoutes from './components/dashboard/dashboardRoutes';
import supplierRoutes from './components/suppliers/supplierRoutes'; 
import paymentRoutes from './components/payments/paymentRoutes'; 
import ledgerRoutes from './components/ledger/ledgerRoutes'; 
import webhookRoutes from './components/webhooks/webhookRoutes';
import messageLogRoutes from './components/messageLogs/messageLogRoutes';
import inventoryRoutes from './components/inventory/inventoryRoutes'; // Added missing route
import settingsRoutes from './components/settings/settingsRoutes';

const app = express();

// 2. Connect to Database
connectDB(); 

// 3. Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'http://127.0.0.1:5000', 'http://localhost:5000'],
            frameSrc: ["'self'", 'blob:'],
            objectSrc: ["'self'", 'blob:'],
            workerSrc: ["'self'", 'blob:']
        }
    }
})); // 🛡️ Security headers with CSP tuned for in-app PDF blob preview
app.use(cors());   // 🌐 Allows Frontend to call Backend (Fixes CORS errors)
app.use(express.json()); 

// 4. API Routes
app.use('/api/auth', authRoutes); 
app.use('/api/users', userRoutes); 
app.use('/api/customers', customerRoutes); 
app.use('/api/products', productRoutes); 
app.use('/api/orders', orderRoutes); 
app.use('/api/bills', billingRoutes); 
app.use('/api/invoices', invoiceRoutes); 
app.use('/api/customer-invoices', customerInvoiceRoutes);
app.use('/api/claims', claimRoutes); 
app.use('/api/scrap', scrapBatteryRoutes); 
app.use('/api/reports', salesReportRoutes); 
app.use('/api/dashboard', dashboardRoutes); 
app.use('/api/suppliers', supplierRoutes); 
app.use('/api/payments', paymentRoutes); 
app.use('/api/ledger', ledgerRoutes);
app.use('/api/inventory', inventoryRoutes); // Register Inventory Routes
app.use('/api/webhooks', webhookRoutes);
app.use('/api/message-logs', messageLogRoutes);
app.use('/api/settings', settingsRoutes);

// 5. Serve Frontend (Desktop packaging)
// Electron spawns backend and loads UI from http://127.0.0.1:5000
if (process.env.SERVE_FRONTEND === '1') {
    const frontendBuildDir = process.env.FRONTEND_BUILD_DIR
        ? process.env.FRONTEND_BUILD_DIR
        : path.join(__dirname, '..', '..', '..', 'frontend', 'build');

    app.use(express.static(frontendBuildDir));
    app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(frontendBuildDir, 'index.html'));
    });
} else {
    // Fallback for API-only mode (development)
    app.get('/', (req: Request, res: Response) => {
        res.status(200).send('API is running successfully! 🚀');
    });
}

// 6. Server Initialization
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { 
    console.log(`Server running on port ${PORT}`); 
    console.log("------------------------------------------------");
    console.log("⚠️  DATABASE MODE CHECK:");
    console.log(
      process.env.MONGO_URI
        ? 'Target DB: MONGO_URI (e.g. MongoDB Atlas)'
        : 'Target DB: local fallback (set MONGO_URI for Atlas)'
    );
    console.log("------------------------------------------------");
});

export default app;