import { createServer } from "http";
import next from "next";
import { parse } from "url";
import { Server } from "socket.io";
import { GameManager } from "./src/server/game-manager";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
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

  httpServer.listen(port, hostname, () => {
    console.log(`Lyric Victory ready on http://${hostname}:${port}`);
  });
});
