// graphql/resolvers.js
// File: graphql/resolvers.js
// This file contains the GraphQL resolvers for the blog application. It defines how to fetch and manipulate data for posts, categories, and images.
// It includes queries for fetching posts and categories, as well as mutations for creating, updating, and deleting posts and categories. The resolvers also handle relationships between posts and categories.
// graphql/resolvers.js
const Post = require('../models/Post');
const Image = require('../models/Image');
const Tag = require('../models/Tag');
const Category = require('../models/Category');

const resolvers = {
  Query: {
    posts: async () => await Post.find({}),
    post: async (_, { id }) => await Post.findById(id),
    categories: async () => await Category.find({}),
    category: async (_, { id }) => await Category.findById(id),
    // New resolver for full-text search
    searchPosts: async (_, { query }) => {
      return await Post.find(
        { $text: { $search: query } },
        // Optionally include a text score to sort by relevance
        { score: { $meta: "textScore" } }
      ).sort({ score: { $meta: "textScore" } });
    }
  },
  Mutation: {
    createPost: async (_, args) => {
      const post = new Post(args);
      return await post.save();
    },
    updatePost: async (_, { id, ...updates }) => {
      // Increment version on each update
      const post = await Post.findByIdAndUpdate(
        id,
        { ...updates, $inc: { version: 1 }, updatedAt: Date.now() },
        { new: true }
      );
      return post;
    },
    deletePost: async (_, { id }) => {
      await Post.findByIdAndDelete(id);
      return true;
    },
    createCategory: async (_, { name, slug, description, parentId }) => {
      const category = new Category({
        name,
        slug,
        description,
        parent: parentId || null
      });
      return await category.save();
    },
    updateCategory: async (_, { id, name, slug, description, parentId }) => {
      const category = await Category.findByIdAndUpdate(
        id,
        { name, slug, description, parent: parentId || null },
        { new: true }
      );
      return category;
    },
    deleteCategory: async (_, { id }) => {
      await Category.findByIdAndDelete(id);
      return true;
    }
  },
  Category: {
    parent: async (parent) => {
      if (parent.parent) {
        return await Category.findById(parent.parent);
      }
      return null;
    },
    subcategories: async (parent) => {
      return await Category.find({ parent: parent.id });
    }
  },
  Post: {
    // Resolve categories for a post; you may optionally populate these in your query or use this resolver
    categories: async (parent) => {
      const post = await Post.findById(parent.id).populate('categories');
      return post.categories;
    },
    images: async (parent) => await Image.find({ postId: parent.id })
  }
};

module.exports = { resolvers };
