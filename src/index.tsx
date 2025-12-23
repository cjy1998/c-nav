import { Hono } from "hono";
import settings from "./routes/settings";
import auth from "./routes/auth";

const app = new Hono();

app.get("/status", (c) => c.text("OK"));
app.route("/auth", auth);
app.route("/settings", settings);

// app.get("/kv", async (c) => {
//   const result = await c.env.NAV_KV.get("key");
//   return c.text(result || "");
// });
// app.post("/users", async (c) => {
//   const user = {
//     name: "John Doe",
//     age: 30,
//     email: "john.doe@example.com",
//   };
//   const db = createDb(c.env.NAV);
//   const result = await db.insert(usersTable).values(user);
//   return c.json(result);
// });
// app.get("/users", async (c) => {
//   const db = createDb(c.env.NAV);
//   const result = await db.query.usersTable.findMany();
//   return c.json(result);
// });
export default app;
