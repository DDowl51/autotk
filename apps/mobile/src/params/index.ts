export type {
  AutomationParams,
  ModuleInteractionParams,
  TaskWindow,
} from "./types";
export { DEFAULT_PARAMS } from "./defaults";
export {
  fromLegacy,
  validateParams,
  timeToSeconds,
  type LegacyParams,
} from "./parse";
