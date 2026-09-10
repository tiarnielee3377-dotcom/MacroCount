import { Router, type IRouter } from "express";
import healthRouter from "./health";
import macrosnapRouter from "./macrosnap";
import appleRouter from "./apple";

const router: IRouter = Router();

router.use(healthRouter);
router.use(appleRouter);
router.use(macrosnapRouter);

export default router;
