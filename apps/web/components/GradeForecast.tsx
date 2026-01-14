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
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Grade Forecast</h3>
        <p className="text-sm text-gray-500">No grade forecasts available</p>
      </div>
    );
  }

  const formatScore = (score: string | null) => {
    if (!score) return "—";
    const num = parseFloat(score);
    return num.toFixed(1);
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Grade Forecast</h3>
      <div className="space-y-3">
        {forecasts.map((f) => (
          <div key={f.courseId} className="border-b pb-2 last:border-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{f.courseName || "Unknown Course"}</span>
              <span className="text-xs text-gray-500">
                {f.updatedAt
                  ? new Date(f.updatedAt).toLocaleDateString()
                  : ""}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-gray-500">Current: </span>
                <span className="font-semibold">{formatScore(f.currentScore)}%</span>
              </div>
              <div>
                <span className="text-gray-500">Projected: </span>
                <span
                  className={`font-semibold ${
                    f.projectedScore && parseFloat(f.projectedScore) >= 90
                      ? "text-green-600"
                      : parseFloat(f.projectedScore || "0") >= 80
                      ? "text-blue-600"
                      : "text-orange-600"
                  }`}
                >
                  {formatScore(f.projectedScore)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}




