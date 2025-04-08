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

    tags: async () => {
      return await Tag.find({});
    },

    posts: async () => await Post.find({}),
    post: async (_, { id }) => await Post.findById(id),
    categories: async () => await Category.find({}),
    category: async (_, { id }) => await Category.findById(id),

    // Resolver for postsSummary query
    postsSummary: async () => {
      // Count all posts and specific statuses using Mongoose's countDocuments method.
      const totalPosts = await Post.countDocuments({});
      const drafts = await Post.countDocuments({ status: 'draft' });
      const published = await Post.countDocuments({ status: 'published' });
      const pending = await Post.countDocuments({ status: 'pending' });

      return {
        totalPosts,
        drafts,
        published,
        pending,
      };
    },

    recentPosts: async () => {
      // Return the 5 most recent published posts, sorted by publishedAt descending.
      return await Post.find({ status: 'published' })
        .sort({ publishedAt: -1 })
        .limit(5);
    },
    
    // Full-text search resolver (from previous implementation)
    searchPosts: async (_, { query }) => {
      return await Post.find(
        { $text: { $search: query } },
        { score: { $meta: "textScore" } }
      ).sort({ score: { $meta: "textScore" } });
    },
    
    // New resolver for dynamic filtering
    filteredPosts: async (_, { filter }) => {
      const queryObj = {};

      if (filter) {
        // 1. Search text in title or content (case-insensitive)
        if (filter.searchText) {
          queryObj.$or = [
            { title:   { $regex: filter.searchText, $options: 'i' } },
            { content: { $regex: filter.searchText, $options: 'i' } }
          ];
        }

        // 2. Filter by status
        if (filter.status && filter.status !== '') {
          queryObj.status = filter.status;
        }

        // 3. Date range filter on publishedAt
        if (filter.dateFrom || filter.dateTo) {
          queryObj.publishedAt = {};
          if (filter.dateFrom) {
            queryObj.publishedAt.$gte = new Date(filter.dateFrom);
          }
          if (filter.dateTo) {
            queryObj.publishedAt.$lte = new Date(filter.dateTo);
          }
        }

        // 4. Category filter (posts containing this category)
        if (filter.category && filter.category !== '') {
          queryObj.categories = filter.category;
        }
      }

      // Populate categories if needed
      return await Post.find(queryObj).populate('categories');
    }
  },
  Mutation: {
    createPost: async (_, { title, content, slug, status, categories }) => {
      // If you want to set 'publishedAt' only when status is 'published':
      let publishedAtValue = null;
      if (status === 'published') {
        publishedAtValue = new Date().toISOString();
      }
    
      const newPost = new Post({
        title,
        content,
        slug,
        status: status || 'draft',
        publishedAt: publishedAtValue,
        categories: categories || []
    })
  },
    updatePost: async (_, { id, ...updates }) => {
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
    categories: async (parent) => {
      const post = await Post.findById(parent.id).populate('categories');
      return post.categories;
    },
    images: async (parent) => await Image.find({ postId: parent.id })
  }
};

module.exports = { resolvers };
