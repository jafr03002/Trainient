import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import programsRouter from "./programs";
import workoutsRouter from "./workouts";
import checkinsRouter from "./checkins";
import progressRouter from "./progress";
import bodyweightRouter from "./bodyweight";
import subscriptionsRouter from "./subscriptions";
import calendarRouter from "./calendar";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(programsRouter);
router.use(workoutsRouter);
router.use(checkinsRouter);
router.use(progressRouter);
router.use(bodyweightRouter);
router.use(subscriptionsRouter);
router.use(calendarRouter);

export default router;
