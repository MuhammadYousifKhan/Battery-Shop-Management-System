import toast from 'react-hot-toast';
import API_URL from '../apiConfig';

// --- HELPER: Fetch PDF Blob with Auth ---
const fetchPdfBlob = async (endpointUrl) => {
    // 1. Construct the Full URL
    // Checks if you passed a relative path ('/api/...') or full URL ('http://...')
    const url = endpointUrl.startsWith('http') ? endpointUrl : `${API_URL}${endpointUrl}`;

    // 2. Get Auth Token
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // 3. Make Request
    const response = await fetch(url, {
        method: 'GET',
        headers: headers,
    });

    // 4. Check Content Type
    const contentType = response.headers.get('content-type');

    // 5. Handle Errors (If server returns JSON error instead of PDF)
    if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        
        if (response.status === 401) {
            throw new Error("Session expired. Please login again.");
        }
        
        throw new Error(errorData.message || "Server Error: Could not generate PDF");
    }

    // 6. Handle Network/Server Errors
    if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    // 7. Return PDF Blob
    return await response.blob();
};

// --- FUNCTION 1: Direct Print (Thermal Printer) ---
export const handlePrintPDF = async (endpointUrl) => {
    const toastId = toast.loading("Preparing document...");
    try {
        const pdfBlob = await fetchPdfBlob(endpointUrl);
        
        // Create a URL for the blob
        const pdfUrl = window.URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));

        // Create invisible iframe to trigger print
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);

        iframe.onload = () => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                console.error("Print command failed", e);
            }
            
            // Cleanup after 1 second
            setTimeout(() => { 
                document.body.removeChild(iframe); 
                window.URL.revokeObjectURL(pdfUrl);
            }, 1000);
        };
        
        toast.success("Sent to printer", { id: toastId });
    } catch (error) {
        console.error("Print Error:", error);
        toast.error(error.message, { id: toastId });
    }
};

// --- FUNCTION 2: View PDF (New Tab) ---
export const handleViewPDF = async (endpointUrl) => {
    const toastId = toast.loading("Opening document...");
    try {
        const pdfBlob = await fetchPdfBlob(endpointUrl);
        
        // Create URL and request in-app dialog open
        const pdfUrl = window.URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
        const titleFromUrl = (() => {
            const path = endpointUrl.split('?')[0].toLowerCase();
            if (path.includes('/ledger/')) return 'Ledger PDF';
            if (path.includes('/bills/')) return 'Bill PDF';
            if (path.includes('/orders/')) return 'Order PDF';
            if (path.includes('/invoices/')) return 'Invoice PDF';
            if (path.includes('/claims/')) return 'Claim Report PDF';
            if (path.includes('/reports/')) return 'Report PDF';
            return 'PDF Preview';
        })();

        const dialogAck = new Promise((resolve) => {
            const onDialogOpened = () => {
                window.removeEventListener('app:pdf-dialog-opened', onDialogOpened);
                resolve(true);
            };

            window.addEventListener('app:pdf-dialog-opened', onDialogOpened, { once: true });
            window.dispatchEvent(new CustomEvent('app:open-pdf-dialog', {
                detail: {
                    pdfUrl,
                    title: titleFromUrl
                }
            }));

            setTimeout(() => {
                window.removeEventListener('app:pdf-dialog-opened', onDialogOpened);
                resolve(false);
            }, 350);
        });

        const openedInDialog = await dialogAck;
        if (!openedInDialog) {
            const popup = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
            if (!popup) {
                throw new Error('Could not open PDF preview window. Please allow popups for this app.');
            }
        }
        
        toast.success("Document opened", { id: toastId });
    } catch (error) {
        console.error("View Error:", error);
        toast.error(error.message, { id: toastId });
    }
};