import { useId } from "react";

export default function ChartCard({ title, series = [], variant = "bars" }) {
  const chartId = useId().replace(/:/g, "");
  const max = Math.max(...series.map((s) => Number(s.value || 0)), 1);
  const formatValue = (value) => {
    const num = Number(value || 0);
    if (Math.abs(num) >= 1000) return num.toLocaleString();
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(2);
  };

  const linePoints = series.map((item, index) => {
    const width = 560;
    const height = 170;
    const minX = 18;
    const maxX = width - 18;
    const minY = 14;
    const maxY = height - 20;
    const value = Number(item.value || 0);
    return {
      label: item.label,
      value,
      x: minX + (index * (maxX - minX)) / Math.max(1, series.length - 1),
      y: maxY - (Math.max(0, value) / max) * (maxY - minY),
    };
  });

  const linePath = linePoints.map((point) => `${point.x},${point.y}`).join(" ");
  const lineArea = linePoints.length
    ? `${linePoints[0].x},150 ${linePath} ${linePoints[linePoints.length - 1].x},150`
    : "";
  const mountainArea = linePoints.length
    ? `M ${linePoints[0].x} 150 L ${linePath} L ${linePoints[linePoints.length - 1].x} 150 Z`
    : "";
  const pieTotal = Math.max(1, series.reduce((sum, item) => sum + Math.max(0, Number(item.value || 0)), 0));
  const piePalette = ["#3b82f6", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
  let pieAcc = 0;
  const pieSlices = series.map((item, index) => {
    const value = Math.max(0, Number(item.value || 0));
    const percentage = (value / pieTotal) * 100;
    const start = pieAcc;
    pieAcc += percentage;
    return {
      label: item.label,
      value,
      percentage,
      start,
      end: pieAcc,
      color: piePalette[index % piePalette.length],
    };
  });
  const pieGradient = pieSlices.length
    ? `conic-gradient(${pieSlices
        .map((slice) => `${slice.color} ${slice.start.toFixed(2)}% ${slice.end.toFixed(2)}%`)
        .join(", ")})`
    : "conic-gradient(#e5e7eb 0 100%)";

  return (
    <section className={`chart-card chart-card-${variant}`}>
      <div className="chart-head">
        <h3>{title}</h3>
      </div>

      {!series.length ? (
        <p className="chart-empty">No chart data available</p>
      ) : null}

      {series.length && variant === "line" ? (
        <div className="chart-line-wrap">
          <svg viewBox="0 0 560 170" className="chart-line-svg" aria-hidden="true">
            <path d={lineArea ? `M ${lineArea} Z` : ""} className="chart-line-area" />
            <polyline points={linePath} className="chart-line-path" />
            {linePoints.map((point, index) => (
              <circle
                key={point.label}
                cx={point.x}
                cy={point.y}
                r="4"
                className="chart-line-dot"
                style={{ animationDelay: `${Math.min(0.7, index * 0.08)}s` }}
              />
            ))}
          </svg>
          <div className="chart-line-labels">
            {linePoints.map((point) => (
              <span key={point.label}>
                {point.label}
                <strong>{formatValue(point.value)}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {series.length && variant === "mountain" ? (
        <div className="chart-mountain-wrap">
          <svg viewBox="0 0 560 170" className="chart-mountain-svg" aria-label={`${title} mountain chart`}>
            <defs>
              <linearGradient id={`mountain-fill-${chartId}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.48" />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.08" />
              </linearGradient>
            </defs>
            <path d={mountainArea} fill={`url(#mountain-fill-${chartId})`} className="chart-mountain-area" />
            <polyline points={linePath} className="chart-mountain-ridge" />
            {linePoints.map((point, index) => (
              <g key={point.label} className="chart-mountain-point" style={{ animationDelay: `${Math.min(0.8, index * 0.09)}s` }}>
                <circle cx={point.x} cy={point.y} r="5" className="chart-mountain-dot" />
                <text x={point.x} y={Math.max(14, point.y - 11)} textAnchor="middle" className="chart-mountain-tip">
                  {formatValue(point.value)}
                </text>
                <title>{`${point.label}: ${formatValue(point.value)}`}</title>
              </g>
            ))}
          </svg>
          <div className="chart-mountain-labels">
            {linePoints.map((point) => (
              <span key={point.label}>{point.label}</span>
            ))}
          </div>
        </div>
      ) : null}

      {series.length && variant === "pie" ? (
        <div className="chart-pie-wrap">
          <div className="chart-pie-donut" style={{ backgroundImage: pieGradient }}>
            <div className="chart-pie-center">
              <span>Total</span>
              <strong>{formatValue(pieTotal)}</strong>
            </div>
          </div>
          <div className="chart-pie-legend">
            {pieSlices.map((slice) => (
              <article key={slice.label}>
                <i style={{ backgroundColor: slice.color }} />
                <span>{slice.label}</span>
                <strong>
                  {formatValue(slice.value)} ({slice.percentage.toFixed(0)}%)
                </strong>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {series.length && variant === "progress" ? (
        <div className="chart-progress-list">
          {series.map((item, index) => {
            const value = Number(item.value || 0);
            return (
              <article key={item.label} className="chart-progress-item">
                <div>
                  <span>{item.label}</span>
                  <strong>{formatValue(value)}</strong>
                </div>
                <div className="chart-progress-track">
                  <span
                    className="chart-progress-fill"
                    style={{
                      width: `${Math.max(8, (value / max) * 100)}%`,
                      animationDelay: `${Math.min(0.8, index * 0.1)}s`,
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {series.length && variant === "bubbles" ? (
        <div className="chart-bubble-grid">
          {series.map((item, index) => {
            const value = Number(item.value || 0);
            const size = 32 + Math.round((Math.max(0, value) / max) * 52);
            return (
              <article key={item.label} className="chart-bubble-item">
                <div
                  className="chart-bubble"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    animationDelay: `${Math.min(0.9, index * 0.1)}s`,
                  }}
                >
                  <strong>{formatValue(value)}</strong>
                </div>
                <span>{item.label}</span>
              </article>
            );
          })}
        </div>
      ) : null}

      {series.length && variant === "orbit" ? (
        <div className="chart-orbit-wrap">
          <div className="chart-orbit-center">
            <span>Total</span>
            <strong>{formatValue(series.reduce((sum, item) => sum + Number(item.value || 0), 0))}</strong>
          </div>
          <div className="chart-orbit-ring" />
          {series.map((item, index) => {
            const value = Number(item.value || 0);
            const angle = (360 / Math.max(1, series.length)) * index;
            const maxSize = 52;
            const minSize = 30;
            const size = minSize + Math.round((Math.max(0, value) / max) * (maxSize - minSize));
            return (
              <article
                key={item.label}
                className="chart-orbit-node"
                style={{
                  "--angle": `${angle}deg`,
                  "--size": `${size}px`,
                  animationDelay: `${Math.min(0.8, index * 0.08)}s`,
                }}
              >
                <div className="chart-orbit-badge">
                  <strong>{formatValue(value)}</strong>
                </div>
                <span>{item.label}</span>
              </article>
            );
          })}
        </div>
      ) : null}

      {series.length &&
      variant !== "line" &&
      variant !== "mountain" &&
      variant !== "pie" &&
      variant !== "progress" &&
      variant !== "bubbles" &&
      variant !== "orbit" ? (
        <div className="chart-bars">
          {series.map((item, index) => {
            const value = Number(item.value || 0);
            return (
              <div key={item.label} className="chart-item">
                <div className="chart-value">{formatValue(value)}</div>
                <div className="chart-track" title={`${item.label}: ${value}`}>
                  <div
                    className="chart-bar"
                    style={{
                      height: `${Math.max(10, (value / max) * 100)}%`,
                      animationDelay: `${Math.min(0.8, index * 0.08)}s`,
                    }}
                  />
                </div>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
