import StoreSettings from '../models/StoreSettings';

export interface StoreSettingsShape {
  storeName: string;
  systemName: string;
  address: string;
  phone: string;
  watermarkName: string;
  logoDataUrl: string;
}

const DEFAULT_STORE_SETTINGS: StoreSettingsShape = {
  storeName: 'My Store',
  systemName: 'Store Management System',
  address: '',
  phone: '',
  watermarkName: '',
  logoDataUrl: ''
};

let cachedStoreSettings: StoreSettingsShape = { ...DEFAULT_STORE_SETTINGS };

const cleanText = (value: any): string => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const normalizeSettings = (value: Partial<StoreSettingsShape> = {}): StoreSettingsShape => {
  return {
    storeName: cleanText(value.storeName) || DEFAULT_STORE_SETTINGS.storeName,
    systemName: cleanText(value.systemName) || DEFAULT_STORE_SETTINGS.systemName,
    address: cleanText(value.address),
    phone: cleanText(value.phone),
    watermarkName: cleanText(value.watermarkName),
    logoDataUrl: cleanText(value.logoDataUrl)
  };
};

export const getCachedStoreSettings = (): StoreSettingsShape => {
  return { ...cachedStoreSettings };
};

export const refreshStoreSettingsCache = async (): Promise<StoreSettingsShape> => {
  const doc = await StoreSettings.findOne({}).lean();
  cachedStoreSettings = normalizeSettings((doc as any) || {});
  return getCachedStoreSettings();
};

export const upsertStoreSettings = async (payload: Partial<StoreSettingsShape>): Promise<StoreSettingsShape> => {
  const next = normalizeSettings(payload);
  const doc = await StoreSettings.findOneAndUpdate(
    {},
    { $set: next },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  cachedStoreSettings = normalizeSettings((doc as any) || next);
  return getCachedStoreSettings();
};
