import React, { useEffect } from 'react';

function MessageAlert({ text, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const className = type === 'success' ? 'success-message' : 
                   type === 'warning' ? 'warning-message' : 'error-message';

  return (
    <div className={className}>
      {text}
    </div>
  );
}

export default MessageAlert;
