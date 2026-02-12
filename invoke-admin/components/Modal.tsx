import React, { ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: string | ReactNode;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  cancelText?: string;
  confirmText?: string;
  confirmVariant?: 'default' | 'danger';
  loading?: boolean;
  confirmDisabled?: boolean;
}

export default function Modal({
  isOpen,
  title,
  description,
  children,
  onCancel,
  onConfirm,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  confirmVariant = 'default',
  loading = false,
  confirmDisabled = false,
}: ModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 animate-scaleIn">
        <h3 className="text-xl font-semibold text-gray-200 mb-4">{title}</h3>
        {description && (
          <p className="text-gray-400 text-sm mb-4">{description}</p>
        )}
        {children}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || isLoading || confirmDisabled}
            className={`flex-1 px-4 py-2 rounded-lg text-white transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              confirmVariant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
