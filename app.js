require("dotenv").config();
const express = require("express");
// const bodyParser = require('body-parser');

const { createHandler } = require("graphql-http/lib/use/express");
const { ruruHTML } = require("ruru/server");

const schema = require('./graphql/schema');
const resolver = require('./graphql/resolver');

const app = express();

app.use(express.json()); // application/json
// app.use(bodyParser.json());

// Create and use the GraphQL handler.
app.all(
  "/graphql",
  createHandler({
    schema: schema,
    rootValue: resolver,
  })
);

// Serve the GraphiQL IDE.
app.get("/", (_req, res) => {
  res.type("html")
  res.end(ruruHTML({ endpoint: "/graphql" }))
})

const db = require("./models");

db.sequelize
  .sync()
  // .sync({force: true})
  .then(() => {
    console.log("Successfully Synced with mySQL DB.");
  })
  .catch((err) => {
    console.log("Failed to sync db: " + err.message);
  });

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

