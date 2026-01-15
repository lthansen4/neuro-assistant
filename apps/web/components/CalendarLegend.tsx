"use client";

export function CalendarLegend() {
  const legendItems = [
    { label: 'Class Time', color: '#3B82F6' },
    { label: 'Office Hours', color: '#8B5CF6' },
    { label: 'Test/Exam', color: '#EF4444' },
    { label: 'Midterm', color: '#DC2626' },
    { label: 'Final', color: '#991B1B' },
    { label: 'Quiz', color: '#F97316' },
    { label: 'Due Date', color: '#EC4899' },
    { label: 'Homework/Focus', color: '#10B981' },
    { label: 'Studying (Test Prep)', color: '#14B8A6' },
    { label: 'Chill/Break', color: '#F59E0B' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Calendar Legend</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded" 
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



