"use client";
import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { QuickAddInput } from "./QuickAddInput";

export function TopNav() {
  const { user } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <div className="flex items-center">
            <Link href="/dashboard" className="text-xl font-bold text-gray-900 dark:text-white">
              Neuro Assistant
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <Link 
              href="/dashboard" 
              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium transition"
            >
              Dashboard
            </Link>
            <Link 
              href="/calendar" 
              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium transition"
            >
              Calendar
            </Link>
            <Link 
              href="/upload" 
              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium transition"
            >
              Upload
            </Link>
          </div>

          {/* Global Quick Add Input (Desktop) */}
          <div className="hidden lg:block flex-1 max-w-2xl mx-8">
            <div className="relative">
              <QuickAddInput />
              <div className="absolute -bottom-6 left-0 text-xs text-gray-500 dark:text-gray-400">
                Press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">Alt+Q</kbd> to focus
              </div>
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {user && (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {user.firstName || user.emailAddresses[0]?.emailAddress}
              </div>
            )}
            
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-4">
            <Link 
              href="/dashboard" 
              className="block text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link 
              href="/calendar" 
              className="block text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Calendar
            </Link>
            <Link 
              href="/upload" 
              className="block text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Upload
            </Link>
            
            {/* Mobile Quick Add */}
            <div className="lg:hidden pt-4 border-t border-gray-200 dark:border-gray-800">
              <QuickAddInput />
            </div>
          </div>
        )}
      </div>
      
      {/* Mobile Floating Action Button */}
      <div className="lg:hidden fixed bottom-6 right-6 z-50">
        <button
          onClick={() => {
            // Focus the Quick Add input
            document.getElementById('quick-add-input')?.focus();
          }}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl"
          title="Quick Add (Alt+Q)"
        >
          +
        </button>
      </div>
    </nav>
  );
}

