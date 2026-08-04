import type { Plugin } from "vite";
import { WebSocketServer, type WebSocket } from "ws";

const MAX_PEERS_PER_ROOM = 2;

function attachSignaling(wss: WebSocketServer) {
  const rooms = new Map<string, Set<WebSocket>>();

  wss.on("connection", (socket, room: string) => {
    const peers = rooms.get(room) ?? new Set<WebSocket>();
    rooms.set(room, peers);

    for (const peer of peers) {
      if (peer.readyState !== peer.OPEN) {
        peers.delete(peer);
      }
    }

    if (peers.size >= MAX_PEERS_PER_ROOM) {
      socket.send(JSON.stringify({ type: "room-full" }));
      socket.close();
      return;
    }

    peers.add(socket);
    socket.send(JSON.stringify({ type: "joined", polite: peers.size > 1 }));
    for (const peer of peers) {
      if (peer !== socket) {
        peer.send(JSON.stringify({ type: "peer-joined" }));
      }
    }

    socket.on("message", (data) => {
      for (const peer of peers) {
        if (peer !== socket) {
          peer.send(data.toString());
        }
      }
    });

    socket.on("close", () => {
      peers.delete(socket);
      if (peers.size === 0) {
        rooms.delete(room);
      } else {
        for (const peer of peers) {
          peer.send(JSON.stringify({ type: "peer-left" }));
        }
      }
    });
  });
}

export default function signalingPlugin(): Plugin {
  return {
    name: "webrtc-signaling",
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      attachSignaling(wss);

      server.httpServer?.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== "/signal") {
          return;
        }
        const room = url.searchParams.get("room");
        if (!room) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, room);
        });
      });
    },
  };
}
