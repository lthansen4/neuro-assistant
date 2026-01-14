// components/GradeForecast.tsx
"use client";

interface Forecast {
  courseId: string;
  courseName: string | null;
  currentScore: string | null;
  projectedScore: string | null;
  updatedAt: string | null;
}

interface GradeForecastProps {
  forecasts: Forecast[];
}

export function GradeForecast({ forecasts }: GradeForecastProps) {
  if (forecasts.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-lg p-6">
        <h3 className="text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">Grade Forecast</h3>
        <p className="text-sm text-gray-500 italic">No forecasts available yet 📉</p>
      </div>
    );
  }

  const formatScore = (score: string | null) => {
    if (!score) return "—";
    const num = parseFloat(score);
    return num.toFixed(1);
  };

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-lg p-6 hover:shadow-xl transition-all duration-300">
      <h3 className="text-sm font-bold text-gray-800 mb-6 uppercase tracking-wider flex items-center gap-2">
        Grade Analytics <span className="text-xs font-normal text-gray-400 capitalize tracking-normal">(Projected)</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {forecasts.map((f) => {
          const projected = parseFloat(f.projectedScore || "0");
          const current = parseFloat(f.currentScore || "0");
          const isImproving = projected > current;

          return (
            <div key={f.courseId} className="group relative bg-gray-50/50 rounded-xl p-4 border border-gray-100 hover:bg-white hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-gray-700 truncate max-w-[150px]">{f.courseName || "Unknown Course"}</span>
                {isImproving && (
                  <span className="flex items-center text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                    ↑ Improving
                  </span>
                )}
              </div>
              
              <div className="flex items-end justify-between">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Current</div>
                  <div className="text-lg font-bold text-gray-600">{formatScore(f.currentScore)}%</div>
                </div>
                
                <div className="text-right space-y-0.5">
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Projected</div>
                  <div className={`text-2xl font-black tracking-tight ${
                    projected >= 90 ? "text-emerald-600" : projected >= 80 ? "text-indigo-600" : "text-amber-600"
                  }`}>
                    {formatScore(f.projectedScore)}%
                  </div>
                </div>
              </div>

              {/* Progress bar visual */}
              <div className="mt-3 w-full bg-gray-200/50 rounded-full h-1 overflow-hidden">
                <div 
                  className={`h-full rounded-full ${projected >= 90 ? "bg-emerald-500" : "bg-indigo-500"}`}
                  style={{ width: `${projected}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}




