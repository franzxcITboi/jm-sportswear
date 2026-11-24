import { resolve } from "node:path";

export default {
  server: {
    host: "localhost",
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        dashboard: resolve(process.cwd(), "dashboard.html"),
        buyer: resolve(process.cwd(), "buyer.html"),
      },
    },
  },
};
