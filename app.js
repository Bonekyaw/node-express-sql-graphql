require("dotenv").config();
const express = require("express");
// const bodyParser = require('body-parser');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require("express-rate-limit");

const { createHandler } = require("graphql-http/lib/use/express");
const { ruruHTML } = require("ruru/server");

const schema = require('./graphql/schema');
const resolver = require('./graphql/resolver');

const app = express();

app.use(helmet());

app.use(express.json()); // application/json
// app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

app.use(compression());
app.use(cors());
// app.options("*", cors());

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  limit: 15,    // Limit each IP to 15 requests per `window` (here, per 1 minutes).
  standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  // skipSuccessfulRequests: true,      // This is useful for auth check. If request is successful, it never limit.
});
app.use(limiter);

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

