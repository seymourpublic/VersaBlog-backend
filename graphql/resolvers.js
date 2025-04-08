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
      // Build the query object from provided filters
      const queryObj = {};
      
      if (filter) {
        // Filter by category: assumes that `categories` is an array of ObjectIds in Post.
        // When filtering by subcategory, we treat it the same way.
        if (filter.categoryId || filter.subcategoryId) {
          // Prefer subcategory if given, otherwise categoryId.
          queryObj.categories = filter.subcategoryId || filter.categoryId;
        }
        
        // Filter by tags: assuming the Post model has a tags field defined as an array.
        if (filter.tagIds && filter.tagIds.length > 0) {
          queryObj.tags = { $in: filter.tagIds };
        }
        
        // Filter by published date range
        if (filter.publishedAfter || filter.publishedBefore) {
          queryObj.publishedAt = {};
          if (filter.publishedAfter) {
            queryObj.publishedAt.$gte = new Date(filter.publishedAfter);
          }
          if (filter.publishedBefore) {
            queryObj.publishedAt.$lte = new Date(filter.publishedBefore);
          }
        }
        
        // Filter by status (e.g., "published", "draft")
        if (filter.status) {
          queryObj.status = filter.status;
        }
      }
      
      // Perform query, sorting results by publication date descending (most recent first)
      return await Post.find(queryObj).sort({ publishedAt: -1 });
    }
  },
  Mutation: {
    createPost: async (_, args) => {
      const post = new Post(args);
      return await post.save();
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
