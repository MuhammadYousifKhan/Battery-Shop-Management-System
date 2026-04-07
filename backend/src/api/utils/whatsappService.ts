import axios from 'axios';
import dotenv from 'dotenv';
import MessageLog from '../models/MessageLog';
import { getCachedStoreSettings } from './storeSettingsService';

dotenv.config();

// WAB2C credentials
const ACCESS_TOKEN = process.env.AccessToken;
const NUMBER_ID = process.env.NUMBER_ID;
const WABA_ID = process.env.WABA_ID;
const DOCUMENT_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_DOCUMENT || 'send_document_v1';
const WELCOME_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_WELCOME || 'customer_welcome';
const CLAIM_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_CLAIM || 'claim_update_v1';
const INCLUDE_STORE_NAME_PARAM = String(process.env.WHATSAPP_INCLUDE_STORE_NAME || 'false').toLowerCase() === 'true';

// Meta WhatsApp Cloud API (WAB2C is just the BSP dashboard — actual API calls go through Meta)
const GRAPH_API_URL = `https://graph.facebook.com/v21.0/${NUMBER_ID}/messages`;

/**
 * Formats phone number to 923001234567 format
 */
const formatPhoneNumber = (phone: string): string => {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('03')) clean = '92' + clean.substring(1);
    else if (clean.startsWith('3') && clean.length === 10) clean = '92' + clean;
    return clean;
};

const getStoreNameForTemplates = (): string => {
    const settings = getCachedStoreSettings();
    return settings.storeName || process.env.STORE_NAME || 'My Store';
};

const maybeAppendStoreNameParam = (params: string[]): string[] => {
    if (!INCLUDE_STORE_NAME_PARAM) return params;
    return [...params, getStoreNameForTemplates()];
};

// ============================================================
//  LOW-LEVEL: Send WhatsApp Template via Meta Cloud API
// ============================================================
export const sendWAB2CTemplate = async (
    phone: string,
    templateName: string,
    bodyParameters: string[],
    pdfUrl?: string,
    pdfFilename?: string
) => {
    if (!ACCESS_TOKEN || !NUMBER_ID) {
        console.error("❌ WhatsApp API credentials missing (AccessToken or NUMBER_ID in .env)");
        return null;
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
        console.error("❌ Invalid phone number");
        return null;
    }

    try {
        const components: any[] = [];

        // HEADER component — for DOCUMENT templates (send_document_v1, claim_update_v1)
        if (pdfUrl) {
            components.push({
                type: "header",
                parameters: [{
                    type: "document",
                    document: {
                        link: pdfUrl,
                        filename: pdfFilename || "Document.pdf"
                    }
                }]
            });
        }

        // BODY component — template text parameters {{1}}, {{2}}, ...
        if (bodyParameters.length > 0) {
            components.push({
                type: "body",
                parameters: bodyParameters.map(p => ({ type: "text", text: String(p) }))
            });
        }

        // WAB2C API request format
        const body = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: formattedPhone,
            type: "template",
            template: {
                name: templateName,
                language: { code: "en" },
                components
            }
        };

        console.log(`📤 WhatsApp → ${templateName} to ${formattedPhone}`);

        const response = await axios.post(GRAPH_API_URL, body, {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ WhatsApp Success:`, response.data);

        try {
            const msgId = response.data?.messages && response.data.messages[0] && response.data.messages[0].id;
            if (msgId) {
                // Save initial status as 'sent'
                await MessageLog.create({
                    messageId: msgId,
                    phone: formattedPhone,
                    status: 'sent'
                });
            }
        } catch (err) {
            console.error('Failed to persist WhatsApp message log:', err);
        }

        return response.data;
    } catch (error: any) {
        const errData = error.response?.data?.error || error.response?.data || error.message;
        console.error("❌ WhatsApp Error:", JSON.stringify(errData, null, 2));
        return null;
    }
};

// ============================================================
//  HIGH-LEVEL HELPERS  (Used by controllers)
// ============================================================

/**
 * Send a document (PDF) via WhatsApp using configured template name.
 * Template name: WHATSAPP_TEMPLATE_DOCUMENT (default: send_document_v1)
 * Optional extra template param: set WHATSAPP_INCLUDE_STORE_NAME=true
 * 
 * @param phone       - Customer phone number
 * @param pdfUrl      - Publicly accessible URL to the PDF
 * @param customerName - Customer name (fills {{1}})
 * @param documentType - e.g. "Invoice", "Statement", "Bill" (fills {{2}})
 * @param pdfFilename  - PDF filename for download
 */
export const sendDocumentWhatsApp = async (
    phone: string,
    pdfUrl: string,
    customerName: string,
    documentType: string,
    pdfFilename?: string
) => {
    return sendWAB2CTemplate(
        phone,
        DOCUMENT_TEMPLATE_NAME,
        maybeAppendStoreNameParam([customerName, documentType]),
        pdfUrl,
        pdfFilename || `${documentType.replace(/\s+/g, '_')}.pdf`
    );
};

/**
 * Send a welcome message to new wholesale customer using configured template name.
 * Template name: WHATSAPP_TEMPLATE_WELCOME (default: customer_welcome)
 * Optional extra template param: set WHATSAPP_INCLUDE_STORE_NAME=true
 * 
 * @param phone        - Customer phone number
 * @param customerName - Customer name (fills {{1}})
 */
export const sendWelcomeWhatsApp = async (
    phone: string,
    customerName: string
) => {
    return sendWAB2CTemplate(
        phone,
        WELCOME_TEMPLATE_NAME,
        maybeAppendStoreNameParam([customerName])
        // No PDF — this is a TEXT template
    );
};

/**
 * Send a claim update via WhatsApp using configured template name.
 * Template name: WHATSAPP_TEMPLATE_CLAIM (default: claim_update_v1)
 * Optional extra template param: set WHATSAPP_INCLUDE_STORE_NAME=true
 * 
 * @param phone        - Customer phone number
 * @param customerName - Customer name (fills {{1}})
 * @param itemName     - Claimed item name (fills {{2}})
 * @param status       - Claim status (fills {{3}})
 * @param resolution   - Resolution text (fills {{4}})
 * @param pdfUrl       - Optional PDF URL (claim_update_v1 is DOCUMENT type)
 * @param pdfFilename  - Optional PDF filename
 */
export const sendClaimUpdateWhatsApp = async (
    phone: string,
    customerName: string,
    itemName: string,
    status: string,
    resolution: string,
    pdfUrl?: string,
    pdfFilename?: string
) => {
    return sendWAB2CTemplate(
        phone,
        CLAIM_TEMPLATE_NAME,
        maybeAppendStoreNameParam([customerName, itemName, status, resolution]),
        pdfUrl,
        pdfFilename
    );
};