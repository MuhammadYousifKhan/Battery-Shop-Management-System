import React from 'react';

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg", hideHeader = false }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 overflow-y-auto h-full w-full">
            <div className="flex justify-center items-center min-h-full py-10 px-4">
                <div className={`relative w-full ${maxWidth} p-5 border shadow-lg rounded-md bg-white`}>
                    {!hideHeader && (
                        <div className="flex justify-between items-center mb-4">
                            {title && <h3 className="text-lg font-bold leading-6 text-gray-900">{title}</h3>}
                            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 focus:outline-none bg-gray-100 rounded-full p-1">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                    )}
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;