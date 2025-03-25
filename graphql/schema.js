// graphql/schema.js
const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type Post {
    id: ID!
    title: String!
    content: String!
    slug: String
    status: String
    publishedAt: String
    updatedAt: String
    version: Int
    images: [Image]
    tags: [Tag]
  }

  type Image {
    id: ID!
    postId: ID!
    url: String!
    altText: String
    uploadedAt: String
  }

  type Tag {
    id: ID!
    name: String!
  }

  type Query {
    posts: [Post]
    post(id: ID!): Post
  }

  type Mutation {
    createPost(title: String!, content: String!, slug: String, status: String): Post
    updatePost(id: ID!, title: String, content: String, slug: String, status: String): Post
    deletePost(id: ID!): Boolean
    # Additional mutations can be added for images and tags if needed
  }
`;

module.exports = { typeDefs };
