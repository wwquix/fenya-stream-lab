import { Router } from "express";
import process from "node:process";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "fenya-stream-lab-api",
    provider: process.env.TWITCH_PROVIDER || "mock",
    timestamp: new Date().toISOString(),
  });
});

export default router;
