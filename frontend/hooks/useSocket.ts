"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const instance = io(SOCKET_SERVER_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    instance.on("connect", handleConnect);
    instance.on("disconnect", handleDisconnect);
    setSocket(instance);

    return () => {
      instance.off("connect", handleConnect);
      instance.off("disconnect", handleDisconnect);
      instance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, []);

  return { socket, isConnected };
};
