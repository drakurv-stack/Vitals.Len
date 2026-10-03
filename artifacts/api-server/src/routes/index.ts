import { Router, type IRouter } from "express";
import healthRouter from "./health";
import liveDemoRouter from "./live-demo";
import bodyReportRouter from "./body-report";

const router: IRouter = Router();

router.use(healthRouter);
router.use(liveDemoRouter);
router.use(bodyReportRouter);

export default router;
