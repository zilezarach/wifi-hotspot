import express from "express";
import cors from "cors";
import path from "path";
import {
  showPortal,
  initiatePayment,
  mpesaCallback,
} from "./controllers/paymentController";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public"))); // Serve frontend

app.get("/", showPortal);
app.post("/api/pay", initiatePayment);
app.post("/api/mpesa_callback", mpesaCallback);

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    res.status(500).json({ error: err.message });
  }
);

export default app;
