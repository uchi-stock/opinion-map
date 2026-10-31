import type { Logger } from "../lib/log.js";
import type { Repositories } from "../repositories/types.js";

export interface ServiceContext {
  repos: Repositories;
  now: () => Date;
  newId: () => string;
  /** 運用監視のログ。障害の検知に使う出来事だけを出す */
  log: Logger;
}
