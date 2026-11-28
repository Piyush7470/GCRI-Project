import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { getPlatformNotifications } from "../controllers/notification.controller.js";

const router = Router();

router.get("/", authenticate, getPlatformNotifications);

export default router;