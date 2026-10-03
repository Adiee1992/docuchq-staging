import React, { createContext, useState, useContext } from 'react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        // Automatically close the alert card after 4 seconds
        setTimeout(() => {
            setToast(null);
        }, 4000);
    };

    // Inside src/context/ToastContext.jsx (replace the return block layout at the bottom):

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toast && (
                <div className="toast-container">
                    <div className={`toast-notification ${toast.type}`}>
                        {/* Custom vector icons matching your brand identity color palettes */}
                        <span>
                            {toast.type === 'success' ? (
                                // Branded Teal-Blue Checkmark SVG (#008DDA)
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 12L9 17L20 6" stroke="#008DDA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            ) : (
                                // Warning Rose Cross SVG (#f43f5e)
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18 6L6 18M6 6L18 18" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </span>
                        <div>{toast.message}</div>
                    </div>
                </div>
            )}
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);