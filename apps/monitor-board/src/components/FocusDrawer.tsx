import React from 'react';

export interface FocusDrawerViewModel {
  title: string;
  focusLine: string;
  detailLines: string[];
}

interface FocusDrawerProps {
  viewModel: FocusDrawerViewModel;
}

export const FocusDrawer = ({ viewModel }: FocusDrawerProps) => {
  return (
    <section className="pixel-panel board-panel focus-drawer">
      <div className="panel-section">
        <h2 className="panel-title">{viewModel.title}</h2>
        <p className="focus-text">{viewModel.focusLine}</p>
        {viewModel.detailLines.map((line) => (
          <p key={line} className="focus-detail">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
};
