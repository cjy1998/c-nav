import z from "zod";
import { settingsInsertSchema, settingsUpdateSchema } from "./schema";

export type SettingsInsertType = z.infer<typeof settingsInsertSchema>;
export type SettingsUpdateType = z.infer<typeof settingsUpdateSchema>;
