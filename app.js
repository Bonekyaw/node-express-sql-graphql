require("dotenv").config();
const express = require("express");
// const bodyParser = require('body-parser');
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");

const { createHandler } = require("graphql-http/lib/use/express");
const { ruruHTML } = require("ruru/server");

const schema = require("./graphql/schema");
const resolver = require("./graphql/resolver");
const limiter = require("./utils/rateLimiter");
const isAuth = require("./middlewares/isAuth");
const authorise = require("./middlewares/authorise");
const fileRoute = require("./routes/v1/file");

const app = express();

app.use(helmet());

app.use(express.json()); // application/json
// app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

app.use(compression());
app.use(cors());
// app.options("*", cors());

app.use(limiter);

// Create and use the GraphQL handler.
app.all(
  "/graphql",
  createHandler({
    schema: schema,
    rootValue: resolver,
    context: (req) => {
      return {
        authHeader: req.headers.authorization,
      };
    }
  })
);

// Serve the GraphiQL IDE.
app.get("/", (_req, res) => {
  res.type("html");
  res.end(ruruHTML({ endpoint: "/graphql" }));
});

// Other way is to use graphql-upload. But I prefer the way of
// seperating file upload from graphql api. 
// This approach leverages the strengths of both REST and GraphQL 
// and can simplify the file upload process.
app.use("/api/v1", isAuth, authorise(false, "user"), fileRoute);

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

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message;
  res.status(status).json({ error: message });
});
