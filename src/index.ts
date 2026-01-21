import { serve } from "bun";
import index from "./index.html";

const isAddrInUseError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }
  return "code" in error && (error as { code?: string }).code === "EADDRINUSE";
};

const preferredPort = Number(process.env.PORT ?? process.env.BUN_PORT ?? 3000);
const fallbackPorts = [preferredPort, 3001, 3002, 3003, 3004];

const serverOptions = {
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
};

let server: ReturnType<typeof serve> | null = null;
for (const port of fallbackPorts) {
  try {
    server = serve({ port, ...serverOptions });
    break;
  } catch (error) {
    if (!isAddrInUseError(error)) {
      throw error;
    }
  }
}

if (!server) {
  throw new Error(
    `No available port found. Tried: ${fallbackPorts.join(", ")}`
  );
}

console.log(`🚀 Server running at ${server.url}`);
