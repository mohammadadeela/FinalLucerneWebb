import { create } from "zustand";

/** Whether the slide-in cart panel is open. */
export const useCartDrawer = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
