"use client";
import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { QuickAddInput } from "./QuickAddInput";
import { Search } from "lucide-react";
import { GessoIcon } from "./ui/GessoIcon";

export function TopNav() {
  const { user } = useUser();

  return (
    <nav className="sticky top-0 z-40 bg-brand-gesso/40 backdrop-blur-md border-b border-slate-200/20">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <div className="flex items-center justify-between h-24">
          {/* Logo / Brand */}
          <div className="flex items-center">
            <Link href="/dashboard" className="text-3xl font-serif font-black text-brand-text tracking-tight group flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-surface flex items-center justify-center transition-all group-hover:rotate-6 shadow-sm border border-brand-muted/10">
                <GessoIcon type="prism" className="text-brand-primary" size={24} />
              </div>
              <span className="hidden sm:inline italic">Gesso</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-10">
            <Link 
              href="/dashboard" 
              className="text-brand-muted hover:text-brand-primary text-[12px] font-bold uppercase tracking-[0.2em] transition-colors"
            >
              Dashboard
            </Link>
            <Link 
              href="/calendar" 
              className="text-brand-muted hover:text-brand-primary text-[12px] font-bold uppercase tracking-[0.2em] transition-colors"
            >
              Schedule
            </Link>
            <Link 
              href="/planner" 
              className="text-brand-muted hover:text-brand-primary text-[12px] font-bold uppercase tracking-[0.2em] transition-colors"
            >
              Planner
            </Link>
            <Link 
              href="/upload" 
              className="text-brand-muted hover:text-brand-primary text-[12px] font-bold uppercase tracking-[0.2em] transition-colors"
            >
              Upload
            </Link>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-6">
            {user && (
              <div className="hidden sm:flex flex-col items-end">
                <div className="text-[10px] font-bold text-brand-muted uppercase tracking-widest leading-none mb-1">Scholar</div>
                <div className="text-sm font-bold text-brand-text tracking-tight leading-none">
                  {user.firstName || user.username}
                </div>
              </div>
            )}
            
            <div className="w-10 h-10 rounded-2xl bg-brand-surface border border-brand-muted/10 flex items-center justify-center text-brand-muted shadow-soft">
              <UserCircle size={20} strokeWidth={2.5} />
            </div>
          </div>
      </div>
      </div>
    </nav>
  );
}

const UserCircle = ({ size, strokeWidth }: { size: number, strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);


