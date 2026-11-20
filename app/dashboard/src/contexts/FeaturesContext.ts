import { create } from "zustand";

// Dialogs added on top of the original dashboard, plus the users selected for
// bulk actions. Kept separate from DashboardContext to keep that store small.
export type FeatureModal = "admins" | "templates" | "analytics" | "cleanup" | "settings" | "subTemplates" | null;

type FeaturesState = {
  openModal: FeatureModal;
  setModal: (modal: FeatureModal) => void;
  selected: string[];
  toggleSelected: (username: string) => void;
  setSelected: (usernames: string[]) => void;
  clearSelected: () => void;
};

export const useFeatures = create<FeaturesState>((set, get) => ({
  openModal: null,
  setModal: (openModal) => set({ openModal }),
  selected: [],
  toggleSelected: (username) => {
    const selected = get().selected;
    set({
      selected: selected.includes(username)
        ? selected.filter((u) => u !== username)
        : [...selected, username],
    });
  },
  setSelected: (selected) => set({ selected }),
  clearSelected: () => set({ selected: [] }),
}));

export const AlertsQueryKey = ["system-alerts"];
export const AdminsQueryKey = ["admins"];
export const TemplatesQueryKey = ["user-templates"];
