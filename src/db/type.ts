import z from "zod";
import {
  bookmarkInsertSchema,
  bookmarkUpdateSchema,
  categorysInsertSchema,
  categorysUpdateSchema,
  settingsInsertSchema,
  settingsUpdateSchema,
} from "./schema";

export type SettingsInsertType = z.infer<typeof settingsInsertSchema>;
export type SettingsUpdateType = z.infer<typeof settingsUpdateSchema>;

export type CategorysInsertType = z.infer<typeof categorysInsertSchema>;
export type CategorysUpdateType = z.infer<typeof categorysUpdateSchema>;

export type BookmarkInsertType = z.infer<typeof bookmarkInsertSchema>;
export type BookmarkUpdateType = z.infer<typeof bookmarkUpdateSchema>;
