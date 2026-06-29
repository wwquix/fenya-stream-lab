import dotenv from "dotenv";
import process from "node:process";

import { createApp } from "./app.js";
import { startMockLiveSampler } from "./services/mockLiveSampler.js";

dotenv.config();

const port = process.env.PORT || 3001;
const app = createApp();

app.listen(port, () => {
  console.log(`Fenya Stream Lab backend listening on http://localhost:${port}`);

  if (String(process.env.MOCK_SAMPLER_AUTOSTART).toLowerCase() === "true") {
    const samplerStatus = startMockLiveSampler();
    console.log(`Mock live sampler started with a ${samplerStatus.intervalMs}ms interval`);
  }
});
