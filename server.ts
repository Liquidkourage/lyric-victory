import { createServer } from "http";
import next from "next";
import { parse } from "url";
import { Server } from "socket.io";
import { GameManager } from "./src/server/game-manager";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const httpServer = createServer((req, res) => {
      const parsedUrl = parse(req.url ?? "", true);
      handle(req, res, parsedUrl);
    });

    const io = new Server(httpServer, {
      cors: { origin: "*" },
      transports: ["websocket", "polling"],
    });

    const gameManager = new GameManager(io);

    io.on("connection", (socket) => {
      gameManager.registerHandlers(socket);
    });

    const shutdown = () => {
      gameManager.flushPersist();
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    httpServer.listen(port, host, () => {
      console.log(`Lyric Victory ready on http://${host}:${port}`);
    });

    httpServer.on("error", (error) => {
      console.error("HTTP server error:", error);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error("Failed to start Lyric Victory:", error);
    process.exit(1);
  });
