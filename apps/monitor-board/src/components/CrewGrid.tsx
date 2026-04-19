import React from 'react';

export interface CrewCard {
  id: string;
  name: string;
  role: string;
  status: string;
  primaryDetail: string;
  secondaryDetail: string;
  metricLabel: string;
}

interface CrewGridProps {
  actors: CrewCard[];
  selectedActorId: string | null;
  onFocus: (actorId: string) => void;
}

export const CrewGrid = ({ actors, selectedActorId, onFocus }: CrewGridProps) => {
  return (
    <section className="pixel-panel board-panel">
      <div className="panel-section">
        <h2 className="panel-title">PIXEL CREW</h2>
        <div className="crew-grid">
          {actors.map((actor) => {
            const isSelected = actor.id === selectedActorId;

            return (
              <button
                key={actor.id}
                type="button"
                aria-label={actor.name}
                aria-pressed={isSelected}
                className={`crew-card${isSelected ? ' is-selected' : ''}`}
                onClick={() => onFocus(actor.id)}
              >
                <span className="crew-card-role">{actor.role}</span>
                <strong className="crew-card-name">{actor.name}</strong>
                <span className="crew-card-status">{actor.status}</span>
                <span className="crew-card-summary">{actor.primaryDetail}</span>
                <span className="crew-card-summary">{actor.secondaryDetail}</span>
                <span className="crew-card-metric">{actor.metricLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
