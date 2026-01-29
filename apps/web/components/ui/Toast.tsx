// components/ui/Toast.tsx
"use client";

import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        style: {
          background: "#FFFFFF",
          color: "#151515",
          border: "1px solid rgba(20, 20, 20, 0.10)",
          borderRadius: "20px",
          padding: "16px 20px",
          fontSize: "15px",
          fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
          fontFamily: "var(--font-inter), sans-serif",
          zIndex: 9999, // Always on top
        },
        className: "cozy-toast",
      }}
      duration={3000}
    />
  );
}

// Custom toast helpers
export const toast = {
  success: (message: string) => {
    sonnerToast.success(message, {
      icon: "✓",
      style: {
        background: "rgba(27,156,110,0.08)",
        color: "#1B9C6E",
        borderColor: "rgba(27,156,110,0.20)",
      },
    });
  },
  error: (message: string) => {
    sonnerToast.error(message, {
      icon: "✕",
      style: {
        background: "rgba(255,59,48,0.08)",
        color: "#FF3B30",
        borderColor: "rgba(255,59,48,0.20)",
      },
    });
  },
  info: (message: string) => {
    sonnerToast.info(message, {
      icon: "ℹ",
      style: {
        background: "rgba(47,107,255,0.08)",
        color: "#2F6BFF",
        borderColor: "rgba(47,107,255,0.20)",
      },
    });
  },
  loading: (message: string) => {
    return sonnerToast.loading(message, {
      style: {
        background: "#FAF7F2",
        color: "#5C5C5C",
      },
    });
  },
  promise: <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: any) => string);
    }
  ) => {
    return sonnerToast.promise(promise, {
      loading,
      success,
      error,
    });
  },
  dismiss: (toastId?: string | number) => {
    sonnerToast.dismiss(toastId);
  },
};

