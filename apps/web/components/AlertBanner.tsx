"use client";

import React, { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

// ============================================================================
// TYPES
// ============================================================================

type AlertType = 
  | 'DEADLINE_AT_RISK'
  | 'AVOIDANCE_DETECTED'
  | 'IMPOSSIBLE_SCHEDULE'
  | 'NO_PLAN_TODAY';

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  assignmentId?: string;
  assignmentTitle?: string;
  eventId?: string;
  dueDate?: string;
  actionLabel: string;
  actionType: 'schedule' | 'move' | 'review';
  metadata: Record<string, any>;
}

interface AlertBannerProps {
  userId: string;
  onActionClick?: (alert: Alert) => void;
  className?: string;
}

// ============================================================================
// ICONS
// ============================================================================

const AlertTriangleIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const RepeatIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAlertIcon(type: AlertType) {
  switch (type) {
    case 'DEADLINE_AT_RISK':
      return <ClockIcon />;
    case 'AVOIDANCE_DETECTED':
      return <RepeatIcon />;
    case 'IMPOSSIBLE_SCHEDULE':
      return <AlertTriangleIcon />;
    case 'NO_PLAN_TODAY':
      return <CalendarIcon />;
    default:
      return <AlertTriangleIcon />;
  }
}

function getSeverityStyles(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-50 border-red-300 text-red-900';
    case 'high':
      return 'bg-orange-50 border-orange-300 text-orange-900';
    case 'medium':
      return 'bg-yellow-50 border-yellow-300 text-yellow-900';
    case 'low':
      return 'bg-blue-50 border-blue-300 text-blue-900';
    default:
      return 'bg-gray-50 border-gray-300 text-gray-900';
  }
}

function getSeverityIconColor(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'text-red-600';
    case 'high':
      return 'text-orange-600';
    case 'medium':
      return 'text-yellow-600';
    case 'low':
      return 'text-blue-600';
    default:
      return 'text-gray-600';
  }
}

function getActionButtonStyles(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-600 hover:bg-red-700 text-white';
    case 'high':
      return 'bg-orange-600 hover:bg-orange-700 text-white';
    case 'medium':
      return 'bg-yellow-600 hover:bg-yellow-700 text-white';
    case 'low':
      return 'bg-blue-600 hover:bg-blue-700 text-white';
    default:
      return 'bg-gray-600 hover:bg-gray-700 text-white';
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AlertBanner({ userId, onActionClick, className = "" }: AlertBannerProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

  const fetchAlerts = useCallback(async () => {
    if (!userId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/alerts`, {
        headers: {
          "x-clerk-user-id": userId,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch alerts");
      }

      const data = await res.json();
      
      if (data.ok) {
        setAlerts(data.alerts || []);
        setError(null);
      } else {
        setError(data.error || "Failed to check alerts");
      }
    } catch (e: any) {
      console.error("[AlertBanner] Error fetching alerts:", e);
      setError(e.message || "Failed to check alerts");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetch alerts on mount and when userId changes
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    setDismissed(new Set());
  }, [userId]);

  // Refresh alerts every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleDismiss = async (alertId: string) => {
    setDismissed(prev => new Set(prev).add(alertId));
    try {
      await fetch(`${API_BASE}/api/rebalancing/alerts/dismiss`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify({ alertId }),
      });
    } catch (e) {
      console.error("[AlertBanner] Failed to persist dismissal", e);
    }
  };

  const handleDismissAll = async () => {
    const ids = alerts.map(a => a.id);
    setDismissed(new Set(ids));
    try {
      await fetch(`${API_BASE}/api/rebalancing/alerts/dismiss`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify({ alertIds: ids }),
      });
    } catch (e) {
      console.error("[AlertBanner] Failed to persist dismiss-all", e);
    }
  };

  const handleAction = (alert: Alert) => {
    if (onActionClick) {
      onActionClick(alert);
    }
  };

  const toggleReason = (alertId: string) => {
    setExpandedReasons(prev => {
      const next = new Set(prev);
      if (next.has(alertId)) {
        next.delete(alertId);
      } else {
        next.add(alertId);
      }
      return next;
    });
  };

  // Filter out dismissed alerts
  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));
  
  // Don't render anything if no alerts or all dismissed
  if (loading || visibleAlerts.length === 0) {
    return null;
  }

  // Get highest severity for banner color
  const highestSeverity = visibleAlerts.reduce<AlertSeverity>((highest, alert) => {
    const order: AlertSeverity[] = ['critical', 'high', 'medium', 'low'];
    return order.indexOf(alert.severity) < order.indexOf(highest) ? alert.severity : highest;
  }, 'low');

  const criticalCount = visibleAlerts.filter(a => a.severity === 'critical').length;
  const highCount = visibleAlerts.filter(a => a.severity === 'high').length;

  return (
    <div className={`${className}`}>
      {/* Collapsed Banner */}
      <div 
        className={`${getSeverityStyles(highestSeverity)} border rounded-lg shadow-sm transition-all`}
      >
        {/* Header - Always visible */}
        <div 
          className="flex items-center justify-between p-3 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <div className={getSeverityIconColor(highestSeverity)}>
              <AlertTriangleIcon />
            </div>
            <div>
              <span className="font-semibold">
                {visibleAlerts.length === 1 
                  ? "1 thing needs attention"
                  : `${visibleAlerts.length} things need attention`}
              </span>
              {(criticalCount > 0 || highCount > 0) && (
                <span className="ml-2 text-sm opacity-75">
                  {criticalCount > 0 && `${criticalCount} urgent`}
                  {criticalCount > 0 && highCount > 0 && ", "}
                  {highCount > 0 && `${highCount} important`}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDismissAll();
              }}
              className="text-sm opacity-75 hover:opacity-100 px-2 py-1 rounded hover:bg-black/5"
            >
              Dismiss all
            </button>
            <div className="p-1">
              {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="border-t border-black/10 p-3 space-y-3">
            {visibleAlerts.map((alert) => (
              <div 
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-lg ${getSeverityStyles(alert.severity)} border`}
              >
                <div className={`mt-0.5 ${getSeverityIconColor(alert.severity)}`}>
                  {getAlertIcon(alert.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm opacity-80 mt-0.5">{alert.message}</p>
                    </div>
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="p-1 opacity-50 hover:opacity-100 rounded hover:bg-black/5"
                      aria-label="Dismiss alert"
                    >
                      <XIcon />
                    </button>
                  </div>

                  {alert.metadata?.reasoning && (
                    <div className="mt-2">
                      <button
                        onClick={() => toggleReason(alert.id)}
                        className="text-xs font-semibold opacity-80 hover:opacity-100"
                      >
                        {expandedReasons.has(alert.id) ? "Hide reasoning" : "Why is this showing?"}
                      </button>
                      {expandedReasons.has(alert.id) && (
                        <p className="text-xs opacity-80 mt-1">
                          {alert.metadata.reasoning}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <div className="mt-2">
                    <button
                      onClick={() => handleAction(alert)}
                      className={`px-3 py-1.5 text-sm font-medium rounded ${getActionButtonStyles(alert.severity)}`}
                    >
                      {alert.actionLabel}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPACT VERSION (for sidebar or smaller spaces)
// ============================================================================

export function AlertBadge({ userId, onClick }: { userId: string; onClick?: () => void }) {
  const [alertCount, setAlertCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlertCount() {
      if (!userId) return;
      
      try {
        const res = await fetch(`${API_BASE}/api/rebalancing/alerts`, {
          headers: {
            "x-clerk-user-id": userId,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setAlertCount(data.totalCount || 0);
            setCriticalCount(data.criticalCount || 0);
          }
        }
      } catch (e) {
        console.error("[AlertBadge] Error:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchAlertCount();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchAlertCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  if (loading || alertCount === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        criticalCount > 0 
          ? 'bg-red-100 text-red-800 hover:bg-red-200' 
          : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
      }`}
    >
      <AlertTriangleIcon />
      <span>
        {alertCount} {alertCount === 1 ? 'alert' : 'alerts'}
      </span>
    </button>
  );
}

