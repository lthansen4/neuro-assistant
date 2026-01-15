"use client";

import React from "react";
import { cn } from "../../lib/utils";

export type GessoIconType = 
  | "prism" // The AI / Syllabus Dump
  | "brick" // The Wall of Awful
  | "wave" // Chill Block
  | "bolt" // Focus Block
  | "portal" // Transition/Buffer
  | "inkblot" // Quick Add
  | "flame"; // Urgent/High Impact

interface GessoIconProps extends React.SVGProps<SVGSVGElement> {
  type?: GessoIconType;
  name?: GessoIconType | "ink-blot"; // Support both conventions
  size?: number;
  className?: string;
}

export function GessoIcon({ type, name, size = 24, className, ...props }: GessoIconProps) {
  const activeType = type || (name === "ink-blot" ? "inkblot" : name) as GessoIconType;

  const iconContent = () => {
    switch (activeType) {
      case "prism":
        return (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3L2 21h20L12 3z" />
            <path d="M12 3v18" opacity="0.3" />
            <path d="M12 3l5 18" opacity="0.5" />
            <path d="M12 3l-5 18" opacity="0.5" />
          </g>
        );
      case "brick":
        return (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="10" width="18" height="8" rx="1" />
            <path d="M8 10v8" />
            <path d="M16 10v8" />
            <path d="M10 10l2-3 2 3" opacity="0.5" />
          </g>
        );
      case "wave":
        return (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12c4-8 8 8 12 0s8-8 12 0" />
            <path d="M2 16c4-8 8 8 12 0s8-8 12 0" opacity="0.4" />
          </g>
        );
      case "bolt":
        return (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" fillOpacity="0.1" />
          </g>
        );
      case "portal":
        return (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" strokeDasharray="4 2" />
          </g>
        );
      case "inkblot":
        return (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3c-4 0-7 2-7 6 0 2 1 3 2 5-1 2-2 4-2 6 0 2 2 3 4 3s4-1 6-1 4 1 6 1 4-1 4-3c0-2-1-4-2-6 1-2 2-3 2-5 0-4-3-6-7-6z" fill="currentColor" fillOpacity="0.1" />
          </g>
        );
      case "flame":
        return (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 14.5c-1.5 0-3-1.5-3-3.5 0-2 1.5-4 3.5-4.5.5-2.5 2-4.5 3-4.5 1 0 2.5 2 3 4.5 2 .5 3.5 2.5 3.5 4.5 0 2-1.5 3.5-3 3.5" />
            <path d="M12 18c-3 0-5.5-2.5-5.5-5.5 0-1 .5-2 1-3.5 1.5 2 3 3 4.5 3s3-1 4.5-3c.5 1.5 1 2.5 1 3.5 0 3-2.5 5.5-5.5 5.5z" fill="currentColor" fillOpacity="0.2" />
          </g>
        );
      default:
        return null;
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("inline-block", className)}
      {...props}
    >
      {iconContent()}
    </svg>
  );
}
