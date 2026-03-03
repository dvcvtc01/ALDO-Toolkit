import fs from "node:fs/promises";
import path from "node:path";

import { buildApp } from "./app.js";

const generate = async (): Promise<void> => {
  const app = await buildApp({ logger: false }, { skipMigrations: true });
  await app.ready();
  const spec = app.swagger();

  const targetPath = path.resolve(process.cwd(), "../../packages/shared/openapi/openapi.json");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

  await app.close();
};

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
