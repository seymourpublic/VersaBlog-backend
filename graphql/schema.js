// graphql/schema.js
// This file defines the GraphQL schema for the blog application using Apollo Server and GraphQL.
// It includes types for Post, Image, Tag, and Category, along with queries and mutations for managing these entities.
// The schema is exported for use in the Apollo Server setup.
// File: graphql/schema.js
// graphql/schema.js
const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar Date

  type PostSummary {
    totalPosts: Int
    drafts: Int
    published: Int
    pending: Int
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    slug: String
    status: String
    publishedAt: Date
    updatedAt: Date
    version: Int
    images: [Image]
    categories: [Category]
    tags: [Tag]
  }

  type Image {
    id: ID!
    postId: ID!
    url: String!
    altText: String
    uploadedAt: Date
  }

  type Tag {
    id: ID!
    name: String!
  }

  type Category {
    id: ID!
    name: String!
    slug: String!
    description: String
    parent: Category
    subcategories: [Category]
  }

  input PostFilter {
    searchText: String
    categoryId: ID
    subcategoryId: ID
    tagIds: [ID!]
    publishedAfter: Date
    publishedBefore: Date
    status: String
  }

  type Query {
    posts: [Post]
    post(id: ID!): Post
    categories: [Category]
    category(id: ID!): Category

    # Query with dynamic filters
    filteredPosts(filter: PostFilter): [Post]
    
    # (If you already have a text search query, that remains separate)
    searchPosts(query: String!): [Post]

     postsSummary: PostSummary
    recentPosts: [Post]

    tags: [Tag]   

    
  }

  type Mutation {
    createPost(
    title: String!,
    content: String!,
    slug: String!,
    status: String,
    categories: [ID!]
    ): Post
    updatePost(id: ID!, title: String, content: String, slug: String, status: String): Post
    deletePost(id: ID!): Boolean

    createCategory(name: String!, slug: String!, description: String, parentId: ID): Category
    updateCategory(id: ID!, name: String, slug: String, description: String, parentId: ID): Category
    deleteCategory(id: ID!): Boolean
    updatePostCategory(postId: ID!, categoryId: ID!): Post
  }
`;

module.exports = { typeDefs };


