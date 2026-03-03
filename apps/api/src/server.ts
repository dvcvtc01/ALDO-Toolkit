import { buildApp } from "./app.js";
import { config } from "./config.js";

const start = async (): Promise<void> => {
  const app = await buildApp();
  await app.listen({
    host: config.HOST,
    port: config.PORT
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
