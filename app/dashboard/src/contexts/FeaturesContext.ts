import { create } from "zustand";
import type { UserTemplate } from "types/Management";
import type { User } from "types/User";

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
  // user template to apply when the create-user form opens
  createFrom: UserTemplate | null;
  setCreateFrom: (template: UserTemplate | null) => void;
  // the user whose links the share dialog shows
  sharing: User | null;
  setSharing: (user: User | null) => void;
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
  createFrom: null,
  setCreateFrom: (createFrom) => set({ createFrom }),
  sharing: null,
  setSharing: (sharing) => set({ sharing }),
}));

export const AlertsQueryKey = ["system-alerts"];
export const AdminsQueryKey = ["admins"];
export const TemplatesQueryKey = ["user-templates"];
