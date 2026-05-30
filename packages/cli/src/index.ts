#!/usr/bin/env node
import { cac } from "cac";
import { register as registerDev } from "./commands/dev.js";
import { register as registerBuild } from "./commands/build.js";
import { register as registerStart } from "./commands/start.js";
import { register as registerRoutes } from "./commands/routes.js";
import { register as registerTypecheck } from "./commands/typecheck.js";
import { register as registerCreate } from "./commands/create.js";

const cli = cac("anaemia");

registerDev(cli);
registerBuild(cli);
registerStart(cli);
registerRoutes(cli);
registerTypecheck(cli);
registerCreate(cli);

cli.help();
cli.parse();
