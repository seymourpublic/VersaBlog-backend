// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { ApolloServer } = require('apollo-server-express');
const { typeDefs } = require('./graphql/schema');
const { resolvers } = require('./graphql/resolvers');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

// Enable CORS if needed
app.use(cors());

// Connect to MongoDB Atlas
connectDB();

// Initialize Apollo Server for GraphQL
async function startApolloServer() {
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  // Version the GraphQL endpoint to /graphql/v1
  server.applyMiddleware({ app, path: '/graphql/v1' });
}

startApolloServer();

// Mount the image upload route under versioned API endpoint
const uploadRouter = require('./routes/upload');
app.use('/api/v1', uploadRouter);

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql/v1`);
});
