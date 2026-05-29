import { runOnServer } from "@anaemia/core";
import { superSecretDatabaseQuery } from "./server/actions.server.js";

export const getSomething = runOnServer(async () => {
  return await superSecretDatabaseQuery();
});