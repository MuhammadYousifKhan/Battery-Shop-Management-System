import express from 'express';
import { 
    getClaims, 
    createClaim, 
    updateClaimStatus, 
    sendClaimsToSupplier,
    getClaimById,
    updateClaim,
    deleteClaim,
    getClaimLedgerPdf,
    sendClaimLedgerWhatsApp,
    editClaimDetails // <--- Import New Function
} from './claimController';
import { protect, admin } from '../../middleware/authMiddleware';

const router = express.Router();

// 1. Base Claims: Get All & Create New
router.route('/')
    .get(protect, getClaims)
    .post(protect, createClaim);

// 2. Bulk Action: Send selected claims to Supplier
router.route('/send-supplier')
    .post(protect, sendClaimsToSupplier);

// Backward-compatible alias used by older frontend builds
router.route('/bulk-send')
    .post(protect, sendClaimsToSupplier);

// 3. Ledger & Reports (PDF is public so WAB2C can fetch it)
router.route('/ledger/pdf')
    .get(getClaimLedgerPdf);

router.route('/ledger/whatsapp')
    .post(protect, sendClaimLedgerWhatsApp);

// 4. Specific Actions
router.route('/:id/status')
    .put(protect, updateClaimStatus);

// 5. NEW: Edit Claim Details (Fee, Items, Description)
router.route('/:id/details')
    .put(protect, editClaimDetails);

// 6. Single Claim Operations
router.route('/:id')
    .get(protect, getClaimById)
    .put(protect, updateClaim)
    .delete(protect, admin, deleteClaim);

export default router;