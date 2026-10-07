import type { NextFunction, Request, Response } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "test") {
    next();
    return;
  }
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Math.round(ms),
        userId: req.user?.id ?? null,
      }),
    );
  });
  next();
}
