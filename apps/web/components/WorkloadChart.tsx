"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

interface WorkloadData {
  date: string; // YYYY-MM-DD
  hours: number;
  isOverloaded?: boolean;
  isUnderutilized?: boolean;
}

interface WorkloadChartProps {
  workloadData: WorkloadData[];
  targetHours?: number;
  maxHours?: number;
  title?: string;
  description?: string;
}

export function WorkloadChart({
  workloadData,
  targetHours = 3,
  maxHours = 4,
  title = "Daily Workload",
  description = "Scheduled work hours per day"
}: WorkloadChartProps) {
  // Calculate stats
  const stats = useMemo(() => {
    const totalHours = workloadData.reduce((sum, d) => sum + d.hours, 0);
    const avgHours = totalHours / workloadData.length;
    const overloadedDays = workloadData.filter(d => d.hours > maxHours).length;
    const underutilizedDays = workloadData.filter(d => d.hours < 1 && d.hours > 0).length;
    const peakDay = workloadData.reduce((max, d) => d.hours > max.hours ? d : max, workloadData[0] || { date: '', hours: 0 });

    return {
      avgHours: avgHours.toFixed(1),
      overloadedDays,
      underutilizedDays,
      peakDay: peakDay?.hours > 0 ? peakDay : null
    };
  }, [workloadData, maxHours]);

  // Find max hours for scaling
  const maxDataHours = Math.max(...workloadData.map(d => d.hours), maxHours);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00Z');
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  // Determine bar color
  const getBarColor = (hours: number) => {
    if (hours === 0) return 'bg-gray-200 dark:bg-gray-700';
    if (hours > maxHours) return 'bg-red-500 dark:bg-red-600';
    if (hours >= targetHours * 0.8 && hours <= targetHours * 1.2) return 'bg-green-500 dark:bg-green-600';
    if (hours < 1) return 'bg-yellow-400 dark:bg-yellow-500';
    return 'bg-blue-500 dark:bg-blue-600';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {title}
          <Badge variant="outline" className="text-xs">
            {stats.avgHours}h avg
          </Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {stats.avgHours}h
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Average</div>
          </div>
          
          {stats.peakDay && (
            <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {stats.peakDay.hours.toFixed(1)}h
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Peak Day</div>
            </div>
          )}
          
          {stats.overloadedDays > 0 && (
            <div className="text-center p-2 bg-red-50 dark:bg-red-900/30 rounded">
              <div className="text-lg font-semibold text-red-900 dark:text-red-100">
                {stats.overloadedDays}
              </div>
              <div className="text-xs text-red-600 dark:text-red-400">Overloaded</div>
            </div>
          )}
        </div>

        {/* Bar Chart */}
        <div className="space-y-2">
          {workloadData.map((data, index) => (
            <div key={data.date} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400 font-medium min-w-[80px]">
                  {formatDate(data.date)}
                </span>
                <span className="text-gray-900 dark:text-white font-semibold">
                  {data.hours.toFixed(1)}h
                </span>
              </div>
              
              <div className="relative h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                {/* Target line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-green-400 dark:bg-green-500 opacity-50 z-10"
                  style={{ left: `${(targetHours / maxDataHours) * 100}%` }}
                  title={`Target: ${targetHours}h`}
                />
                
                {/* Max line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-400 dark:bg-red-500 opacity-50 z-10"
                  style={{ left: `${(maxHours / maxDataHours) * 100}%` }}
                  title={`Max: ${maxHours}h`}
                />
                
                {/* Actual bar */}
                <div
                  className={`h-full transition-all duration-300 ${getBarColor(data.hours)}`}
                  style={{ width: `${(data.hours / maxDataHours) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span>Balanced</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span>Good</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-yellow-400 rounded"></div>
                <span>Light</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span>Overloaded</span>
              </div>
            </div>
          </div>
          
          {(stats.overloadedDays > 0 || stats.underutilizedDays > 0) && (
            <div className="text-xs text-gray-600 dark:text-gray-400 italic">
              {stats.overloadedDays > 0 && (
                <p>⚠️ {stats.overloadedDays} day(s) exceed {maxHours}h - consider redistributing work</p>
              )}
              {stats.underutilizedDays > 0 && (
                <p>💡 {stats.underutilizedDays} day(s) underutilized - opportunity to prevent cramming</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}







