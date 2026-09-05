import { Router, type IRouter } from "express";
import healthRouter from "./health";
import macrosnapRouter from "./macrosnap";

const router: IRouter = Router();

router.use(healthRouter);
router.use(macrosnapRouter);

export default router;
