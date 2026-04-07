// src/components/Common/Footer.js
import React from 'react';
import { useStoreSettings } from '../../context/StoreSettingsContext';

const Footer = () => {
    const { settings } = useStoreSettings();

    return (
        <footer className="bg-white text-center p-4 text-gray-500 text-sm border-t fixed bottom-0 left-0 w-full z-20 shadow-[0_-2px_5px_rgba(0,0,0,0.05)]">
            <p>
                &copy; {new Date().getFullYear()} {settings.storeName || 'My Store'}. 
                <span className="hidden md:inline"> | </span>
                <br className="md:hidden" />
                Developed by <span className="font-semibold text-blue-600">Yousif & Usman / Sukkur IBA University Dadu-Campus</span>
            </p>
        </footer>
    );
};

export default Footer;