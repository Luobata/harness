import { create } from 'zustand';

export type BoardMode = 'metadata' | 'summary';

interface BoardUiState {
  mode: BoardMode;
  selectedActorId: string | null;
  setMode: (mode: BoardMode) => void;
  setSelectedActorId: (actorId: string | null) => void;
}

export const useBoardStore = create<BoardUiState>((set) => ({
  mode: 'summary',
  selectedActorId: null,
  setMode: (mode) => set({ mode }),
  setSelectedActorId: (selectedActorId) => set({ selectedActorId }),
}));
