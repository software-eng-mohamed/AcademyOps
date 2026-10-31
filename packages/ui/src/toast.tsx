'use client';

import { Toast, toast } from '@heroui/react/toast';
import type { ReactNode } from 'react';

export type PlgToast = {
  description?: ReactNode;
  title: ReactNode;
  type?: 'error' | 'info' | 'success' | 'warning';
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toast.Provider
        className="plg-toast-region"
        gap={10}
        maxVisibleToasts={4}
        placement="top"
        width="min(400px, calc(100vw - 2rem))"
      />
    </>
  );
}

export function useToast() {
  return {
    add({ description, title, type }: PlgToast) {
      const options = { description, timeout: 4200 };
      if (type === 'error') return toast.danger(title, options);
      if (type === 'success') return toast.success(title, options);
      if (type === 'warning') return toast.warning(title, options);
      if (type === 'info') return toast.info(title, options);
      return toast(title, options);
    },
    dismiss(id?: string | number) {
      if (id === undefined) {
        toast.clear();
        return;
      }
      toast.close(String(id));
    },
  };
}
