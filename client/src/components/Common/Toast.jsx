import React, { useState, useEffect } from 'react';
import './Toast.css';

let addToastHandler = null;

export const showToast = (message, type = 'info') => {
  if (addToastHandler) {
    addToastHandler(message, type);
  }
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    addToastHandler = (message, type) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, message, type }]);
      
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
    };

    return () => {
      addToastHandler = null;
    };
  }, []);

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type} slide-in-right`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
};
