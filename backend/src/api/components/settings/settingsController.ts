import { Request, Response } from 'express';
import {
  getCachedStoreSettings,
  refreshStoreSettingsCache,
  upsertStoreSettings
} from '../../utils/storeSettingsService';

export const getStoreSettings = async (_req: Request, res: Response) => {
  try {
    const cached = getCachedStoreSettings();

    // If cache is still default-ish, refresh once from DB.
    if (!cached.storeName || cached.storeName === 'My Store') {
      const settings = await refreshStoreSettingsCache();
      return res.status(200).json({ success: true, data: settings });
    }

    return res.status(200).json({ success: true, data: cached });
  } catch (error) {
    console.error('Get store settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch store settings' });
  }
};

export const updateStoreSettings = async (req: Request, res: Response) => {
  try {
    const { storeName, systemName, address, phone, watermarkName, logoDataUrl } = req.body || {};

    const settings = await upsertStoreSettings({
      storeName,
      systemName,
      address,
      phone,
      watermarkName,
      logoDataUrl
    });

    return res.status(200).json({ success: true, message: 'Store settings updated', data: settings });
  } catch (error) {
    console.error('Update store settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update store settings' });
  }
};
