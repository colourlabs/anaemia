import { runOnServer } from "@anaemia/core";
import { superSecretDatabaseQuery } from "./api/actions.server.js";

export const getSomething = runOnServer(async () => {
  return await superSecretDatabaseQuery();
});
