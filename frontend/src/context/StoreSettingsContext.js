import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../utils/apiClient';

const DEFAULT_SETTINGS = {
  storeName: 'My Store',
  systemName: 'Store Management System',
  address: '',
  phone: '',
  watermarkName: '',
  logoDataUrl: ''
};

const StoreSettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  loading: true,
  refreshSettings: async () => {}
});

export const StoreSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refreshSettings = async () => {
    try {
      const res = await apiClient.get('/api/settings');
      const next = res?.data || DEFAULT_SETTINGS;
      setSettings({ ...DEFAULT_SETTINGS, ...next });
      return next;
    } catch (error) {
      console.error('Failed to fetch store settings:', error);
      return DEFAULT_SETTINGS;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  useEffect(() => {
    document.title = settings.systemName || `${settings.storeName} Management System`;
  }, [settings.storeName, settings.systemName]);

  const value = useMemo(() => ({ settings, loading, refreshSettings }), [settings, loading]);

  return <StoreSettingsContext.Provider value={value}>{children}</StoreSettingsContext.Provider>;
};

export const useStoreSettings = () => useContext(StoreSettingsContext);
