const app = require("./app");
const env = require("./config/env");

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend server is running on port ${env.port}`);
});
