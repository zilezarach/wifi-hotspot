"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const paymentController_1 = require("./controllers/paymentController");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, "../public"))); // Serve frontend
app.get("/", paymentController_1.showPortal);
app.post("/api/pay", paymentController_1.initiatePayment);
app.post("/api/mpesa_callback", paymentController_1.mpesaCallback);
// Error handler
app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
});
exports.default = app;
