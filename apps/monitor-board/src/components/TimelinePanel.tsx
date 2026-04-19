import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface TimelineEntry {
  id: string;
  actorId: string;
  label: string;
}

interface TimelinePanelProps {
  entries: TimelineEntry[];
}

export const TimelinePanel = ({ entries }: TimelinePanelProps) => {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 2,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const renderedRows = virtualRows.length
    ? virtualRows.map((virtualRow) => ({
        key: virtualRow.key,
        entry: entries[virtualRow.index],
        start: virtualRow.start,
      }))
    : entries.map((entry, index) => ({
        key: entry.id,
        entry,
        start: index * 40,
      }));

  return (
    <section className="pixel-panel board-panel">
      <div className="panel-section timeline-panel">
        <h2 className="panel-title">TIMELINE</h2>
        <div ref={parentRef} className="timeline-scroll" aria-label="Timeline">
          <div className="timeline-virtual-space" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {renderedRows.map(({ key, entry, start }) => (
              <div key={key} className="timeline-row" style={{ transform: `translateY(${start}px)` }}>
                {entry.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
