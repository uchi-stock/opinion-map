import type { Repositories } from "../repositories/types.js";

export interface ServiceContext {
  repos: Repositories;
  now: () => Date;
  newId: () => string;
}
