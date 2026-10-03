import { Router, type IRouter } from "express";
import healthRouter from "./health";
import liveDemoRouter from "./live-demo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(liveDemoRouter);

export default router;
