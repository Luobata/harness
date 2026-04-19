import React from 'react';
import type { BoardMode } from '../store/useBoardStore';

interface TopBarStats {
  mission: string;
  progress: string;
  tokens: string;
  elapsed: string;
  actors: string;
  health: string;
}

interface TopBarProps {
  mode: BoardMode;
  onModeChange: (mode: BoardMode) => void;
  stats: TopBarStats;
}

const metricOrder: Array<keyof TopBarStats> = ['mission', 'progress', 'tokens', 'elapsed', 'actors', 'health'];

export const TopBar = ({ mode, onModeChange, stats }: TopBarProps) => {
  return (
    <header className="pixel-panel board-header top-bar">
      <div className="top-bar-metrics">
        {metricOrder.map((key) => (
          <div key={key} className="top-bar-metric">
            <span className="top-bar-label">{key.toUpperCase()}</span>
            <strong className="top-bar-value">{stats[key]}</strong>
          </div>
        ))}
      </div>

      <div className="top-bar-controls">
        <div className="mode-switch" role="group" aria-label="Board mode switch">
          <button
            type="button"
            className={`mode-button${mode === 'summary' ? ' is-active' : ''}`}
            onClick={() => onModeChange('summary')}
          >
            Summary
          </button>
          <button
            type="button"
            className={`mode-button${mode === 'metadata' ? ' is-active' : ''}`}
            onClick={() => onModeChange('metadata')}
          >
            Metadata
          </button>
        </div>
        <div className="mode-text">Mode: {mode}</div>
      </div>
    </header>
  );
};
